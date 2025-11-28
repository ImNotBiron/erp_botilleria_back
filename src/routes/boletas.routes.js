import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getPendientesBoletear, postMarcarBoleta } from "../controllers/boletas.controller.js";

const router = Router();

router.get("/pendientes", requireAuth, getPendientesBoletear);
router.post("/marcar", requireAuth, postMarcarBoleta);

export default router;
