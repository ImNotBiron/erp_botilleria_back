import pool from "../config/db.js";
import { anularVenta } from "../services/anulaciones.service.js";

export const anularVentaController = async (req, res) => {
  const { id_venta, motivo } = req.body;
  const id_usuario = req.user.id;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    await anularVenta(id_venta, motivo, id_usuario, conn);

    await conn.commit();
    res.json({ success: true, message: "Venta anulada correctamente." });

  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
};
