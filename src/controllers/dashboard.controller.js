import { obtenerResumenDashboard } from "../services/dashboard.service.js";

const requireAdmin = (req) => {
  // La tabla usuarios define tipo_usuario 'admin' | 'vendedor' :contentReference[oaicite:3]{index=3}
  if (!req.user || req.user.tipo_usuario !== "admin") {
    const err = new Error("Acceso denegado. Solo administrador.");
    err.statusCode = 403;
    throw err;
  }
};

export const resumenDashboardController = async (req, res) => {
  try {
    requireAdmin(req);

    // ?mode=all | last  (por defecto "all")
    // ?limite=200
    const mode = (req.query.mode || "all").toString();
    const limite = Number(req.query.limite || 200);

    const data = await obtenerResumenDashboard({ mode, limite });

    res.json({ success: true, ...data });
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message });
  }
};
