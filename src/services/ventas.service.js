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

};

/* ============================================================
   CREAR VENTA
============================================================ */
export const crearVenta = async (req, conn) => {
  const {
    items,
    pagos,
    tipo_venta = "NORMAL",
    nota_interna,
    monto_total_interno,
  } = req.body;

  const id_usuario = req.user?.id;
  if (!id_usuario) {
    throw new Error("Usuario no identificado.");
  }

  // Normalizar tipo
  const tipoVenta = tipo_venta === "INTERNA" ? "INTERNA" : "NORMAL";

  // 1) Validar caja activa
  const caja = await obtenerCajaActiva();
  if (!caja) {
    throw new Error("No hay una caja abierta. No se puede registrar la venta.");
  }
  const id_caja_sesion = caja.id;

  // 2) Validar productos (precios reales desde BD)
  const {
    total_general: totalBase,
    total_exento: totalExentoBase,
  } = await validarProductos(items, conn);

  const totalAfectoBase = totalBase - totalExentoBase;

  if (totalBase <= 0) {
    throw new Error("El total de la venta debe ser mayor a cero.");
  }

  // ========================================================
  //       NUEVA LÓGICA DE TOTALES PARA VENTA INTERNA
  // ========================================================

  // Por defecto, si es venta normal:
  let total_general = totalBase;
  let total_afecto = totalAfectoBase;
  let total_exento_final = totalExentoBase;

  // Si es venta interna, el admin puede definir un monto total
  if (tipoVenta === "INTERNA" && monto_total_interno != null) {
    const m = Number(monto_total_interno);

    if (Number.isNaN(m) || m <= 0) {
      throw new Error("Monto total interno inválido.");
    }

    // Para internas:
    // - total_general = monto definido por admin
    // - total_afecto = monto definido por admin
    // - total_exento_final = 0 (no aplica SII)
    total_general = m;
    total_afecto = m;
    total_exento_final = 0;
  }

  // ========================================================
  //   VALIDAR PAGOS CON EL TOTAL FINAL (INCLUIDO INTERNA)
  // ========================================================
  validarPagos(pagos, total_general, total_exento_final, tipoVenta);

    // ========================================================
  // 5) INSERTAR CABECERA DE LA VENTA
  // ========================================================
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
      total_general,        // <-- puede ser total_base o total_interno
      total_afecto,         // <-- si es interna, queda igual al monto interno
      total_exento_final,   // <-- internas = 0
      tipoVenta === "INTERNA" ? (nota_interna || null) : null,
    ]
  );

  const id_venta = ventaRes.insertId;

  // ========================================================
  // 6) INSERTAR PAGOS
  // ========================================================
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

  // ========================================================
  // 7) INSERTAR DETALLE + 8) ACTUALIZAR STOCK
  // ========================================================
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

    // Movimiento de stock
    await registrarMovimientoStock({
      conn,
      id_producto: it.id_producto,
      id_usuario,
      id_caja_sesion,
      tipo_movimiento: "VENTA",
      cantidad: -it.cantidad,
      descripcion: `Venta N° ${id_venta}`,
    });
  }

  // ========================================================
  // 9) ACTUALIZAR CAJA (con los totales finales)
  // ========================================================
  await actualizarCajaDesdeVenta(
    conn,
    id_caja_sesion,
    pagos,
    total_exento_final,  // <-- si es interna, 0
    tipoVenta
  );

  // ========================================================
  // 10) GUARDAR VOUCHER JSON
  // ========================================================
  await conn.query(
    `
      INSERT INTO vouchers (id_venta, contenido)
      VALUES (?, ?)
    `,
    [id_venta, JSON.stringify({ items, pagos })]
  );

  // ========================================================
  // RESPUESTA AL CONTROLLER
  // ========================================================
  return {
    id_venta,
    tipo_venta: tipoVenta,
    total_general,
    total_afecto,
    total_exento: total_exento_final,
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



// POS: previsualizar venta (totales + precios reales + promos fijas)
export const previsualizarVentaPos = async (req, conn) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error("La previsualización no contiene productos.");
  }

  // Vamos a construir el resultado manteniendo el mismo orden
  const resultadoItems = new Array(items.length);

  // Ítems que SÍ pasan por validarProductos (no son "gratis promo" tipo hielo 0 sin promo_id)
  const itemsParaValidar = [];

  // Guardamos índices de los ítems gratis de promo (ej: hielo combo licores)
  const indicesPromoGratis = [];

  items.forEach((orig, index) => {
    const cantidad = Number(orig.cantidad) || 0;
    if (!orig.id_producto || cantidad <= 0) {
      throw new Error("Producto inválido en la previsualización POS.");
    }

    const esPromo = !!orig.es_promo;
    const precioUnitarioFront = Number(orig.precio_unitario ?? 0) || 0;

    // Caso especial: combos donde el front define precio 0 (ej: hielo de combo scanner),
    // y que NO pertenecen a una promo fija (no tienen promo_id)
    if (esPromo && precioUnitarioFront === 0 && !orig.promo_id) {
      indicesPromoGratis.push(index);
      resultadoItems[index] = {
        // guardamos lo básico y luego completamos con nombre / exento
        id_producto: orig.id_producto,
        cantidad,
        es_promo: 1,
        promo_id: orig.promo_id ?? null,
        precio_unitario: 0,
      };
    } else {
      // Estos pasan por validarProductos (mayorista, exento, etc.)
      itemsParaValidar.push({
        id_producto: orig.id_producto,
        cantidad,
        es_promo: esPromo ? 1 : 0,
        promo_id: orig.promo_id ?? null,
        // guardamos índice para luego rearmar en la misma posición
        __index: index,
      });
    }
  });

  let total_general = 0;
  let total_exento = 0;

  // Procesamos los ítems normales / mayoristas / promos fijas
  if (itemsParaValidar.length > 0) {
    // 1) Enriquecer con nombre, precio normal/mayorista, exento, etc.
    await validarProductos(itemsParaValidar, conn);

    // 2) Aplicar lógica de promociones FIJAS (precio_promocion)
    const { total_general: tg, total_exento: te } =
      await recalcularTotalesConPromosFijas(itemsParaValidar, conn);

    total_general += tg;
    total_exento += te;

    // validarProductos + recalcularTotalesConPromosFijas mutaron itemsParaValidar con:
    // nombre_producto, precio_unitario final, exento_iva, es_mayorista
    for (const it of itemsParaValidar) {
      const idx = it.__index;

      resultadoItems[idx] = {
        id_producto: it.id_producto,
        cantidad: it.cantidad,
        nombre_producto: it.nombre_producto,
        precio_unitario: it.precio_unitario,
        exento_iva: it.exento_iva,
        es_promo: it.es_promo ? 1 : 0,
        promo_id: it.promo_id ?? null,
        es_mayorista: it.es_mayorista ? 1 : 0,
      };
    }
  }

  // Ahora completamos los ítems promocionales "gratis" (precio 0, ej: hielo regalo)
  for (const idx of indicesPromoGratis) {
    const itm = resultadoItems[idx];

    const [rows] = await conn.query(
      `
        SELECT nombre_producto, exento_iva
        FROM productos
        WHERE id = ?
      `,
      [itm.id_producto]
    );

    if (rows.length === 0) {
      throw new Error("Producto promocional no existe en la base de datos.");
    }

    const prod = rows[0];

    resultadoItems[idx] = {
      ...itm,
      nombre_producto: prod.nombre_producto,
      exento_iva: prod.exento_iva,
      // precio_unitario ya es 0, subtotal = 0
    };
    // total_general no cambia (es 0)
    // si es exento_iva = 1, igual subtotal es 0 → no afecta total_exento
  }

  const total_afecto = total_general - total_exento;

  return {
    items: resultadoItems,
    total_general,
    total_afecto,
    total_exento,
  };
};

// ================================
// LISTAR VENTAS POR USUARIO (+ filtros)
// ================================
export const listarVentasUsuario = async (id_usuario, filtros = {}, conn) => {
  const { fecha_desde, fecha_hasta, id_caja_sesion } = filtros;

  let where = "WHERE v.id_usuario = ?";
  const params = [id_usuario];

  if (fecha_desde) {
    where += " AND v.fecha >= ?";
    params.push(fecha_desde + " 00:00:00");
  }

  if (fecha_hasta) {
    where += " AND v.fecha <= ?";
    params.push(fecha_hasta + " 23:59:59");
  }

  if (id_caja_sesion) {
    where += " AND v.id_caja_sesion = ?";
    params.push(id_caja_sesion);
  }

  const [rows] = await conn.query(
    `
      SELECT
        v.id,
        v.fecha,
        v.tipo_venta,
        v.total_general,
        v.total_afecto,
        v.total_exento,
        v.id_caja_sesion,
        v.estado
      FROM ventas v
      ${where}
      ORDER BY v.fecha DESC
      LIMIT 200
    `,
    params
  );

  return rows;
};

// ================================
// OBTENER DETALLE DE UNA VENTA
// (cabecera + productos + pagos)
// ================================
export const obtenerVentaDetalle = async (id_venta, id_usuario, conn) => {
  // Cabecera (además valida que la venta sea del usuario)
  const [cabRows] = await conn.query(
    `
      SELECT
        v.id,
        v.fecha,
        v.tipo_venta,
        v.total_general,
        v.total_afecto,
        v.total_exento,
        v.id_caja_sesion,
        v.estado
      FROM ventas v
      WHERE v.id = ? AND v.id_usuario = ?
    `,
    [id_venta, id_usuario]
  );

  if (cabRows.length === 0) {
    throw new Error("Venta no encontrada o no pertenece al usuario.");
  }

  const cabecera = cabRows[0];

  // Detalle de productos
  const [items] = await conn.query(
    `
      SELECT
        id_producto,
        nombre_producto,
        cantidad,
        precio_unitario,
        precio_final,
        exento_iva,
        es_promo
      FROM ventas_detalle
      WHERE id_venta = ?
    `,
    [id_venta]
  );

  // Pagos
  const [pagos] = await conn.query(
    `
      SELECT
        tipo_pago,
        monto
      FROM ventas_pagos
      WHERE id_venta = ?
    `,
    [id_venta]
  );

  return { cabecera, items, pagos };
};

/* ============================================================
   ACTUALIZAR CAJA POR DEVOLUCIÓN
   ------------------------------------------------------------
   - Ajusta totales de métodos de pago
   - Ajusta total_exento devuelto
   - NO toca tickets_* (siguen representando tickets generados)
============================================================ */
const actualizarCajaPorDevolucion = async (
  conn,
  id_caja_sesion,
  metodo_pago,
  totalDevuelto,
  totalExentoDevuelto
) => {
  const sets = [];
  const params = [];

  if (totalDevuelto > 0) {
    if (metodo_pago === "EFECTIVO" || metodo_pago === "GIRO") {
      sets.push("total_efectivo_giro = total_efectivo_giro - ?");
      params.push(totalDevuelto);
    } else if (metodo_pago === "DEBITO") {
      sets.push("total_debito = total_debito - ?");
      params.push(totalDevuelto);
    } else if (metodo_pago === "CREDITO") {
      sets.push("total_credito = total_credito - ?");
      params.push(totalDevuelto);
    } else if (metodo_pago === "TRANSFERENCIA") {
      sets.push("total_transferencia = total_transferencia - ?");
      params.push(totalDevuelto);
    }
  }

  if (totalExentoDevuelto > 0) {
    sets.push("total_exento = total_exento - ?");
    params.push(totalExentoDevuelto);
  }

  if (sets.length === 0) return;

  const sql = `
    UPDATE caja_sesiones
    SET ${sets.join(", ")}
    WHERE id = ?
  `;
  params.push(id_caja_sesion);

  await conn.query(sql, params);
};

/* ============================================================
   DEVOLVER VENTA (PARCIAL O TOTAL)
   ------------------------------------------------------------
   Body esperado:
   - items: [{ id_producto, cantidad }]
   - motivo: string (opcional)
   - metodo_pago: 'EFECTIVO' | 'GIRO' | 'DEBITO' | 'CREDITO' | 'TRANSFERENCIA'
============================================================ */
export const devolverVentaParcial = async (req, conn) => {
  const id_usuario = req.user?.id;
  if (!id_usuario) {
    throw new Error("Usuario no identificado.");
  }

  const id_venta = Number(req.params.id || req.body.id_venta);
  if (!id_venta) {
    throw new Error("ID de venta inválido.");
  }

  const { items, motivo, metodo_pago } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Debes indicar al menos un producto a devolver.");
  }

  const metodosValidos = ["EFECTIVO", "GIRO", "DEBITO", "CREDITO", "TRANSFERENCIA"];
  if (!metodosValidos.includes(metodo_pago)) {
    throw new Error("Método de devolución inválido.");
  }

  // 1) Debe existir una caja abierta (devolución siempre se hace contra caja actual)
  const cajaActiva = await obtenerCajaActiva();
  if (!cajaActiva) {
    throw new Error("No hay una caja abierta para registrar la devolución.");
  }
  const id_caja_sesion_dev = cajaActiva.id;

  // 2) Obtener venta original
  const [ventaRows] = await conn.query(
    `
      SELECT *
      FROM ventas
      WHERE id = ?
      LIMIT 1
    `,
    [id_venta]
  );

  if (ventaRows.length === 0) {
    throw new Error("Venta no encontrada.");
  }

  const venta = ventaRows[0];

  if (venta.estado !== "ACTIVA") {
    throw new Error("Solo se pueden devolver ventas activas.");
  }

  // 3) Detalle original de la venta
  const [detalleRows] = await conn.query(
    `
      SELECT id_producto, cantidad, precio_unitario, exento_iva
      FROM ventas_detalle
      WHERE id_venta = ?
    `,
    [id_venta]
  );

  if (detalleRows.length === 0) {
    throw new Error("La venta no tiene detalle de productos.");
  }

  const detallePorProducto = new Map();
  for (const row of detalleRows) {
    detallePorProducto.set(row.id_producto, row);
  }

  // 4) Cantidades ya devueltas previamente (si existen)
  const [devPrevRows] = await conn.query(
    `
      SELECT
        vdd.id_producto,
        SUM(vdd.cantidad_devuelta) AS cantidad_devuelta
      FROM ventas_devoluciones_detalle vdd
      JOIN ventas_devoluciones vd
        ON vd.id = vdd.id_devolucion
      WHERE vd.id_venta = ?
      GROUP BY vdd.id_producto
    `,
    [id_venta]
  );

  const devueltaPrevPorProd = new Map();
  for (const row of devPrevRows) {
    devueltaPrevPorProd.set(row.id_producto, Number(row.cantidad_devuelta) || 0);
  }

  // 5) Validar ítems a devolver y calcular totales
  const devolucionItems = [];
  let totalDevuelto = 0;
  let totalExentoDevuelto = 0;

  for (const it of items) {
    const id_producto = Number(it.id_producto);
    const cantidadSolicitada = Number(it.cantidad);

    if (!id_producto || cantidadSolicitada <= 0) {
      throw new Error("Datos de producto a devolver inválidos.");
    }

    const detalle = detallePorProducto.get(id_producto);
    if (!detalle) {
      throw new Error(`El producto ID ${id_producto} no pertenece a la venta.`);
    }

    const cantidadVendida = Number(detalle.cantidad) || 0;
    const cantidadDevueltaPrev = devueltaPrevPorProd.get(id_producto) || 0;
    const cantidadDisponible = cantidadVendida - cantidadDevueltaPrev;

    if (cantidadDisponible <= 0) {
      throw new Error(
        `El producto ID ${id_producto} ya fue devuelto completamente en devoluciones anteriores.`
      );
    }

    if (cantidadSolicitada > cantidadDisponible) {
      throw new Error(
        `No puedes devolver más de la cantidad disponible para el producto ID ${id_producto}. Disponible: ${cantidadDisponible}.`
      );
    }

    const precioUnitario = Number(detalle.precio_unitario) || 0;
    const exento_iva = detalle.exento_iva ? 1 : 0;

    const subtotal = precioUnitario * cantidadSolicitada;
    if (subtotal <= 0) {
      throw new Error("El subtotal de la devolución debe ser mayor a cero.");
    }

    totalDevuelto += subtotal;
    if (exento_iva === 1) {
      totalExentoDevuelto += subtotal;
    }

    devolucionItems.push({
      id_producto,
      cantidad_devuelta: cantidadSolicitada,
      monto_linea: subtotal,
      exento_iva,
    });
  }

  if (totalDevuelto <= 0) {
    throw new Error("El total devuelto debe ser mayor a cero.");
  }

  // 6) Insertar cabecera de devolución
  const [devRes] = await conn.query(
    `
      INSERT INTO ventas_devoluciones
        (id_venta, id_caja_sesion, id_usuario, motivo, metodo_pago, total_devuelto)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      id_venta,
      id_caja_sesion_dev,
      id_usuario,
      motivo || null,
      metodo_pago,
      totalDevuelto,
    ]
  );

  const id_devolucion = devRes.insertId;

  // 7) Insertar detalle de devolución + movimientos de stock
  for (const di of devolucionItems) {
    await conn.query(
      `
        INSERT INTO ventas_devoluciones_detalle
          (id_devolucion, id_producto, cantidad_devuelta, monto_linea, exento_iva)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        id_devolucion,
        di.id_producto,
        di.cantidad_devuelta,
        di.monto_linea,
        di.exento_iva,
      ]
    );

    // Movimiento de stock: suma la cantidad devuelta
    await registrarMovimientoStock({
      conn,
      id_producto: di.id_producto,
      id_usuario,
      id_caja_sesion: id_caja_sesion_dev,
      tipo_movimiento: "DEVOLUCION",
      cantidad: di.cantidad_devuelta,
      descripcion: `Devolución venta N° ${id_venta}`,
    });
  }

  // 8) Actualizar caja (totales por método de pago + exento)
  await actualizarCajaPorDevolucion(
    conn,
    id_caja_sesion_dev,
    metodo_pago,
    totalDevuelto,
    totalExentoDevuelto
  );

  // 9) Registrar movimiento en caja_movimientos (EGRESO DEVOLUCION)
  await conn.query(
    `
      INSERT INTO caja_movimientos
        (id_caja_sesion, tipo, categoria, monto, descripcion, id_usuario)
      VALUES (?, 'EGRESO', 'DEVOLUCION', ?, ?, ?)
    `,
    [
      id_caja_sesion_dev,
      totalDevuelto,
      `Devolución venta N° ${id_venta}`,
      id_usuario,
    ]
  );

  // 10) Marcar venta con devoluciones (si creaste el campo tiene_devoluciones)
  try {
    await conn.query(
      `
        UPDATE ventas
        SET tiene_devoluciones = 1
        WHERE id = ?
      `,
      [id_venta]
    );
  } catch (e) {
    // Si la columna no existe, simplemente ignoramos el error.
  }

  // (Opcional) Si quieres marcar ANULADA cuando se devuelve el 100%,
  // podríamos calcularlo aquí más adelante.

  return {
    id_venta,
    id_devolucion,
    total_devuelto: totalDevuelto,
  };
};

/* ============================================================
   OBTENER DETALLE DE UNA VENTA (para caja/admin)
   ------------------------------------------------------------
   - Devuelve cabecera + items + pagos
   - Incluye info de devoluciones previas por producto:
     cantidad_devuelta, cantidad_disponible
   - Incluye resumen: devolucion.total_devuelto y devolucion.completa
============================================================ */
export const obtenerVentaDetalleAdmin = async (id_venta, conn) => {
  // Cabecera
  const [cabRows] = await conn.query(
    `
      SELECT
        v.id,
        v.fecha,
        v.tipo_venta,
        v.total_general,
        v.total_afecto,
        v.total_exento,
        v.id_caja_sesion,
        v.estado
      FROM ventas v
      WHERE v.id = ?
      LIMIT 1
    `,
    [id_venta]
  );

  if (cabRows.length === 0) {
    throw new Error("Venta no encontrada.");
  }

  const cabecera = cabRows[0];

  // Items vendidos
  const [items] = await conn.query(
    `
      SELECT
        id_producto,
        nombre_producto,
        cantidad,
        precio_unitario,
        precio_final,
        exento_iva
      FROM ventas_detalle
      WHERE id_venta = ?
    `,
    [id_venta]
  );

  // Pagos
  const [pagos] = await conn.query(
    `
      SELECT
        tipo_pago,
        monto
      FROM ventas_pagos
      WHERE id_venta = ?
    `,
    [id_venta]
  );

  // ===== NUEVO: devoluciones previas por producto =====
  const [devPorProdRows] = await conn.query(
    `
      SELECT
        vdd.id_producto,
        SUM(vdd.cantidad_devuelta) AS cantidad_devuelta
      FROM ventas_devoluciones_detalle vdd
      JOIN ventas_devoluciones vd ON vd.id = vdd.id_devolucion
      WHERE vd.id_venta = ?
      GROUP BY vdd.id_producto
    `,
    [id_venta]
  );

  const devMap = new Map();
  for (const r of devPorProdRows) {
    devMap.set(r.id_producto, Number(r.cantidad_devuelta) || 0);
  }

  // Total devuelto en dinero (para mostrar en UI)
  const [devTotalRows] = await conn.query(
    `
      SELECT COALESCE(SUM(total_devuelto), 0) AS total_devuelto
      FROM ventas_devoluciones
      WHERE id_venta = ?
    `,
    [id_venta]
  );

  const total_devuelto = Number(devTotalRows?.[0]?.total_devuelto) || 0;

  // Enriquecer items con devuelto y disponible
  const itemsEnriquecidos = items.map((it) => {
    const vendida = Number(it.cantidad) || 0;
    const devuelta = devMap.get(it.id_producto) || 0;
    const disponible = Math.max(0, vendida - devuelta);

    return {
      ...it,
      cantidad_devuelta: devuelta,
      cantidad_disponible: disponible,
    };
  });

  // Devolución completa si todos los items quedaron sin disponible
  const devolucion_completa =
    itemsEnriquecidos.length > 0 &&
    itemsEnriquecidos.every((x) => Number(x.cantidad_disponible) === 0);

  return {
    cabecera,
    items: itemsEnriquecidos,
    pagos,
    devolucion: {
      total_devuelto,
      completa: devolucion_completa,
    },
  };
};

export const crearCambio = async (req, conn) => {
  const id_usuario = req.user?.id;
  if (!id_usuario) throw new Error("Usuario no identificado.");

  const id_venta_origen = Number(req.params.id);
  if (!id_venta_origen) throw new Error("ID de venta origen inválido.");

  const { devueltos, entregados, metodo_pago_diferencia, motivo } = req.body;

  if (!Array.isArray(devueltos) || devueltos.length === 0) {
    throw new Error("Debes indicar al menos 1 producto devuelto.");
  }
  if (!Array.isArray(entregados) || entregados.length === 0) {
    throw new Error("Debes indicar al menos 1 producto entregado.");
  }

  // caja abierta obligatoria (porque impacta caja y stock hoy)
  const caja = await obtenerCajaActiva();
  if (!caja) throw new Error("No hay caja abierta para registrar el cambio.");
  const id_caja_sesion = caja.id;

  // Traer detalle de venta origen (para precios y límites)
  const [detalleRows] = await conn.query(
    `
      SELECT id_producto, cantidad, precio_unitario, exento_iva, nombre_producto
      FROM ventas_detalle
      WHERE id_venta = ?
    `,
    [id_venta_origen]
  );
  if (detalleRows.length === 0) throw new Error("Venta origen sin detalle.");

  const detalleMap = new Map();
  for (const r of detalleRows) detalleMap.set(r.id_producto, r);

  // Ya devuelto previamente (para no pasarse)
  const [devPrevRows] = await conn.query(
    `
      SELECT vdd.id_producto, SUM(vdd.cantidad_devuelta) AS cantidad_devuelta
      FROM ventas_devoluciones_detalle vdd
      JOIN ventas_devoluciones vd ON vd.id = vdd.id_devolucion
      WHERE vd.id_venta = ?
      GROUP BY vdd.id_producto
    `,
    [id_venta_origen]
  );
  const devPrevMap = new Map();
  for (const r of devPrevRows) devPrevMap.set(r.id_producto, Number(r.cantidad_devuelta) || 0);

  // 1) Calcular total_devuelto (con precios de la venta origen)
  let total_devuelto = 0;
  let total_devuelto_exento = 0;

  const devueltosCalc = [];
  for (const it of devueltos) {
    const id_producto = Number(it.id_producto);
    const cantidad = Number(it.cantidad);

    if (!id_producto || cantidad <= 0) throw new Error("Devolución inválida.");

    const det = detalleMap.get(id_producto);
    if (!det) throw new Error(`Producto ${id_producto} no pertenece a la venta origen.`);

    const vendida = Number(det.cantidad) || 0;
    const yaDev = devPrevMap.get(id_producto) || 0;
    const disponible = vendida - yaDev;
    if (cantidad > disponible) {
      throw new Error(`Producto ${id_producto}: disponible para devolver ${disponible}.`);
    }

    const precio_unitario = Number(det.precio_unitario) || 0;
    const monto_linea = precio_unitario * cantidad;
    const exento_iva = det.exento_iva ? 1 : 0;

    total_devuelto += monto_linea;
    if (exento_iva === 1) total_devuelto_exento += monto_linea;

    devueltosCalc.push({
      id_producto,
      cantidad,
      precio_unitario,
      exento_iva,
      monto_linea,
    });
  }

  if (total_devuelto <= 0) throw new Error("Total devuelto inválido.");

  // 2) Calcular total_nuevo con precios actuales (usa validarProductos)
  // entregados: [{id_producto, cantidad}]
  const entregadosPlanos = entregados.map((x) => ({
    id_producto: Number(x.id_producto),
    cantidad: Number(x.cantidad) || 1,
  }));

  const { total_general: total_nuevo, total_exento: total_nuevo_exento } =
    await validarProductos(entregadosPlanos, conn);

  if (total_nuevo <= 0) throw new Error("Total nuevo inválido.");

  // Regla: nuevo >= devuelto
  if (total_nuevo < total_devuelto) {
    throw new Error(
      `El total del producto nuevo (${total_nuevo}) debe ser igual o mayor al devuelto (${total_devuelto}).`
    );
  }

  const diferencia = total_nuevo - total_devuelto;

  // Si hay diferencia, método obligatorio
  const metodosValidos = ["EFECTIVO", "GIRO", "DEBITO", "CREDITO", "TRANSFERENCIA"];
  if (diferencia > 0 && !metodosValidos.includes(metodo_pago_diferencia)) {
    throw new Error("Debes indicar método de pago para la diferencia.");
  }

  // 3) Insertar cabecera cambio
  const [cambioRes] = await conn.query(
    `
      INSERT INTO ventas_cambios
        (id_venta_origen, id_caja_sesion, id_usuario, motivo,
         total_devuelto, total_nuevo, diferencia, metodo_pago_diferencia)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id_venta_origen,
      id_caja_sesion,
      id_usuario,
      motivo || null,
      total_devuelto,
      total_nuevo,
      diferencia,
      diferencia > 0 ? metodo_pago_diferencia : null,
    ]
  );
  const id_cambio = cambioRes.insertId;

  // 4) Guardar devueltos + movimientos stock (ENTRAN)
  for (const d of devueltosCalc) {
    await conn.query(
      `
        INSERT INTO ventas_cambios_devueltos
          (id_cambio, id_producto, cantidad, precio_unitario, exento_iva, monto_linea)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [id_cambio, d.id_producto, d.cantidad, d.precio_unitario, d.exento_iva, d.monto_linea]
    );

    await registrarMovimientoStock({
      conn,
      id_producto: d.id_producto,
      id_usuario,
      id_caja_sesion,
      tipo_movimiento: "CAMBIO_DEVOLUCION",
      cantidad: d.cantidad, // entra
      descripcion: `Cambio #${id_cambio} (devuelto) de venta #${id_venta_origen}`,
    });
  }

  // 5) Guardar entregados + movimientos stock (SALEN)
  for (const e of entregadosPlanos) {
    // validarProductos muta entregadosPlanos con nombre_producto, precio_unitario, exento_iva
    const monto_linea = (Number(e.precio_unitario) || 0) * (Number(e.cantidad) || 0);

    await conn.query(
      `
        INSERT INTO ventas_cambios_entregados
          (id_cambio, id_producto, cantidad, precio_unitario, exento_iva, monto_linea)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [id_cambio, e.id_producto, e.cantidad, e.precio_unitario, e.exento_iva, monto_linea]
    );

    await registrarMovimientoStock({
      conn,
      id_producto: e.id_producto,
      id_usuario,
      id_caja_sesion,
      tipo_movimiento: "CAMBIO_ENTREGA",
      cantidad: -e.cantidad, // sale
      descripcion: `Cambio #${id_cambio} (entregado) por venta #${id_venta_origen}`,
    });
  }

  // 6) Caja: registrar solo DIFERENCIA como ingreso + actualizar caja_sesiones
  if (diferencia > 0) {
    // actualizar caja_sesiones según método
    const pagos = [{ tipo: metodo_pago_diferencia, monto: diferencia }];
    const { efectivo_giro, debito, credito, transferencia } = clasificarPagos(pagos);

    await conn.query(
      `
        UPDATE caja_sesiones
        SET
          total_efectivo_giro = total_efectivo_giro + ?,
          total_debito        = total_debito        + ?,
          total_credito       = total_credito       + ?,
          total_transferencia = total_transferencia + ?
        WHERE id = ?
      `,
      [efectivo_giro, debito, credito, transferencia, id_caja_sesion]
    );

    // (opcional) tickets: si quieres contar la diferencia como “ticket”:
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
        (efectivo_giro > 0 ? 1 : 0),
        (debito > 0 ? 1 : 0),
        (credito > 0 ? 1 : 0),
        (transferencia > 0 ? 1 : 0),
        id_caja_sesion,
      ]
    );

    // movimiento caja
    await conn.query(
      `
        INSERT INTO caja_movimientos
          (id_caja_sesion, tipo, categoria, monto, descripcion, id_usuario)
        VALUES (?, 'INGRESO', 'CAMBIO', ?, ?, ?)
      `,
      [
        id_caja_sesion,
        diferencia,
        `Cambio #${id_cambio} por venta #${id_venta_origen}`,
        id_usuario,
      ]
    );
  }

  return {
    id_cambio,
    id_venta_origen,
    total_devuelto,
    total_nuevo,
    diferencia,
  };
};



