// src/services/productos.service.js
import pool from "../config/db.js";

export const buscarProductoPorCodigo = async (codigo) => {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        codigo_producto,
        nombre_producto,
        precio_venta,
        precio_mayorista,
        exento_iva,
        activo,
        stock
      FROM productos
      WHERE codigo_producto = ?
      LIMIT 1
    `,
    [codigo]
  );

  return rows?.[0] || null;
};
