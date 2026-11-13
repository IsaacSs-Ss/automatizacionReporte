/* Dashboard de conteo de productos. Usa ReporteParser (parser.js) y SheetJS. */
(function () {
  "use strict";

  const P = window.ReporteParser;
  const CLAVE_STORAGE = "conteoProductos.historial.v1";
  const IMG = "https://barbacoamx.com/wp-content/uploads/";

  // Foto de cada categoría (menú oficial) y cómo se lee su número.
  const CAT_INFO = {
    "Refrescos": { img: IMG + "2025/04/refresocs_.jpg", unidad: "refrescos y aguas" },
    "Cervezas": { img: IMG + "2020/07/cerveza.png", unidad: "cervezas y clamatos" },
    "Jugos, aguas y café": { img: IMG + "2025/04/bebidas_elmexiquense.jpg", unidad: "vasos y tazas" },
    "Tacos dorados": { img: IMG + "2025/04/tacos-dorados-barbacoa.jpg", unidad: "tacos (piezas)" },
    "Complementos": { img: IMG + "2025/04/complementos_elmexiquense.jpg", unidad: "órdenes y piezas" },
    "Postres": { img: IMG + "2025/04/cafe_postre_elmexiquense.jpg", unidad: "postres" },
  };
  const CATEGORIAS = [...new Set(P.PRODUCTOS.map((p) => p.categoria))];

  // Íconos de línea (SVG) en lugar de emojis.
  const svg = (d) => `<svg class="icono" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONOS = {
    vaso: svg('<path d="M6 3h12l-1.6 17.2a1 1 0 0 1-1 .8H8.6a1 1 0 0 1-1-.8z"/><path d="M6.6 9h10.8"/><path d="M14 3l2-2"/>'),
    taco: svg('<path d="M3 17a9 9 0 0 1 18 0z"/><path d="M7 13.5c1-.8 2-.8 3 0s2 .8 3 0 2-.8 3 0"/>'),
    grafica: svg('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
    tabla: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'),
  };

  // Dos paneles: bebidas y alimentos, con 3 categorías cada uno.
  const PANELES = {
    bebidas: { nombre: "Bebidas", icono: "vaso", img: IMG + "2025/04/bebidas_elmexiquense.jpg",
      cats: ["Refrescos", "Cervezas", "Jugos, aguas y café"] },
    alimentos: { nombre: "Alimentos", icono: "taco", img: IMG + "2025/04/tacos-dorados-barbacoa.jpg",
      cats: ["Tacos dorados", "Complementos", "Postres"] },
  };
  // Pestañas extra (sin foto)
  const PESTANAS_EXTRA = {
    comparativo: { nombre: "Comparativo", icono: "grafica" },
    datos: { nombre: "Datos", icono: "tabla" },
  };
  const pref = (k, def) => { try { return localStorage.getItem("conteoProductos." + k) || def; } catch (_) { return def; } };
  const guardarPref = (k, v) => { try { localStorage.setItem("conteoProductos." + k, v); } catch (_) { /* opcional */ } };
  const CAT_DE = Object.fromEntries(P.PRODUCTOS.map((p) => [p.id, p.categoria]));
  const AREA_LARGO = { PB: "Planta baja", PA: "Planta alta", TR: "Terraza", PLL: "Para llevar", DV: "DV", OTRA: "Sin área" };
  const TONOS_PARTES = ["#7a5a43", "#a78265", "#d6bfa9"]; // tonos café de la marca para los desgloses

  const fmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });
  const fmtPct = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
  /** 68.5 -> "68½" */
  function num(n) {
    const ent = Math.trunc(n);
    const frac = Math.round((Math.abs(n) - Math.abs(ent)) * 100) / 100;
    if (frac === 0.5) return (ent === 0 && n < 0 ? "-" : "") + fmt.format(ent) + "½";
    return fmt.format(n);
  }

  const $ = (id) => document.getElementById(id);
  const el = {
    drop: $("drop"), inp: $("inpArchivo"), error: $("error"), panel: $("panel"), sub: $("subtitulo"),
    selActual: $("selActual"), selComparar: $("selComparar"), leyenda: $("leyenda"),
    bloques: $("bloques"), paneles: $("paneles"), controles: $("controles"),
    modo: $("modo"), tableroM: $("tableroMeseros"),
    vistaPanel: $("vistaPanel"), vistaComp: $("vistaComparativo"), vistaDatos: $("vistaDatos"), subDatos: $("subDatos"),
    anCats: $("anCats"), anNota: $("anNota"), anLista: $("anLista"),
    anTitulo: $("anTitulo"), anValor: $("anValor"), anGrafica: $("anGrafica"), anPie: $("anPie"),
    tabla: $("tabla"), tablaHist: $("tablaHistorial"), notaHist: $("notaHistorial"), tablaDet: $("tablaDetalle"),
    btnExp: $("btnExportar"), inpImp: $("inpImportar"), tip: $("tooltip"),
  };

  const estado = {
    historial: cargarHistorial(), actual: null, comparar: "", tendencia: "tacos-dorados",
    panel: PANELES[pref("panel")] || PESTANAS_EXTRA[pref("panel")] ? pref("panel") : "bebidas",
    tablaDatos: "tabla",
    catAnalisis: pref("catAnalisis", ""),
    prodAnalisis: "",
    modo: pref("modo") === "meseros" ? "meseros" : "productos",
  };
  const cache = new Map();

  // ================================================================ historial
  function cargarHistorial() {
    try { return JSON.parse(localStorage.getItem(CLAVE_STORAGE)) || {}; } catch (_) { return {}; }
  }
  function guardarHistorial() {
    try { localStorage.setItem(CLAVE_STORAGE, JSON.stringify(estado.historial)); }
    catch (_) { mostrarError("No se pudo guardar el historial en este navegador (modo privado o almacenamiento lleno). Exporta un respaldo."); }
  }
  function claveDe(r) {
    const f = r.fecha ? (r.fecha.desde === r.fecha.hasta ? r.fecha.desde : `${r.fecha.desde} a ${r.fecha.hasta}`) : r.archivo;
    return `${f}|${r.sucursal || ""}`;
  }
  const fechaDe = (clave) => clave.split("|")[0];
  function fechaCorta(clave) {
    const f = fechaDe(clave);
    const m = f.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return f;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
  }
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const aFecha = (iso) => { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const anioSi = (d) => (d.getFullYear() !== new Date().getFullYear() ? ` de ${d.getFullYear()}` : "");

  /** "2026-10-04" -> "Domingo 4 de octubre"; un rango -> "Del 1 al 3 de octubre". */
  function fechaLarga(clave) {
    const f = fechaDe(clave);
    const rango = f.match(/^(\S+) a (\S+)$/);
    if (rango) {
      const a = aFecha(rango[1]), b = aFecha(rango[2]);
      if (!a || !b) return f;
      return a.getMonth() === b.getMonth()
        ? `Del ${a.getDate()} al ${b.getDate()} de ${MESES[b.getMonth()]}${anioSi(b)}`
        : `Del ${a.getDate()} de ${MESES[a.getMonth()]} al ${b.getDate()} de ${MESES[b.getMonth()]}${anioSi(b)}`;
    }
    const d = aFecha(f);
    return d ? `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}${anioSi(d)}` : f;
  }

  /** Qué tan lejos está un día del reporte elegido: "día anterior", "hace una semana"… */
  function distancia(clave, ref) {
    const a = aFecha(fechaDe(clave).split(" a ")[0]), b = aFecha(fechaDe(ref).split(" a ")[0]);
    if (!a || !b) return "";
    const dias = Math.round((b - a) / 86400000);
    if (dias === 0) return "mismo día";
    if (dias === 1) return "día anterior";
    if (dias === -1) return "día siguiente";
    if (dias === 7) return "hace una semana";
    if (dias % 7 === 0 && dias > 0 && dias <= 56) return `hace ${dias / 7} semanas`;
    if (dias > 0) return `hace ${dias} días`;
    return `${-dias} días después`;
  }

  /** Nombre corto de la sucursal ("El Mexiquense - Lomas Verdes" -> "Lomas Verdes"). */
  const sucursalCorta = (s) => (s || "").split(" - ").pop().trim();
  const variasSucursales = () => new Set(Object.keys(estado.historial).map((k) => k.split("|")[1])).size > 1;

  /** Texto de un reporte para selectores y avisos. Con ref, agrega la distancia a ese día. */
  function etiqueta(clave, ref) {
    const s = clave.split("|")[1];
    let t = fechaLarga(clave);
    if (ref) { const d = distancia(clave, ref); if (d) t += ` (${d})`; }
    if (s && variasSucursales()) t += ` · ${sucursalCorta(s)}`;
    return t;
  }
  const clavesOrdenadas = () => Object.keys(estado.historial).sort();

  /** Devuelve el reporte ya contado. Si se guardaron las líneas crudas, se recalcula con las reglas actuales. */
  function reporte(clave) {
    if (cache.has(clave)) return cache.get(clave);
    const s = estado.historial[clave];
    if (!s) return null;
    let r;
    if (s.crudo) {
      r = Object.assign({}, s, P.calcular(s.crudo));
    } else {
      // Reporte guardado con la versión anterior (sin líneas crudas).
      const porId = Object.fromEntries((s.productos || []).map((p) => [p.id, p]));
      r = Object.assign({}, s, {
        antiguo: true,
        productos: P.PRODUCTOS.map((p) => porId[p.id] || {
          id: p.id, nombre: p.nombre, unidad: p.unidad || "unidades", total: 0, porArea: {}, porTipo: {}, falta: true,
        }),
      });
    }
    r.productos.forEach((p) => { p.categoria = CAT_DE[p.id]; p.porTipo = p.porTipo || {}; });
    cache.set(clave, r);
    return r;
  }
  const mapa = (r) => Object.fromEntries((r ? r.productos : []).map((p) => [p.id, p]));
  const sumaCat = (r, cat) => r.productos.filter((p) => p.categoria === cat).reduce((s, p) => s + p.total, 0);

  // ================================================================ archivos
  async function leerArchivos(files) {
    ocultarError();
    let ultima = null;
    for (const file of files) {
      try {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const r = P.procesar(XLSX, wb, file.name);
        const clave = claveDe(r);
        estado.historial[clave] = {
          fecha: r.fecha, sucursal: r.sucursal, archivo: r.archivo, crudo: r.crudo, cargado: new Date().toISOString(),
        };
        cache.delete(clave);
        ultima = clave;
      } catch (e) {
        console.error(e);
        mostrarError(`${file.name}: ${e.message || e}`);
      }
    }
    if (ultima) {
      guardarHistorial();
      estado.actual = ultima;
      estado.comparar = anteriorA(ultima);
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  function anteriorA(clave) {
    const ks = clavesOrdenadas();
    const i = ks.indexOf(clave);
    return i > 0 ? ks[i - 1] : "";
  }

  // ================================================================ render
  function render() {
    const ks = clavesOrdenadas();
    if (!ks.length) {
      el.panel.hidden = true;
      el.tableroM.hidden = true;
      el.modo.hidden = true;
      el.controles.hidden = true;
      el.drop.classList.remove("oculto");
      el.sub.textContent = "Conteo de productos vendidos";
      return;
    }
    if (!estado.actual || !estado.historial[estado.actual]) {
      estado.actual = ks[ks.length - 1];
      estado.comparar = anteriorA(estado.actual);
    }
    if (estado.comparar && !estado.historial[estado.comparar]) estado.comparar = "";

    const meseros = estado.modo === "meseros";
    el.panel.hidden = meseros;
    el.tableroM.hidden = !meseros;
    el.modo.hidden = false;
    el.modo.setAttribute("aria-checked", String(meseros));
    el.modo.setAttribute("aria-label", meseros ? "Cambiar al tablero de productos" : "Cambiar al tablero de meseros");
    el.controles.hidden = false;
    el.drop.classList.add("oculto");
    const act = reporte(estado.actual);
    const cmp = estado.comparar ? reporte(estado.comparar) : null;
    el.sub.textContent = `${act.sucursal || "Conteo de productos"} · ${fechaLarga(estado.actual)}`;

    if (act.antiguo) mostrarError("Este reporte se guardó con una versión anterior del dashboard. Vuelve a subir el Excel para ver los productos nuevos y los desgloses.");
    else ocultarError();

    renderSelects(ks);
    if (meseros) {
      if (window.TableroMeseros) window.TableroMeseros.render(act, cmp, ks);
      return;
    }
    renderPanel(act, cmp);
    renderAnalisis(act, cmp, ks);
    renderTabla(act, cmp);
    renderHistorial(ks);
    renderDetalle(act);
  }

  function opcion(valor, texto, sel) {
    const o = document.createElement("option");
    o.value = valor; o.textContent = texto; o.selected = valor === sel;
    return o;
  }
  function renderSelects(ks) {
    const ultimo = ks[ks.length - 1];
    el.selActual.replaceChildren(...ks.slice().reverse().map((k) =>
      opcion(k, etiqueta(k) + (k === ultimo && ks.length > 1 ? " (el más reciente)" : ""), estado.actual)));
    el.selComparar.replaceChildren(
      opcion("", "— Sin comparar —", estado.comparar),
      ...ks.slice().reverse().filter((k) => k !== estado.actual).map((k) => opcion(k, etiqueta(k, estado.actual), estado.comparar))
    );
  }

  function areasUsadas(r) {
    return P.AREAS.concat(r.productos.some((p) => p.porArea && p.porArea.OTRA) ? ["OTRA"] : []);
  }
  function renderLeyenda(act) {
    el.leyenda.innerHTML = areasUsadas(act).map((a) =>
      `<span><i class="punto" style="background:var(--a-${a})"></i>${AREA_LARGO[a]}</span>`).join("");
  }

  /** Chip de cambio contra el reporte de comparación. */
  function cambio(actual, previo, { chip = false } = {}) {
    if (previo == null) return "";
    const d = actual - previo;
    if (Math.abs(d) < 0.001) return chip ? `<span class="chip">= igual</span>` : `<span class="nota">= igual</span>`;
    const pct = previo ? ` · ${d > 0 ? "+" : "−"}${fmtPct.format(Math.abs((d / previo) * 100))}%` : " · nuevo";
    const txt = `${d > 0 ? "▲ +" : "▼ −"}${num(Math.abs(d))}${pct}`;
    return chip
      ? `<span class="chip"><span class="${d > 0 ? "fl-sube" : "fl-baja"}">${txt}</span></span>`
      : `<span class="${d > 0 ? "sube" : "baja"}">${txt}</span>`;
  }

  const idCat = (cat) => "cat-" + cat.toLowerCase().normalize("NFD").replace(/[^a-z]+/g, "-");

  function imagen(src, alt) {
    // Si la foto del menú no carga, la tarjeta queda con el fondo café de la marca.
    return `<img src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />`;
  }

  // ---------------------------------------------------------------- panel
  function renderPanel(act, cmp) {
    const fotos = Object.entries(PANELES).map(([id, pn]) => {
      const resumen = pn.cats.map((c) => `${num(sumaCat(act, c))} ${c.toLowerCase()}`).join(" · ");
      return `<button type="button" class="panel-tab" role="tab" data-panel="${id}" aria-selected="${id === estado.panel}">
        ${imagen(pn.img, pn.nombre)}
        <span class="panel-tab-in"><span class="panel-tab-nombre">${ICONOS[pn.icono]}${pn.nombre}</span>
        <span class="panel-tab-res">${resumen}</span></span>
      </button>`;
    });
    const extra = Object.entries(PESTANAS_EXTRA).map(([id, t]) =>
      `<button type="button" class="panel-tab extra" role="tab" data-panel="${id}" aria-selected="${id === estado.panel}">
        <span class="panel-tab-in"><span class="panel-tab-nombre">${ICONOS[t.icono]}${t.nombre}</span></span></button>`);
    el.paneles.innerHTML = fotos.concat(extra).join("");

    const esPanel = !!PANELES[estado.panel];
    el.vistaPanel.hidden = !esPanel;
    el.vistaComp.hidden = estado.panel !== "comparativo";
    el.vistaDatos.hidden = estado.panel !== "datos";
    if (esPanel) {
      renderLeyenda(act);
      renderBloques(act, cmp, PANELES[estado.panel].cats);
    }
    for (const b of el.subDatos.querySelectorAll("[data-tabla]")) {
      const on = b.dataset.tabla === estado.tablaDatos;
      b.setAttribute("aria-pressed", String(on));
      $(b.dataset.tabla).hidden = !on;
    }
  }

  function barraApilada(p, max, areas) {
    if (!p.total) return `<div class="vacia">Sin ventas</div>`;
    const ancho = (p.total / max) * 100;
    const segs = areas.filter((a) => p.porArea[a]).map((a) => {
      const v = p.porArea[a];
      const tip = `<b>${p.nombre}</b><br>${AREA_LARGO[a]}: <b>${num(v)}</b> (${fmtPct.format((v / p.total) * 100)}%)`;
      return `<div class="seg" style="flex:${v} 1 0;background:var(--a-${a})" data-tip="${esc(tip)}"></div>`;
    }).join("");
    return `<div class="pista"><div class="apilada" style="width:${Math.max(ancho, 2)}%" role="img" aria-label="${p.nombre}: ${areas.filter((a) => p.porArea[a]).map((a) => `${AREA_LARGO[a]} ${num(p.porArea[a])}`).join(", ")}">${segs}</div></div>`;
  }

  /** Pie de columna: ranking de áreas de la categoría, de más a menos. */
  function resumenAreas(act, cat, areas) {
    const lista = act.productos.filter((p) => p.categoria === cat);
    const total = lista.reduce((s, p) => s + p.total, 0);
    if (!total) return "";
    const por = areas.map((a) => [a, lista.reduce((s, p) => s + (p.porArea[a] || 0), 0)])
      .filter(([, v]) => v).sort((x, y) => y[1] - x[1]);
    const max = por[0][1];
    const filas = por.map(([a, v], i) => `
      <div class="ra-fila ${i === 0 ? "ra-top" : ""}" data-tip="${esc(`<b>${cat}</b><br>${AREA_LARGO[a]}: <b>${num(v)}</b> (${fmtPct.format((v / total) * 100)}%)`)}">
        <span class="ra-area">${AREA_LARGO[a]}</span>
        <span class="ra-pista"><span class="ra-b" style="width:${(v / max) * 100}%;background:var(--a-${a})"></span></span>
        <span class="ra-valor">${num(v)}</span>
        <span class="ra-pct">${fmtPct.format((v / total) * 100)}%</span>
      </div>`).join("");
    return `<div class="resumen-areas">
      <div class="ra-titulo">¿Dónde se vendió más?</div>
      ${filas}
    </div>`;
  }

  /** Si una columna no alcanza, se oculta su resumen por área para no tener que desplazar. */
  function ajustarColumnas() {
    const cols = [...document.querySelectorAll(".col-cuerpo")];
    cols.forEach((c) => c.classList.remove("sin-resumen"));
    // Si una columna no alcanza, se quita en las tres para que el panel se vea parejo.
    if (cols.some((c) => c.scrollHeight > c.clientHeight + 1)) cols.forEach((c) => c.classList.add("sin-resumen"));
  }

  function renderBloques(act, cmp, cats = CATEGORIAS) {
    const areas = areasUsadas(act);
    const prev = cmp ? mapa(cmp) : null;
    el.bloques.innerHTML = cats.map((cat) => {
      const info = CAT_INFO[cat] || {};
      const lista = act.productos.filter((p) => p.categoria === cat).sort((a, b) => b.total - a.total);
      const max = Math.max(1, ...lista.map((p) => p.total));
      const filas = lista.map((p) => `
        <div class="fila">
          <div class="fila-top">
            <span class="fila-nombre">${p.nombre}${lista.length > 1 ? ` <span class="fila-parte" title="Parte del total de ${cat.toLowerCase()}">(${fmtPct.format(sumaCat(act, cat) ? (p.total / sumaCat(act, cat)) * 100 : 0)}%)</span>` : ""}${p.unidad && p.unidad !== "unidades" ? ` <span class="nota">${p.unidad}</span>` : ""}</span>
            <span class="fila-delta">${prev ? cambio(p.total, prev[p.id] ? prev[p.id].total : 0) : ""}</span>
            <span class="fila-valor">${num(p.total)}</span>
          </div>
          ${barraApilada(p, max, areas)}
        </div>`).join("");
      const fichas = lista.map(fichaDesglose).filter(Boolean).join("");
      const total = sumaCat(act, cat);
      return `<article class="col" id="${idCat(cat)}">
        <header class="col-head">
          ${info.img ? imagen(info.img, cat) : ""}
          <div class="col-head-in">
            <h2>${cat}</h2>
            <div class="col-total">${num(total)} <span>${info.unidad || ""}</span></div>
            ${cmp ? `<div class="col-delta">${cambio(total, sumaCat(cmp, cat), { chip: true })}</div>` : ""}
          </div>
        </header>
        <div class="col-cuerpo">
          ${filas}
          ${fichas ? `<div class="desglose">${fichas}</div>` : ""}
          ${resumenAreas(act, cat, areas)}
        </div>
      </article>`;
    }).join("");
    ajustarColumnas();
  }

  /** Ficha de desglose: tacos (orden de 3 / suelto / combo) y medias órdenes. */
  function fichaDesglose(p) {
    const tipos = Object.entries(p.porTipo || {}).filter(([, t]) => t.lineas);
    if (!tipos.length) return "";
    const medias = p.porTipo["Media orden"];
    const completas = p.porTipo["Orden completa"];
    let texto;
    if (medias || completas) {
      const c = completas ? completas.lineas : 0, m = medias ? medias.lineas : 0;
      texto = `<div class="ficha-cuenta"><strong>${fmt.format(c)}</strong> completas + <strong>${fmt.format(m)}</strong> medias
        <span class="nota">(= ${num(m / 2)} órdenes)</span> → <strong>${num(p.total)}</strong> órdenes</div>
        <div class="iconos" aria-label="2 medias órdenes equivalen a 1 orden"><span class="ic media"></span><span class="ic-mas">+</span><span class="ic media"></span><span class="ic-mas">=</span><span class="ic"></span><span class="ic-mas">&nbsp;2 medias = 1 orden</span></div>`;
    } else {
      texto = `<div class="ficha-cuenta">${tipos.map(([n, t]) => `${n}: <strong>${num(t.unidades)}</strong>${t.lineas !== t.unidades ? ` <span class="nota">(${fmt.format(t.lineas)} × ${fmt.format(t.unidades / t.lineas)})</span>` : ""}`).join(" · ")}</div>`;
    }
    const partes = tipos.map(([n, t], i) =>
      `<div style="flex:${t.unidades} 1 0;background:${TONOS_PARTES[i % TONOS_PARTES.length]}" data-tip="${esc(`<b>${p.nombre}</b><br>${n}: <b>${num(t.unidades)}</b> (${fmtPct.format((t.unidades / p.total) * 100)}%)`)}"></div>`).join("");
    const ley = tipos.map(([n, t], i) =>
      `<span><i class="punto" style="background:${TONOS_PARTES[i % TONOS_PARTES.length]}"></i>${n} ${fmtPct.format((t.unidades / p.total) * 100)}%</span>`).join("");
    return `<div class="ficha"><div class="ficha-titulo">${p.nombre}: de dónde salen</div>${texto}
      <div class="partes">${partes}</div><div class="partes-ley">${ley}</div></div>`;
  }

  // ---------------------------------------------------------------- análisis por producto
  /**
   * Comparativo: botones por categoría (con foto); a la izquierda qué subió y qué
   * bajó en esa categoría, a la derecha la tendencia del producto seleccionado.
   */
  function renderAnalisis(act, cmp, ks) {
    const cats = CATEGORIAS.concat(["Todas"]);
    if (!cats.includes(estado.catAnalisis)) estado.catAnalisis = CATEGORIAS[0];
    const prev = cmp ? mapa(cmp) : null;

    // Botones de categoría: foto a la derecha, total y cambio
    el.anCats.innerHTML = cats.map((cat) => {
      const info = CAT_INFO[cat] || {};
      const total = cat === "Todas" ? null : sumaCat(act, cat);
      const ch = cmp && total != null ? cambio(total, sumaCat(cmp, cat)).replace(/ · .*?</, "<") : "";
      return `<button type="button" class="an-cat" data-cat="${esc(cat)}" aria-pressed="${cat === estado.catAnalisis}">
        ${info.img ? imagen(info.img, cat) : ""}
        <span class="an-cat-in">
          <span class="an-cat-n">${cat}</span>
          <span class="an-cat-v">${total != null ? num(total) : act.productos.length} <span class="an-cat-d">${total != null ? ch : "productos"}</span></span>
        </span>
      </button>`;
    }).join("");

    // Productos de la categoría
    const lista = act.productos.filter((p) => estado.catAnalisis === "Todas" || p.categoria === estado.catAnalisis);
    if (!lista.some((p) => p.id === estado.prodAnalisis)) {
      estado.prodAnalisis = [...lista].sort((a, b) => b.total - a.total)[0].id;
    }

    // Izquierda: qué subió y qué bajó (o, sin comparación, lo vendido)
    if (cmp) {
      el.anNota.textContent = `${fechaCorta(estado.actual)} contra ${fechaCorta(estado.comparar)} · clic para ver su tendencia`;
      const filas = lista.map((p) => {
        const antes = prev[p.id] ? prev[p.id].total : 0;
        const d = p.total - antes;
        const pct = antes ? (d / antes) * 100 : (p.total ? 100 : 0);
        return { p, antes, d, pct };
      }).sort((a, b) => b.pct - a.pct);
      const max = Math.max(10, ...filas.map((f) => Math.abs(f.pct)));
      el.anLista.classList.remove("an-sin-cmp");
      el.anLista.innerHTML = filas.map(({ p, antes, d, pct }) => {
        const w = (Math.abs(pct) / max) * 100;
        const sel = p.id === estado.prodAnalisis ? " an-sel" : "";
        const tip = esc(`<b>${p.nombre}</b><br>${fechaCorta(estado.comparar)}: ${num(antes)}<br>${fechaCorta(estado.actual)}: ${num(p.total)}<br>Cambio: <b>${d > 0 ? "+" : d < 0 ? "−" : ""}${num(Math.abs(d))}</b>`);
        const etq = antes ? `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${fmtPct.format(Math.abs(pct))}%` : (p.total ? "nuevo" : "—");
        return `<div class="dv-fila${sel}" data-prod="${p.id}" data-tip="${tip}">
          <div class="dv-nombre">${p.nombre}</div>
          <div class="dv-izq">${pct < 0 ? `<div class="b" style="width:calc(${w}% - 2px)"></div>` : ""}</div>
          <div class="dv-der">${pct > 0 ? `<div class="b" style="width:calc(${w}% - 2px)"></div>` : ""}</div>
          <div class="dv-valor ${d > 0 ? "sube" : d < 0 ? "baja" : ""}">${d > 0 ? "▲" : d < 0 ? "▼" : "="} ${etq}</div>
        </div>`;
      }).join("") + `<div class="dv-fila dv-pie"><div></div><div class="dv-eje"><span>−${fmtPct.format(max)}% bajó</span><span>subió +${fmtPct.format(max)}%</span></div></div>`;
    } else {
      el.anNota.textContent = "elige un día en Comparar contra para ver qué subió y qué bajó";
      const orden = [...lista].sort((a, b) => b.total - a.total);
      const max = Math.max(1, ...orden.map((p) => p.total));
      el.anLista.classList.add("an-sin-cmp");
      el.anLista.innerHTML = orden.map((p) => `
        <div class="dv-fila${p.id === estado.prodAnalisis ? " an-sel" : ""}" data-prod="${p.id}">
          <div class="dv-nombre">${p.nombre}</div>
          <div class="an-pista"><div class="an-b" style="width:${(p.total / max) * 100}%"></div></div>
          <div class="dv-valor">${num(p.total)}</div>
        </div>`).join("");
    }

    renderTendenciaProducto(act, cmp, ks);
  }

  /** Derecha: tendencia del producto seleccionado, dibujada al tamaño de su espacio. */
  function renderTendenciaProducto(act, cmp, ks) {
    const p = act.productos.find((x) => x.id === estado.prodAnalisis);
    if (!p) return;
    const pts = ks.map((k) => { const m = mapa(reporte(k)); return { k, v: m[p.id] ? m[p.id].total : 0 }; });
    const unidad = p.unidad && p.unidad !== "unidades" ? ` <span class="nota">${p.unidad}</span>` : "";
    el.anTitulo.innerHTML = `${p.nombre}${unidad}`;
    el.anValor.innerHTML = `<b>${num(p.total)}</b> ${cmp ? cambio(p.total, mapa(cmp)[p.id] ? mapa(cmp)[p.id].total : 0) : ""}`;

    if (pts.length < 2) {
      el.anGrafica.innerHTML = `<p class="vacio">Sube al menos dos días para ver la tendencia.</p>`;
      el.anPie.innerHTML = "";
      return;
    }
    const vals = pts.map((x) => x.v);
    const prom = vals.reduce((s, v) => s + v, 0) / vals.length;
    const iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals));

    const W = Math.max(320, el.anGrafica.clientWidth || 640), H = Math.max(180, el.anGrafica.clientHeight || 300);
    const m = { l: 48, r: 18, t: 22, b: 28 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const maxV = Math.max(...vals, 1);
    const paso = Math.pow(10, Math.floor(Math.log10(maxV)));
    const tope = Math.ceil((maxV * 1.1) / paso) * paso;
    const X = (i) => m.l + (i / (pts.length - 1)) * iw;
    const Y = (v) => m.t + ih - (v / tope) * ih;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => tope * f);
    const cada = Math.ceil(pts.length / Math.max(2, Math.floor(iw / 90)));
    const linea = pts.map((x, i) => `${X(i)},${Y(x.v)}`).join(" ");
    const area = `${X(0)},${m.t + ih} ${linea} ${X(pts.length - 1)},${m.t + ih}`;
    const puntos = pts.map((x, i) => {
      const esAct = x.k === estado.actual, esCmp = x.k === estado.comparar;
      const dif = i > 0 ? x.v - pts[i - 1].v : null;
      const tip = esc(`<b>${p.nombre}</b><br>${fechaLarga(x.k)}: <b>${num(x.v)}</b>${dif != null ? `<br>vs día anterior: ${dif > 0 ? "+" : dif < 0 ? "−" : ""}${num(Math.abs(dif))}` : ""}`);
      return `<circle class="an-pt ${esAct ? "an-pt-act" : ""} ${esCmp ? "an-pt-cmp" : ""}" cx="${X(i)}" cy="${Y(x.v)}" r="${esAct ? 6 : esCmp ? 5.5 : 4}"/>
        <circle class="an-hit" cx="${X(i)}" cy="${Y(x.v)}" r="14" data-tip="${tip}"/>
        ${(esAct || i === iMax || i === iMin) ? `<text class="an-etq" x="${X(i)}" y="${Y(x.v) - 10}" text-anchor="${i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}">${num(x.v)}</text>` : ""}`;
    }).join("");
    el.anGrafica.innerHTML = `<svg class="an-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tendencia de ${esc(p.nombre)}">
      <g class="an-ejes">${ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${fmt.format(t)}</text>`).join("")}</g>
      ${pts.map((x, i) => (i % cada === 0 || i === pts.length - 1) ? `<text class="an-x" x="${X(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}">${fechaCorta(x.k)}</text>` : "").join("")}
      <line class="an-prom" x1="${m.l}" x2="${W - m.r}" y1="${Y(prom)}" y2="${Y(prom)}"/>
      <polygon class="an-area" points="${area}"/>
      <polyline class="an-linea" points="${linea}"/>
      ${puntos}
    </svg>`;
    el.anPie.innerHTML = `<span>Promedio <b>${num(Math.round(prom * 10) / 10)}</b></span>
      <span>Máximo <b>${num(vals[iMax])}</b> · ${fechaCorta(pts[iMax].k)}</span>
      <span>Mínimo <b>${num(vals[iMin])}</b> · ${fechaCorta(pts[iMin].k)}</span>
      <span class="an-ley"><i class="an-ley-act"></i>reporte <i class="an-ley-cmp"></i>comparado <i class="an-ley-prom"></i>promedio</span>`;
  }

  // ---------------------------------------------------------------- tablas
  function renderTabla(act, cmp) {
    const areas = areasUsadas(act);
    const prev = cmp ? mapa(cmp) : null;
    el.tabla.tHead.innerHTML = `<tr><th>Producto</th><th class="num">Total</th>${areas.map((a) => `<th class="num">${AREA_LARGO[a]}</th>`).join("")}${prev ? `<th class="num">${fechaCorta(estado.comparar)}</th><th class="num">Cambio</th>` : ""}</tr>`;
    let html = "";
    for (const cat of CATEGORIAS) {
      html += `<tr class="grupo"><td colspan="${areas.length + 2 + (prev ? 2 : 0)}">${cat}</td></tr>`;
      for (const p of act.productos.filter((q) => q.categoria === cat)) {
        const antes = prev ? (prev[p.id] ? prev[p.id].total : 0) : null;
        html += `<tr><td>${p.nombre}</td><td class="num"><b>${num(p.total)}</b></td>
          ${areas.map((a) => `<td class="num ${p.porArea[a] ? "" : "cero"}">${num(p.porArea[a] || 0)}</td>`).join("")}
          ${prev ? `<td class="num">${num(antes)}</td><td class="num">${cambio(p.total, antes)}</td>` : ""}</tr>`;
      }
    }
    el.tabla.tBodies[0].innerHTML = html;
  }

  function renderHistorial(ks) {
    el.notaHist.textContent = `(${ks.length})`;
    const mapas = ks.map((k) => mapa(reporte(k)));
    el.tablaHist.tHead.innerHTML = `<tr><th>Producto</th>${ks.map((k) =>
      `<th class="num">${fechaCorta(k)} <button class="x" data-borrar="${encodeURIComponent(k)}" title="Quitar este día del historial">×</button></th>`).join("")}${ks.length > 1 ? '<th class="num">Promedio</th>' : ""}</tr>`;
    el.tablaHist.tBodies[0].innerHTML = P.PRODUCTOS.map((p) => {
      const vals = mapas.map((m) => (m[p.id] ? m[p.id].total : 0));
      const prom = vals.reduce((s, v) => s + v, 0) / vals.length;
      return `<tr><td>${p.nombre}</td>${vals.map((v) => `<td class="num">${num(v)}</td>`).join("")}${ks.length > 1 ? `<td class="num"><b>${fmt.format(Math.round(prom * 10) / 10)}</b></td>` : ""}</tr>`;
    }).join("");
  }

  function renderDetalle(act) {
    const nombres = Object.fromEntries(P.PRODUCTOS.map((p) => [p.id, p.nombre]));
    el.tablaDet.tBodies[0].innerHTML = (act.detalle || []).map((d) =>
      `<tr><td>${nombres[d.productoId]}</td><td>${d.tabla}</td><td>${esc(d.nombre)}</td><td>${AREA_LARGO[d.area] || d.area}</td>
       <td class="num">${fmt.format(d.cantidad)}</td><td class="num">${d.factor}</td><td class="num">${num(d.unidades)}</td></tr>`).join("");
  }

  // ================================================================ utilidades
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function mostrarError(msg) { el.error.textContent = msg; el.error.hidden = false; }
  function ocultarError() { el.error.hidden = true; }

  function mostrarTip(html, e) {
    el.tip.innerHTML = html;
    el.tip.hidden = false;
    const r = el.tip.getBoundingClientRect();
    let left = e.clientX + 14, top = e.clientY + 14;
    if (left + r.width > window.innerWidth - 8) left = e.clientX - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = e.clientY - r.height - 14;
    el.tip.style.left = Math.max(8, left) + "px";
    el.tip.style.top = Math.max(8, top) + "px";
  }
  function ocultarTip() { el.tip.hidden = true; }

  // ================================================================ eventos
  el.inp.addEventListener("change", () => { leerArchivos([...el.inp.files]); el.inp.value = ""; });
  el.drop.addEventListener("click", (e) => { e.preventDefault(); el.inp.click(); });

  // Arrastrar un archivo en cualquier parte de la página.
  let arrastres = 0;
  document.addEventListener("dragenter", (e) => { e.preventDefault(); arrastres++; document.body.classList.add("arrastrando"); el.drop.classList.add("sobre"); });
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("dragleave", () => { if (--arrastres <= 0) { arrastres = 0; document.body.classList.remove("arrastrando"); el.drop.classList.remove("sobre"); } });
  document.addEventListener("drop", (e) => {
    e.preventDefault(); arrastres = 0;
    document.body.classList.remove("arrastrando"); el.drop.classList.remove("sobre");
    if (e.dataTransfer.files.length) leerArchivos([...e.dataTransfer.files]);
  });

  el.selActual.onchange = () => { estado.actual = el.selActual.value; estado.comparar = anteriorA(estado.actual); render(); };
  el.selComparar.onchange = () => { estado.comparar = el.selComparar.value; render(); };
  el.paneles.addEventListener("click", (e) => {
    const b = e.target.closest("[data-panel]");
    if (!b) return;
    estado.panel = b.dataset.panel; guardarPref("panel", estado.panel);
    render();
  });
  el.modo.addEventListener("click", () => {
    estado.modo = estado.modo === "meseros" ? "productos" : "meseros";
    guardarPref("modo", estado.modo);
    ocultarTip();
    render();
  });

  // Utilidades compartidas con el tablero de meseros (meseros.js).
  window.Tablero = {
    estado, reporte, clavesOrdenadas, fechaLarga, fechaCorta, num, fmt, fmtPct, esc, cambio,
    mostrarTip, ocultarTip, pref, guardarPref, render: () => render(),
  };

  el.subDatos.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tabla]");
    if (!b) return;
    estado.tablaDatos = b.dataset.tabla;
    render();
  });
  el.anLista.addEventListener("click", (e) => {
    const f = e.target.closest("[data-prod]");
    if (!f) return;
    estado.prodAnalisis = f.dataset.prod;
    for (const x of el.anLista.querySelectorAll("[data-prod]")) x.classList.toggle("an-sel", x === f);
    renderTendenciaProducto(reporte(estado.actual), estado.comparar ? reporte(estado.comparar) : null, clavesOrdenadas());
  });
  el.anCats.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    estado.catAnalisis = b.dataset.cat;
    guardarPref("catAnalisis", estado.catAnalisis);
    render();
  });
  let tResize;
  window.addEventListener("resize", () => {
    clearTimeout(tResize);
    tResize = setTimeout(() => {
      ajustarColumnas();
      if (!el.vistaComp.hidden && estado.actual) renderAnalisis(reporte(estado.actual), estado.comparar ? reporte(estado.comparar) : null, clavesOrdenadas());
    }, 150);
  });

  // Tooltips de barras (cualquier elemento con data-tip)
  document.addEventListener("mousemove", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (t) mostrarTip(t.dataset.tip, e);
    else if (!e.target.closest || !e.target.closest("#tCapa")) ocultarTip();
  });

  el.tablaHist.addEventListener("click", (e) => {
    const b = e.target.closest("[data-borrar]");
    if (!b) return;
    e.preventDefault();
    const k = decodeURIComponent(b.dataset.borrar);
    if (!confirm(`¿Quitar el reporte del ${etiqueta(k)} del historial?`)) return;
    delete estado.historial[k];
    cache.delete(k);
    if (estado.actual === k) estado.actual = null;
    guardarHistorial();
    render();
  });

  el.btnExp.onclick = () => {
    const blob = new Blob([JSON.stringify(estado.historial)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `historial-conteo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  el.inpImp.onchange = async () => {
    try {
      const datos = JSON.parse(await el.inpImp.files[0].text());
      Object.assign(estado.historial, datos);
      cache.clear();
      guardarHistorial();
      render();
    } catch (e) { mostrarError("El archivo de historial no es válido."); }
    el.inpImp.value = "";
  };

  render();
})();
