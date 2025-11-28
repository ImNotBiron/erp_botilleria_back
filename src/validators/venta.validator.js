// src/validators/venta.validator.js

/* ============================================================
   VALIDAR PRODUCTOS (CON PRECIOS DESDE BD)
   ------------------------------------------------------------
   - Verifica que existan productos
   - Obtiene precio real y exento desde BD
   - Reemplaza lo enviado por frontend (seguridad)
   - Calcula total_general y total_exento
============================================================ */

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

    // 🔥 Traemos el producto REAL desde la BD, incluyendo mayorista
    const [prodRows] = await conn.query(
      `
      SELECT 
        nombre,
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

    // ===============================
    // LÓGICA DE PRECIO APLICADO
    // ===============================
    let precioAplicado = prod.precio_venta;

    const tieneMayorista =
      prod.precio_mayorista != null &&
      prod.precio_mayorista > 0 &&
      prod.mayorista_cantidad_min != null &&
      prod.mayorista_cantidad_min > 0;

    if (tieneMayorista && it.cantidad >= prod.mayorista_cantidad_min) {
      // 👉 Aplica precio mayorista
      precioAplicado = prod.precio_mayorista;
      // Si quieres marcarlo: it.es_mayorista = 1;
    } else {
      // it.es_mayorista = 0;
    }

    // Reemplazamos datos que vienen del front por los REALES
    it.nombre_producto = prod.nombre;
    it.precio_unitario = precioAplicado;
    it.exento_iva = prod.exento_iva;

    const subtotal = precioAplicado * it.cantidad;
    total_general += subtotal;

    if (prod.exento_iva === 1) {
      total_exento += subtotal;
    }
  }

  return { total_general, total_exento };
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
      "Pagos con tarjeta/transferencia exceden el monto afecto. "
      + "No se pueden pagar productos exentos (cigarros) con tarjeta."
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
