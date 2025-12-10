// src/validators/venta.validator.js

/* ============================================================
   VALIDAR PRODUCTOS (CON PRECIOS DESDE BD)
   ------------------------------------------------------------
   - Verifica que existan productos
   - Obtiene precio real y exento desde BD
   - Reemplaza lo enviado por frontend (seguridad)
   - Calcula total_general y total_exento
============================================================ */

const HIELO_1KG_CODIGO = "HIE001"; // código del Hielo 1kg usado en combos scanner

/* ============================================================
   AJUSTE POR PROMOCIONES FIJAS (COMBOS ARMADOS)
   ------------------------------------------------------------
   - Usa tablas:
       promociones (tipo_promocion = 'FIJA', precio_promocion, activa = 1)
       promociones_detalles (id_promocion, id_producto, cantidad, es_gratis)
   - Items deben venir con:
       es_promo (0/1) y promo_id (id de la promo)
   - Flujo:
       1) validarProductos calcula todos los subtotales normales.
       2) Aquí vemos cuántos combos completos hay por promo.
       3) Calculamos cuánto costarían esos combos a precio normal
          (incluyendo también los productos marcados como es_gratis)
          y restamos la diferencia para dejar el combo en precio_promocion.
============================================================ */

const aplicarDescuentoPromosFijas = async (items, conn, totales) => {
  const promoIds = [
    ...new Set(
      items
        .filter((it) => it.es_promo && it.promo_id != null)
        .map((it) => it.promo_id)
    ),
  ];

  if (promoIds.length === 0) return;

  for (const promoId of promoIds) {
    if (!promoId) continue;

    // Promo FIJA activa
    const [promoRows] = await conn.query(
      `
        SELECT id, tipo_promocion, precio_promocion
        FROM promociones
        WHERE id = ? AND activa = 1
      `,
      [promoId]
    );

    if (promoRows.length === 0) continue;

    const promo = promoRows[0];

    if (promo.tipo_promocion !== "FIJA") continue;
    if (promo.precio_promocion == null || promo.precio_promocion <= 0) continue;

    // Detalles de la promo
    const [detRows] = await conn.query(
      `
        SELECT id_producto, cantidad, es_gratis
        FROM promociones_detalle
        WHERE id_promocion = ?
      `,
      [promoId]
    );

    if (detRows.length === 0) continue;

    // 1) ¿Cuántos combos completos podemos armar?
    let combosPosibles = Infinity;

    for (const det of detRows) {
      const linea = items.find(
        (it) =>
          it.promo_id === promoId &&
          it.id_producto === det.id_producto
      );
      if (!linea) {
        combosPosibles = 0;
        break;
      }

      const cantLinea = Number(linea.cantidad) || 0;
      const cantDet = Number(det.cantidad) || 0;

      if (cantDet <= 0) {
        combosPosibles = 0;
        break;
      }

      const combosDesdeLinea = Math.floor(cantLinea / cantDet);
      combosPosibles = Math.min(combosPosibles, combosDesdeLinea);
    }

    if (!combosPosibles || combosPosibles <= 0) continue;

    // 2) Precio "normal" de UN combo (incluyendo productos es_gratis)
    let precioNormalCombo = 0;

    for (const det of detRows) {
      const linea = items.find(
        (it) =>
          it.promo_id === promoId &&
          it.id_producto === det.id_producto
      );
      if (!linea) continue;

      const precioUnit = Number(linea.precio_unitario) || 0;
      const cantDet = Number(det.cantidad) || 0;

      precioNormalCombo += precioUnit * cantDet;
    }

    const descuentoPorCombo = precioNormalCombo - promo.precio_promocion;
    if (descuentoPorCombo <= 0) continue;

    const descuentoTotal = descuentoPorCombo * combosPosibles;

    // Descontamos del total_general (afecto)
    totales.total_general -= descuentoTotal;
    // Si quisieras afinar exento vs afecto se puede hacer aquí más adelante.
  }
};

// =============================================================

export const validarProductos = async (items, conn) => {
  if (!items || items.length === 0)
    throw new Error("La venta no contiene productos.");

  let total_general = 0;
  let total_exento = 0;

  for (const it of items) {
    if (!it.id_producto)
      throw new Error("Producto sin ID.");

    if (it.cantidad == null || it.cantidad <= 0)
      throw new Error("Cantidad inválida para un producto.");

    // Producto REAL desde la BD (incluye mayorista y código)
    const [prodRows] = await conn.query(
      `
        SELECT 
          codigo_producto,
          nombre_producto,
          precio_venta,
          precio_mayorista,
          cantidad_mayorista,
          exento_iva
        FROM productos
        WHERE id = ?
      `,
      [it.id_producto]
    );

    if (prodRows.length === 0)
      throw new Error("Producto no existe en la base de datos.");

    const prod = prodRows[0];

    // ---------------------------------------------------------
    // CASO ESPECIAL: HIELO 1KG REGALO DE COMBO SCANNER
    // ---------------------------------------------------------
    const esPromo = it.es_promo === 1 || it.es_promo === true || it.es_promo === "1";

    if (esPromo && prod.codigo_producto === HIELO_1KG_CODIGO) {
      // Hielo de combo → precio 0, no se suma al total
      it.nombre_producto = prod.nombre_producto;
      it.precio_unitario = 0;
      it.exento_iva = prod.exento_iva;
      it.es_mayorista = 0;

      // subtotal = 0, no modifica total_general ni total_exento
      continue;
    }

    // ===============================
    // LÓGICA DE PRECIO APLICADO
    // ===============================
    let precioAplicado = prod.precio_venta;

    const tieneMayorista =
      prod.precio_mayorista != null &&
      prod.precio_mayorista > 0 &&
      prod.cantidad_mayorista != null &&
      prod.cantidad_mayorista > 0;

    if (tieneMayorista && it.cantidad >= prod.cantidad_mayorista) {
      // 👉 Aplica precio mayorista
      precioAplicado = prod.precio_mayorista;
      it.es_mayorista = 1;
    } else {
      it.es_mayorista = 0;
    }

    // Reemplazamos datos que vienen del front por los REALES
    it.nombre_producto = prod.nombre_producto;
    it.precio_unitario = precioAplicado;
    it.exento_iva = prod.exento_iva;

    const subtotal = precioAplicado * it.cantidad;
    total_general += subtotal;

    if (prod.exento_iva === 1) {
      total_exento += subtotal;
    }
  }

  // 🔹 Ajustar totales por PROMOS FIJAS (combos armados)
  const totales = { total_general, total_exento };
  await aplicarDescuentoPromosFijas(items, conn, totales);

  return totales;
};



/* ============================================================
   VALIDAR PAGOS
   ------------------------------------------------------------
   - Debe haber al menos un método de pago
   - Deben sumar igual que total_general
   - Tarjetas/transferencias NO pueden pagar exentos
   - Saltar reglas si la venta es INTERNA
============================================================ */
export const validarPagos = (pagos, total_general, total_exento, tipo_venta) => {
  if (!pagos || pagos.length === 0)
    throw new Error("Debe ingresar al menos un método de pago.");

  // Validar suma total
  const sumaPagos = pagos.reduce((acc, p) => acc + Number(p.monto), 0);

  if (sumaPagos !== total_general)
    throw new Error(
      `La suma de los pagos (${sumaPagos}) no coincide con el total de la venta (${total_general}).`
    );

  // Regla especial para ventas internas → no se aplican las restricciones del SII
  if (tipo_venta === "INTERNA") return;

  // Tarjetas no pueden pagar productos exentos
  const pagosNoEfectivo = pagos
    .filter((p) => !["EFECTIVO", "GIRO"].includes(p.tipo))
    .reduce((acc, p) => acc + Number(p.monto), 0);

  const maxNoEfectivo = total_general - total_exento;

  if (pagosNoEfectivo > maxNoEfectivo) {
    throw new Error(
      "Pagos con tarjeta/transferencia exceden el monto afecto. " +
      "No se pueden pagar productos exentos (cigarros) con tarjeta."
    );
  }
};

/* ============================================================
   VALIDAR TIPO DE VENTA
   ------------------------------------------------------------
   Aceptamos:
   - NORMAL
   - INTERNA
============================================================ */
export const validarTipoVenta = (tipo) => {
  const t = (tipo || "").toUpperCase();

  if (t !== "NORMAL" && t !== "INTERNA")
    throw new Error("Tipo de venta inválido. Debe ser NORMAL o INTERNA.");

  return t;
};
