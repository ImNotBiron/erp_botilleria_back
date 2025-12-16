import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { resumenDashboardController } from "../controllers/dashboard.controller.js";

const router = Router();

// Admin-only
router.get("/resumen", requireAuth, resumenDashboardController);

export default router;
