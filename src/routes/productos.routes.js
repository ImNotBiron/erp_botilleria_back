// src/routes/productos.routes.js
import { Router } from "express";
import {
  listarProductos,
  obtenerProducto,
  crearProducto,
  editarProducto,
  cambiarEstadoProducto,
  borrarProducto,
} from "../controllers/productos.controller.js";

import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// Todas las rutas protegidas para admin (por ahora)
router.get("/", requireAuth, requireAdmin, listarProductos);
router.get("/:id", requireAuth, requireAdmin, obtenerProducto);
router.post("/", requireAuth, requireAdmin, crearProducto);
router.put("/:id", requireAuth, requireAdmin, editarProducto);
router.patch("/:id/estado", requireAuth, requireAdmin, cambiarEstadoProducto);
router.delete("/:id", requireAuth, requireAdmin, borrarProducto);

export default router;
