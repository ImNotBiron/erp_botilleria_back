// src/controllers/caja.controller.js

import {
  obtenerCajaActiva,
  abrirCaja,
  registrarMovimiento,
  cerrarCaja,
  obtenerHistorialCajas,
  obtenerDetalleCaja,
} from "../services/caja.service.js";

/* ============================================================
   ABRIR CAJA
============================================================ */
export const abrirCajaController = async (req, res) => {
  try {
    const { inicial_local, inicial_vecina } = req.body;
    const id_usuario = req.user.id; // viene del middleware requireAuth

    const id_sesion = await abrirCaja(id_usuario, inicial_local, inicial_vecina);

    res.json({
      success: true,
      id_sesion,
      message: "Caja abierta correctamente.",
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ============================================================
   ESTADO DE CAJA (para admin o POS)
============================================================ */
export const estadoCajaController = async (req, res) => {
  try {
    const caja = await obtenerCajaActiva();
    res.json({
      success: true,
      caja_activa: !!caja,
      caja,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ============================================================
   REGISTRAR MOVIMIENTO MANUAL
============================================================ */
export const movimientoCajaController = async (req, res) => {
  try {
    const {
      tipo,
      categoria,
      monto,
      descripcion,
      id_proveedor,
      id_proveedor_vendedor,
    } = req.body;

    const id_usuario = req.user.id;

    await registrarMovimiento({
      tipo,
      categoria,
      monto,
      descripcion,
      id_proveedor,
      id_proveedor_vendedor,
      id_usuario,
    });

    res.json({
      success: true,
      message: "Movimiento registrado correctamente.",
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ============================================================
   CERRAR CAJA
============================================================ */
export const cerrarCajaController = async (req, res) => {
  try {
    const { total_real_local, total_real_vecina } = req.body;
    const id_usuario = req.user.id;

    const resultado = await cerrarCaja(
      id_usuario,
      total_real_local,
      total_real_vecina
    );

    res.json({
      success: true,
      message: "Caja cerrada correctamente.",
      ...resultado,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ============================================================
   HISTORIAL DE CAJAS
============================================================ */
export const historialCajaController = async (req, res) => {
  try {
    // más adelante podríamos recibir ?limite=...
    const historial = await obtenerHistorialCajas(50);
    res.json({ success: true, historial });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ============================================================
   DETALLE DE UNA SESIÓN DE CAJA
============================================================ */
export const detalleCajaController = async (req, res) => {
  try {
    const { id } = req.params;
    const detalle = await obtenerDetalleCaja(id);
    res.json({ success: true, ...detalle });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
