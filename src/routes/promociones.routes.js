// src/routes/promociones.routes.js
import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";
import * as promocionesController from "../controllers/promociones.controller.js";

const router = Router();

router.get("/", requireAuth, requireAdmin, promocionesController.listarPromosFijas);
router.get("/:id", requireAuth, requireAdmin, promocionesController.obtenerPromoFija);
router.post("/", requireAuth, requireAdmin, promocionesController.crearPromoFija);
router.put("/:id", requireAuth, requireAdmin, promocionesController.actualizarPromoFija);
router.patch("/:id/estado", requireAuth, requireAdmin, promocionesController.cambiarEstadoPromoFija);

export default router;
