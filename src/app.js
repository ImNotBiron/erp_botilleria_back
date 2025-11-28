// src/app.js
import express from "express";
import cors from "cors";
import { config } from "dotenv";

config();

import authRoutes from "./routes/auth.routes.js";
import cajaRoutes from "./routes/caja.routes.js";
import boletasRoutes from "./routes/boletas.routes.js";

const app = express();

// Middlewares globales
app.use(cors({
  origin: [
    "https://botilleriaelparaiso.cl",
    "http://localhost:5173"
  ],
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use("/api/auth", authRoutes);
app.use("/api/caja", cajaRoutes);
app.use("/api/boletas", boletasRoutes);

// Healthcheck básico
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "ERP Botillería API OK" });
});

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error("ERROR BACKEND:", err);
  res
    .status(err.status || 500)
    .json({ error: err.message || "Error interno del servidor" });
});





export default app;
