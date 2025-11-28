import pool from "../config/db.js";
import { obtenerCajaActiva } from "./caja.service.js";
import { registrarMovimientoStock } from "./stock.service.js";
import { clasificarPagos } from "./ventas.service.js"; // lo exportaremos
import { actualizarCajaAnulacion } from "./caja.service.js";

/* ============================================================
   ANULAR VENTA
============================================================ */
export const anularVenta = async (id_venta, motivo, id_usuario, conn) => {
  // Validaciones básicas
  if (!id_venta) throw new Error("ID de venta requerido.");

  // 1) Obtener venta
  const [ventaRows] = await conn.query(
    `
      SELECT * FROM ventas
      WHERE id = ?
      FOR UPDATE
    `,
    [id_venta]
  );

  if (ventaRows.length === 0)
    throw new Error("La venta no existe.");

  const venta = ventaRows[0];

  if (venta.anulada === 1)
    throw new Error("Esta venta ya se encuentra anulada.");

  if (venta.boleteado === 1)
    throw new Error("No se puede anular una venta boleteada.");

  // 2) Validar caja activa
  const caja = await obtenerCajaActiva();
  if (!caja)
    throw new Error("No hay una caja activa. No se puede anular la venta.");

  if (caja.id !== venta.id_caja_sesion)
    throw new Error("No se puede anular una venta asociada a otra caja.");

  // 3) Obtener detalle de la venta
  const [detalle] = await conn.query(
    `SELECT * FROM ventas_detalle WHERE id_venta = ?`,
    [id_venta]
  );

  // 4) Revertir stock
  for (const it of detalle) {
    await registrarMovimientoStock({
      conn,
      id_producto: it.id_producto,
      id_usuario,
      id_caja_sesion: venta.id_caja_sesion,
      tipo_movimiento: "ANULACION",
      cantidad: +it.cantidad,
      descripcion: `Anulación de venta N° ${id_venta}`
    });
  }

  // 5) Revertir TOTALES de CAJA
  // Obtener pagos
  const [pagos] = await conn.query(
    `SELECT tipo_pago, monto FROM ventas_pagos WHERE id_venta = ?`,
    [id_venta]
  );

  await actualizarCajaAnulacion(
    conn,
    venta.id_caja_sesion,
    pagos,
    venta.total_exento,
    venta.tipo_venta
  );

  // 6) Marcar venta como anulada
  await conn.query(
    `
      UPDATE ventas
      SET anulada = 1,
          fecha_anulacion = NOW(),
          id_usuario_anulacion = ?,
          motivo_anulacion = ?
      WHERE id = ?
    `,
    [id_usuario, motivo || null, id_venta]
  );

  return true;
};
