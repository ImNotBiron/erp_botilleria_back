// src/services/ventas.service.js

import { obtenerCajaActiva } from "./caja.service.js";
import { validarProductos, validarPagos } from "../validators/venta.validator.js";
import { registrarMovimientoStock } from "./stock.service.js";

/* ============================================================
   CLASIFICAR PAGOS POR TIPO
   ------------------------------------------------------------
   Devuelve la suma de los montos por tipo de pago.
============================================================ */
export const clasificarPagos = (pagos) => {
  let efectivo_giro = 0;
  let debito = 0;
  let credito = 0;
  let transferencia = 0;

  for (const p of pagos) {
    const monto = Number(p.monto) || 0;

    switch (p.tipo) {
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
      default:
        // Si quieres ser más estricto, puedes lanzar error aquí
        // throw new Error(`Tipo de pago inválido: ${p.tipo}`);
        break;
    }
  }

  return { efectivo_giro, debito, credito, transferencia };
};

/* ============================================================
   ACTUALIZAR CAJA DESDE VENTA
   ------------------------------------------------------------
   - Actualiza totales de métodos de pago
   - Actualiza cantidad de tickets por método
   - Suma exento (cigarros, etc.)
   - Si es venta INTERNA, mueve todo a movimientos_vecina
============================================================ */
export const actualizarCajaDesdeVenta = async (
  conn,
  id_caja_sesion,
  pagos,
  total_exento,
  tipo_venta
) => {
  const { efectivo_giro, debito, credito, transferencia } =
    clasificarPagos(pagos);

  // Actualizar TOTALES monetarios
  await conn.query(
    `
      UPDATE caja_sesiones
      SET 
        total_efectivo_giro   = total_efectivo_giro   + ?,
        total_debito          = total_debito          + ?,
        total_credito         = total_credito         + ?,
        total_transferencia   = total_transferencia   + ?,
        total_exento          = total_exento          + ?
      WHERE id = ?
    `,
    [efectivo_giro, debito, credito, transferencia, total_exento, id_caja_sesion]
  );

  // Actualizar CONTADOR de tickets (1 ticket por venta si existe ese medio)
  await conn.query(
    `
      UPDATE caja_sesiones
      SET 
        tickets_efectivo      = tickets_efectivo      + ?,
        tickets_debito        = tickets_debito        + ?,
        tickets_credito       = tickets_credito       + ?,
        tickets_transferencia = tickets_transferencia + ?
      WHERE id = ?
    `,
    [
      efectivo_giro > 0 ? 1 : 0,
      debito > 0 ? 1 : 0,
      credito > 0 ? 1 : 0,
      transferencia > 0 ? 1 : 0,
      id_caja_sesion,
    ]
  );

  // En ventas internas, consideramos que TODO el monto es un movimiento con caja vecina
  if (tipo_venta === "INTERNA") {
    await conn.query(
      `
        UPDATE caja_sesiones
        SET movimientos_vecina = movimientos_vecina + ?
        WHERE id = ?
      `,
      [efectivo_giro + debito + credito + transferencia, id_caja_sesion]
    );
  }
};

/* ============================================================
   CREAR VENTA
   ------------------------------------------------------------
   Flujo:
   1. Validar usuario y caja activa
   2. Validar productos (precios y exento desde BD)
   3. Validar pagos (regla exentos / tarjetas)
   4. Insertar cabecera de venta
   5. Insertar pagos
   6. Insertar detalle
   7. Actualizar stock
   8. Actualizar caja
   9. Crear voucher JSON
============================================================ */
export const crearVenta = async (req, conn) => {
  const { items, pagos, tipo_venta = "NORMAL", nota_interna } = req.body;
  const id_usuario = req.user?.id;

  if (!id_usuario) {
    throw new Error("Usuario no identificado.");
  }

  // Normalizar tipo de venta
  const tipoVenta = tipo_venta === "INTERNA" ? "INTERNA" : "NORMAL";

  // 1) Validar que exista caja activa
  const caja = await obtenerCajaActiva();
  if (!caja) {
    throw new Error("No hay una caja abierta. No se puede registrar la venta.");
  }
  const id_caja_sesion = caja.id;

  // 2) Validar productos (y obtener precios desde BD)
  const { total_general, total_exento } = await validarProductos(items, conn);
  const total_afecto = total_general - total_exento;

  if (total_general <= 0) {
    throw new Error("El total de la venta debe ser mayor a cero.");
  }

  // 3) Validar pagos (sumas y reglas exento/tarjeta)
  validarPagos(pagos, total_general, total_exento, tipoVenta);

  // 4) Insertar cabecera de la venta
  const [ventaRes] = await conn.query(
    `
      INSERT INTO ventas (
        id_usuario,
        id_caja_sesion,
        tipo_venta,
        total_general,
        total_afecto,
        total_exento,
        nota_interna,
        boleteado
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `,
    [
      id_usuario,
      id_caja_sesion,
      tipoVenta,
      total_general,
      total_afecto,
      total_exento,
      tipoVenta === "INTERNA" ? (nota_interna || null) : null,
    ]
  );

  const id_venta = ventaRes.insertId;

  // 5) Insertar pagos
  for (const p of pagos) {
    const tipo_pago = p.tipo;
    const monto = Number(p.monto) || 0;

    if (!tipo_pago || monto <= 0) {
      throw new Error("Datos de pago inválidos.");
    }

    await conn.query(
      `INSERT INTO ventas_pagos (id_venta, tipo_pago, monto) VALUES (?, ?, ?)`,
      [id_venta, tipo_pago, monto]
    );
  }

  // 6) Insertar detalle + 7) Actualizar stock (registrar movimientos);
 for (const it of items) { 

  // Insertar detalle
  await conn.query(
    `
      INSERT INTO ventas_detalle
      (id_venta, id_producto, nombre_producto, cantidad,
       precio_unitario, precio_final, exento_iva)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id_venta,
      it.id_producto,
      it.nombre_producto,
      it.cantidad,
      it.precio_unitario,
      it.precio_unitario * it.cantidad,
      it.exento_iva,
    ]
  );

  // Registrar movimiento de stock PROFESIONAL
  await registrarMovimientoStock({
    conn,
    id_producto: it.id_producto,
    id_usuario,
    id_caja_sesion,
    tipo_movimiento: "VENTA",
    cantidad: -it.cantidad, // venta = resta stock
    descripcion: `Venta N° ${id_venta}`
  });
}

  // 8) Actualizar caja con totales de la venta
  await actualizarCajaDesdeVenta(
    conn,
    id_caja_sesion,
    pagos,
    total_exento,
    tipoVenta
  );

  // 9) Guardar JSON para voucher
  await conn.query(
    `
      INSERT INTO vouchers (id_venta, contenido)
      VALUES (?, ?)
    `,
    [id_venta, JSON.stringify({ items, pagos })]
  );

  // Respuesta al controller
  return {
    id_venta,
    tipo_venta: tipoVenta,
    total_general,
    total_afecto,
    total_exento,
  };
};

// ID/CÓDIGO del producto "Hielo 1kg" (se usará codigo_producto, no id fijo)
const HIELO_1KG_CODIGO = "HIE001";

/* ============================================================
   CREAR VENTA POS (con combos licores + hielo bonificado)
   ------------------------------------------------------------
   - items:
       tipo: "PRODUCTO" | "COMBO_LICORES"
       si tipo === "PRODUCTO" → { id_producto, cantidad }
       si tipo === "COMBO_LICORES" → { licor_id, bebida_id }
   - pagos: igual que crearVenta normal
============================================================ */
export const crearVentaPos = async (req, conn) => {
  const { items, pagos } = req.body;
  const id_usuario = req.user?.id;

  if (!id_usuario) {
    throw new Error("Usuario no identificado.");
  }

  if (!items || items.length === 0) {
    throw new Error("La venta POS no contiene ítems.");
  }

  // 1) Validar caja abierta
  const caja = await obtenerCajaActiva();
  if (!caja) {
    throw new Error(
      "No hay una caja abierta. No se puede registrar la venta POS."
    );
  }
  const id_caja_sesion = caja.id;

  // 2) Construir items "planos" para cobrar (licor + bebida se cobran; hielo es gratis)
  const itemsPlanos = [];
  let cantidadHielos = 0; // cuántos hielos de combo se van a regalar

  for (const it of items) {
    const cantidad = Number(it.cantidad) || 1;

    // Producto normal del POS
    if (it.tipo === "PRODUCTO") {
      itemsPlanos.push({
        id_producto: it.id_producto,
        cantidad,
      });
      continue;
    }

    // Combo licores (licor + bebida + hielo regalo)
    if (it.tipo === "COMBO_LICORES") {
      if (!it.licor_id || !it.bebida_id) {
        throw new Error("Combo licores incompleto (falta licor o bebida).");
      }

      // 1 licor
      itemsPlanos.push({
        id_producto: it.licor_id,
        cantidad: 1,
      });

      // 1 bebida
      itemsPlanos.push({
        id_producto: it.bebida_id,
        cantidad: 1,
      });

      // El hielo NO se cobra aquí, solo contamos para bonificarlo después
      cantidadHielos += 1;
      continue;
    }

    // Si llega un tipo raro
    throw new Error("Tipo de ítem POS inválido.");
  }

  if (itemsPlanos.length === 0) {
    throw new Error("No hay productos cobrables en la venta POS.");
  }

  // 3) Validar productos con tu validador normal (aplica precios, exento, mayorista, etc.)
  //    validarProductos MUTARÁ itemsPlanos añadiendo nombre_producto, precio_unitario, exento_iva
  const { total_general, total_exento } = await validarProductos(
    itemsPlanos,
    conn
  );
  const total_afecto = total_general - total_exento;

  if (total_general <= 0) {
    throw new Error("El total de la venta debe ser mayor a cero.");
  }

  // 4) Validar pagos con las mismas reglas del SII
  validarPagos(pagos, total_general, total_exento, "NORMAL");

  // 5) Insertar cabecera de venta
  const [ventaRes] = await conn.query(
    `
      INSERT INTO ventas (
        id_usuario,
        id_caja_sesion,
        tipo_venta,
        total_general,
        total_afecto,
        total_exento,
        nota_interna,
        boleteado
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `,
    [
      id_usuario,
      id_caja_sesion,
      "NORMAL",
      total_general,
      total_afecto,
      total_exento,
      null,
    ]
  );

  const id_venta = ventaRes.insertId;

  // 6) Insertar pagos
  for (const p of pagos) {
    const tipo_pago = p.tipo;
    const monto = Number(p.monto) || 0;

    if (!tipo_pago || monto <= 0) {
      throw new Error("Datos de pago inválidos.");
    }

    await conn.query(
      `INSERT INTO ventas_pagos (id_venta, tipo_pago, monto) VALUES (?, ?, ?)`,
      [id_venta, tipo_pago, monto]
    );
  }

  // 7) Insertar detalle + movimientos de stock para itemsPlanos (productos cobrados)
  for (const it of itemsPlanos) {
    await conn.query(
      `
        INSERT INTO ventas_detalle
        (id_venta, id_producto, nombre_producto, cantidad,
         precio_unitario, precio_final, exento_iva)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id_venta,
        it.id_producto,
        it.nombre_producto, // viene desde validarProductos
        it.cantidad,
        it.precio_unitario, // viene desde validarProductos
        it.precio_unitario * it.cantidad,
        it.exento_iva,
      ]
    );

    await registrarMovimientoStock({
      conn,
      id_producto: it.id_producto,
      id_usuario,
      id_caja_sesion,
      tipo_movimiento: "VENTA",
      cantidad: -it.cantidad,
      descripcion: `Venta POS N° ${id_venta}`,
    });
  }

  // 8) Agregar detalle y movimiento de stock para hielos bonificados (gratis)
  if (cantidadHielos > 0) {
    // Traer datos reales del producto hielo usando codigo_producto = 'HIE001'
    const [rowsHielo] = await conn.query(
      `
        SELECT id, nombre_producto, exento_iva
        FROM productos
        WHERE codigo_producto = ?
      `,
      [HIELO_1KG_CODIGO]
    );

    if (rowsHielo.length === 0) {
      throw new Error(
        "Producto Hielo 1kg (codigo HIE001) no encontrado en la base de datos."
      );
    }

    const prodHielo = rowsHielo[0];

    // Insertamos UNA línea con cantidad = cantidadHielos, precio 0
    await conn.query(
      `
        INSERT INTO ventas_detalle
        (id_venta, id_producto, nombre_producto, cantidad,
         precio_unitario, precio_final, exento_iva)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id_venta,
        prodHielo.id,
        prodHielo.nombre_producto,
        cantidadHielos,
        0, // 🔥 se regala
        0,
        prodHielo.exento_iva,
      ]
    );

    await registrarMovimientoStock({
      conn,
      id_producto: prodHielo.id,
      id_usuario,
      id_caja_sesion,
      tipo_movimiento: "VENTA",
      cantidad: -cantidadHielos,
      descripcion: `Hielo bonificado en combo licores. Venta POS N° ${id_venta}`,
    });
  }

  // 9) Actualizar caja con totales de la venta
  await actualizarCajaDesdeVenta(
    conn,
    id_caja_sesion,
    pagos,
    total_exento,
    "NORMAL"
  );

  // 10) Guardar voucher JSON (incluimos items originales del POS)
  await conn.query(
    `
      INSERT INTO vouchers (id_venta, contenido)
      VALUES (?, ?)
    `,
    [id_venta, JSON.stringify({ items, pagos })]
  );

  // Respuesta
  return {
    id_venta,
    tipo_venta: "NORMAL",
    total_general,
    total_afecto,
    total_exento,
  };
};
