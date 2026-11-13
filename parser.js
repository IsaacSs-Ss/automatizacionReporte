/*
 * Lógica de lectura del reporte "Ventas por Sucursal".
 * Funciona en el navegador (window.ReporteParser) y en Node (module.exports),
 * así se puede probar sin abrir la página.
 *
 * Recibe un libro ya leído con SheetJS (XLSX.read) y devuelve, por producto,
 * cuántas unidades se vendieron en total y por área.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ReporteParser = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Catálogo de productos que se cuentan.
  // Cada regla compara contra el nombre YA normalizado (mayúsculas, sin el área
  // y sin "(350 ml)"). "factor" convierte la línea a unidades:
  //   orden de 3 dorados = 3 tacos, media orden de guacamole = 0.5, etc.
  // Para agregar un producto nuevo basta con añadir una entrada aquí.
  // ---------------------------------------------------------------------------
  const PRODUCTOS = [
    { id: "coca-cola", nombre: "Coca Cola", categoria: "Refrescos", reglas: [[/^COCA COLA$/, 1]] },
    { id: "coca-zero", nombre: "Coca Zero", categoria: "Refrescos", reglas: [[/^COCA (COLA )?ZERO$/, 1]] },
    { id: "coca-light", nombre: "Coca Light", categoria: "Refrescos", reglas: [[/^COCA (COLA )?LIGHT$/, 1]] },
    { id: "sidral", nombre: "Sidral", categoria: "Refrescos", reglas: [[/^SIDRAL$/, 1]] },
    { id: "rojo", nombre: "Rojo", categoria: "Refrescos", reglas: [[/^ROJO$/, 1]] },
    // El sistema exporta la Ñ dañada (PE�AFIEL), por eso se acepta cualquier carácter.
    { id: "penafiel", nombre: "Peñafiel", categoria: "Refrescos", reglas: [[/^PE.{1,2}AFIEL$/, 1]] },
    { id: "agua-embotellada", nombre: "Agua embotellada", categoria: "Refrescos", reglas: [[/^AGUA EMBOTELLADA$/, 1]] },
    { id: "corona", nombre: "Corona", categoria: "Cervezas", reglas: [[/^CORONA$/, 1]] },
    { id: "victoria", nombre: "Victoria", categoria: "Cervezas", reglas: [[/^VICTORIA( EN LATA)?$/, 1]] },
    { id: "negra-modelo", nombre: "Negra Modelo", categoria: "Cervezas", reglas: [[/^NEGRA MODELO$/, 1]] },
    { id: "modelo-especial", nombre: "Modelo Especial", categoria: "Cervezas", reglas: [[/^MODELO ESPECIAL$/, 1]] },
    { id: "clamato", nombre: "Clamato", categoria: "Cervezas", reglas: [[/^CLAMATO$/, 1]] },
    { id: "jugo", nombre: "Jugo", categoria: "Jugos, aguas y café", reglas: [[/^JUGO$/, 1]] },
    // "AGUA HORCHATA TR (350 ml)" en platillos y "AGUA DE HORCHATA" en combos
    { id: "agua-horchata", nombre: "Agua de horchata", categoria: "Jugos, aguas y café", reglas: [[/^AGUA (DE )?HORCHATA$/, 1]] },
    { id: "agua-jamaica", nombre: "Agua de jamaica", categoria: "Jugos, aguas y café", reglas: [[/^AGUA (DE )?JAMAICA$/, 1]] },
    // "CAFE DE OLLA TR" y "CAFÉ DE OLLA" (combos; a veces con la É dañada). No incluye café americano.
    { id: "cafe-olla", nombre: "Café de olla", categoria: "Jugos, aguas y café", reglas: [[/^CAF.{1,2} DE OLLA$/, 1]] },
    {
      id: "tacos-dorados", nombre: "Tacos dorados", categoria: "Tacos dorados", unidad: "piezas",
      // Dorados y semidorados van al mismo conteo, en piezas.
      // El tercer valor es la etiqueta del desglose que se muestra en el dashboard.
      reglas: [
        [/^TACO (SEMI)?DORADO$/, 1, "Taco suelto"],
        [/^ORDEN DE 3 (SEMI)?DORADOS?$/, 3, "Orden de 3"],
        [/^3 TACOS (SEMI)?DORADOS$/, 3, "En combo"],              // modificador de combo
        [/^2 (TACOS )?(SEMI)?DORADOS \/ 1 /, 2, "En combo"],      // combo 2 dorados + 1 de barbacoa
      ],
    },
    {
      // 2 medias órdenes = 1 orden.
      id: "guacamole", nombre: "Guacamole", categoria: "Complementos", unidad: "órdenes",
      reglas: [[/^GUACAMOLE$/, 1, "Orden completa"], [/^MEDIA ORDEN DE GUACAMOLE$/, 0.5, "Media orden"]],
    },
    {
      id: "nopales", nombre: "Nopales", categoria: "Complementos", unidad: "órdenes",
      reglas: [[/^NOPALES$/, 1, "Orden completa"], [/^MEDIA ORDEN DE NOPALES$/, 0.5, "Media orden"]],
    },
    { id: "aguacates", nombre: "Aguacates", categoria: "Complementos", reglas: [[/^AGUACATE$/, 1]] },
    { id: "panques", nombre: "Panqués", categoria: "Postres", reglas: [[/^PANQUE$/, 1]] },
    { id: "arroz-con-leche", nombre: "Arroz con leche", categoria: "Postres", reglas: [[/^ARROZ CON LECHE$/, 1]] },
    { id: "flan-napolitano", nombre: "Flan napolitano", categoria: "Postres", reglas: [[/^FLAN NAPOLITANO$/, 1]] },
  ];

  const AREAS = ["PB", "PA", "TR", "PLL", "DV"];
  const AREA_NOMBRES = { PB: "Planta baja", PA: "Planta alta", TR: "Terraza", PLL: "Para llevar", DV: "DV" };

  // Sufijo de área al final del nombre: "COCA COLA TR", "AGUA EMBOTELLADA P.A."
  const RE_AREA = /\s+(P\.?B\.?|P\.?A\.?|T\.?R\.?|PLL|DV)$/;

  function normalizar(texto) {
    return String(texto == null ? "" : texto)
      .toUpperCase()
      .replace(/\(.*?\)/g, " ") // quita "(350 ml)"
      .replace(/\s+/g, " ")
      .trim();
  }

  function areaDeSufijo(s) {
    return s.replace(/\./g, "");
  }

  // Los combos están en grupos tipo "COMBOS PLANTA BAJA"; el área sale del grupo.
  function areaDeGrupo(grupo) {
    const g = normalizar(grupo);
    if (/PLANTA BAJA/.test(g)) return "PB";
    if (/PLANTA ALTA/.test(g)) return "PA";
    if (/TERRAZA/.test(g)) return "TR";
    const m = g.match(/\b(PB|PA|TR|PLL|DV)$/);
    return m ? m[1] : null;
  }

  /** Separa "COCA COLA TR" en { base: "COCA COLA", area: "TR" }. */
  function separarArea(nombre) {
    const n = normalizar(nombre);
    const m = n.match(RE_AREA);
    if (!m) return { base: n, area: null };
    return { base: n.slice(0, m.index).trim(), area: areaDeSufijo(m[1]) };
  }

  function clasificar(base) {
    for (const p of PRODUCTOS) {
      for (const [re, factor, tipo] of p.reglas) {
        if (re.test(base)) return { producto: p, factor, tipo: tipo || null };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Lectura de la hoja
  // ---------------------------------------------------------------------------

  function hojaResumenVentas(wb) {
    const nombre =
      wb.SheetNames.find((n) => /RESUMEN DE VENTAS/i.test(n)) || wb.SheetNames[2];
    if (!nombre) throw new Error("El archivo no tiene una tercera hoja (Resumen de Ventas).");
    return wb.Sheets[nombre];
  }

  /** Convierte la hoja a una matriz de filas (arreglo de arreglos). */
  function aMatriz(XLSX, ws) {
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  }

  /**
   * Busca una tabla por su título ("Ventas por modificador") y devuelve
   * la fila de encabezados y las columnas que nos interesan.
   */
  function ubicarTabla(filas, reTitulo, columnasBuscadas) {
    for (let r = 0; r < filas.length; r++) {
      const fila = filas[r] || [];
      for (let c = 0; c < fila.length; c++) {
        if (typeof fila[c] === "string" && reTitulo.test(normalizar(fila[c]))) {
          // El encabezado está en alguna de las siguientes filas; las columnas
          // pueden empezar un poco antes que el título.
          for (let h = r + 1; h < Math.min(r + 6, filas.length); h++) {
            const enc = filas[h] || [];
            const desde = Math.max(0, c - 3);
            const hasta = c + 10;
            const cols = {};
            for (const [clave, re] of Object.entries(columnasBuscadas)) {
              for (let k = desde; k <= hasta && k < enc.length; k++) {
                if (typeof enc[k] === "string" && re.test(normalizar(enc[k])) && !Object.values(cols).includes(k)) {
                  cols[clave] = k;
                  break;
                }
              }
            }
            if (Object.keys(cols).length === Object.keys(columnasBuscadas).length) {
              return { filaEncabezado: h, cols };
            }
          }
        }
      }
    }
    return null;
  }

  function leerFilas(filas, tabla) {
    const out = [];
    const { filaEncabezado, cols } = tabla;
    let vacias = 0;
    for (let r = filaEncabezado + 1; r < filas.length; r++) {
      const fila = filas[r] || [];
      const nombre = fila[cols.nombre];
      if (nombre == null || nombre === "") {
        if (++vacias > 3) break; // fin de la tabla
        continue;
      }
      vacias = 0;
      const cantidad = Number(fila[cols.cantidad]) || 0;
      out.push({
        clave: cols.clave != null ? fila[cols.clave] : null,
        nombre: String(nombre),
        grupo: cols.grupo != null ? fila[cols.grupo] : null,
        cantidad,
      });
    }
    return out;
  }

  function leerFecha(XLSX, wb, nombreArchivo) {
    // 1) "Del 2026-10-04 al 2026-10-04" en la primera hoja
    try {
      const filas = aMatriz(XLSX, wb.Sheets[wb.SheetNames[0]]).slice(0, 15);
      for (const fila of filas) {
        for (const v of fila || []) {
          const m = typeof v === "string" && v.match(/DEL\s+(\d{4}-\d{2}-\d{2})\s+AL\s+(\d{4}-\d{2}-\d{2})/i);
          if (m) return { desde: m[1], hasta: m[2] };
        }
      }
    } catch (_) { /* sigue con el nombre del archivo */ }
    // 2) Fecha en el nombre del archivo
    const m = String(nombreArchivo || "").match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return { desde: m[1], hasta: m[1] };
    return null;
  }

  function leerSucursal(XLSX, wb) {
    try {
      const filas = aMatriz(XLSX, wb.Sheets[wb.SheetNames[0]]).slice(0, 6);
      for (const fila of filas) {
        for (const v of fila || []) {
          if (typeof v === "string" && / - /.test(v) && !/^DEL /i.test(v)) return v.trim().replace(/N$/, "");
        }
      }
    } catch (_) { /* opcional */ }
    return null;
  }

  /**
   * Procesa el libro y devuelve:
   * {
   *   fecha: { desde, hasta }, sucursal,
   *   productos: [{ id, nombre, categoria, unidad, total, porArea: {PB, PA, ...} }],
   *   detalle: [{ tabla, nombre, grupo, cantidad, factor, unidades, area, productoId }]
   * }
   */
  function procesar(XLSX, wb, nombreArchivo) {
    const ws = hojaResumenVentas(wb);
    const filas = aMatriz(XLSX, ws);

    const tablaPlatillos = ubicarTabla(filas, /^VENTAS POR PLATILLO/, {
      clave: /^CLAVE/,
      nombre: /^NOMBRE/,
      grupo: /^GRUPO$/,
      cantidad: /^CANTIDAD$/,
    });
    const tablaModificadores = ubicarTabla(filas, /^VENTAS POR MODIFICADOR/, {
      grupo: /^GRUPO$/,
      clave: /^CLAVE/,
      nombre: /^NOMBRE/,
      cantidad: /^CANTIDAD$/,
    });
    if (!tablaPlatillos) throw new Error('No se encontró la tabla "Ventas por platillo / artículo" en la hoja 3.');
    if (!tablaModificadores) throw new Error('No se encontró la tabla "Ventas por modificador" en la hoja 3.');

    // Se guardan las líneas originales (solo nombre, grupo y cantidad) para
    // poder recalcular el conteo si después cambian los productos o las reglas.
    const recortar = (f) => [f.nombre, f.grupo == null ? "" : String(f.grupo), f.cantidad];
    const crudo = {
      platillos: leerFilas(filas, tablaPlatillos).filter((f) => f.cantidad).map(recortar),
      modificadores: leerFilas(filas, tablaModificadores).filter((f) => f.cantidad).map(recortar),
    };

    return Object.assign(
      {
        fecha: leerFecha(XLSX, wb, nombreArchivo),
        sucursal: leerSucursal(XLSX, wb),
        archivo: nombreArchivo || null,
        crudo,
      },
      calcular(crudo)
    );
  }

  /**
   * Cuenta los productos a partir de las líneas crudas del reporte.
   * crudo = { platillos: [[nombre, grupo, cantidad], ...], modificadores: [...] }
   */
  function calcular(crudo) {
    const resultado = {};
    for (const p of PRODUCTOS) {
      resultado[p.id] = {
        id: p.id, nombre: p.nombre, categoria: p.categoria, unidad: p.unidad || "unidades",
        total: 0, porArea: Object.fromEntries(AREAS.map((a) => [a, 0]).concat([["OTRA", 0]])),
        // Desglose por tipo de línea: { "Media orden": { lineas: 17, unidades: 8.5 }, ... }
        porTipo: {},
      };
    }
    const detalle = [];

    function sumar(origen, fila, area) {
      const { base } = separarArea(fila.nombre);
      const c = clasificar(base);
      if (!c || !fila.cantidad) return;
      const unidades = fila.cantidad * c.factor;
      const a = area && AREAS.includes(area) ? area : "OTRA";
      const r = resultado[c.producto.id];
      r.total += unidades;
      r.porArea[a] += unidades;
      if (c.tipo) {
        const t = (r.porTipo[c.tipo] = r.porTipo[c.tipo] || { lineas: 0, unidades: 0 });
        t.lineas += fila.cantidad;
        t.unidades += unidades;
      }
      detalle.push({
        tabla: origen, clave: fila.clave, nombre: fila.nombre, grupo: fila.grupo,
        cantidad: fila.cantidad, factor: c.factor, unidades, area: a, productoId: c.producto.id,
      });
    }

    const aFila = ([nombre, grupo, cantidad]) => ({ nombre, grupo, cantidad: Number(cantidad) || 0 });

    for (const fila of crudo.platillos.map(aFila)) {
      // Las líneas de combo (MCOM..., MODAL...) se cuentan desde la tabla de
      // modificadores; aquí se ignoran para no contarlas dos veces.
      const grupo = normalizar(fila.grupo);
      if (/^COMBOS/.test(grupo) || /^MOD /.test(grupo)) continue;
      sumar("Platillos", fila, separarArea(fila.nombre).area);
    }
    for (const fila of crudo.modificadores.map(aFila)) {
      sumar("Modificadores", fila, separarArea(fila.nombre).area || areaDeGrupo(fila.grupo));
    }

    // Redondeo para evitar 12.499999 por los 0.5
    for (const r of Object.values(resultado)) {
      r.total = Math.round(r.total * 100) / 100;
      for (const a in r.porArea) r.porArea[a] = Math.round(r.porArea[a] * 100) / 100;
    }

    return { productos: PRODUCTOS.map((p) => resultado[p.id]), detalle };
  }

  return { PRODUCTOS, AREAS, AREA_NOMBRES, procesar, calcular, normalizar, separarArea, clasificar };
});
