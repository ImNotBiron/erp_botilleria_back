// routes/usuarios.routes.js
import { Router } from "express";
import {
  listarUsuarios,
  obtenerUsuario,
  crearNuevoUsuario,
  editarUsuario,
  cambiarEstado,
  actualizarEnLinea,
  borrarUsuario,
} from "../controllers/usuarios.controller.js";

import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// Todas las rutas requieren admin
router.get("/", requireAuth, requireAdmin, listarUsuarios);
router.get("/:id", requireAuth, requireAdmin, obtenerUsuario);
router.post("/", requireAuth, requireAdmin, crearNuevoUsuario);
router.put("/:id", requireAuth, requireAdmin, editarUsuario);
router.patch("/:id/estado", requireAuth, requireAdmin, cambiarEstado);
router.patch("/:id/en-linea", requireAuth, actualizarEnLinea); // vendedores también pueden avisar en línea
router.delete("/:id", requireAuth, requireAdmin, borrarUsuario);

export default router;
