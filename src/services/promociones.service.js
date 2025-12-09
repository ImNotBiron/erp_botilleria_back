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
    LEFT JOIN promociones_detalle d ON d.id_promocion = p.id
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
    FROM promociones_detalle
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
      INSERT INTO promociones_detalle (id_promocion, id_producto, cantidad, es_gratis, es_variable)
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

    await conn.query("DELETE FROM promociones_detalle WHERE id_promocion = ?", [id]);

    const values = detalle.map((d) => [
      id,
      d.id_producto,
      d.cantidad,
      0,
      0,
    ]);

    await conn.query(
      `
      INSERT INTO promociones_detalle (id_promocion, id_producto, cantidad, es_gratis, es_variable)
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

/* ============================================================
   OBTENER PROMOCIONES FIJAS ACTIVAS PARA POS
   ------------------------------------------------------------
   - Solo tipo_promocion = 'FIJA'
   - Solo promociones.activa = 1
   - Incluye detalle del combo + datos del producto
============================================================ */
export const obtenerPromocionesFijasActivas = async () => {
  const [rows] = await pool.query(
    `
    SELECT
      p.id               AS id_promocion,
      p.nombre           AS nombre_promocion,
      p.descripcion,
      p.tipo_promocion,
      p.precio_promocion,

      d.id_producto,
      d.cantidad,
      d.es_gratis,
      d.es_variable,

      prod.nombre_producto,
      prod.codigo_producto,
      prod.precio_venta,
      prod.exento_iva
    FROM promociones p
    JOIN promociones_detalle d
      ON d.id_promocion = p.id
    JOIN productos prod
      ON prod.id = d.id_producto
    WHERE
      p.activa = 1
      AND p.tipo_promocion = 'FIJA'
    ORDER BY p.id, d.id
    `
  );

  // Agrupamos por promoción
  const map = new Map();

  for (const row of rows) {
    let promo = map.get(row.id_promocion);
    if (!promo) {
      promo = {
        id: row.id_promocion,
        nombre: row.nombre_promocion,
        descripcion: row.descripcion,
        tipo_promocion: row.tipo_promocion, // siempre 'FIJA' aquí
        precio_promocion: row.precio_promocion,
        items: [],
      };
      map.set(row.id_promocion, promo);
    }

    promo.items.push({
      id_producto: row.id_producto,
      nombre_producto: row.nombre_producto,
      codigo_producto: row.codigo_producto,
      cantidad: row.cantidad,
      es_gratis: row.es_gratis === 1,
      es_variable: row.es_variable === 1,
      precio_venta: row.precio_venta,
      exento_iva: row.exento_iva,
    });
  }

  return Array.from(map.values());
};

