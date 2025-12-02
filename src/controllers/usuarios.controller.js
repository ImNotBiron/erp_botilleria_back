import {
  getUsuarios,
  getUsuarioById,
  crearUsuario,
  actualizarUsuario,
  cambiarEstadoUsuario,
  marcarEnLinea,
  eliminarUsuario,
} from "../services/usuarios.service.js";

export const listarUsuarios = async (req, res, next) => {
  try {
    const [rows] = await getUsuarios();
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const obtenerUsuario = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await getUsuarioById(id);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};

export const crearNuevoUsuario = async (req, res, next) => {
  try {
    const { rut, nombre_usuario, tipo_usuario } = req.body;

    if (!rut || !nombre_usuario || !tipo_usuario) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    await crearUsuario({ rut, nombre_usuario, tipo_usuario });
    res.json({ success: true, message: "Usuario creado" });
  } catch (error) {
    next(error);
  }
};

export const editarUsuario = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rut, nombre_usuario, tipo_usuario } = req.body;

    await actualizarUsuario({ id, rut, nombre_usuario, tipo_usuario });
    res.json({ success: true, message: "Usuario actualizado" });
  } catch (error) {
    next(error);
  }
};

export const cambiarEstado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    await cambiarEstadoUsuario(id, activo);
    res.json({ success: true, message: "Estado actualizado" });
  } catch (error) {
    next(error);
  }
};

export const actualizarEnLinea = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { en_linea } = req.body;

    await marcarEnLinea(id, en_linea);
    res.json({ success: true, message: "Estado en línea actualizado" });
  } catch (error) {
    next(error);
  }
};

export const borrarUsuario = async (req, res, next) => {
  try {
    const { id } = req.params;

    await eliminarUsuario(id);
    res.json({ success: true, message: "Usuario eliminado" });
  } catch (error) {
    next(error);
  }
};
