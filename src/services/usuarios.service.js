// services/usuarios.service.js
import pool from "../config/db.js";

export const getUsuarios = () => {
  return pool.query(`
    SELECT id, rut, nombre_usuario, tipo_usuario, activo, en_linea, created_at, updated_at
    FROM usuarios
    ORDER BY id DESC
  `);
};

export const getUsuarioById = (id) => {
  return pool.query(
    `
    SELECT id, rut, nombre_usuario, tipo_usuario, activo, en_linea, created_at, updated_at
    FROM usuarios
    WHERE id = ?
    LIMIT 1
  `,
    [id]
  );
};

export const crearUsuario = ({ rut, nombre_usuario, tipo_usuario }) => {
  return pool.query(
    `
    INSERT INTO usuarios (rut, nombre_usuario, tipo_usuario, activo, en_linea)
    VALUES (?, ?, ?, 1, 0)
  `,
    [rut, nombre_usuario, tipo_usuario]
  );
};

export const actualizarUsuario = ({ id, rut, nombre_usuario, tipo_usuario }) => {
  return pool.query(
    `
    UPDATE usuarios
    SET rut = ?, nombre_usuario = ?, tipo_usuario = ?
    WHERE id = ?
  `,
    [rut, nombre_usuario, tipo_usuario, id]
  );
};

export const cambiarEstadoUsuario = (id, activo) => {
  return pool.query(
    `
    UPDATE usuarios
    SET activo = ?
    WHERE id = ?
  `,
    [activo, id]
  );
};

export const marcarEnLinea = (id, en_linea) => {
  return pool.query(
    `
    UPDATE usuarios
    SET en_linea = ?
    WHERE id = ?
  `,
    [en_linea, id]
  );
};

export const eliminarUsuario = (id) => {
  return pool.query(`DELETE FROM usuarios WHERE id = ?`, [id]);
};
