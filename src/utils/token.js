import jwt from "jsonwebtoken";

export const generarToken = (payload, expiresIn = process.env.JWT_EXPIRES || "8h") => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Falta JWT_SECRET en .env");
  return jwt.sign(payload, secret, { expiresIn });
};

export const verificarToken = (token) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Falta JWT_SECRET en .env");
  return jwt.verify(token, secret);
};
