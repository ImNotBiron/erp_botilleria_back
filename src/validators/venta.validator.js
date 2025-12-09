// src/validators/venta.validator.js

/* ============================================================
   VALIDAR PRODUCTOS (CON PRECIOS DESDE BD)
   ------------------------------------------------------------
   - Verifica que existan productos
   - Obtiene precio real y exento desde BD
   - Reemplaza lo enviado por frontend (seguridad)
   - Calcula total_general y total_exento
============================================================ */

const HIELO_1KG_CODIGO = "HIE001"; // mismo código que usas en el front

export const validarProductos = async (items, conn) => {
  if (!items || items.length === 0) {
    throw new Error("La venta no contiene productos.");
  }

  let total_general = 0;
  let total_exento = 0;

  for (const it of items) {
    if (!it.id_producto) {
      throw new Error("Producto sin ID.");
    }

    if (it.cantidad == null || it.cantidad <= 0) {
      throw new Error("Cantidad inválida para un producto.");
    }

    // Traer producto real desde BD
    const [rows] = await conn.query(
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

    if (rows.length === 0) {
      throw new Error("Producto no existe en la base de datos.");
    }

    const prod = rows[0];

    // -----------------------------
    // Precio aplicado
    // -----------------------------
    let precioAplicado = prod.precio_venta;

    // Mayorista (si lo usas)
    const tieneMayorista =
      prod.precio_mayorista != null &&
      prod.precio_mayorista > 0 &&
      prod.cantidad_mayorista != null &&
      prod.cantidad_mayorista > 0;

    if (tieneMayorista && it.cantidad >= prod.cantidad_mayorista) {
      precioAplicado = prod.precio_mayorista;
    }

    // 🔥 Regla combo:
    // Si es hielo 1kg y viene marcado como promo, NO se cobra (precio 0)
    if (prod.codigo_producto === HIELO_1KG_CODIGO && it.es_promo) {
      precioAplicado = 0;
    }

    // Actualizar el item con los datos "oficiales"
    it.codigo_producto = prod.codigo_producto;
    it.nombre_producto = prod.nombre_producto;
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
