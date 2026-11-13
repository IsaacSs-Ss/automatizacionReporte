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
    "Bebidas": { img: IMG + "2025/04/bebidas_elmexiquense.jpg", unidad: "jugos, aguas y cafés" },
    "Tacos dorados": { img: IMG + "2025/04/tacos-dorados-barbacoa.jpg", unidad: "tacos (piezas)" },
    "Complementos": { img: IMG + "2025/04/complementos_elmexiquense.jpg", unidad: "órdenes y piezas" },
    "Postres": { img: IMG + "2025/04/cafe_postre_elmexiquense.jpg", unidad: "postres" },
  };
  const CATEGORIAS = [...new Set(P.PRODUCTOS.map((p) => p.categoria))];
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
    categorias: $("categorias"), bloques: $("bloques"),
    secComp: $("secComparacion"), notaComp: $("notaComparacion"), grafComp: $("graficaComparacion"),
    secTend: $("secTendencia"), selTend: $("selTendencia"), grafTend: $("graficaTendencia"),
    tabla: $("tabla"), tablaHist: $("tablaHistorial"), notaHist: $("notaHistorial"), tablaDet: $("tablaDetalle"),
    btnExp: $("btnExportar"), inpImp: $("inpImportar"), tip: $("tooltip"),
  };

  const estado = { historial: cargarHistorial(), actual: null, comparar: "", tendencia: "tacos-dorados" };
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
  function etiqueta(clave) {
    const [f, s] = clave.split("|");
    return s ? `${fechaCorta(clave)} (${f}) · ${s}` : fechaCorta(clave);
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
      el.drop.classList.remove("oculto");
      el.sub.textContent = "Conteo de productos vendidos";
      return;
    }
    if (!estado.actual || !estado.historial[estado.actual]) {
      estado.actual = ks[ks.length - 1];
      estado.comparar = anteriorA(estado.actual);
    }
    if (estado.comparar && !estado.historial[estado.comparar]) estado.comparar = "";

    el.panel.hidden = false;
    el.drop.classList.add("oculto");
    const act = reporte(estado.actual);
    const cmp = estado.comparar ? reporte(estado.comparar) : null;
    el.sub.textContent = `${act.sucursal || "Conteo de productos"} · ${fechaCorta(estado.actual)}`;

    if (act.antiguo) mostrarError("Este reporte se guardó con una versión anterior del dashboard. Vuelve a subir el Excel para ver los productos nuevos y los desgloses.");
    else ocultarError();

    renderSelects(ks);
    renderLeyenda(act);
    renderCategorias(act, cmp);
    renderBloques(act, cmp);
    renderComparacion(act, cmp);
    renderTendencia(ks);
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
    el.selActual.replaceChildren(...ks.slice().reverse().map((k) => opcion(k, etiqueta(k), estado.actual)));
    el.selComparar.replaceChildren(
      opcion("", "— Sin comparar —", estado.comparar),
      ...ks.slice().reverse().filter((k) => k !== estado.actual).map((k) => opcion(k, etiqueta(k), estado.comparar))
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
    const pct = previo ? ` · ${d > 0 ? "+" : ""}${fmtPct.format((d / previo) * 100)}%` : " · nuevo";
    const txt = `${d > 0 ? "▲ +" : "▼ "}${num(d)}${pct}`;
    return chip
      ? `<span class="chip"><span class="${d > 0 ? "fl-sube" : "fl-baja"}">${txt}</span></span>`
      : `<span class="${d > 0 ? "sube" : "baja"}">${txt}</span>`;
  }

  const idCat = (cat) => "cat-" + cat.toLowerCase().normalize("NFD").replace(/[^a-z]+/g, "-");

  function imagen(src, alt) {
    // Si la foto del menú no carga, la tarjeta queda con el fondo café de la marca.
    return `<img src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />`;
  }

  function renderCategorias(act, cmp) {
    el.categorias.innerHTML = CATEGORIAS.map((cat) => {
      const info = CAT_INFO[cat] || {};
      const v = sumaCat(act, cat);
      return `<a class="cat" href="#${idCat(cat)}">
        ${info.img ? imagen(info.img, cat) : ""}
        <div class="cat-in">
          <div class="cat-nombre">${cat}</div>
          <div class="cat-valor">${num(v)}</div>
          <div class="cat-unidad">${info.unidad || "unidades"}</div>
          ${cmp ? cambio(v, sumaCat(cmp, cat), { chip: true }) : ""}
        </div>
      </a>`;
    }).join("");
  }

  function barraApilada(p, max, areas) {
    if (!p.total) return `<div class="vacia">Sin ventas</div>`;
    const ancho = (p.total / max) * 100;
    const segs = areas.filter((a) => p.porArea[a]).map((a) => {
      const v = p.porArea[a];
      const tip = `<b>${p.nombre}</b><br>${AREA_LARGO[a]}: <b>${num(v)}</b> (${fmtPct.format((v / p.total) * 100)}%)`;
      return `<div class="seg" style="flex:${v} 1 0;background:var(--a-${a})" data-tip="${esc(tip)}"></div>`;
    }).join("");
    return `<div class="apilada" style="width:${Math.max(ancho, 2)}%" role="img" aria-label="${p.nombre}: ${areas.filter((a) => p.porArea[a]).map((a) => `${AREA_LARGO[a]} ${num(p.porArea[a])}`).join(", ")}">${segs}</div>`;
  }

  function renderBloques(act, cmp) {
    const areas = areasUsadas(act);
    const prev = cmp ? mapa(cmp) : null;
    el.bloques.innerHTML = CATEGORIAS.map((cat) => {
      const info = CAT_INFO[cat] || {};
      const lista = act.productos.filter((p) => p.categoria === cat).sort((a, b) => b.total - a.total);
      const max = Math.max(1, ...lista.map((p) => p.total));
      const filas = lista.map((p) => `
        <div class="fila">
          <div class="fila-nombre">${p.nombre}${p.unidad && p.unidad !== "unidades" ? ` <span class="nota">${p.unidad}</span>` : ""}</div>
          <div class="fila-valor">${num(p.total)}</div>
          ${barraApilada(p, max, areas)}
          <div class="fila-delta">${prev ? cambio(p.total, prev[p.id] ? prev[p.id].total : 0) : ""}</div>
        </div>`).join("");
      const fichas = lista.map(fichaDesglose).filter(Boolean).join("");
      return `<article class="bloque" id="${idCat(cat)}">
        <div class="bloque-foto">${info.img ? imagen(info.img, cat) : ""}</div>
        <div class="bloque-cuerpo">
          <div class="bloque-head"><h2>${cat}</h2><span class="bloque-total">${num(sumaCat(act, cat))} <span class="nota">${info.unidad || ""}</span></span></div>
          ${filas}
          ${fichas ? `<div class="desglose">${fichas}</div>` : ""}
        </div>
      </article>`;
    }).join("");
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

  // ---------------------------------------------------------------- comparación
  function renderComparacion(act, cmp) {
    if (!cmp) { el.secComp.hidden = true; return; }
    el.secComp.hidden = false;
    el.notaComp.textContent = `${fechaCorta(estado.actual)} contra ${fechaCorta(estado.comparar)} · % de cambio`;
    const prev = mapa(cmp);
    const filas = act.productos.map((p) => {
      const antes = prev[p.id] ? prev[p.id].total : 0;
      const d = p.total - antes;
      const pct = antes ? (d / antes) * 100 : (p.total ? 100 : 0);
      return { p, antes, d, pct };
    }).sort((a, b) => b.pct - a.pct);
    const max = Math.max(10, ...filas.map((f) => Math.abs(f.pct)));
    el.grafComp.innerHTML = filas.map(({ p, antes, d, pct }) => {
      const w = (Math.abs(pct) / max) * 100;
      const tip = esc(`<b>${p.nombre}</b><br>${fechaCorta(estado.comparar)}: ${num(antes)}<br>${fechaCorta(estado.actual)}: ${num(p.total)}<br>Cambio: <b>${d > 0 ? "+" : ""}${num(d)}</b>`);
      const etiquetaPct = antes ? `${pct > 0 ? "+" : ""}${fmtPct.format(pct)}%` : (p.total ? "nuevo" : "—");
      return `<div class="dv-nombre">${p.nombre}</div>
        <div class="dv-izq" data-tip="${tip}">${pct < 0 ? `<div class="b" style="width:calc(${w}% - 2px)"></div>` : ""}</div>
        <div class="dv-der" data-tip="${tip}">${pct > 0 ? `<div class="b" style="width:calc(${w}% - 2px)"></div>` : ""}</div>
        <div class="dv-valor ${d > 0 ? "sube" : d < 0 ? "baja" : ""}">${d > 0 ? "▲" : d < 0 ? "▼" : "="} ${etiquetaPct}</div>`;
    }).join("") + `<div></div><div class="dv-eje"><span>−${fmtPct.format(max)}% bajó</span><span>subió +${fmtPct.format(max)}%</span></div>`;
  }

  // ---------------------------------------------------------------- tendencia
  function renderTendencia(ks) {
    if (ks.length < 2) { el.secTend.hidden = true; return; }
    el.secTend.hidden = false;
    // Selector: categorías completas y cada producto.
    const opciones = [];
    for (const cat of CATEGORIAS) {
      const g = document.createElement("optgroup");
      g.label = cat;
      g.append(opcion("cat:" + cat, `Total ${cat.toLowerCase()}`, estado.tendencia));
      P.PRODUCTOS.filter((p) => p.categoria === cat).forEach((p) => g.append(opcion(p.id, p.nombre, estado.tendencia)));
      opciones.push(g);
    }
    el.selTend.replaceChildren(...opciones);

    const sel = estado.tendencia;
    const puntos = ks.map((k) => {
      const r = reporte(k);
      const v = sel.startsWith("cat:") ? sumaCat(r, sel.slice(4)) : (mapa(r)[sel] || { total: 0 }).total;
      return { k, v };
    });
    const W = 760, H = 240, m = { l: 44, r: 16, t: 14, b: 30 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const maxV = Math.max(1, ...puntos.map((p) => p.v));
    const paso = Math.pow(10, Math.floor(Math.log10(maxV)));
    const tope = Math.ceil(maxV / paso) * paso;
    const x = (i) => m.l + (puntos.length === 1 ? iw / 2 : (i / (puntos.length - 1)) * iw);
    const y = (v) => m.t + ih - (v / tope) * ih;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => tope * f);
    const cada = Math.ceil(puntos.length / 8); // no más de ~8 fechas en el eje
    const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tendencia">
      <g class="grid">${ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt.format(t)}</text>`).join("")}</g>
      ${puntos.map((p, i) => i % cada === 0 || i === puntos.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${fechaCorta(p.k)}</text>` : "").join("")}
      <polyline class="linea" points="${puntos.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")}"/>
      <line class="guia" id="tGuia" y1="${m.t}" y2="${m.t + ih}" x1="${m.l}" x2="${m.l}" style="opacity:0"/>
      ${puntos.map((p, i) => `<circle class="pt" cx="${x(i)}" cy="${y(p.v)}" r="${p.k === estado.actual ? 6 : 4}"/>`).join("")}
      <rect id="tCapa" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>
    </svg>`;
    el.grafTend.innerHTML = svg;
    const capa = el.grafTend.querySelector("#tCapa"), guia = el.grafTend.querySelector("#tGuia");
    const svgEl = el.grafTend.querySelector("svg");
    const nombreSel = sel.startsWith("cat:") ? `Total ${sel.slice(4).toLowerCase()}` : P.PRODUCTOS.find((p) => p.id === sel).nombre;
    capa.addEventListener("mousemove", (e) => {
      const pt = svgEl.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const lx = pt.matrixTransform(svgEl.getScreenCTM().inverse()).x;
      let i = 0, best = Infinity;
      puntos.forEach((_, j) => { const dd = Math.abs(x(j) - lx); if (dd < best) { best = dd; i = j; } });
      guia.setAttribute("x1", x(i)); guia.setAttribute("x2", x(i)); guia.style.opacity = 1;
      const ant = i > 0 ? puntos[i - 1].v : null;
      mostrarTip(`<b>${nombreSel}</b><br>${etiqueta(puntos[i].k).split(" · ")[0]}: <b>${num(puntos[i].v)}</b>${ant != null ? `<br>vs día anterior: ${cambio(puntos[i].v, ant).replace(/class="(sube|baja)"/, "")}` : ""}`, e);
    });
    capa.addEventListener("mouseleave", () => { guia.style.opacity = 0; ocultarTip(); });
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
    el.notaHist.textContent = `(${ks.length} día${ks.length === 1 ? "" : "s"} en este navegador)`;
    const mapas = ks.map((k) => mapa(reporte(k)));
    el.tablaHist.tHead.innerHTML = `<tr><th>Producto</th>${ks.map((k) =>
      `<th class="num">${fechaCorta(k)} <button class="x" data-borrar="${encodeURIComponent(k)}" title="Quitar este día del historial">✕</button></th>`).join("")}${ks.length > 1 ? '<th class="num">Promedio</th>' : ""}</tr>`;
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
  el.selTend.onchange = () => { estado.tendencia = el.selTend.value; renderTendencia(clavesOrdenadas()); };

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
