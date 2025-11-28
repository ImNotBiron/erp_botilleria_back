import pool from "../config/db.js";
import { generarToken } from "../utils/token.js";

export const login = async (req, res, next) => {
  try {
    const { rut } = req.body;

    if (!rut) {
      return res.status(400).json({ error: "Falta el RUT" });
    }

    const [rows] = await pool.query(
      `
      SELECT id, rut, nombre_usuario, tipo_usuario, activo
      FROM usuarios
      WHERE rut = ?
      LIMIT 1
      `,
      [rut]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "RUT no encontrado" });
    }

    const user = rows[0];

    if (!user.activo) {
      return res.status(403).json({ error: "Usuario desactivado" });
    }

    // Generar token (sin password)
    const token = generarToken({
      id: user.id,
      rut: user.rut,
      nombre_usuario: user.nombre_usuario,
      tipo_usuario: user.tipo_usuario,
    });

    res.json({
      success: true,
      token,
      usuario: {
        id: user.id,
        rut: user.rut,
        nombre_usuario: user.nombre_usuario,
        tipo_usuario: user.tipo_usuario,
      },
    });

  } catch (error) {
    next(error);
  }
};
