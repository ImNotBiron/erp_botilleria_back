// src/services/caja.service.js

import pool from "../config/db.js";

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
   Validaciones:
   - no debe existir caja abierta
   - montos iniciales válidos
   - usuario válido
============================================================ */
export const abrirCaja = async (id_usuario, inicial_local, inicial_vecina) => {
  if (!id_usuario) throw new Error("Usuario no identificado.");

  // Validaciones de montos
  if (inicial_local == null || isNaN(inicial_local) || inicial_local < 0)
    throw new Error("El monto inicial de la caja local es inválido.");

  if (inicial_vecina == null || isNaN(inicial_vecina) || inicial_vecina < 0)
    throw new Error("El monto inicial de la caja vecina es inválido.");

  // ¿Ya existe caja abierta?
  const caja = await obtenerCajaActiva();
  if (caja) throw new Error("Ya existe una caja abierta.");

  // Registrar apertura
  const [result] = await pool.query(
    `
      INSERT INTO caja_sesiones (
        fecha_apertura,
        id_usuario_apertura,
        inicial_local,
        inicial_vecina,
        estado
      )
      VALUES (NOW(), ?, ?, ?, 'ABIERTA')
    `,
    [id_usuario, inicial_local, inicial_vecina]
  );

  return result.insertId;
};

/* ============================================================
   VALIDAR PROVEEDOR Y VENDEDOR (si se envían)
============================================================ */
const validarProveedor = async (id_proveedor, id_proveedor_vendedor) => {
  if (!id_proveedor) return; // nada que validar

  const [prov] = await pool.query(
    "SELECT id FROM proveedores WHERE id = ?",
    [id_proveedor]
  );

  if (prov.length === 0) throw new Error("Proveedor no existe.");

  if (id_proveedor_vendedor) {
    const [vend] = await pool.query(
      "SELECT id FROM proveedores_vendedores WHERE id = ? AND id_proveedor = ?",
      [id_proveedor_vendedor, id_proveedor]
    );

    if (vend.length === 0)
      throw new Error("El vendedor no pertenece a este proveedor.");
  }
};

/* ============================================================
   REGISTRAR MOVIMIENTO DE CAJA
   ------------------------------------------------------------
   Tipos:
   - INGRESO
   - EGRESO
   - VECINA
============================================================ */
export const registrarMovimiento = async (
  id_caja_sesion,
  id_usuario,
  tipo,
  categoria,
  monto,
  descripcion,
  id_proveedor,
  id_proveedor_vendedor
) => {
  if (!id_caja_sesion) throw new Error("No hay caja activa.");
  if (!id_usuario) throw new Error("Usuario no identificado.");

  // Validación tipo
  const tiposValidos = ["INGRESO", "EGRESO", "VECINA"];
  if (!tiposValidos.includes(tipo))
    throw new Error("Tipo de movimiento inválido.");

  // Validación categoría
  if (!categoria || categoria.trim().length === 0)
    throw new Error("Debe indicar una categoría de movimiento.");

  // Validación monto
  if (monto == null || isNaN(monto) || monto <= 0)
    throw new Error("Monto inválido. Debe ser un número mayor a cero.");

  // Validación proveedor (si existe)
  await validarProveedor(id_proveedor, id_proveedor_vendedor);

  // Registrar movimiento
  await pool.query(
    `
      INSERT INTO caja_movimientos
      (id_caja_sesion, tipo, categoria, monto, descripcion,
       id_proveedor, id_proveedor_vendedor, id_usuario)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id_caja_sesion,
      tipo,
      categoria.trim(),
      monto,
      descripcion || null,
      id_proveedor || null,
      id_proveedor_vendedor || null,
      id_usuario,
    ]
  );

  // Actualizar totales en tabla caja_sesiones
  let campo = null;

  if (tipo === "INGRESO") campo = "ingresos_extra";
  else if (tipo === "EGRESO") campo = "egresos";
  else if (tipo === "VECINA") campo = "movimientos_vecina";

  if (campo) {
    await pool.query(
      `UPDATE caja_sesiones SET ${campo} = ${campo} + ? WHERE id = ?`,
      [monto, id_caja_sesion]
    );
  }
};

/* ============================================================
   CERRAR CAJA
   ------------------------------------------------------------
   Validaciones:
   - caja debe estar abierta
   - montos reales válidos
   - cálculo de esperado y diferencias
============================================================ */
export const cerrarCaja = async (
  id_caja,
  id_usuario_cierre,
  total_real_local,
  total_real_vecina
) => {
  if (!id_usuario_cierre) throw new Error("Usuario no identificado.");

  if (total_real_local == null || isNaN(total_real_local) || total_real_local < 0)
    throw new Error("Monto real de caja local es inválido.");

  if (total_real_vecina == null || isNaN(total_real_vecina) || total_real_vecina < 0)
    throw new Error("Monto real de caja vecina es inválido.");

  // Buscar caja
  const [rows] = await pool.query(
    `SELECT * FROM caja_sesiones WHERE id = ? LIMIT 1`,
    [id_caja]
  );
  if (rows.length === 0) throw new Error("Caja no encontrada.");

  const caja = rows[0];

  if (caja.estado === "CERRADA")
    throw new Error("La caja ya se encuentra cerrada.");

  // Cálculo esperado
  const esperado_local =
    caja.inicial_local +
    caja.total_efectivo_giro +
    caja.ingresos_extra -
    caja.egresos -
    caja.movimientos_vecina;

  const esperado_vecina =
    caja.inicial_vecina +
    caja.movimientos_vecina;

  const diferencia_local = total_real_local - esperado_local;
  const diferencia_vecina = total_real_vecina - esperado_vecina;

  // Guardar cierre
  await pool.query(
    `
      UPDATE caja_sesiones
      SET 
        fecha_cierre = NOW(),
        id_usuario_cierre = ?,
        total_real_local = ?,
        total_real_vecina = ?,
        diferencia_local = ?,
        diferencia_vecina = ?,
        estado = 'CERRADA'
      WHERE id = ?
    `,
    [
      id_usuario_cierre,
      total_real_local,
      total_real_vecina,
      diferencia_local,
      diferencia_vecina,
      id_caja,
    ]
  );

  return {
    esperado_local,
    esperado_vecina,
    diferencia_local,
    diferencia_vecina,
  };
};

export const obtenerHistorialCajas = async () => {
  const [rows] = await pool.query(`
    SELECT 
      cs.*,
      u1.nombre_usuario AS abierto_por,
      u2.nombre_usuario AS cerrado_por
    FROM caja_sesiones cs
    LEFT JOIN usuarios u1 ON cs.id_usuario_apertura = u1.id
    LEFT JOIN usuarios u2 ON cs.id_usuario_cierre = u2.id
    ORDER BY cs.id DESC
  `);

  return rows;
};
export const obtenerDetalleCaja = async (id_caja) => {
  // 1) Obtener datos de la caja
  const [caja_rows] = await pool.query(
    `
    SELECT 
      cs.*,
      u1.nombre_usuario AS abierto_por,
      u2.nombre_usuario AS cerrado_por
    FROM caja_sesiones cs
    LEFT JOIN usuarios u1 ON cs.id_usuario_apertura = u1.id
    LEFT JOIN usuarios u2 ON cs.id_usuario_cierre = u2.id
    WHERE cs.id = ?
    `,
    [id_caja]
  );

  if (caja_rows.length === 0)
    throw new Error("Caja no encontrada.");

  const caja = caja_rows[0];

  // 2) Obtener movimientos de caja
  const [movimientos] = await pool.query(
    `
    SELECT cm.*, p.nombre AS proveedor_nombre, pv.nombre AS vendedor_proveedor
    FROM caja_movimientos cm
    LEFT JOIN proveedores p ON cm.id_proveedor = p.id
    LEFT JOIN proveedores_vendedores pv ON cm.id_proveedor_vendedor = pv.id
    WHERE cm.id_caja_sesion = ?
    ORDER BY cm.id DESC
    `,
    [id_caja]
  );

  // 3) Obtener ventas asociadas a esta caja
  const [ventas] = await pool.query(
    `
    SELECT 
      v.id,
      v.fecha,
      v.total_general,
      v.total_afecto,
      v.total_exento,
      v.tipo_venta,
      v.boleteado,
      u.nombre_usuario AS vendedor
    FROM ventas v
    LEFT JOIN usuarios u ON v.id_usuario = u.id
    WHERE v.id_caja_sesion = ?
    ORDER BY v.id DESC
    `,
    [id_caja]
  );

  return {
    caja,
    movimientos,
    ventas
  };
};

/* ============================================================
   REVERTIR TOTALES EN CAJA POR ANULACIÓN
============================================================ */
export const actualizarCajaAnulacion = async (
  conn,
  id_caja_sesion,
  pagos,
  total_exento,
  tipo_venta
) => {

  let efectivo_giro = 0;
  let debito = 0;
  let credito = 0;
  let transferencia = 0;

  for (const p of pagos) {
    const monto = Number(p.monto);

    switch (p.tipo_pago) {
      case "EFECTIVO":
      case "GIRO":
        efectivo_giro += monto;
        break;
      case "DEBITO":
        debito += monto;
        break;
      case "CREDITO":
        credito += monto;
        break;
      case "TRANSFERENCIA":
        transferencia += monto;
        break;
    }
  }

  // Revertir montos
  await conn.query(
    `
      UPDATE caja_sesiones
      SET 
        total_efectivo_giro   = total_efectivo_giro   - ?,
        total_debito          = total_debito          - ?,
        total_credito         = total_credito         - ?,
        total_transferencia   = total_transferencia   - ?,
        total_exento          = total_exento          - ?
      WHERE id = ?
    `,
    [efectivo_giro, debito, credito, transferencia, total_exento, id_caja_sesion]
  );

  // Revertir tickets
  await conn.query(
    `
      UPDATE caja_sesiones
      SET 
        tickets_efectivo      = tickets_efectivo      - ?,
        tickets_debito        = tickets_debito        - ?,
        tickets_credito       = tickets_credito       - ?,
        tickets_transferencia = tickets_transferencia - ?
      WHERE id = ?
    `,
    [
      efectivo_giro > 0 ? 1 : 0,
      debito > 0 ? 1 : 0,
      credito > 0 ? 1 : 0,
      transferencia > 0 ? 1 : 0,
      id_caja_sesion
    ]
  );

  // En ventas internas revertimos caja vecina
  if (tipo_venta === "INTERNA") {
    await conn.query(
      `
        UPDATE caja_sesiones
        SET movimientos_vecina = movimientos_vecina - ?
        WHERE id = ?
      `,
      [efectivo_giro + debito + credito + transferencia, id_caja_sesion]
    );
  }
};
  
