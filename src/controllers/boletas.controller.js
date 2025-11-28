import { obtenerVentasPendientes, marcarBoleta } from "../services/boletas.service.js";

export const getPendientesBoletear = async (req, res) => {
  try {
    const filas = await obtenerVentasPendientes();
    res.json({ success: true, ventas: filas });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const postMarcarBoleta = async (req, res) => {
  try {
    const { id_venta, folio_interno } = req.body;

    await marcarBoleta(id_venta, folio_interno);

    res.json({
      success: true,
      message: "Venta marcada como boleteada."
    });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
