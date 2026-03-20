import prisma from "../../../prisma/prismaClient.js";
import { check, validationResult } from "express-validator";
import { uploadFile, getPublicUrl } from "../../bucket_service/bucket.js";

const createProducto = async (req, res) => {
  const {
    subcategoriaId,
    ubi_alma_id,
    nombre,
    codigo,
    color,
    descripcion,
    alto,
    ancho,
    largo,
    cantidad,
    precio_publico,
    precio_contratista,
    costo_compra,
    foto,
  } = req.body;

  // Validar los datos de entrada producto
  await check("subcategoriaId")
    .notEmpty()
    .isInt()
    .withMessage(
      "El ID de subcategoría es obligatorio y debe ser un número entero",
    )
    .run(req);
  // ubicacion_almacen_id ahora es obligatorio
  await check("ubi_alma_id")
    .notEmpty()
    .isInt()
    .withMessage("El ubi_alma_id es obligatorio y debe ser un número entero")
    .run(req);
  await check("nombre")
    .notEmpty()
    .isString()
    .withMessage(
      "El nombre de la variante es obligatorio y debe ser una cadena de texto",
    )
    .run(req);
  await check("codigo")
    .notEmpty()
    .isString()
    .withMessage(
      "El código de la variante es obligatorio y debe ser una cadena de texto",
    )
    .run(req);
  await check("color")
    .notEmpty()
    .isString()
    .withMessage(
      "El color de la variante es obligatorio y debe ser una cadena de texto",
    )
    .run(req);
  await check("descripcion")
    .notEmpty()
    .isString()
    .withMessage(
      "La descripción de la variante es obligatorio y debe ser una cadena de texto",
    )
    .run(req);
  await check("cantidad")
    .notEmpty()
    .isFloat()
    .withMessage(
      "La cantidad de la variante es obligatorio y debe ser un número decimal",
    )
    .run(req);
  // dimensiones opcionales
  await check("alto")
    .optional()
    .isFloat()
    .withMessage("El alto de la variante debe ser un número decimal")
    .run(req);
  await check("ancho")
    .optional()
    .isFloat()
    .withMessage("El ancho de la variante debe ser un número decimal")
    .run(req);
  await check("largo")
    .optional()
    .isFloat()
    .withMessage("El largo de la variante debe ser un número decimal")
    .run(req);
  await check("precio_publico")
    .notEmpty()
    .isFloat()
    .withMessage(
      "El precio público de la variante es obligatorio y debe ser un número decimal",
    )
    .run(req);
  await check("precio_contratista")
    .notEmpty()
    .isFloat()
    .withMessage(
      "El precio contratista de la variante es obligatorio y debe ser un número decimal",
    )
    .run(req);
  await check("costo_compra")
    .notEmpty()
    .isFloat()
    .withMessage(
      "El costo de compra de la variante es obligatorio y debe ser un número decimal",
    )
    .run(req);
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({ message: "Errores de validación", errors: errors.array() });
  }

  // Validar fotos (archivos o URLs) - máximo 5
  const allowedFormats = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const files = req.files || [];
  const fotoUrls = Array.isArray(foto) ? foto : foto ? [foto] : [];
  const totalFotos = files.length + fotoUrls.length;

  if (totalFotos === 0) {
    return res.status(400).json({
      message: "Al menos una foto es obligatoria (archivo o URL de texto)",
      error: "Al menos una foto es obligatoria (archivo o URL de texto)",
    });
  }

  if (totalFotos > 5) {
    return res.status(400).json({
      message: "Máximo 5 fotos permitidas",
      error: "Máximo 5 fotos permitidas",
    });
  }

  // Validar formatos de archivo
  for (const file of files) {
    if (!allowedFormats.includes(file.mimetype)) {
      return res.status(400).json({
        message: `Formato de archivo no permitido: ${file.originalname}. Solo se permiten JPEG, JPG, PNG y WEBP`,
        error: "Formato de archivo no permitido",
      });
    }
  }

  // Validar URLs (si son strings)
  if (fotoUrls.some((url) => typeof url !== "string" || !url.trim())) {
    return res.status(400).json({
      message: "Las URLs de fotos deben ser cadenas de texto válidas",
      error: "Las URLs de fotos deben ser cadenas de texto válidas",
    });
  }

  // Parsear valores numéricos
  const subcategoriaIdInt = parseInt(subcategoriaId, 10);
  const ubi_alma_idInt = parseInt(ubi_alma_id, 10);
  const cantidadFloat = parseFloat(cantidad);
  const precioPublicoFloat = parseFloat(precio_publico);
  const precioContratistaFloat = parseFloat(precio_contratista);
  const costoCompraFloat = parseFloat(costo_compra);

  // dimensiones opcionales
  const altoFloat = alto !== undefined ? parseFloat(alto) : undefined;
  const anchoFloat = ancho !== undefined ? parseFloat(ancho) : undefined;
  const largoFloat = largo !== undefined ? parseFloat(largo) : undefined;

  const valor_stock = (cantidadFloat * costoCompraFloat).toFixed(2);

  //Validar que el codigo no exista en la base de datos
  const productoExistente = await prisma.variantes.findFirst({
    where: { codigo },
  });

  if (productoExistente) {
    return res.status(400).json({
      message: "La variante ya existe",
      error: "La variante ya existe",
    });
  }

  const subcategoriaExistente = await prisma.subcategorias.findFirst({
    where: { id: subcategoriaIdInt },
  });

  if (!subcategoriaExistente) {
    return res.status(400).json({
      message: "La subcategoría no existe",
      error: "La subcategoría no existe",
    });
  }

  const ubi_almaExistente = await prisma.ubicacion_almacen.findFirst({
    where: { id: ubi_alma_idInt },
  });

  if (!ubi_almaExistente) {
    return res.status(400).json({
      message: "La ubicación de almacén no existe",
      error: "La ubicación de almacén no existe",
    });
  }

  try {
    // Recopilar URLs de fotos (archivos y URLs)
    const fotosArray = [];

    // Procesar archivos subidos
    if (files && files.length > 0) {
      for (const file of files) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const extension = file.originalname.split(".").pop();
        const key = `productos/${uniqueSuffix}.${extension}`;

        await uploadFile({
          key: key,
          body: file.buffer,
          contentType: file.mimetype,
        });
        fotosArray.push(getPublicUrl(key));
      }
    }

    // Agregar URLs de texto
    if (fotoUrls && fotoUrls.length > 0) {
      fotosArray.push(...fotoUrls.filter((url) => url && url.trim()));
    }

    // Crear el producto
    const productoCreado = await prisma.productos.create({
      data: {
        subcategoriaId: subcategoriaIdInt,
      },
    });

    let medidasSt;
    if (
      altoFloat !== undefined &&
      anchoFloat !== undefined &&
      largoFloat !== undefined
    ) {
      medidasSt = `${altoFloat} ft x ${anchoFloat} ft x ${largoFloat} ft = ${
        altoFloat * anchoFloat * largoFloat
      }`;
    }

    // Crear variante básica relacionada con el producto
    // build data object conditionally to avoid inserting undefined values
    const varianteData = {
      producto_id: productoCreado.id,
      ubicacion_almacen_id: ubi_alma_idInt,
      nombre,
      codigo,
      color,
      descripcion,
      cantidad: cantidadFloat,
      precio_publico: precioPublicoFloat,
      precio_contratista: precioContratistaFloat,
      costo_compra: costoCompraFloat,
      valor_stock: parseFloat(valor_stock),
    };
    if (altoFloat !== undefined) varianteData.alto = altoFloat;
    if (anchoFloat !== undefined) varianteData.ancho = anchoFloat;
    if (largoFloat !== undefined) varianteData.largo = largoFloat;
    if (medidasSt !== undefined) varianteData.medidas = medidasSt;

    const varianteCreada = await prisma.variantes.create({
      data: varianteData,
    });

    const subcategoria = await prisma.subcategorias.findUnique({
      where: { id: subcategoriaIdInt },
    });

    await prisma.subcategorias.update({
      where: { id: subcategoriaIdInt },
      data: {
        valor_stock:
          parseFloat(subcategoria.valor_stock) + parseFloat(valor_stock),
      },
    });

    // Crear múltiples registros de fotos
    const fotosCreadas = await Promise.all(
      fotosArray.map((fotoUrl) =>
        prisma.fotos.create({
          data: {
            variante_id: varianteCreada.id,
            url: fotoUrl,
          },
        }),
      ),
    );

    // Registrar en auditoría
    await prisma.auditoria.create({
      data: {
        usuario_id: req.user.id,
        accion: "CREATE",
        productoId: productoCreado.id,
        varianteId: varianteCreada.id,
      },
    });

    return res.status(201).json({
      message: "Producto y variante básica creados con éxito",
      data: { variante: varianteCreada, fotos: fotosCreadas },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error al crear el producto",
      error: "Error al crear el producto",
      details: error.message,
      code: error.code,
    });
  }
};

const crearVariante = async (req, res) => {
  const {
    ubi_alma_id,
    productoId,
    nombre,
    codigo,
    color,
    descripcion,
    cantidad,
    alto,
    ancho,
    largo,
    precio_publico,
    precio_contratista,
    costo_compra,
    foto,
  } = req.body;

  // Validar los datos de entrada variante
  // ubicacion_almacen_id ahora es obligatorio
  await check("ubi_alma_id")
    .notEmpty()
    .isInt()
    .withMessage("El ubi_alma_id es obligatorio y debe ser un número entero")
    .run(req);
  await check("productoId")
    .notEmpty()
    .isInt()
    .withMessage("El productoId es obligatorio y debe ser un número entero")
    .run(req);
  await check("nombre")
    .notEmpty()
    .isString()
    .withMessage(
      "El nombre de la variante es obligatorio y debe ser una cadena de texto",
    )
    .run(req);
  await check("codigo")
    .notEmpty()
    .isString()
    .withMessage(
      "El código de la variante es obligatorio y debe ser una cadena de texto",
    )
    .run(req);
  await check("color")
    .notEmpty()
    .isString()
    .withMessage(
      "El color de la variante es obligatorio y debe ser una cadena de texto",
    )
    .run(req);
  await check("descripcion")
    .notEmpty()
    .isString()
    .withMessage(
      "La descripción de la variante es obligatorio y debe ser una cadena de texto",
    )
    .run(req);
  await check("cantidad")
    .notEmpty()
    .isFloat()
    .withMessage(
      "La cantidad de la variante es obligatorio y debe ser un número decimal",
    )
    .run(req);
  // dimensiones opcionales para actualización
  await check("alto")
    .optional()
    .isFloat()
    .withMessage("El alto de la variante debe ser un número decimal")
    .run(req);
  await check("ancho")
    .optional()
    .isFloat()
    .withMessage("El ancho de la variante debe ser un número decimal")
    .run(req);
  await check("largo")
    .optional()
    .isFloat()
    .withMessage("El largo de la variante debe ser un número decimal")
    .run(req);
  await check("precio_publico")
    .notEmpty()
    .isFloat()
    .withMessage(
      "El precio público de la variante es obligatorio y debe ser un número decimal",
    )
    .run(req);
  await check("precio_contratista")
    .notEmpty()
    .isFloat()
    .withMessage(
      "El precio contratista de la variante es obligatorio y debe ser un número decimal",
    )
    .run(req);
  await check("costo_compra")
    .notEmpty()
    .isFloat()
    .withMessage(
      "El costo de compra de la variante es obligatorio y debe ser un número decimal",
    )
    .run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({ message: "Errores de validación", errors: errors.array() });
  }

  // Validar fotos (archivos o URLs) - máximo 5
  const allowedFormats = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const files = req.files || [];
  const fotoUrls = Array.isArray(foto) ? foto : foto ? [foto] : [];
  const totalFotos = files.length + fotoUrls.length;

  if (totalFotos === 0) {
    return res.status(400).json({
      message: "Al menos una foto es obligatoria (archivo o URL de texto)",
      error: "Al menos una foto es obligatoria (archivo o URL de texto)",
    });
  }

  if (totalFotos > 5) {
    return res.status(400).json({
      message: "Máximo 5 fotos permitidas",
      error: "Máximo 5 fotos permitidas",
    });
  }

  // Validar formatos de archivo
  for (const file of files) {
    if (!allowedFormats.includes(file.mimetype)) {
      return res.status(400).json({
        message: `Formato de archivo no permitido: ${file.originalname}. Solo se permiten JPEG, JPG, PNG y WEBP`,
        error: "Formato de archivo no permitido",
      });
    }
  }

  // Validar URLs (si son strings)
  if (Array.isArray(fotoUrls)) {
    if (fotoUrls.some((url) => typeof url !== "string" || !url.trim())) {
      return res.status(400).json({
        message: "Las URLs de fotos deben ser cadenas de texto válidas",
        error: "Las URLs de fotos deben ser cadenas de texto válidas",
      });
    }
  }

  //Validar que el codigo no exista en la base de datos
  var varianteExistente = await prisma.variantes.findFirst({
    where: { codigo },
  });
  if (varianteExistente) {
    return res.status(400).json({
      message: "La variante ya existe",
      error: "La variante ya existe",
    });
  }

  try {
    // Recopilar URLs de fotos (archivos y URLs)
    const fotosArray = [];

    // Procesar archivos subidos
    if (files && files.length > 0) {
      for (const file of files) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const extension = file.originalname.split(".").pop();
        const key = `productos/${uniqueSuffix}.${extension}`;

        await uploadFile({
          key: key,
          body: file.buffer,
          contentType: file.mimetype,
        });
        fotosArray.push(getPublicUrl(key));
      }
    }

    // Agregar URLs de texto
    if (fotoUrls && fotoUrls.length > 0) {
      fotosArray.push(...fotoUrls.filter((url) => url && url.trim()));
    }

    // Parsear valores numéricos
    const productoIdInt = parseInt(productoId, 10);
    const ubi_alma_idInt = parseInt(ubi_alma_id, 10);
    const cantidadFloat = parseFloat(cantidad);
    const precioPublicoFloat = parseFloat(precio_publico);
    const precioContratistaFloat = parseFloat(precio_contratista);
    const costoCompraFloat = parseFloat(costo_compra);

    // dimensiones opcionales
    const altoFloat = alto !== undefined ? parseFloat(alto) : undefined;
    const anchoFloat = ancho !== undefined ? parseFloat(ancho) : undefined;
    const largoFloat = largo !== undefined ? parseFloat(largo) : undefined;

    const valor_stock = (cantidadFloat * costoCompraFloat).toFixed(2);

    let medidasSt;
    if (
      altoFloat !== undefined &&
      anchoFloat !== undefined &&
      largoFloat !== undefined
    ) {
      medidasSt = `${altoFloat} ft x ${anchoFloat} ft x ${largoFloat} ft = ${
        altoFloat * anchoFloat * largoFloat
      }`;
    }

    const varianteData = {
      producto_id: productoIdInt,
      ubicacion_almacen_id: ubi_alma_idInt,
      nombre,
      codigo,
      color,
      descripcion,
      cantidad: cantidadFloat,
      precio_publico: precioPublicoFloat,
      precio_contratista: precioContratistaFloat,
      costo_compra: costoCompraFloat,
      valor_stock: parseFloat(valor_stock),
    };
    if (altoFloat !== undefined) varianteData.alto = altoFloat;
    if (anchoFloat !== undefined) varianteData.ancho = anchoFloat;
    if (largoFloat !== undefined) varianteData.largo = largoFloat;
    if (medidasSt !== undefined) varianteData.medidas = medidasSt;

    const nuevaVariante = await prisma.variantes.create({
      data: varianteData,
    });

    const subcategoriaId = await prisma.productos.findUnique({
      where: { id: productoIdInt },
      select: {
        subcategoriaId: true,
      },
    });

    const subcategoria = await prisma.subcategorias.findUnique({
      where: { id: subcategoriaId.subcategoriaId },
    });

    await prisma.subcategorias.update({
      where: { id: subcategoriaId.subcategoriaId },
      data: {
        valor_stock:
          subcategoria.valor_stock + cantidadFloat * costoCompraFloat,
      },
    });

    // Crear múltiples registros de fotos
    const fotosCreadas = await Promise.all(
      fotosArray.map((fotoUrl) =>
        prisma.fotos.create({
          data: {
            variante_id: nuevaVariante.id,
            url: fotoUrl,
          },
        }),
      ),
    );

    // Registrar en auditoría
    await prisma.auditoria.create({
      data: {
        usuario_id: req.user.id,
        accion: "CREATE",
        productoId: productoIdInt,
        varianteId: nuevaVariante.id,
      },
    });

    return res.status(201).json({
      message: "Variante creada con éxito",
      data: { variante: nuevaVariante, fotos: fotosCreadas },
    });
  } catch (error) {
    console.log("Error al crear la variante:", error);
    return res.status(500).json({
      message: "Error al crear la variante",
      error: "Error al crear la variante",
    });
  }
};

const updateVariante = async (req, res) => {
  const { varianteId } = req.params;
  const {
    ubi_alma_id,
    nombre,
    codigo,
    color,
    descripcion,
    cantidad,
    alto,
    ancho,
    largo,
    precio_publico,
    precio_contratista,
    costo_compra,
    foto,
    fotosEliminar, // ids de fotos a eliminar
  } = req.body;

  // Validaciones opcionales: solo validar si vienen
  await check("ubi_alma_id")
    .optional()
    .isInt()
    .withMessage("El ubi_alma_id debe ser un número entero")
    .run(req);
  await check("nombre")
    .optional()
    .isString()
    .withMessage("El nombre debe ser una cadena de texto")
    .run(req);
  await check("codigo")
    .optional()
    .isString()
    .withMessage("El código debe ser una cadena de texto")
    .run(req);
  await check("color")
    .optional()
    .isString()
    .withMessage("El color debe ser una cadena de texto")
    .run(req);
  await check("descripcion")
    .optional()
    .isString()
    .withMessage("La descripción debe ser una cadena de texto")
    .run(req);
  await check("cantidad")
    .optional()
    .isFloat()
    .withMessage("La cantidad debe ser un número decimal")
    .run(req);
  await check("alto")
    .optional()
    .isFloat()
    .withMessage("El alto debe ser un número decimal")
    .run(req);
  await check("ancho")
    .optional()
    .isFloat()
    .withMessage("El ancho debe ser un número decimal")
    .run(req);
  await check("largo")
    .optional()
    .isFloat()
    .withMessage("El largo debe ser un número decimal")
    .run(req);
  await check("precio_publico")
    .optional()
    .isFloat()
    .withMessage("El precio_publico debe ser un número decimal")
    .run(req);
  await check("precio_contratista")
    .optional()
    .isFloat()
    .withMessage("El precio_contratista debe ser un número decimal")
    .run(req);
  await check("costo_compra")
    .optional()
    .isFloat()
    .withMessage("El costo_compra debe ser un número decimal")
    .run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({ message: "Errores de validación", errors: errors.array() });
  }

  // Manejo de imágenes
  const allowedFormats = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const files = req.files || [];
  const fotoUrls = Array.isArray(foto) ? foto : foto ? [foto] : [];

  const fotosEliminarArray = Array.isArray(fotosEliminar)
    ? fotosEliminar.map((f) => parseInt(f, 10)).filter(Boolean)
    : fotosEliminar
      ? [parseInt(fotosEliminar, 10)].filter(Boolean)
      : [];

  try {
    const varianteIdInt = parseInt(varianteId, 10);

    // Obtener variante actual para cálculos y validaciones
    const varianteActual = await prisma.variantes.findUnique({
      where: { id: varianteIdInt },
    });

    if (!varianteActual) {
      return res.status(404).json({
        message: "Variante no encontrada",
        error: "Variante no encontrada",
      });
    }

    // Contar fotos existentes
    const fotosExistentes = await prisma.fotos.findMany({
      where: { variante_id: varianteIdInt },
    });
    const existingCount = fotosExistentes.length;

    // Validar formatos de archivos subidos
    for (const file of files) {
      if (!allowedFormats.includes(file.mimetype)) {
        return res.status(400).json({
          message: `Formato de archivo no permitido: ${file.originalname}. Solo se permiten JPEG, JPG, PNG y WEBP`,
          error: "Formato de archivo no permitido",
        });
      }
    }

    const newFilesCount = files.length;
    const newUrlsCount = fotoUrls.length;
    const deletionsCount = fotosEliminarArray.length;

    const finalCount =
      existingCount - deletionsCount + newFilesCount + newUrlsCount;
    if (finalCount > 5) {
      return res.status(400).json({
        message: "Máximo 5 fotos permitidas por variante",
        error: "Máximo 5 fotos permitidas",
      });
    }

    // Eliminar fotos solicitadas
    if (fotosEliminarArray.length > 0) {
      await prisma.fotos.deleteMany({
        where: { id: { in: fotosEliminarArray }, variante_id: varianteIdInt },
      });
    }

    // Procesar archivos subidos y crear registros
    const fotosNuevasUrls = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const extension = file.originalname.split(".").pop();
        const key = `productos/${uniqueSuffix}.${extension}`;

        await uploadFile({
          key: key,
          body: file.buffer,
          contentType: file.mimetype,
        });
        fotosNuevasUrls.push(getPublicUrl(key));
      }
    }

    // Agregar URLs de texto
    if (fotoUrls && fotoUrls.length > 0) {
      fotosNuevasUrls.push(...fotoUrls.filter((u) => u && u.trim()));
    }

    // Parsear valores numéricos y preparar objeto de update
    const updateData = {};
    if (ubi_alma_id !== undefined)
      updateData.ubicacion_almacen_id = parseInt(ubi_alma_id, 10);
    if (nombre !== undefined) updateData.nombre = nombre;
    if (codigo !== undefined) updateData.codigo = codigo;
    if (color !== undefined) updateData.color = color;
    if (descripcion !== undefined) updateData.descripcion = descripcion;
    if (cantidad !== undefined) updateData.cantidad = parseFloat(cantidad);
    if (alto !== undefined) updateData.alto = parseFloat(alto);
    if (ancho !== undefined) updateData.ancho = parseFloat(ancho);
    if (largo !== undefined) updateData.largo = parseFloat(largo);
    if (precio_publico !== undefined)
      updateData.precio_publico = parseFloat(precio_publico);
    if (precio_contratista !== undefined)
      updateData.precio_contratista = parseFloat(precio_contratista);
    if (costo_compra !== undefined)
      updateData.costo_compra = parseFloat(costo_compra);

    // Sólo recalcular medidas si alguna dimensión se modificó
    if (alto !== undefined || ancho !== undefined || largo !== undefined) {
      const finalAlto =
        alto !== undefined ? parseFloat(alto) : varianteActual.alto;
      const finalAncho =
        ancho !== undefined ? parseFloat(ancho) : varianteActual.ancho;
      const finalLargo =
        largo !== undefined ? parseFloat(largo) : varianteActual.largo;
      updateData.medidas = `${finalAlto} ft x ${finalAncho} ft x ${finalLargo} ft = ${
        finalAlto * finalAncho * finalLargo
      }`;
    }

    // Calcular ajuste de valor_stock para la subcategoría si cambia cantidad o costo
    const cantidadIntNew =
      updateData.cantidad !== undefined
        ? updateData.cantidad
        : varianteActual.cantidad;
    const costoCompraNew =
      updateData.costo_compra !== undefined
        ? updateData.costo_compra
        : varianteActual.costo_compra;

    const oldValor =
      parseFloat(varianteActual.cantidad) *
      parseFloat(varianteActual.costo_compra || 0);
    const newValor =
      parseFloat(cantidadIntNew) * parseFloat(costoCompraNew || 0);
    const deltaValor = parseFloat((newValor - oldValor).toFixed(2));

    // Actualizar la variante
    const varianteActualizada = await prisma.variantes.update({
      where: { id: varianteIdInt },
      data: updateData,
    });

    // Crear registros de fotos nuevas en DB
    if (fotosNuevasUrls.length > 0) {
      await Promise.all(
        fotosNuevasUrls.map((url) =>
          prisma.fotos.create({
            data: { variante_id: varianteActualizada.id, url },
          }),
        ),
      );
    }

    // Actualizar valor_stock en subcategoría si aplica
    if (deltaValor !== 0) {
      // Obtener subcategoriaId via producto
      const producto = await prisma.productos.findUnique({
        where: { id: varianteActualizada.producto_id },
        select: { subcategoriaId: true },
      });
      if (producto && producto.subcategoriaId) {
        const subcategoria = await prisma.subcategorias.findUnique({
          where: { id: producto.subcategoriaId },
        });
        if (subcategoria) {
          await prisma.subcategorias.update({
            where: { id: producto.subcategoriaId },
            data: {
              valor_stock:
                parseFloat(subcategoria.valor_stock || 0) + deltaValor,
            },
          });
        }
      }
    }

    // Registrar en auditoría
    await prisma.auditoria.create({
      data: {
        usuario_id: req.user.id,
        accion: "UPDATE",
        productoId: varianteActualizada.producto_id,
        varianteId: varianteIdInt,
      },
    });

    return res.status(200).json({ message: "Variante actualizada con éxito" });
  } catch (error) {
    console.error("Error al actualizar variante:", error);
    return res.status(500).json({
      message: "Error al actualizar la variante",
      error: "Error al actualizar la variante",
    });
  }
};

const getProductosBySubcategoria = async (req, res) => {
  const { subcategoriaId } = req.params;

  // Validar que subcategoriaId sea un número
  if (!subcategoriaId || isNaN(subcategoriaId)) {
    return res.status(400).json({
      message: "El ID de subcategoría es inválido",
      error: "El ID de subcategoría es inválido",
    });
  }

  try {
    const productos = await prisma.productos.findMany({
      where: {
        subcategoriaId: parseInt(subcategoriaId),
      },
      include: {
        subcategoria: {
          include: {
            categoria: true,
          },
        },
        variantes: {
          include: {
            fotos: true,
            ubicacion_almacen: {
              include: {
                ubicacion: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (productos.length === 0) {
      return res.status(404).json({
        message: "No se encontraron productos para esta categoría",
        error: "No se encontraron productos para esta categoría",
      });
    }
    return res
      .status(200)
      .json({ message: "Productos obtenidos exitosamente", data: productos });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error al obtener productos por categoría",
      error: "Error al obtener productos por categoría",
    });
  }
};

const getProductoById = async (req, res) => {
  const { id } = req.params;

  try {
    const producto = await prisma.productos.findUnique({
      where: { id: parseInt(id) },
      include: {
        subcategoria: {
          include: {
            categoria: true,
          },
        },
        variantes: {
          include: {
            fotos: true,
            ubicacion_almacen: {
              include: {
                ubicacion: true,
              },
            },
          },
        },
      },
    });

    if (!producto) {
      return res.status(404).json({
        message: "Producto no encontrado",
        error: "Producto no encontrado",
      });
    }

    return res
      .status(200)
      .json({ message: "Producto obtenido exitosamente", data: producto });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error al obtener el producto",
      error: "Error al obtener el producto",
    });
  }
};

const getProductosBySearch = async (req, res) => {
  const { search } = req.body;

  try {
    const productos = await prisma.productos.findMany({
      where: {
        OR: [
          {
            subcategoria: { nombre: { contains: search, mode: "insensitive" } },
          },
          {
            subcategoria: {
              categoria: { nombre: { contains: search, mode: "insensitive" } },
            },
          },
          {
            variantes: {
              some: {
                OR: [
                  { nombre: { contains: search, mode: "insensitive" } },
                  { color: { contains: search, mode: "insensitive" } },
                  { codigo: { contains: search, mode: "insensitive" } },
                  { descripcion: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      },
      include: {
        subcategoria: {
          include: {
            categoria: true,
          },
        },
        variantes: {
          include: {
            fotos: true,
            ubicacion_almacen: {
              include: {
                ubicacion: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return res
      .status(200)
      .json({ message: "Productos encontrados exitosamente", data: productos });
  } catch (error) {
    console.error("Error al buscar productos:", error);
    return res.status(500).json({
      message: "Error al buscar productos",
      error: "Error al buscar productos",
      details: error.message,
    });
  }
};

export {
  createProducto,
  crearVariante,
  updateVariante,
  getProductosBySubcategoria,
  getProductoById,
  getProductosBySearch,
};
