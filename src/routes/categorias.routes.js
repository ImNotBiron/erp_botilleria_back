import { Router } from "express";
import pool from "../config/db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();

/* LISTAR (solo activas) */
router.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM categorias WHERE activo = 1 ORDER BY nombre ASC"
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* CREAR */
router.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { nombre } = req.body;

    if (!nombre || !nombre.trim()) {
      return res
        .status(400)
        .json({ error: "El nombre de la categoría es obligatorio." });
    }

    await pool.query(
      "INSERT INTO categorias (nombre, activo) VALUES (?, 1)",
      [nombre.trim()]
    );

    res.json({ success: true });
  } catch (err) {
    // para manejar UNIQUE nombre si lo tienes
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(400)
        .json({ error: "Ya existe una categoría con ese nombre." });
    }
    next(err);
  }
});

/* EDITAR */
router.put("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;

    if (!nombre || !nombre.trim()) {
      return res
        .status(400)
        .json({ error: "El nombre de la categoría es obligatorio." });
    }

    await pool.query(
      "UPDATE categorias SET nombre = ? WHERE id = ?",
      [nombre.trim(), id]
    );

    res.json({ success: true });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(400)
        .json({ error: "Ya existe una categoría con ese nombre." });
    }
    next(err);
  }
});

/* CAMBIAR ESTADO (activar / desactivar) */
router.patch("/:id/estado", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    await pool.query("UPDATE categorias SET activo = ? WHERE id = ?", [
      activo,
      id,
    ]);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
