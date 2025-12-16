// src/app.js
import express from "express";
import cors from "cors";
import { config } from "dotenv";

config();

import authRoutes from "./routes/auth.routes.js";
import cajaRoutes from "./routes/caja.routes.js";
import boletasRoutes from "./routes/boletas.routes.js";
import usuariosRoutes from "./routes/usuarios.routes.js";
import productosRoutes from "./routes/productos.routes.js";
import categoriasRoutes from "./routes/categorias.routes.js";
import proveedoresRoutes from "./routes/proveedores.routes.js";
import promocionesRoutes from "./routes/promociones.routes.js";
import ventasRoutes from "./routes/ventas.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";

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
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/productos", productosRoutes);
app.use("/api/categorias", categoriasRoutes);
app.use("/api/proveedores", proveedoresRoutes);
app.use("/api/promociones", promocionesRoutes);
app.use("/api/ventas", ventasRoutes);
app.use("/api/dashboard", dashboardRouter);


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
