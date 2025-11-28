// src/services/promociones.service.js

import pool from "../config/db.js";

/* ============================================================
   1) CREAR PROMOCIÓN
============================================================ */
export const crearPromocion = async (
  { nombre, descripcion, tipo_promocion, precio_promocion },
  conn
) => {

  if (!nombre || !tipo_promocion)
    throw new Error("Nombre y tipo de promoción son obligatorios.");

  if (tipo_promocion === "FIJA" && (!precio_promocion || precio_promocion <= 0))
    throw new Error("Las promociones FIJAS requieren un precio válido.");

  const [res] = await conn.query(
    `
      INSERT INTO promociones 
      (nombre, descripcion, tipo_promocion, precio_promocion)
      VALUES (?, ?, ?, ?)
    `,
    [nombre, descripcion || null, tipo_promocion, precio_promocion || null]
  );

  return res.insertId;
};

/* ============================================================
   2) EDITAR PROMOCIÓN
============================================================ */
export const editarPromocion = async (
  id,
  { nombre, descripcion, tipo_promocion, precio_promocion },
  conn
) => {
  if (!id) throw new Error("ID requerido.");

  await conn.query(
    `
      UPDATE promociones
      SET nombre = ?, descripcion = ?, tipo_promocion = ?, precio_promocion = ?
      WHERE id = ?
    `,
    [nombre, descripcion, tipo_promocion, precio_promocion, id]
  );

  return true;
};

/* ============================================================
   3) ACTIVAR / DESACTIVAR PROMOCIÓN
============================================================ */
export const setPromocionActiva = async (id, activa, conn) => {
  if (!id) throw new Error("ID requerido.");

  await conn.query(
    `UPDATE promociones SET activa = ? WHERE id = ?`,
    [activa, id]
  );

  return true;
};

/* ============================================================
   4) LISTAR PROMOCIONES
============================================================ */
export const obtenerPromociones = async () => {
  const [rows] = await pool.query(`
    SELECT *
    FROM promociones
    ORDER BY id DESC
  `);

  return rows;
};

/* ============================================================
   5) OBTENER PROMOCIÓN CON DETALLES Y REGLAS
============================================================ */
export const obtenerPromocionById = async (id) => {
  if (!id) throw new Error("ID requerido.");

  const [[promo]] = await pool.query(
    `SELECT * FROM promociones WHERE id = ?`,
    [id]
  );

  if (!promo) throw new Error("Promoción no encontrada.");

  const [detalle] = await pool.query(
    `
      SELECT pd.*, p.nombre AS nombre_producto
      FROM promociones_detalle pd
      LEFT JOIN productos p ON p.id = pd.id_producto
      WHERE id_promocion = ?
    `,
    [id]
  );

  const [reglas] = await pool.query(
    `
      SELECT pr.*, c.nombre AS nombre_categoria, p.nombre AS nombre_producto
      FROM promociones_reglas pr
      LEFT JOIN categorias c ON pr.id_categoria = c.id
      LEFT JOIN productos p ON pr.id_producto = p.id
      WHERE id_promocion = ?
    `,
    [id]
  );

  return { promo, detalle, reglas };
};

/* ============================================================
   6) AGREGAR PRODUCTO A PROMO FIJA
============================================================ */
export const agregarProductoPromo = async (
  id_promocion,
  { id_producto, cantidad, es_gratis, es_variable },
  conn
) => {
  await conn.query(
    `
      INSERT INTO promociones_detalle
      (id_promocion, id_producto, cantidad, es_gratis, es_variable)
      VALUES (?, ?, ?, ?, ?)
    `,
    [id_promocion, id_producto, cantidad, es_gratis, es_variable]
  );

  return true;
};

/* ============================================================
   7) BORRAR PRODUCTO DEL COMBO
============================================================ */
export const eliminarDetallePromo = async (id_detalle, conn) => {
  await conn.query(
    `DELETE FROM promociones_detalle WHERE id = ?`,
    [id_detalle]
  );

  return true;
};

/* ============================================================
   8) AGREGAR REGLA A PROMO (dinámica)
============================================================ */
export const agregarReglaPromo = async (
  id_promocion,
  {
    tipo_regla,
    id_categoria,
    id_producto,
    cantidad_requerida,
    min_capacidad_ml,
    max_capacidad_ml,
    es_gratis
  },
  conn
) => {
  await conn.query(
    `
      INSERT INTO promociones_reglas
      (id_promocion, tipo_regla, id_categoria, id_producto, cantidad_requerida,
       min_capacidad_ml, max_capacidad_ml, es_gratis)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id_promocion,
      tipo_regla,
      id_categoria || null,
      id_producto || null,
      cantidad_requerida,
      min_capacidad_ml,
      max_capacidad_ml,
      es_gratis
    ]
  );

  return true;
};

/* ============================================================
   9) ELIMINAR REGLA
============================================================ */
export const eliminarReglaPromo = async (id_regla, conn) => {
  await conn.query(
    `DELETE FROM promociones_reglas WHERE id = ?`,
    [id_regla]
  );
  return true;
};
