// src/services/caja.service.js

import pool from "../config/db.js";

/* ============================================================
   HELPERS
============================================================ */

// Asegura que un valor sea número entero >= 0 (o lanza error)
const toIntOrZero = (val) => {
  const n = Number(val);
  return Number.isNaN(n) ? 0 : Math.trunc(n);
};

/* ============================================================
   OBTENER CAJA ACTIVA
   ------------------------------------------------------------
   Retorna la sesión de caja en estado "ABIERTA".
============================================================ */
export const obtenerCajaActiva = async () => {
  const [rows] = await pool.query(
    `SELECT * FROM caja_sesiones WHERE estado = 'ABIERTA' LIMIT 1`
  );
  return rows.length > 0 ? rows[0] : null;
};

/* ============================================================
   ABRIR CAJA
   ------------------------------------------------------------
   - Verifica que NO haya caja abierta.
   - Inserta nueva sesión con inicial_local / inicial_vecina.
============================================================ */
export const abrirCaja = async (
  id_usuario_apertura,
  inicial_local,
  inicial_vecina
) => {
  const cajaActiva = await obtenerCajaActiva();
  if (cajaActiva) {
    throw new Error("Ya existe una caja abierta. Debes cerrarla antes de abrir otra.");
  }

  const inicialLocalNum = toIntOrZero(inicial_local);
  const inicialVecinaNum = toIntOrZero(inicial_vecina);

  if (inicialLocalNum < 0 || inicialVecinaNum < 0) {
    throw new Error("Los montos iniciales no pueden ser negativos.");
  }

  const [result] = await pool.query(
    `
      INSERT INTO caja_sesiones (
        fecha_apertura,
        id_usuario_apertura,
        inicial_local,
        inicial_vecina,
        total_efectivo_giro,
        total_debito,
        total_credito,
        total_transferencia,
        total_exento,
        ingresos_extra,
        egresos,
        movimientos_vecina,
        total_esperado_local,
        total_esperado_vecina,
        total_real_local,
        total_real_vecina,
        diferencia_local,
        diferencia_vecina,
        tickets_efectivo,
        tickets_debito,
        tickets_credito,
        tickets_transferencia,
        estado
      )
      VALUES (
        NOW(),
        ?,
        ?,
        ?,
        0, 0, 0, 0, 0,
        0, 0, 0,
        0, 0,
        NULL, NULL,
        NULL, NULL,
        0, 0, 0, 0,
        'ABIERTA'
      )
    `,
    [id_usuario_apertura, inicialLocalNum, inicialVecinaNum]
  );

  return result.insertId;
};

/* ============================================================
   REGISTRAR MOVIMIENTO MANUAL DE CAJA
   ------------------------------------------------------------
   Tipos: 'INGRESO' | 'EGRESO' | 'VECINA'
   - Siempre ligado a la caja ACTIVA.
   - Actualiza agregados en caja_sesiones.
============================================================ */
export const registrarMovimiento = async ({
  tipo,
  categoria,
  monto,
  descripcion,
  id_proveedor = null,
  id_proveedor_vendedor = null,
  id_usuario,
}) => {
  const caja = await obtenerCajaActiva();
  if (!caja) {
    throw new Error("No hay caja abierta. No se pueden registrar movimientos.");
  }

  // ✅ Solo INGRESO / EGRESO afectan los agregados
  if (!["INGRESO", "EGRESO"].includes(tipo)) {
    throw new Error("Tipo de movimiento inválido. Solo INGRESO o EGRESO.");
  }

  if (!categoria || typeof categoria !== "string") {
    throw new Error("Debe indicar una categoría de movimiento.");
  }

  const montoNum = Number(monto);
  if (Number.isNaN(montoNum) || montoNum <= 0) {
    throw new Error("Monto inválido. Debe ser un número mayor a cero.");
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `
        INSERT INTO caja_movimientos
          (id_caja_sesion, tipo, categoria, monto, descripcion,
           id_proveedor, id_proveedor_vendedor, anulado, fecha, id_usuario)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(), ?)
      `,
      [
        caja.id,
        tipo,
        categoria,
        montoNum,
        descripcion || null,
        id_proveedor || null,
        id_proveedor_vendedor || null,
        id_usuario,
      ]
    );

    let deltaIngresos = 0;
    let deltaEgresos = 0;

    if (tipo === "INGRESO") {
      deltaIngresos = montoNum;
    } else if (tipo === "EGRESO") {
      deltaEgresos = montoNum;
    }

    await conn.query(
      `
        UPDATE caja_sesiones
        SET
          ingresos_extra = ingresos_extra + ?,
          egresos        = egresos        + ?
        WHERE id = ?
      `,
      [deltaIngresos, deltaEgresos, caja.id]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


/* ============================================================
   CERRAR CAJA
   ------------------------------------------------------------
   - Calcula totales esperados local/vecina.
   - Guarda montos reales ingresados por el usuario.
   - Calcula diferencias.
============================================================ */
export const cerrarCaja = async (
  id_usuario_cierre,
  total_real_local,
  total_real_vecina
) => {
  const caja = await obtenerCajaActiva();
  if (!caja) {
    throw new Error("No hay caja abierta para cerrar.");
  }

  const realLocalNum = toIntOrZero(total_real_local);
  const realVecinaNum = toIntOrZero(total_real_vecina);

  // ✅ Reglas nuevas:

  // 1) Caja LOCAL: NO se descuenta exento, y Caja Vecina no afecta el efectivo local.
  const totalEsperadoLocal =
    caja.inicial_local +
    caja.total_efectivo_giro +
    caja.ingresos_extra -
    caja.egresos;

  // 2) Caja VECINA: solo comparamos saldo inicial vs saldo final
  const totalEsperadoVecina = caja.inicial_vecina;

  const diferenciaLocal = realLocalNum - totalEsperadoLocal;
  const diferenciaVecina = realVecinaNum - totalEsperadoVecina;

  await pool.query(
    `
      UPDATE caja_sesiones
      SET
        fecha_cierre         = NOW(),
        id_usuario_cierre    = ?,
        total_esperado_local = ?,
        total_esperado_vecina= ?,
        total_real_local     = ?,
        total_real_vecina    = ?,
        diferencia_local     = ?,
        diferencia_vecina    = ?,
        estado               = 'CERRADA'
      WHERE id = ?
        AND estado = 'ABIERTA'
    `,
    [
      id_usuario_cierre,
      totalEsperadoLocal,
      totalEsperadoVecina,
      realLocalNum,
      realVecinaNum,
      diferenciaLocal,
      diferenciaVecina,
      caja.id,
    ]
  );

  return {
    id_caja_sesion: caja.id,
    total_esperado_local: totalEsperadoLocal,
    total_esperado_vecina: totalEsperadoVecina,
    total_real_local: realLocalNum,
    total_real_vecina: realVecinaNum,
    diferencia_local: diferenciaLocal,
    diferencia_vecina: diferenciaVecina,
  };
};


/* ============================================================
   HISTORIAL DE CAJAS
   ------------------------------------------------------------
   Últimas N sesiones de caja (para listado en admin).
============================================================ */
export const obtenerHistorialCajas = async (limite = 50) => {
  const [rows] = await pool.query(
    `
      SELECT
        cs.*,
        ua.nombre_usuario AS usuario_apertura,
        uc.nombre_usuario AS usuario_cierre
      FROM caja_sesiones cs
      LEFT JOIN usuarios ua ON cs.id_usuario_apertura = ua.id
      LEFT JOIN usuarios uc ON cs.id_usuario_cierre  = uc.id
      ORDER BY cs.fecha_apertura DESC
      LIMIT ?
    `,
    [limite]
  );
  return rows;
};

/* ============================================================
   DETALLE DE CAJA
   ------------------------------------------------------------
   - Cabecera de la sesión
   - Movimientos asociados
============================================================ */
export const obtenerDetalleCaja = async (id_caja_sesion) => {
  const [cajaRows] = await pool.query(
    `
      SELECT
        cs.*,
        ua.nombre_usuario AS usuario_apertura,
        uc.nombre_usuario AS usuario_cierre
      FROM caja_sesiones cs
      LEFT JOIN usuarios ua ON cs.id_usuario_apertura = ua.id
      LEFT JOIN usuarios uc ON cs.id_usuario_cierre  = uc.id
      WHERE cs.id = ?
    `,
    [id_caja_sesion]
  );

  if (cajaRows.length === 0) {
    throw new Error("La sesión de caja indicada no existe.");
  }

  const caja = cajaRows[0];

  const [movimientos] = await pool.query(
    `
      SELECT
        cm.*,
        p.nombre  AS proveedor_nombre,
        pv.nombre AS proveedor_vendedor_nombre
      FROM caja_movimientos cm
      LEFT JOIN proveedores p
        ON cm.id_proveedor = p.id
      LEFT JOIN proveedores_vendedores pv
        ON cm.id_proveedor_vendedor = pv.id
      WHERE cm.id_caja_sesion = ?
      ORDER BY cm.fecha ASC
    `,
    [id_caja_sesion]
  );

  return { caja, movimientos };
};

export const actualizarCajaAnulacion = {

};