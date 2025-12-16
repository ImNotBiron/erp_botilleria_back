import pool from "../config/db.js";

const normTipoPago = (t) => String(t || "").trim().toUpperCase();
const esEfectivo = (t) => ["EFECTIVO", "GIRO", "EFECTIVO_GIRO"].includes(normTipoPago(t));

const roundPeso = (n) => Math.round(Number(n) || 0);

async function obtenerVentaConPagos(conn, id_venta) {
  const [[venta]] = await conn.query(
    `
      SELECT v.id, v.estado, v.tipo_venta, v.total_general, v.total_afecto, v.total_exento
      FROM ventas v
      WHERE v.id = ?
      LIMIT 1
    `,
    [id_venta]
  );

  if (!venta) throw new Error("Venta no existe.");
  if (String(venta.estado || "").toUpperCase() === "ANULADA") {
    throw new Error("No se puede boletear una venta ANULADA.");
  }

  const [pagos] = await conn.query(
    `SELECT tipo_pago, monto FROM ventas_pagos WHERE id_venta = ?`,
    [id_venta]
  );

  return { venta, pagos: pagos || [] };
}

// ✅ Regla CORRECTA (sin prorrateo):
// Asignar efectivo primero a EXENTO y luego a AFECTO.
function calcularEfectivoSeparado(venta, pagos) {
  const totalAfecto = Number(venta.total_afecto) || 0;
  const totalExento = Number(venta.total_exento) || 0;

  let efectivoTotal = 0;
  for (const p of pagos) {
    const monto = Number(p.monto) || 0;
    if (!monto) continue;
    if (esEfectivo(p.tipo_pago)) efectivoTotal += monto;
  }

  const exentoEfectivo = roundPeso(Math.min(totalExento, efectivoTotal));
  const afectoEfectivo = roundPeso(Math.min(totalAfecto, Math.max(efectivoTotal - exentoEfectivo, 0)));

  return { efectivoTotal, afectoEfectivo, exentoEfectivo };
}

async function yaTieneBoleta(conn, id_venta, tipo) {
  const [[row]] = await conn.query(
    `SELECT id FROM ventas_boletas WHERE id_venta = ? AND tipo = ? LIMIT 1`,
    [id_venta, tipo]
  );
  return !!row;
}

/* ============================================================
   OBTENER VENTAS PENDIENTES (si lo usas en otra pantalla)
============================================================ */
export const obtenerVentasPendientes = async () => {
  const [rows] = await pool.query(
    `
    SELECT
      v.id,
      v.fecha,
      v.total_general,
      v.total_afecto,
      v.total_exento,
      COALESCE(v.monto_efectivo_total,0) AS monto_efectivo_total,
      u.nombre_usuario AS vendedor,

      MAX(CASE WHEN vb.tipo='AFECTA' THEN 1 ELSE 0 END) AS tiene_boleta_afecta,
      MAX(CASE WHEN vb.tipo='EXENTA' THEN 1 ELSE 0 END) AS tiene_boleta_exenta,

      LEAST(COALESCE(v.total_exento,0), COALESCE(v.monto_efectivo_total,0)) AS exento_efectivo,

      LEAST(
        COALESCE(v.total_afecto,0),
        GREATEST(
          COALESCE(v.monto_efectivo_total,0) - LEAST(COALESCE(v.total_exento,0), COALESCE(v.monto_efectivo_total,0)),
          0
        )
      ) AS afecto_efectivo

    FROM ventas v
    INNER JOIN usuarios u ON u.id = v.id_usuario
    LEFT JOIN ventas_boletas vb ON vb.id_venta = v.id
    WHERE v.estado = 'ACTIVA'
      AND v.tipo_venta = 'NORMAL'
      AND COALESCE(v.monto_efectivo_total,0) > 0
    GROUP BY v.id
    HAVING
      (afecto_efectivo > 0 AND tiene_boleta_afecta = 0)
      OR
      (exento_efectivo > 0 AND tiene_boleta_exenta = 0)
    ORDER BY v.fecha DESC
    `
  );

  return rows;
};

/* ============================================================
   MARCAR BOLETA (AFECTA/EXENTA) — SOLO SI CORRESPONDE A EFECTIVO
============================================================ */
export async function marcarBoleta({ id_venta, tipo, folio_sii, id_usuario }) {
  if (!id_venta) throw new Error("Falta id_venta.");
  if (!["AFECTA", "EXENTA"].includes(tipo)) throw new Error("Tipo inválido (AFECTA/EXENTA).");

  const folio = Number(folio_sii);
  if (!Number.isFinite(folio) || folio <= 0) throw new Error("Folio SII inválido.");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { venta, pagos } = await obtenerVentaConPagos(conn, id_venta);

    if (String(venta.tipo_venta || "").toUpperCase() === "INTERNA") {
      throw new Error("No se boletean ventas INTERNAS.");
    }

    const pr = calcularEfectivoSeparado(venta, pagos);

    // 🔥 regla clave: SOLO boletear lo que fue pagado con efectivo/giro
    if (tipo === "AFECTA" && pr.afectoEfectivo <= 0) {
      throw new Error("No corresponde boleta AFECTA: el AFECTO no fue pagado con efectivo.");
    }
    if (tipo === "EXENTA" && pr.exentoEfectivo <= 0) {
      throw new Error("No corresponde boleta EXENTA: el EXENTO no fue pagado con efectivo.");
    }

    const existe = await yaTieneBoleta(conn, id_venta, tipo);
    if (existe) throw new Error(`Ya existe boleta ${tipo} registrada para esta venta.`);

    try {
      await conn.query(
        `INSERT INTO ventas_boletas (id_venta, tipo, folio_sii, id_usuario) VALUES (?, ?, ?, ?)`,
        [id_venta, tipo, folio, id_usuario || null]
      );
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        throw new Error("Ya existe una boleta de ese tipo para esta venta, o el folio ya fue usado.");
      }
      throw err;
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
