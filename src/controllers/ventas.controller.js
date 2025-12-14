import { crearVenta, previsualizarVentaPos, listarVentasUsuario, obtenerVentaDetalle, obtenerVentaDetalleAdmin } from "../services/ventas.service.js";
import { crearVentaPos, devolverVentaParcial, crearCambio } from "../services/ventas.service.js";
import pool from "../config/db.js";

export const crearVentaController = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const resultado = await crearVenta(req, conn);

    await conn.commit();
    res.json({ success: true, ...resultado });

  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

export const crearVentaPosController = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const resultado = await crearVentaPos(req, conn);

    await conn.commit();
    res.json({ success: true, ...resultado });

  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

export const previsualizarVentaPosController = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    // Para previsualizar no necesitamos transacción
    const resultado = await previsualizarVentaPos(req, conn);

    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// ===============================
// MIS VENTAS (LISTADO + FILTROS)
// ===============================
export const listarMisVentasController = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const id_usuario = req.user?.id;
    if (!id_usuario) {
      return res.status(401).json({ error: "Usuario no identificado." });
    }

    const { desde, hasta, id_caja } = req.query;

    const filtros = {
      fecha_desde: desde || null,
      fecha_hasta: hasta || null,
      id_caja_sesion: id_caja ? Number(id_caja) : null,
    };

    const ventas = await listarVentasUsuario(id_usuario, filtros, conn);
    res.json({ success: true, ventas });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// ===============================
// DETALLE DE UNA VENTA DEL USUARIO
// ===============================
export const obtenerMiVentaDetalleController = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const id_usuario = req.user?.id;
    if (!id_usuario) {
      return res.status(401).json({ error: "Usuario no identificado." });
    }

    const id_venta = Number(req.params.id);
    if (!id_venta) {
      return res.status(400).json({ error: "ID de venta inválido." });
    }

    const detalle = await obtenerVentaDetalle(id_venta, id_usuario, conn);
    res.json({ success: true, ...detalle });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

export const devolverVentaParcialController = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const resultado = await devolverVentaParcial(req, conn);

    await conn.commit();
    res.json({ success: true, ...resultado });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

export const obtenerVentaDetalleController = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const id_venta = Number(req.params.id);
    if (!id_venta) {
      return res.status(400).json({ error: "ID de venta inválido." });
    }

    const detalle = await obtenerVentaDetalleAdmin(id_venta, conn);
    res.json(detalle);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};

export const crearCambioController = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await crearCambio(req, conn);
    await conn.commit();
    res.json({ success: true, ...r });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};