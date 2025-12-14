import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { crearVentaController, crearVentaPosController, previsualizarVentaPosController,
 listarMisVentasController, obtenerMiVentaDetalleController,
 devolverVentaParcialController, obtenerVentaDetalleController,
crearCambioController } from "../controllers/ventas.controller.js";
import { anularVentaController } from "../controllers/anulaciones.controller.js";

const router = Router();

router.post("/crear", requireAuth, crearVentaController);
router.post("/anular", requireAuth, anularVentaController);

//venta mediante POS
router.post("/pos", requireAuth, crearVentaPosController); 
router.post("/previsualizar-pos", requireAuth, previsualizarVentaPosController);

// mis ventas
router.get("/mis", requireAuth, listarMisVentasController);
router.get("/mis/:id", requireAuth, obtenerMiVentaDetalleController);

// Devoluciones / Cambios
router.post("/:id/devolucion", requireAuth, devolverVentaParcialController);
router.get("/:id/detalle", requireAuth, obtenerVentaDetalleController);
router.post("/:id/cambio", requireAuth, crearCambioController);



export default router;
