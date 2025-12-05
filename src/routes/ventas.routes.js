import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { crearVentaController, crearVentaPosController } from "../controllers/ventas.controller.js";
import { anularVentaController } from "../controllers/anulaciones.controller.js";

const router = Router();

router.post("/crear", requireAuth, crearVentaController);
router.post("/anular", requireAuth, anularVentaController);

//venta mediante POS
router.post("/pos", requireAuth, crearVentaPosController); 

export default router;
