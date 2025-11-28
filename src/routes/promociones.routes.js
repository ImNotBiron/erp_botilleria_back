import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";

import {
  crearPromocionController,
  editarPromocionController,
  obtenerPromocionesController,
  obtenerPromocionByIdController,
  setPromocionActivaController,
  agregarProductoPromoController,
  eliminarDetallePromoController,
  agregarReglaPromoController,
  eliminarReglaPromoController
} from "../controllers/promociones.controller.js";

const router = Router();

// CRUD principal
router.get("/", requireAuth, obtenerPromocionesController);
router.post("/", requireAuth, crearPromocionController);
router.get("/:id", requireAuth, obtenerPromocionByIdController);
router.put("/:id", requireAuth, editarPromocionController);
router.put("/:id/activa", requireAuth, setPromocionActivaController);

// Detalle del combo
router.post("/:id_promocion/detalle", requireAuth, agregarProductoPromoController);
router.delete("/detalle/:id_detalle", requireAuth, eliminarDetallePromoController);

// Reglas dinámicas
router.post("/:id_promocion/reglas", requireAuth, agregarReglaPromoController);
router.delete("/reglas/:id_regla", requireAuth, eliminarReglaPromoController);

export default router;
