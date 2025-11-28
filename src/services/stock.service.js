// src/services/stock.service.js

import pool from "../config/db.js";

/* ============================================================
   REGISTRAR MOVIMIENTO DE STOCK
   ------------------------------------------------------------
   - tipo_movimiento: 'VENTA', 'ENTRADA', 'AJUSTE', 'ANULACION'
   - cantidad: int (negativo si resta stock)
============================================================ */
export const registrarMovimientoStock = async ({
  conn,
  id_producto,
  id_usuario,
  id_caja_sesion = null,
  tipo_movimiento,
  cantidad,
  descripcion = null
}) => {

  // 1) Obtener stock actual
  const [rows] = await conn.query(
    `SELECT stock FROM productos WHERE id = ?`,
    [id_producto]
  );

  if (rows.length === 0) {
    throw new Error("Producto no encontrado para movimiento de stock.");
  }

  const stock_anterior = rows[0].stock;
  const stock_nuevo = stock_anterior + cantidad; // cantidad será negativa en ventas

  // 2) Actualizar stock en productos
  await conn.query(
    `UPDATE productos SET stock = ? WHERE id = ?`,
    [stock_nuevo, id_producto]
  );

  // 3) Guardar registro del movimiento
  await conn.query(
    `
      INSERT INTO movimientos_stock
      (id_producto, id_usuario, id_caja_sesion, tipo_movimiento,
       cantidad, stock_anterior, stock_nuevo, descripcion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id_producto,
      id_usuario,
      id_caja_sesion,
      tipo_movimiento,
      cantidad,
      stock_anterior,
      stock_nuevo,
      descripcion
    ]
  );

  return stock_nuevo;
};
