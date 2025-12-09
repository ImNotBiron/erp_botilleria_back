// src/controllers/promociones.controller.js
import * as promocionesService from "../services/promociones.service.js";

import { obtenerPromocionesFijasActivas } from "../services/promociones.service.js";

export async function listarPromosFijas(req, res, next) {
  try {
    const promos = await promocionesService.listarPromosFijas();
    res.json(promos);
  } catch (err) {
    next(err);
  }
}

export async function obtenerPromoFija(req, res, next) {
  try {
    const id = req.params.id;
    const promo = await promocionesService.obtenerPromoFija(id);

    if (!promo) return res.status(404).json({ error: "Promoción no encontrada" });

    res.json(promo);
  } catch (err) {
    next(err);
  }
}

export async function crearPromoFija(req, res, next) {
  try {
    const { nombre, descripcion, precio_promocion, activa, detalle } = req.body;

    if (!nombre || !precio_promocion || !detalle?.length) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    const id = await promocionesService.crearPromoFija({
      nombre,
      descripcion,
      precio_promocion,
      activa,
      detalle,
    });

    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
}

export async function actualizarPromoFija(req, res, next) {
  try {
    const id = req.params.id;
    const { nombre, descripcion, precio_promocion, activa, detalle } = req.body;

    if (!nombre || !precio_promocion || !detalle?.length) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    await promocionesService.actualizarPromoFija(id, {
      nombre,
      descripcion,
      precio_promocion,
      activa,
      detalle,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function cambiarEstadoPromoFija(req, res, next) {
  try {
    const id = req.params.id;
    const { activa } = req.body;

    await promocionesService.cambiarEstadoPromoFija(id, activa);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/* ============================================================
   LISTAR PROMOS PARA POS
============================================================ */
export const listarPromocionesPosController = async (req, res) => {
  try {
    const promociones = await obtenerPromocionesFijasActivas();
    res.json({ success: true, promociones });
  } catch (err) {
    console.error("Error al obtener promociones POS:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener promociones para POS.",
    });
  }
};