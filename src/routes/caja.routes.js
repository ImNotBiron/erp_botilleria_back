import { Router } from "express";
import {
  abrirCajaController,
  estadoCajaController,
  movimientoCajaController,
  cerrarCajaController,
  historialCajaController,
  detalleCajaController
} from "../controllers/caja.controller.js";

import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/abrir", requireAuth, abrirCajaController);
router.get("/estado", requireAuth, estadoCajaController);
router.post("/movimiento", requireAuth, movimientoCajaController);
router.post("/cerrar", requireAuth, cerrarCajaController);
router.get("/historial", requireAuth, historialCajaController);
router.get("/:id", requireAuth, detalleCajaController);



export default router;
