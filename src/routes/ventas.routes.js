import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { crearVentaController } from "../controllers/ventas.controller.js";
import { anularVentaController } from "../controllers/anulaciones.controller.js";

const router = Router();

router.post("/crear", requireAuth, crearVentaController);
router.post("/anular", requireAuth, anularVentaController);

export default router;
