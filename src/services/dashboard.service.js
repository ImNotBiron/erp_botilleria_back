import pool from "../config/db.js";
import { obtenerCajaActiva } from "./caja.service.js";

export const obtenerResumenDashboard = async ({ mode = "all", limite = 200 }) => {
  // 1) Caja activa
  const caja = await obtenerCajaActiva();
  if (!caja) {
    return {
      caja_activa: false,
      caja: null,
      resumenVentas: null,
      metodosPago: null,
      usuariosOnline: [],
      pendientesBoletear: { count: 0, ventas: [] },
      ventas: [],
      ultimaVenta: null,
    };
  }

  const idCaja = caja.id;

  // 2) Resumen de ventas de la sesión
  const [[resumen]] = await pool.query(
    `
    SELECT
      COUNT(*) AS totalVentas,
      COALESCE(SUM(total_general),0) AS totalGeneral,
      COALESCE(SUM(total_afecto),0)  AS totalAfecto,
      COALESCE(SUM(total_exento),0)  AS totalExento,
      COALESCE(SUM(monto_efectivo_total),0) AS totalEfectivo,
      COALESCE(SUM(monto_no_efectivo_total),0) AS totalNoEfectivo
    FROM ventas
    WHERE id_caja_sesion = ?
      AND estado = 'ACTIVA'
    `,
    [idCaja]
  );

  // 3) Métodos de pago (acumulados en caja_sesiones)
  const metodosPago = {
    efectivo_giro: Number(caja.total_efectivo_giro || 0),
    debito: Number(caja.total_debito || 0),
    credito: Number(caja.total_credito || 0),
    transferencia: Number(caja.total_transferencia || 0),
    tarjetas_total:
      Number(caja.total_debito || 0) +
      Number(caja.total_credito || 0) +
      Number(caja.total_transferencia || 0),
    exento: Number(caja.total_exento || 0),
    tickets: {
      efectivo: Number(caja.tickets_efectivo || 0),
      debito: Number(caja.tickets_debito || 0),
      credito: Number(caja.tickets_credito || 0),
      transferencia: Number(caja.tickets_transferencia || 0),
    },
  };

  // 4) Última venta
  const [[ultimaVenta]] = await pool.query(
    `
    SELECT
      v.id, v.fecha, v.tipo_venta,
      v.total_general, v.total_afecto, v.total_exento,
      v.monto_efectivo_total, v.monto_no_efectivo_total,
      v.boleteado, v.estado,
      u.id AS id_usuario, u.nombre_usuario,
      MAX(CASE WHEN vb.tipo='AFECTA' THEN 1 ELSE 0 END) AS tiene_boleta_afecta,
      MAX(CASE WHEN vb.tipo='EXENTA' THEN 1 ELSE 0 END) AS tiene_boleta_exenta
    FROM ventas v
    INNER JOIN usuarios u ON u.id = v.id_usuario
    LEFT JOIN ventas_boletas vb ON vb.id_venta = v.id
    WHERE v.id_caja_sesion = ?
      AND v.estado = 'ACTIVA'
    GROUP BY v.id
    ORDER BY v.fecha DESC, v.id DESC
    LIMIT 1
    `,
    [idCaja]
  );

  // 5) Ventas (todas o vacío si mode=last)
  let ventas = [];
  if (mode !== "last") {
    const [rows] = await pool.query(
      `
      SELECT
        v.id, v.fecha, v.tipo_venta,
        v.total_general, v.total_afecto, v.total_exento,
        v.monto_efectivo_total, v.monto_no_efectivo_total,
        v.boleteado, v.estado,
        u.id AS id_usuario, u.nombre_usuario,
        MAX(CASE WHEN vb.tipo='AFECTA' THEN 1 ELSE 0 END) AS tiene_boleta_afecta,
        MAX(CASE WHEN vb.tipo='EXENTA' THEN 1 ELSE 0 END) AS tiene_boleta_exenta
      FROM ventas v
      INNER JOIN usuarios u ON u.id = v.id_usuario
      LEFT JOIN ventas_boletas vb ON vb.id_venta = v.id
      WHERE v.id_caja_sesion = ?
        AND v.estado = 'ACTIVA'
      GROUP BY v.id
      ORDER BY v.fecha DESC, v.id DESC
      LIMIT ?
      `,
      [idCaja, Math.max(1, Math.min(1000, Number(limite) || 200))]
    );
    ventas = rows;
  }

  // 6) Usuarios online + métricas dentro de la caja activa
  const [usuariosOnline] = await pool.query(
    `
    SELECT
      u.id,
      u.nombre_usuario,
      COUNT(v.id) AS ventasCount,
      COALESCE(SUM(v.total_general),0) AS totalGeneral,
      COALESCE(SUM(v.total_afecto),0)  AS totalAfecto,
      COALESCE(SUM(v.total_exento),0)  AS totalExento,
      COALESCE(SUM(v.monto_efectivo_total),0) AS efectivo,
      COALESCE(SUM(v.monto_no_efectivo_total),0) AS noEfectivo
    FROM usuarios u
    LEFT JOIN ventas v
      ON v.id_usuario = u.id
      AND v.id_caja_sesion = ?
      AND v.estado = 'ACTIVA'
    WHERE u.en_linea = 1
      AND u.activo = 1
    GROUP BY u.id, u.nombre_usuario
    ORDER BY totalGeneral DESC
    `,
    [idCaja]
  );

  // 7) Pendientes de boletear (SOLO EFECTIVO/GIRO) + separación AFECTO/EXENTO
  // Regla nueva:
  // - exento_efectivo = min(total_exento, efectivo_total)
  // - afecto_efectivo = min(total_afecto, max(efectivo_total - exento_efectivo, 0))
  const [pendientes] = await pool.query(
    `
    SELECT
      v.id, v.fecha,
      v.total_general, v.total_afecto, v.total_exento,
      v.monto_efectivo_total,
      u.nombre_usuario,

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
    WHERE v.id_caja_sesion = ?
      AND v.estado = 'ACTIVA'
      AND v.tipo_venta = 'NORMAL'
      AND COALESCE(v.monto_efectivo_total,0) > 0
    GROUP BY v.id
    HAVING
      (afecto_efectivo > 0 AND tiene_boleta_afecta = 0)
      OR
      (exento_efectivo > 0 AND tiene_boleta_exenta = 0)
    ORDER BY v.fecha ASC, v.id ASC
    `,
    [idCaja]
  );

  return {
    caja_activa: true,
    caja,
    resumenVentas: resumen,
    metodosPago,
    usuariosOnline,
    pendientesBoletear: {
      count: pendientes.length,
      ventas: pendientes,
    },
    ventas,
    ultimaVenta: ultimaVenta || null,
  };
};
