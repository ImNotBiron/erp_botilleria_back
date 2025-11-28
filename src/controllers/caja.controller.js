// src/controllers/caja.controller.js
import {
  obtenerCajaActiva,
  abrirCaja,
  registrarMovimiento,
  cerrarCaja,
} from "../services/caja.service.js";
import { obtenerHistorialCajas,obtenerDetalleCaja } from "../services/caja.service.js";

export const abrirCajaController = async (req, res, next) => {
  try {
    const { inicial_local, inicial_vecina } = req.body;
    const id_usuario = req.user.id;

    const id_sesion = await abrirCaja(id_usuario, inicial_local, inicial_vecina);

    res.json({ success: true, id_sesion });
  } catch (err) {
    next(err);
  }
};

export const estadoCajaController = async (req, res, next) => {
  try {
    const caja = await obtenerCajaActiva();
    res.json({ success: true, caja });
  } catch (err) {
    next(err);
  }
};

export const movimientoCajaController = async (req, res, next) => {
  try {
    const caja = await obtenerCajaActiva();
    if (!caja) throw new Error("No hay caja abierta.");

    const { tipo, categoria, monto, descripcion, id_proveedor, id_proveedor_vendedor } =
      req.body;

    await registrarMovimiento(
      caja.id,
      req.user.id,
      tipo,
      categoria,
      monto,
      descripcion,
      id_proveedor,
      id_proveedor_vendedor
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const cerrarCajaController = async (req, res, next) => {
  try {
    const caja = await obtenerCajaActiva();
    if (!caja) throw new Error("No hay caja abierta.");

    const { total_real_local, total_real_vecina } = req.body;

    const result = await cerrarCaja(
      caja.id,
      req.user.id,
      total_real_local,
      total_real_vecina
    );

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

export const historialCajaController = async (req, res, next) => {
  try {
    const historial = await obtenerHistorialCajas();
    res.json({ success: true, historial });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const detalleCajaController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const detalle = await obtenerDetalleCaja(id);
    res.json({ success: true, ...detalle });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

