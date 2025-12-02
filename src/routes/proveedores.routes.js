import { Router } from "express";
import pool from "../config/db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();

/* LISTAR */
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM proveedores WHERE activo = 1 ORDER BY nombre ASC");
  res.json(rows);
});

/* CREAR */
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const { nombre, rut, telefono, email, direccion } = req.body;

  if (!nombre || nombre.trim() === "") {
    return res.status(400).json({ error: "El nombre es obligatorio" });
  }

  await pool.query(
    `
    INSERT INTO proveedores (nombre, rut, telefono, email, direccion, activo)
    VALUES (?, ?, ?, ?, ?, 1)
    `,
    [nombre.trim(), rut || null, telefono || null, email || null, direccion || null]
  );

  res.json({ success: true });
});

/* EDITAR */
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nombre, rut, telefono, email, direccion } = req.body;

  await pool.query(
    `
    UPDATE proveedores
    SET nombre = ?, rut = ?, telefono = ?, email = ?, direccion = ?
    WHERE id = ?
    `,
    [nombre.trim(), rut || null, telefono || null, email || null, direccion || null, id]
  );

  res.json({ success: true });
});

/* CAMBIAR ESTADO */
router.patch("/:id/estado", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;

  await pool.query("UPDATE proveedores SET activo = ? WHERE id = ?", [activo, id]);

  res.json({ success: true });
});

export default router;
