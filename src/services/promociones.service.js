// src/services/promociones.service.js
import pool from "../config/db.js";

// 🔹 LISTAR PROMOS FIJAS
export async function listarPromosFijas() {
  const [rows] = await pool.query(
    `
    SELECT 
      p.id,
      p.nombre,
      p.precio_promocion,
      p.activa,
      COUNT(d.id) AS total_productos
    FROM promociones p
    LEFT JOIN promociones_detalles d ON d.id_promocion = p.id
    WHERE p.tipo_promocion = 'FIJA'
    GROUP BY p.id
    ORDER BY p.nombre ASC
  `
  );
  return rows;
}

// 🔹 OBTENER PROMO FIJA + DETALLE
export async function obtenerPromoFija(id) {
  const [[promo]] = await pool.query(
    `
    SELECT 
      id,
      nombre,
      descripcion,
      precio_promocion,
      activa,
      tipo_promocion
    FROM promociones
    WHERE id = ? AND tipo_promocion = 'FIJA'
    LIMIT 1
  `,
    [id]
  );

  if (!promo) return null;

  const [detalle] = await pool.query(
    `
    SELECT
      id,
      id_producto,
      cantidad,
      es_gratis,
      es_variable
    FROM promociones_detalles
    WHERE id_promocion = ?
  `,
    [id]
  );

  return { ...promo, detalle };
}

// 🔹 CREAR PROMO FIJA
export async function crearPromoFija({ nombre, descripcion, precio_promocion, activa, detalle }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `
      INSERT INTO promociones (nombre, descripcion, tipo_promocion, precio_promocion, activa)
      VALUES (?, ?, 'FIJA', ?, ?)
    `,
      [nombre, descripcion ?? null, precio_promocion, activa ? 1 : 0]
    );

    const idPromocion = result.insertId;

    const values = detalle.map((d) => [
      idPromocion,
      d.id_producto,
      d.cantidad,
      0, // es_gratis
      0, // es_variable
    ]);

    await conn.query(
      `
      INSERT INTO promociones_detalles (id_promocion, id_producto, cantidad, es_gratis, es_variable)
      VALUES ?
    `,
      [values]
    );

    await conn.commit();

    return idPromocion;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// 🔹 ACTUALIZAR PROMO FIJA
export async function actualizarPromoFija(id, { nombre, descripcion, precio_promocion, activa, detalle }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `
      UPDATE promociones
      SET nombre = ?, descripcion = ?, precio_promocion = ?, activa = ?
      WHERE id = ? AND tipo_promocion = 'FIJA'
    `,
      [nombre, descripcion ?? null, precio_promocion, activa ? 1 : 0, id]
    );

    await conn.query("DELETE FROM promociones_detalles WHERE id_promocion = ?", [id]);

    const values = detalle.map((d) => [
      id,
      d.id_producto,
      d.cantidad,
      0,
      0,
    ]);

    await conn.query(
      `
      INSERT INTO promociones_detalles (id_promocion, id_producto, cantidad, es_gratis, es_variable)
      VALUES ?
    `,
      [values]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// 🔹 CAMBIAR ESTADO
export async function cambiarEstadoPromoFija(id, activa) {
  await pool.query(
    `
    UPDATE promociones
    SET activa = ?
    WHERE id = ? AND tipo_promocion = 'FIJA'
  `,
    [activa ? 1 : 0, id]
  );
}
