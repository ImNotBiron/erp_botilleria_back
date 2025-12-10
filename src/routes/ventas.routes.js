import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { crearVentaController, crearVentaPosController, previsualizarVentaPosController, listarMisVentasController } from "../controllers/ventas.controller.js";
import { anularVentaController } from "../controllers/anulaciones.controller.js";

const router = Router();

router.post("/crear", requireAuth, crearVentaController);
router.post("/anular", requireAuth, anularVentaController);

//venta mediante POS
router.post("/pos", requireAuth, crearVentaPosController); 
router.post("/previsualizar-pos", requireAuth, previsualizarVentaPosController);

// mis ventas
router.get("/mis", requireAuth, listarMisVentasController);

export default router;
