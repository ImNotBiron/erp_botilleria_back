import { verificarToken } from "../utils/token.js";

export const requireAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token no proporcionado" });
    }

    const token = header.split(" ")[1];
    const payload = verificarToken(token);

    // Guardamos datos del usuario en la request
    req.user = {
      id: payload.id,
      nombre_usuario: payload.nombre_usuario,
      tipo_usuario: payload.tipo_usuario,
    };

    next();
  } catch (error) {
    console.error("Error en requireAuth:", error);
    res.status(401).json({ error: "Token inválido o expirado" });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.tipo_usuario !== "admin") {
    return res.status(403).json({ error: "Requiere rol admin" });
  }
  next();
};
