/* Dashboard de conteo de productos. Usa ReporteParser (parser.js) y SheetJS. */
(function () {
  "use strict";

  const P = window.ReporteParser;
  const CLAVE_STORAGE = "conteoProductos.historial.v1";
  const fmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });

  const $ = (id) => document.getElementById(id);
  const el = {
    drop: $("drop"), inp: $("inpArchivo"), error: $("error"), panel: $("panel"),
    sub: $("subtitulo"), selActual: $("selActual"), selComparar: $("selComparar"),
    chips: $("chips"), kpis: $("kpis"), buscar: $("buscar"),
    tabla: $("tabla"), tablaHist: $("tablaHistorial"), notaHist: $("notaHistorial"),
    tablaDet: $("tablaDetalle"), btnExp: $("btnExportar"), inpImp: $("inpImportar"),
  };

  const CATEGORIAS = [...new Set(P.PRODUCTOS.map((p) => p.categoria))];
  const estado = { historial: cargarHistorial(), actual: null, comparar: "", categoria: "Todas", texto: "" };

  // ---------------------------------------------------------------- historial
  function cargarHistorial() {
    try { return JSON.parse(localStorage.getItem(CLAVE_STORAGE)) || {}; } catch (_) { return {}; }
  }
  function guardarHistorial() {
    try { localStorage.setItem(CLAVE_STORAGE, JSON.stringify(estado.historial)); }
    catch (_) { mostrarError("No se pudo guardar el historial en este navegador (modo privado o almacenamiento lleno)."); }
  }
  function claveDe(r) {
    const f = r.fecha ? (r.fecha.desde === r.fecha.hasta ? r.fecha.desde : `${r.fecha.desde} a ${r.fecha.hasta}`) : r.archivo;
    return `${f}|${r.sucursal || ""}`;
  }
  function etiqueta(clave) {
    const [f, s] = clave.split("|");
    return s ? `${f} · ${s}` : f;
  }
  function clavesOrdenadas() {
    return Object.keys(estado.historial).sort();
  }

  // ---------------------------------------------------------------- archivos
  async function leerArchivos(files) {
    ocultarError();
    let ultima = null;
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const r = P.procesar(XLSX, wb, file.name);
        r.cargado = new Date().toISOString();
        const clave = claveDe(r);
        estado.historial[clave] = r;
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
    }
  }

  function anteriorA(clave) {
    const ks = clavesOrdenadas();
    const i = ks.indexOf(clave);
    return i > 0 ? ks[i - 1] : "";
  }

  // ---------------------------------------------------------------- render
  function render() {
    const ks = clavesOrdenadas();
    if (!ks.length) {
      el.panel.hidden = true;
      el.drop.classList.remove("compacto");
      el.sub.innerHTML = "Sube el reporte <em>Ventas por Sucursal</em> (.xlsx) para ver el conteo.";
      return;
    }
    if (!estado.actual || !estado.historial[estado.actual]) {
      estado.actual = ks[ks.length - 1];
      estado.comparar = anteriorA(estado.actual);
    }
    if (estado.comparar && !estado.historial[estado.comparar]) estado.comparar = "";

    el.panel.hidden = false;
    el.drop.classList.add("compacto");
    const r = estado.historial[estado.actual];
    el.sub.textContent = `${r.sucursal || "Sucursal"} · ${etiqueta(estado.actual).split(" · ")[0]}`;

    renderSelects(ks);
    renderChips();
    renderKpis();
    renderTabla();
    renderHistorial(ks);
    renderDetalle();
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

  function renderChips() {
    el.chips.replaceChildren(...["Todas", ...CATEGORIAS].map((c) => {
      const b = document.createElement("button");
      b.className = "chip"; b.type = "button"; b.textContent = c;
      b.setAttribute("aria-pressed", String(c === estado.categoria));
      b.onclick = () => { estado.categoria = c; render(); };
      return b;
    }));
  }

  function mapaTotales(r) {
    return Object.fromEntries((r ? r.productos : []).map((p) => [p.id, p]));
  }

  function delta(actual, previo) {
    if (previo == null) return "";
    const d = actual - previo;
    if (d === 0) return `<span class="mini">= igual</span>`;
    const pct = previo ? ` (${d > 0 ? "+" : ""}${fmt.format((d / previo) * 100)}%)` : "";
    return `<span class="${d > 0 ? "up" : "down"}">${d > 0 ? "▲ +" : "▼ "}${fmt.format(d)}${pct}</span>`;
  }

  function renderKpis() {
    const act = estado.historial[estado.actual];
    const cmp = estado.comparar ? estado.historial[estado.comparar] : null;
    const tarjetas = CATEGORIAS.map((cat) => {
      const suma = (r) => r.productos.filter((p) => p.categoria === cat).reduce((s, p) => s + p.total, 0);
      const unidad = cat === "Alimentos" ? "tacos (piezas)" : cat === "Complementos" ? "órdenes / piezas" : "unidades";
      return `<div class="kpi"><div class="t">${cat}</div><div class="v">${fmt.format(suma(act))}</div>
        <div class="d">${cmp ? delta(suma(act), suma(cmp)) : `<span class="mini">${unidad}</span>`}</div></div>`;
    });
    el.kpis.innerHTML = tarjetas.join("");
  }

  function productosVisibles(r) {
    const t = estado.texto.trim().toLowerCase();
    return r.productos.filter((p) =>
      (estado.categoria === "Todas" || p.categoria === estado.categoria) &&
      (!t || p.nombre.toLowerCase().includes(t))
    );
  }

  function renderTabla() {
    const act = estado.historial[estado.actual];
    const cmp = estado.comparar ? mapaTotales(estado.historial[estado.comparar]) : null;
    const areas = P.AREAS.concat(act.productos.some((p) => p.porArea.OTRA) ? ["OTRA"] : []);
    const lista = productosVisibles(act);
    const max = Math.max(1, ...lista.map((p) => p.total));

    el.tabla.tHead.innerHTML = `<tr><th>Producto</th><th class="num">Total</th>
      ${areas.map((a) => `<th class="num" title="${P.AREA_NOMBRES[a] || "Sin área"}">${a}</th>`).join("")}
      <th></th>${cmp ? `<th class="num">vs ${etiqueta(estado.comparar).split(" · ")[0]}</th>` : ""}</tr>`;

    const cols = areas.length + 3 + (cmp ? 1 : 0);
    let html = "", catPrevia = null;
    for (const p of lista) {
      if (p.categoria !== catPrevia) {
        html += `<tr class="cat"><td colspan="${cols}">${p.categoria}</td></tr>`;
        catPrevia = p.categoria;
      }
      const unidad = p.unidad !== "unidades" ? ` <span class="mini">${p.unidad}</span>` : "";
      html += `<tr>
        <td>${p.nombre}${unidad}</td>
        <td class="num"><strong>${fmt.format(p.total)}</strong></td>
        ${areas.map((a) => `<td class="num ${p.porArea[a] ? "" : "cero"}">${fmt.format(p.porArea[a] || 0)}</td>`).join("")}
        <td class="barra-celda"><div class="barra-fondo"><div class="barra-valor" style="width:${(p.total / max) * 100}%"></div></div></td>
        ${cmp ? `<td class="num">${delta(p.total, cmp[p.id] ? cmp[p.id].total : 0)}</td>` : ""}
      </tr>`;
    }
    el.tabla.tBodies[0].innerHTML = html || `<tr><td colspan="${cols}" class="mini">Sin productos para este filtro.</td></tr>`;
  }

  function renderHistorial(ks) {
    const act = estado.historial[estado.actual];
    const lista = productosVisibles(act);
    const mapas = ks.map((k) => mapaTotales(estado.historial[k]));
    el.notaHist.textContent = `${ks.length} reporte(s) guardado(s) en este navegador`;
    el.tablaHist.tHead.innerHTML = `<tr><th>Producto</th>${ks.map((k) =>
      `<th class="num">${etiqueta(k).split(" · ")[0]} <button class="x" data-borrar="${encodeURIComponent(k)}" title="Quitar este reporte del historial">✕</button></th>`
    ).join("")}${ks.length > 1 ? '<th class="num">Promedio</th>' : ""}</tr>`;
    el.tablaHist.tBodies[0].innerHTML = lista.map((p) => {
      const vals = mapas.map((m) => (m[p.id] ? m[p.id].total : 0));
      const prom = vals.reduce((s, v) => s + v, 0) / vals.length;
      return `<tr><td>${p.nombre}</td>${vals.map((v, i) =>
        `<td class="num ${ks[i] === estado.actual ? "" : "mini"}">${fmt.format(v)}</td>`).join("")}
        ${ks.length > 1 ? `<td class="num">${fmt.format(prom)}</td>` : ""}</tr>`;
    }).join("");
  }

  function renderDetalle() {
    const act = estado.historial[estado.actual];
    const nombres = Object.fromEntries(P.PRODUCTOS.map((p) => [p.id, p.nombre]));
    el.tablaDet.tBodies[0].innerHTML = (act.detalle || []).map((d) =>
      `<tr><td>${nombres[d.productoId]}</td><td>${d.tabla}</td><td>${escapar(d.nombre)}</td><td>${d.area}</td>
       <td class="num">${fmt.format(d.cantidad)}</td><td class="num">${d.factor}</td><td class="num">${fmt.format(d.unidades)}</td></tr>`
    ).join("");
  }

  function escapar(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ---------------------------------------------------------------- errores
  function mostrarError(msg) { el.error.textContent = msg; el.error.hidden = false; }
  function ocultarError() { el.error.hidden = true; }

  // ---------------------------------------------------------------- eventos
  el.inp.addEventListener("change", () => { leerArchivos([...el.inp.files]); el.inp.value = ""; });
  ["dragenter", "dragover"].forEach((t) => el.drop.addEventListener(t, (e) => { e.preventDefault(); el.drop.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach((t) => el.drop.addEventListener(t, () => el.drop.classList.remove("sobre")));
  el.drop.addEventListener("drop", (e) => { e.preventDefault(); leerArchivos([...e.dataTransfer.files]); });

  el.selActual.onchange = () => { estado.actual = el.selActual.value; estado.comparar = anteriorA(estado.actual); render(); };
  el.selComparar.onchange = () => { estado.comparar = el.selComparar.value; render(); };
  el.buscar.oninput = () => { estado.texto = el.buscar.value; renderTabla(); renderHistorial(clavesOrdenadas()); };

  el.tablaHist.addEventListener("click", (e) => {
    const b = e.target.closest("[data-borrar]");
    if (!b) return;
    const k = decodeURIComponent(b.dataset.borrar);
    if (!confirm(`¿Quitar el reporte ${etiqueta(k)} del historial?`)) return;
    delete estado.historial[k];
    if (estado.actual === k) estado.actual = null;
    guardarHistorial();
    render();
  });

  el.btnExp.onclick = () => {
    const blob = new Blob([JSON.stringify(estado.historial, null, 2)], { type: "application/json" });
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
      guardarHistorial();
      render();
    } catch (e) { mostrarError("El archivo de historial no es válido."); }
    el.inpImp.value = "";
  };

  render();
})();
