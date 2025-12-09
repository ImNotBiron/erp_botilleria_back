import { crearVenta, previsualizarVentaPos } from "../services/ventas.service.js";
import { crearVentaPos } from "../services/ventas.service.js";
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
