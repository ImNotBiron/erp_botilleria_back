import { Router } from "express";
import { login, logoutUsuario } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", login);
router.post("/logout", requireAuth, logoutUsuario);


export default router;
