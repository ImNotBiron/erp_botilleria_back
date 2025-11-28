import pool from "../config/db.js";
import {
  crearPromocion,
  editarPromocion,
  setPromocionActiva,
  obtenerPromociones,
  obtenerPromocionById,
  agregarProductoPromo,
  eliminarDetallePromo,
  agregarReglaPromo,
  eliminarReglaPromo
} from "../services/promociones.service.js";

export const crearPromocionController = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    const id = await crearPromocion(req.body, conn);
    await conn.commit();

    res.json({ success: true, id });

  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

export const editarPromocionController = async (req, res) => {
  const conn = await pool.getConnection();
  const { id } = req.params;

  try {
    await conn.beginTransaction();
    await editarPromocion(id, req.body, conn);
    await conn.commit();

    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

export const obtenerPromocionesController = async (req, res) => {
  try {
    const data = await obtenerPromociones();
    res.json({ success: true, promociones: data });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const obtenerPromocionByIdController = async (req, res) => {
  try {
    const data = await obtenerPromocionById(req.params.id);
    res.json({ success: true, ...data });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const setPromocionActivaController = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    await setPromocionActiva(req.params.id, req.body.activa, conn);
    await conn.commit();

    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

export const agregarProductoPromoController = async (req, res) => {
  const conn = await pool.getConnection();
  const { id_promocion } = req.params;

  try {
    await conn.beginTransaction();
    await agregarProductoPromo(id_promocion, req.body, conn);
    await conn.commit();

    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

export const eliminarDetallePromoController = async (req, res) => {
  const { id_detalle } = req.params;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    await eliminarDetallePromo(id_detalle, conn);
    await conn.commit();

    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

export const agregarReglaPromoController = async (req, res) => {
  const conn = await pool.getConnection();
  const { id_promocion } = req.params;

  try {
    await conn.begin.beginTransaction();
    await agregarReglaPromo(id_promocion, req.body, conn);
    await conn.commit();

    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

export const eliminarReglaPromoController = async (req, res) => {
  const { id_regla } = req.params;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    await eliminarReglaPromo(id_regla, conn);
    await conn.commit();

    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};
