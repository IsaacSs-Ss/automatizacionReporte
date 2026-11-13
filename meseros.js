/* Tablero de meseros: desempeño (ticket por grupos de mesas), canales y horario, e historial.
 * Usa las utilidades que expone app.js en window.Tablero y los datos que el
 * parser guarda en reporte.crudo.extra. */
(function () {
  "use strict";

  const T = () => window.Tablero;
  const $ = (id) => document.getElementById(id);
  const dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  const entero = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
  const pct = (v, t) => (t ? Math.round((v / t) * 100) : 0) + "%";

  const PESTANAS = [
    { id: "desempeno", nombre: "Desempeño", icono: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },
    { id: "canales", nombre: "Canales y horario", icono: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    { id: "historial", nombre: "Historial", icono: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>' },
  ];
  const icono = (d) => `<svg class="icono" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  let pestana = null;
  let meseroHist = null;

  // ================================================================ datos
  const esCanal = (n) => /^(CAJA|APP|UBER|RAPPI|DIDI)/i.test(n) || /DOMICILIO/i.test(n);
  const bonito = (n) => n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const nombreCanal = (n) => {
    const u = n.toUpperCase();
    if (u === "CAJA PARA LLEVAR") return "Caja para llevar";
    if (u === "APP A DOMICILIO") return "App a domicilio";
    if (u === "CAJA NIEVES") return "Caja nieves";
    if (u.startsWith("CAJA PLANTA")) return bonito(n);
    return bonito(n);
  };

  function datos(r) {
    const e = r && r.crudo && r.crudo.extra;
    if (!e || !e.usuarios || !e.usuarios.length) return null;
    const usuarios = e.usuarios.map(([n, subtotal, total, cuentas, personas]) => ({
      clave: n.toUpperCase(), nombre: bonito(n), subtotal, total, cuentas, personas,
      ticket: cuentas ? total / cuentas : 0, porPersona: personas ? total / personas : 0,
    }));
    const meseros = usuarios.filter((u) => !esCanal(u.clave) && u.total > 0).sort((a, b) => b.total - a.total);
    const canales = usuarios.filter((u) => esCanal(u.clave) && u.total > 0).sort((a, b) => b.total - a.total)
      .map((u) => Object.assign(u, { nombre: nombreCanal(u.clave) }));
    const suma = (k) => meseros.reduce((s, m) => s + m[k], 0);
    const venta = suma("total"), cuentas = suma("cuentas"), personas = suma("personas");
    return {
      meseros, canales, venta, cuentas, personas,
      ticket: cuentas ? venta / cuentas : 0, porPersona: personas ? venta / personas : 0,
      horas: e.horas || [], ocupacion: e.ocupacion || [], pagos: e.pagos || [], ordenes: e.ordenes || [],
    };
  }

  // ================================================================ render principal
  function render(act, cmp, ks) {
    const t = T();
    if (!pestana) pestana = t.pref("mTab", "desempeno");
    if (!PESTANAS.some((p) => p.id === pestana)) pestana = "desempeno";
    const nav = $("mPestanas"), cuerpo = $("mCuerpo");
    nav.innerHTML = PESTANAS.map((p) =>
      `<button type="button" class="panel-tab extra" role="tab" data-mtab="${p.id}" aria-selected="${p.id === pestana}">
        <span class="panel-tab-in"><span class="panel-tab-nombre">${icono(p.icono)}${p.nombre}${p.id === "desempeno" ? `<span class="beta">Beta</span>` : ""}</span></span></button>`).join("");

    const d = datos(act);
    if (!d) {
      cuerpo.innerHTML = `<p class="vacio">Este reporte se guardó antes de que existiera el tablero de meseros.<br>
        Vuelve a subir el Excel de este día para ver sus datos.</p>`;
      return;
    }
    const c = cmp ? datos(cmp) : null;
    const vistas = { desempeno, canales, historial };
    cuerpo.innerHTML = `<div class="m-vista m-${pestana}">${vistas[pestana](d, c, ks)}</div>`;
    if (pestana === "historial") enlazarHistorial(ks);
  }

  // ---------------------------------------------------------------- utilidades de dibujo
  function delta(a, b, { dinero: esDinero = false } = {}) {
    if (b == null) return "";
    const dd = a - b;
    if (Math.abs(dd) < 0.5) return `<span class="nota">= igual</span>`;
    const p = b ? ` · ${dd > 0 ? "+" : "−"}${Math.abs(Math.round((dd / b) * 100))}%` : "";
    const v = esDinero ? dinero.format(Math.abs(dd)) : entero.format(Math.abs(dd));
    return `<span class="${dd > 0 ? "sube" : "baja"}">${dd > 0 ? "▲ +" : "▼ −"}${v}${p}</span>`;
  }
  const kpi = (titulo, valor, extra = "") =>
    `<div class="m-kpi"><div class="m-kpi-t">${titulo}</div><div class="m-kpi-v">${valor}</div><div class="m-kpi-d">${extra}</div></div>`;
  const tarjeta = (titulo, cuerpo, nota = "", clase = "") =>
    `<section class="tarjeta m-card ${clase}"><div class="tarjeta-head"><h2>${titulo}</h2>${nota ? `<span class="nota">${nota}</span>` : ""}</div><div class="m-card-cuerpo">${cuerpo}</div></section>`;
  const tip = (html) => T().esc(html);
  const horaBonita = (h) => { const n = parseInt(h, 10); if (isNaN(n)) return h; return n === 12 ? "12 pm" : n > 12 ? `${n - 12} pm` : `${n} am`; };

  // ================================================================ Desempeño
  /**
   * Agrupa a los meseros por número de mesas (cuentas) en tres grupos parecidos:
   * pocas, medias y muchas. Así se compara el ticket entre quienes tuvieron
   * una carga de trabajo similar.
   */
  function grupos(meseros) {
    const orden = [...meseros].sort((a, b) => a.cuentas - b.cuentas);
    const n = orden.length;
    const cortes = [0, Math.round(n / 3), Math.round((2 * n) / 3), n];
    const nombres = ["Pocas mesas", "Mesas medias", "Muchas mesas"];
    return nombres.map((nombre, i) => {
      const miembros = orden.slice(cortes[i], cortes[i + 1]);
      if (!miembros.length) return null;
      const venta = miembros.reduce((s, m) => s + m.total, 0);
      const cuentas = miembros.reduce((s, m) => s + m.cuentas, 0);
      return {
        nombre, miembros: miembros.sort((a, b) => b.ticket - a.ticket),
        desde: miembros.reduce((a, m) => Math.min(a, m.cuentas), Infinity),
        hasta: miembros.reduce((a, m) => Math.max(a, m.cuentas), 0),
        ticket: cuentas ? venta / cuentas : 0,
      };
    }).filter(Boolean);
  }

  const ppm = (d) => (d.cuentas ? d.personas / d.cuentas : 0);
  function deltaDecimal(a, b) {
    const dd = a - b;
    if (Math.abs(dd) < 0.05) return `<span class="nota">= igual</span>`;
    return `<span class="${dd > 0 ? "sube" : "baja"}">${dd > 0 ? "▲ +" : "▼ −"}${Math.abs(dd).toFixed(1)}</span>`;
  }

  function desempeno(d, c) {
    const prev = c ? Object.fromEntries(c.meseros.map((m) => [m.clave, m])) : null;
    const kpis = `<div class="m-kpis">
      ${kpi("Ticket promedio", dinero.format(d.ticket), c ? delta(d.ticket, c.ticket, { dinero: true }) : `<span class="nota">por cuenta</span>`)}
      ${kpi("Promedio por persona", dinero.format(d.porPersona), c ? delta(d.porPersona, c.porPersona, { dinero: true }) : `<span class="nota">por comensal</span>`)}
      ${kpi("Personas por mesa", ppm(d).toFixed(1), c ? deltaDecimal(ppm(d), ppm(c)) : `<span class="nota">en promedio</span>`)}
      ${kpi("Cuentas atendidas", entero.format(d.cuentas), c ? delta(d.cuentas, c.cuentas) : `<span class="nota">${d.meseros.length} meseros</span>`)}
      ${kpi("Venta de meseros", dinero.format(d.venta), c ? delta(d.venta, c.venta, { dinero: true }) : `<span class="nota">con IVA</span>`)}
    </div>`;

    const gs = grupos(d.meseros);
    const maxT = Math.max(...d.meseros.map((m) => m.ticket), 1);
    const bloques = gs.map((g) => {
      const filas = g.miembros.map((m, i) => {
        const dif = g.ticket ? (m.ticket - g.ticket) / g.ticket : 0;
        const p = prev && prev[m.clave];
        const t = tip(`<b>${m.nombre}</b><br>Ticket: <b>${dinero.format(m.ticket)}</b><br>Promedio de su grupo: ${dinero.format(g.ticket)}<br>${m.cuentas} mesas · ${m.personas} personas · ${(m.personas / m.cuentas).toFixed(1)} por mesa<br>Por persona: ${dinero.format(m.porPersona)}${p ? `<br>Ticket del día comparado: ${dinero.format(p.ticket)}` : ""}`);
        return `<div class="m-tk ${i === 0 ? "m-top" : ""}" data-tip="${t}">
          <span class="m-tk-nombre">${m.nombre}</span>
          <span class="m-tk-mesas">${m.cuentas} mesas</span>
          <span class="m-tk-pista">
            <span class="m-tk-b" style="width:${(m.ticket / maxT) * 100}%"></span>
            <span class="m-tk-ref" style="left:${(g.ticket / maxT) * 100}%"></span>
          </span>
          <span class="m-tk-valor">${dinero.format(m.ticket)}</span>
          <span class="m-tk-dif ${dif >= 0 ? "sube" : "baja"}">${dif >= 0 ? "+" : "−"}${Math.abs(Math.round(dif * 100))}%</span>
        </div>`;
      }).join("");
      return `<div class="m-grupo">
        <div class="m-grupo-head"><b>${g.nombre}</b> <span class="nota">${g.desde}–${g.hasta} mesas · ticket del grupo ${dinero.format(g.ticket)}</span></div>
        ${filas}
      </div>`;
    }).join("");

    return `${kpis}
      <div class="m-grid">
        ${tarjeta("Ticket promedio entre meseros con mesas similares", `<div class="m-grupos">${bloques}</div>
          <div class="m-ley"><span><i class="m-ley-marca"></i>promedio del grupo</span><span>% = diferencia contra su grupo</span></div>`, "", "m-col-izq")}
        <div class="m-col-der">
          ${tarjeta("Mapa: mesas atendidas contra ticket", mapa(d, gs), "tamaño del punto = personas")}
          ${tarjeta("Venta por persona", porPersona(d), `promedio del restaurante: ${dinero.format(d.porPersona)}`)}
        </div>
      </div>`;
  }

  /** Dispersión: cuentas (x) contra ticket promedio (y); franjas = grupos de mesas; tamaño = personas. */
  function mapa(d, gs) {
    const W = 640, H = 300, m = { l: 62, r: 16, t: 22, b: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const xs = d.meseros.map((x) => x.cuentas), ys = d.meseros.map((x) => x.ticket);
    const x0 = 0, x1 = Math.max(...xs) * 1.08, y0 = Math.min(...ys) * 0.85, y1 = Math.max(...ys) * 1.08;
    const X = (v) => m.l + ((v - x0) / (x1 - x0)) * iw;
    const Y = (v) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
    const maxP = Math.max(...d.meseros.map((x) => x.personas), 1);
    const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => y0 + (y1 - y0) * f);
    const ticksX = [0, 0.25, 0.5, 0.75, 1].map((f) => x0 + (x1 - x0) * f);
    // Franjas: del punto medio entre grupos al siguiente.
    const limites = gs.map((g, i) => ({
      g, a: i === 0 ? x0 : (gs[i - 1].hasta + g.desde) / 2, b: i === gs.length - 1 ? x1 : (g.hasta + gs[i + 1].desde) / 2,
    }));
    const franjas = limites.map(({ g, a, b }, i) => `
      <rect class="m-franja ${i % 2 ? "m-franja-b" : ""}" x="${X(a)}" y="${m.t}" width="${X(b) - X(a)}" height="${ih}"/>
      <text class="m-franja-t" x="${(X(a) + X(b)) / 2}" y="${m.t - 8}" text-anchor="middle">${g.nombre}</text>
      <line class="m-franja-prom" x1="${X(a) + 4}" x2="${X(b) - 4}" y1="${Y(g.ticket)}" y2="${Y(g.ticket)}"/>`).join("");
    // Etiqueta al mejor y al peor ticket de cada grupo.
    const marcados = new Set(gs.flatMap((g) => [g.miembros[0].clave, g.miembros[g.miembros.length - 1].clave]));
    const puntos = d.meseros.map((x) => {
      const r = 5 + Math.sqrt(x.personas / maxP) * 10;
      const g = gs.find((gg) => gg.miembros.includes(x));
      const arriba = g && x.ticket >= g.ticket;
      const t = tip(`<b>${x.nombre}</b><br>${x.cuentas} mesas · ticket ${dinero.format(x.ticket)}<br>${g ? `${arriba ? "Arriba" : "Abajo"} del ticket de su grupo (${dinero.format(g.ticket)})<br>` : ""}${x.personas} personas`);
      return `<circle class="m-pt ${arriba ? "m-pt-arriba" : "m-pt-abajo"}" cx="${X(x.cuentas)}" cy="${Y(x.ticket)}" r="${r}" data-tip="${t}"/>` +
        (marcados.has(x.clave) ? `<text class="m-pt-lbl" x="${X(x.cuentas)}" y="${Y(x.ticket) - r - 4}" text-anchor="middle">${x.nombre.split(" ")[0]}</text>` : "");
    }).join("");
    return `<svg class="m-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mesas atendidas contra ticket promedio por mesero">
      ${franjas}
      <g class="m-grid-l">${ticksY.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${dinero.format(v)}</text>`).join("")}
      ${ticksX.map((v) => `<text x="${X(v)}" y="${H - 14}" text-anchor="middle">${entero.format(v)}</text>`).join("")}</g>
      <text x="${m.l + iw / 2}" y="${H - 1}" text-anchor="middle">mesas atendidas</text>
      ${puntos}
    </svg>
    <div class="m-ley"><span><i class="punto m-ley-arriba"></i>ticket arriba de su grupo</span><span><i class="punto m-ley-abajo"></i>abajo de su grupo</span><span><i class="m-ley-marca"></i>ticket promedio del grupo</span></div>`;
  }

  /** Tira de puntos: venta por persona de cada mesero contra el promedio del restaurante. */
  function porPersona(d) {
    const W = 640, H = 92, m = { l: 16, r: 16 };
    const vals = d.meseros.map((x) => x.porPersona);
    const v0 = Math.min(...vals) * 0.95, v1 = Math.max(...vals) * 1.03;
    const X = (v) => m.l + ((v - v0) / (v1 - v0)) * (W - m.l - m.r);
    const orden = [...d.meseros].sort((a, b) => a.porPersona - b.porPersona);
    const bajo = orden[0], alto = orden[orden.length - 1];
    // Se alternan alturas para que los puntos cercanos no se encimen.
    const pts = orden.map((x, i) => {
      const y = 38 + ((i % 3) - 1) * 12;
      const t = tip(`<b>${x.nombre}</b><br>${dinero.format(x.porPersona)} por persona<br>${x.personas} personas`);
      return `<circle class="m-pp ${x.porPersona >= d.porPersona ? "m-pp-arriba" : ""}" cx="${X(x.porPersona)}" cy="${y}" r="7" data-tip="${t}"/>`;
    }).join("");
    return `<svg class="m-svg m-svg-tira" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Venta por persona por mesero">
      <line class="m-base" x1="${m.l}" x2="${W - m.r}" y1="38" y2="38"/>
      <line class="m-prom" x1="${X(d.porPersona)}" x2="${X(d.porPersona)}" y1="14" y2="62"/>
      <text class="m-prom-t" x="${X(d.porPersona)}" y="10" text-anchor="middle">promedio</text>
      ${pts}
      <text class="m-tira-t" x="${X(bajo.porPersona)}" y="${H - 6}" text-anchor="start">${bajo.nombre.split(" ")[0]} ${dinero.format(bajo.porPersona)}</text>
      <text class="m-tira-t" x="${X(alto.porPersona)}" y="${H - 6}" text-anchor="end">${alto.nombre.split(" ")[0]} ${dinero.format(alto.porPersona)}</text>
    </svg>
    <div class="m-ley"><span><i class="punto m-ley-arriba"></i>arriba del promedio</span><span><i class="punto m-ley-abajo"></i>abajo del promedio</span></div>`;
  }

  // ================================================================ Canales y horario
  function canales(d, c) {
    const salon = { nombre: "Salón (meseros)", total: d.venta, cuentas: d.cuentas };
    const filas = [salon, ...d.canales];
    const totalCan = filas.reduce((s, x) => s + x.total, 0);
    const prevMap = c ? Object.fromEntries([["Salón (meseros)", c.venta], ...c.canales.map((x) => [x.nombre, x.total])]) : null;
    const max = Math.max(...filas.map((x) => x.total), 1);
    const listaCanales = filas.map((x, i) => `
      <div class="m-rk ${i === 0 ? "m-top" : ""}" data-tip="${tip(`<b>${x.nombre}</b><br>${dinero.format(x.total)} · ${pct(x.total, totalCan)} del total<br>${x.cuentas} cuentas`)}">
        <span class="m-rk-nombre">${x.nombre}</span>
        <span class="m-rk-pista"><span class="m-rk-b" style="width:${(x.total / max) * 100}%"></span></span>
        <span class="m-rk-valor">${dinero.format(x.total)}</span>
        <span class="m-rk-mov">${prevMap ? delta(x.total, prevMap[x.nombre] || 0, { dinero: true }).replace(/ · .*?</, "<") : `<span class="nota">${pct(x.total, totalCan)}</span>`}</span>
      </div>`).join("");

    // Forma de pago: barra 100 % + lista (paleta categórica validada, orden fijo)
    const totPago = d.pagos.reduce((s, p) => s + p[1], 0);
    const colores = ["var(--a-PB)", "var(--a-PA)", "var(--a-TR)", "var(--a-PLL)", "var(--a-DV)"];
    const pagos = [...d.pagos].sort((a, b) => b[1] - a[1]);
    const barraPago = pagos.map(([n, v], i) => `<div style="flex:${v} 1 0;background:${colores[i % 5]}" data-tip="${tip(`<b>${n}</b><br>${dinero.format(v)} (${pct(v, totPago)})`)}"></div>`).join("");
    const listaPago = pagos.map(([n, v], i) => `<div class="m-pago"><span><i class="punto" style="background:${colores[i % 5]}"></i>${n}</span><b>${dinero.format(v)}</b><span class="nota">${pct(v, totPago)}</span></div>`).join("");

    // Restaurante contra para llevar
    const ord = d.ordenes.map(([tipo, personas, cuentas, sub]) => `
      <div class="m-ord"><div class="m-ord-t">${tipo}</div><div class="m-ord-v">${dinero.format(sub * 1.16)}</div>
      <div class="nota">${entero.format(cuentas)} cuentas · ${entero.format(personas)} personas · ${dinero.format(personas ? (sub * 1.16) / personas : 0)} por persona</div></div>`).join("");

    return `<div class="m-grid">
      <div class="m-col-izq m-pila">
        ${tarjeta("Venta por canal", `<div class="m-ranking">${listaCanales}</div>`, c ? "cambio contra el día comparado" : "% del total")}
        ${tarjeta("Forma de pago", `<div class="m-barra100">${barraPago}</div><div class="m-pagos">${listaPago}</div>`)}
        ${ord ? tarjeta("Restaurante y para llevar", `<div class="m-ords">${ord}</div>`, "con IVA aprox.") : ""}
      </div>
      <div class="m-col-der">
        ${tarjeta("Ventas por hora", columnas(d.horas, (v) => dinero.format(v), c ? c.horas : null), "hora pico resaltada")}
        ${tarjeta("Personas por hora", columnas(d.ocupacion, (v) => entero.format(v) + " personas", c ? c.ocupacion : null), "ocupación")}
      </div>
    </div>`;
  }

  /** Columnas por hora; la hora pico va resaltada. Si hay comparación, una marca indica el valor anterior. */
  function columnas(serie, fmtV, prevSerie) {
    if (!serie.length) return `<p class="vacio">El reporte no trae este dato.</p>`;
    const prev = prevSerie ? Object.fromEntries(prevSerie) : null;
    const max = Math.max(...serie.map((s) => s[1]), ...(prevSerie || []).map((s) => s[1]), 1);
    const pico = serie.reduce((a, b) => (b[1] > a[1] ? b : a));
    return `<div class="m-cols">${serie.map(([h, v]) => {
      const antes = prev ? prev[h] : null;
      const t = tip(`<b>${horaBonita(h)}</b><br>${fmtV(v)}${antes != null ? `<br>Antes: ${fmtV(antes)}` : ""}`);
      return `<div class="m-colw" data-tip="${t}">
        <div class="m-colv">${h === pico[0] ? fmtV(v).replace(" personas", "") : ""}</div>
        <div class="m-colz">
          <div class="m-colb ${h === pico[0] ? "m-pico" : ""}" style="height:${(v / max) * 100}%"></div>
          ${antes != null ? `<div class="m-colp" style="bottom:${(antes / max) * 100}%"></div>` : ""}
        </div>
        <div class="m-colh">${horaBonita(h)}</div>
      </div>`;
    }).join("")}</div>${prev ? `<div class="m-ley"><span><i class="m-ley-marca"></i>día comparado</span></div>` : ""}`;
  }

  // ================================================================ Historial
  function historial(d, c, ks) {
    const t = T();
    const dias = ks.map((k) => ({ k, d: datos(t.reporte(k)) })).filter((x) => x.d);
    if (dias.length < 2) return `<p class="vacio">Sube al menos dos días (con datos de meseros) para ver el historial.</p>`;
    // Resumen por mesero en todo el historial
    const acum = {};
    for (const { k, d: dd } of dias) {
      for (const m of dd.meseros) {
        const a = (acum[m.clave] = acum[m.clave] || { nombre: m.nombre, dias: 0, venta: 0, cuentas: 0, personas: 0, mejor: null });
        a.dias++; a.venta += m.total; a.cuentas += m.cuentas; a.personas += m.personas;
        if (!a.mejor || m.total > a.mejor.v) a.mejor = { v: m.total, k };
      }
    }
    const lista = Object.entries(acum).sort((a, b) => b[1].venta / b[1].dias - a[1].venta / a[1].dias);
    if (!meseroHist || !acum[meseroHist]) meseroHist = lista[0][0];
    const tabla = `<table class="m-tabla"><thead><tr><th>Mesero</th><th class="num">Días</th><th class="num">Venta promedio</th><th class="num">Ticket prom.</th><th class="num">Por persona</th><th>Mejor día</th></tr></thead><tbody>
      ${lista.map(([clave, a]) => `<tr class="${clave === meseroHist ? "m-sel" : ""}" data-mesero="${t.esc(clave)}">
        <td>${a.nombre}</td><td class="num">${a.dias} de ${dias.length}</td><td class="num"><b>${dinero.format(a.venta / a.dias)}</b></td>
        <td class="num">${dinero.format(a.cuentas ? a.venta / a.cuentas : 0)}</td><td class="num">${dinero.format(a.personas ? a.venta / a.personas : 0)}</td>
        <td>${t.fechaCorta(a.mejor.k)} · ${dinero.format(a.mejor.v)}</td></tr>`).join("")}
    </tbody></table>`;
    const opciones = lista.map(([clave, a]) => `<option value="${t.esc(clave)}" ${clave === meseroHist ? "selected" : ""}>${a.nombre}</option>`).join("");
    return `<div class="m-grid m-grid-hist">
      ${tarjeta("Promedios del historial", `<div class="tabla-scroll">${tabla}</div>`, "clic en un mesero para ver su tendencia", "m-col-izq")}
      <section class="tarjeta m-card m-col-der"><div class="tarjeta-head"><h2>Venta por día</h2><select id="mSelMesero" aria-label="Mesero">${opciones}</select></div>
        <div class="m-card-cuerpo" id="mLinea">${linea(dias, meseroHist)}</div></section>
    </div>`;
  }

  function linea(dias, clave) {
    const t = T();
    const pts = dias.map(({ k, d }) => { const m = d.meseros.find((x) => x.clave === clave); return { k, v: m ? m.total : null, prom: d.meseros.length ? d.venta / d.meseros.length : 0 }; });
    const W = 640, H = 300, m = { l: 70, r: 16, t: 16, b: 30 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = Math.max(...pts.map((p) => Math.max(p.v || 0, p.prom)), 1) * 1.1;
    const X = (i) => m.l + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
    const Y = (v) => m.t + ih - (v / max) * ih;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
    const seg = pts.map((p, i) => (p.v == null ? null : `${X(i)},${Y(p.v)}`)).filter(Boolean).join(" ");
    const prom = pts.map((p, i) => `${X(i)},${Y(p.prom)}`).join(" ");
    return `<svg class="m-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Venta por día del mesero">
      <g class="m-grid-l">${ticks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${dinero.format(v)}</text>`).join("")}
      ${pts.map((p, i) => `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${t.fechaCorta(p.k)}</text>`).join("")}</g>
      <polyline class="m-linea-prom" points="${prom}"/>
      <polyline class="m-linea" points="${seg}"/>
      ${pts.map((p, i) => p.v == null
        ? `<text class="m-falta" x="${X(i)}" y="${m.t + ih - 6}" text-anchor="middle">no trabajó</text>`
        : `<circle class="m-pt m-pt-top" cx="${X(i)}" cy="${Y(p.v)}" r="5" data-tip="${tip(`<b>${t.fechaLarga(p.k)}</b><br>Venta: ${dinero.format(p.v)}<br>Promedio por mesero: ${dinero.format(p.prom)}`)}"/>`).join("")}
    </svg>
    <div class="m-ley"><span><i class="m-ley-linea"></i>mesero</span><span><i class="m-ley-linea m-ley-prom"></i>promedio por mesero del día</span></div>`;
  }

  function enlazarHistorial(ks) {
    const sel = $("mSelMesero");
    const cambiar = (clave) => { meseroHist = clave; T().render(); };
    if (sel) sel.onchange = () => cambiar(sel.value);
    for (const tr of document.querySelectorAll("[data-mesero]")) tr.onclick = () => cambiar(tr.dataset.mesero);
  }

  // ================================================================ eventos
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-mtab]");
    if (!b) return;
    pestana = b.dataset.mtab;
    T().guardarPref("mTab", pestana);
    T().render();
  });

  window.TableroMeseros = { render, datos };
})();
