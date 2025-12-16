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
    const { id_venta, tipo, folio_sii } = req.body;

    await marcarBoleta({
      id_venta,
      tipo,
      folio_sii,
      id_usuario: req.user?.id || null,
    });

    res.json({ success: true, message: "Boleta registrada." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
