import pool from "../config/db.js";

/* ======================================================
   LISTAR TODOS LOS PRODUCTOS (CON CATEGORÍA Y PROVEEDOR)
====================================================== */
export const listarProductos = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        p.*,
        c.nombre AS categoria,
        pr.nombre AS proveedor
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id
      LEFT JOIN proveedores pr ON p.id_proveedor = pr.id
      ORDER BY p.nombre_producto ASC
      `
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
};

/* ======================================================
   OBTENER PRODUCTO POR ID
====================================================== */
export const obtenerProducto = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT 
        p.*,
        c.nombre AS categoria,
        pr.nombre AS proveedor
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id
      LEFT JOIN proveedores pr ON p.id_proveedor = pr.id
      WHERE p.id = ?
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};

/* ======================================================
   CREAR NUEVO PRODUCTO
   - Código opcional: si no viene, se genera "P-000001" etc.
   - Categoría y proveedor OBLIGATORIOS
====================================================== */
export const crearProducto = async (req, res, next) => {
  try {
    const {
      codigo_producto,
      nombre_producto,
      precio_venta = 0,
      cantidad_mayorista = 0,
      precio_mayorista = 0,
      exento_iva = 0,
      stock = 0,
      stock_critico = 0,
      capacidad_ml = null,
      id_categoria,
      id_proveedor,
      id_proveedor_vendedor = null,
      activo = 1,
    } = req.body;

    if (!nombre_producto || nombre_producto.trim() === "") {
      return res.status(400).json({ error: "El nombre del producto es obligatorio" });
    }

    if (!id_categoria) {
      return res.status(400).json({ error: "La categoría es obligatoria" });
    }

    if (!id_proveedor) {
      return res.status(400).json({ error: "El proveedor es obligatorio" });
    }

    // ====== GENERAR CÓDIGO SI VIENE VACÍO ======
    let codigoFinal = codigo_producto && codigo_producto.trim() !== ""
      ? codigo_producto.trim()
      : null;

    if (!codigoFinal) {
      const [rows] = await pool.query(
        `
        SELECT AUTO_INCREMENT AS nextId
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'productos'
        `
      );

      const nextId = rows.length > 0 ? rows[0].nextId : 1;
      codigoFinal = "P-" + String(nextId).padStart(6, "0");
    }

    const [result] = await pool.query(
      `
      INSERT INTO productos (
        codigo_producto,
        nombre_producto,
        precio_venta,
        cantidad_mayorista,
        precio_mayorista,
        exento_iva,
        stock,
        stock_critico,
        capacidad_ml,
        id_categoria,
        id_proveedor,
        id_proveedor_vendedor,
        activo
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        codigoFinal,
        nombre_producto.trim(),
        precio_venta,
        cantidad_mayorista,
        precio_mayorista,
        exento_iva,
        stock,
        stock_critico,
        capacidad_ml,
        id_categoria,
        id_proveedor,
        id_proveedor_vendedor,
        activo,
      ]
    );

    res.status(201).json({
      success: true,
      id: result.insertId,
      codigo_producto: codigoFinal,
    });
  } catch (error) {
    next(error);
  }
};

/* ======================================================
   EDITAR PRODUCTO
   (categoría y proveedor siguen siendo obligatorios)
====================================================== */
export const editarProducto = async (req, res, next) => {
  try {
    const { id } = req.params;

    const {
      codigo_producto,
      nombre_producto,
      precio_venta = 0,
      cantidad_mayorista = 0,
      precio_mayorista = 0,
      exento_iva = 0,
      stock = 0,
      stock_critico = 0,
      capacidad_ml = null,
      id_categoria,
      id_proveedor,
      id_proveedor_vendedor = null,
    } = req.body;

    if (!nombre_producto || nombre_producto.trim() === "") {
      return res.status(400).json({ error: "El nombre del producto es obligatorio" });
    }

    if (!id_categoria) {
      return res.status(400).json({ error: "La categoría es obligatoria" });
    }

    if (!id_proveedor) {
      return res.status(400).json({ error: "El proveedor es obligatorio" });
    }

    let codigoFinal = codigo_producto && codigo_producto.trim() !== ""
      ? codigo_producto.trim()
      : null;

    if (!codigoFinal) {
      // Si al editar lo dejan vacío, generamos uno nuevo
      const [rows] = await pool.query(
        `
        SELECT AUTO_INCREMENT AS nextId
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'productos'
        `
      );

      const nextId = rows.length > 0 ? rows[0].nextId : 1;
      codigoFinal = "P-" + String(nextId).padStart(6, "0");
    }

    await pool.query(
      `
      UPDATE productos
      SET
        codigo_producto = ?,
        nombre_producto = ?,
        precio_venta = ?,
        cantidad_mayorista = ?,
        precio_mayorista = ?,
        exento_iva = ?,
        stock = ?,
        stock_critico = ?,
        capacidad_ml = ?,
        id_categoria = ?,
        id_proveedor = ?,
        id_proveedor_vendedor = ?
      WHERE id = ?
      `,
      [
        codigoFinal,
        nombre_producto.trim(),
        precio_venta,
        cantidad_mayorista,
        precio_mayorista,
        exento_iva,
        stock,
        stock_critico,
        capacidad_ml,
        id_categoria,
        id_proveedor,
        id_proveedor_vendedor,
        id,
      ]
    );

    res.json({ success: true, codigo_producto: codigoFinal });
  } catch (error) {
    next(error);
  }
};

/* ======================================================
   CAMBIAR ESTADO
====================================================== */
export const cambiarEstadoProducto = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    await pool.query(
      `
      UPDATE productos
      SET activo = ?
      WHERE id = ?
      `,
      [activo, id]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

/* ======================================================
   BORRAR PRODUCTO
====================================================== */
export const borrarProducto = async (req, res, next) => {
  try {
    const { id } = req.params;

    await pool.query("DELETE FROM productos WHERE id = ?", [id]);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const obtenerProductoPorCodigo = async (req, res, next) => {
  try {
    const { codigo } = req.params;

    const [rows] = await pool.query(
      `
      SELECT 
        p.*,
        c.nombre AS categoria,
        pr.nombre AS proveedor
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id
      LEFT JOIN proveedores pr ON p.id_proveedor = pr.id
      WHERE p.codigo_producto = ?
        AND p.activo = 1
      LIMIT 1
      `,
      [codigo]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};
