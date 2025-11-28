// src/services/boletas.service.js

import pool from "../config/db.js";

/* ============================================================
   OBTENER VENTAS PENDIENTES DE BOLETEAR
============================================================ */
export const obtenerVentasPendientes = async () => {
  const [rows] = await pool.query(`
    SELECT
      v.id,
      v.fecha,
      v.total_general,
      u.nombre_usuario AS vendedor,
      COALESCE(SUM(CASE WHEN vp.tipo_pago IN ('EFECTIVO','GIRO') 
                        THEN vp.monto ELSE 0 END), 0) AS monto_efectivo
    FROM ventas v
    JOIN ventas_pagos vp ON v.id = vp.id_venta
    LEFT JOIN usuarios u ON v.id_usuario = u.id
    WHERE v.boleteado = 0
      AND v.tipo_venta = 'NORMAL'
      AND v.total_general > 0
    GROUP BY v.id
    HAVING monto_efectivo > 0
    ORDER BY v.fecha DESC
  `);

  return rows;
};

/* ============================================================
   MARCAR VENTA COMO BOLETEADA
============================================================ */
export const marcarBoleta = async (id_venta, folio_interno) => {
  if (!id_venta) throw new Error("ID de venta requerido.");
  if (!folio_interno) throw new Error("Folio interno requerido.");

  // Validación: Venta debe existir y estar pendiente
  const [rows] = await pool.query(
    `SELECT boleteado, tipo_venta FROM ventas WHERE id = ?`,
    [id_venta]
  );

  if (rows.length === 0) throw new Error("Venta no existe.");

  const venta = rows[0];

  if (venta.tipo_venta !== "NORMAL")
    throw new Error("Las ventas internas no se boletean.");

  if (venta.boleteado === 1)
    throw new Error("Esta venta ya fue marcada como boleteada.");

  // Actualizar venta
  await pool.query(
    `
      UPDATE ventas
      SET boleteado = 1, folio_interno = ?
      WHERE id = ?
    `,
    [folio_interno, id_venta]
  );

  return true;
};
