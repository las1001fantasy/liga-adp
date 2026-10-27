/*
 * Interfaz: inscripción, tabla de 15 rondas y panel de comprobaciones.
 * El estado se guarda en el navegador (localStorage) y, si hay cfg.servidor, también en el servidor
 * con la contraseña del manager.
 */
(function () {
  "use strict";

  var cfg = window.LIGA_CONFIG;
  var D = window.Draft;
  var CLAVE = "ligaADP-" + cfg.temporada;
  var $ = function (id) { return document.getElementById(id); };

  var jugadores = [];
  var porNombre = {};
  var estado = { grupo: "", equipo: "", telegram: "", slot: null, picks: [] };
  var inscritos = []; // equipos inscritos: [{ equipo, telegram, slot, completo }]
  var sesion = null;  // { equipo, clave } cuando el manager ha entrado con su contraseña
  var managers = [];  // lista cerrada de equipos del año pasado (data/managers.json)

  // ---------- persistencia ----------
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* sin almacenamiento */ }
    if (sesion && estado.slot) programarEnvio();
  }

  // ---------- servidor ----------
  function marcaGuardado(texto, clase) {
    var el = $("estado-guardado");
    el.hidden = false; el.textContent = texto; el.className = "chip " + (clase || "idle");
  }

  // Cada cambio se manda al servidor un segundo después del último, para no enviar letra a letra.
  function programarEnvio() {
    clearTimeout(programarEnvio.t);
    marcaGuardado("Guardando…");
    programarEnvio.t = setTimeout(enviar, 1000);
  }
  function enviar() {
    var datos = { accion: "guardar", equipo: sesion.equipo, clave: sesion.clave, slot: estado.slot, picks: estado.picks.slice(0, cfg.rondas) };
    Liga.llamarServidor(cfg, datos).then(function (r) {
      if (!r.ok) { marcaGuardado("No guardado", "bad"); toast(r.error); return; }
      var hora = new Date(r.actualizado).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      marcaGuardado((r.completo ? "Completo · guardado " : "Guardado ") + hora, r.completo ? "ok" : "idle");
    }).catch(function () { marcaGuardado("Sin conexión: no guardado", "bad"); });
  }

  function leerSesion() {
    try { return JSON.parse(sessionStorage.getItem(CLAVE + "-sesion") || "null"); } catch (e) { return null; }
  }
  function escribirSesion(s) {
    sesion = s;
    try { if (s) sessionStorage.setItem(CLAVE + "-sesion", JSON.stringify(s)); else sessionStorage.removeItem(CLAVE + "-sesion"); } catch (e) { /* sin almacenamiento */ }
  }

  // Con servidor, el pick y las rondas solo aparecen tras poner la contraseña.
  function pintarAcceso() {
    if (!cfg.servidor) return;
    var elegido = !!$("in-telegram").value;
    $("campo-clave").hidden = !elegido || !!sesion;
    $("campo-slot").hidden = !sesion;
    $("btn-empezar").hidden = !sesion;
    if (!sesion) $("paso2").hidden = true;
  }

  function pedirEntrada() {
    var clave = $("in-clave").value.trim();
    if (!clave) { $("err-clave").textContent = "Escribe la contraseña que te ha pasado el comisionado."; return; }
    entrar($("in-equipo").value, clave, false);
  }

  function entrar(equipo, clave, silencioso) {
    $("err-clave").textContent = "";
    $("btn-entrar").disabled = true;
    return Liga.llamarServidor(cfg, { accion: "entrar", equipo: equipo, clave: clave }).then(function (r) {
      $("btn-entrar").disabled = false;
      if (!r.ok) { escribirSesion(null); if (!silencioso) $("err-clave").textContent = r.error; pintarAcceso(); return; }
      escribirSesion({ equipo: equipo, clave: clave });
      // Lo guardado en el servidor manda sobre lo que hubiera en este navegador.
      if (r.equipo) { estado.slot = r.equipo.slot; estado.slotPicks = r.equipo.slot; estado.picks = r.equipo.picks || []; filtrosPos = {}; }
      try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* sin almacenamiento */ }
      $("in-clave").value = "";
      pintarAcceso(); pintarSlots(); pintarTablero();
      if (r.equipo) marcaGuardado(r.equipo.completo ? "Completo · guardado" : "Guardado", r.equipo.completo ? "ok" : "idle");
      intentarMostrar(!silencioso);
    }).catch(function () {
      $("btn-entrar").disabled = false;
      $("err-clave").textContent = "No se ha podido conectar con el servidor. Prueba otra vez en un momento.";
    });
  }
  function recuperar() {
    try {
      var s = JSON.parse(localStorage.getItem(CLAVE) || "null");
      if (s && typeof s === "object") estado = Object.assign(estado, s);
    } catch (e) { /* sin almacenamiento */ }
  }

  function toast(msg) {
    var t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600);
  }

  var plazoCerrado = window.Layout.plazoCerrado;

  // ---------- paso 1 ----------
  // Picks de 1ª ronda ya cogidos por otros equipos del mismo grupo.
  // Un pick está lleno cuando ya lo tienen maxPorSlot managers del mismo grupo.
  function slotsOcupados() {
    var o = {}, cuenta = {};
    if (cfg.datosEsEjemplo || !cfg.maxPorSlot) return o; // los equipos de ejemplo no bloquean picks reales
    var yo = normalizarTelegram($("in-telegram").value).toLowerCase();
    inscritos.forEach(function (e) {
      if ((e.grupo || cfg.grupos[0]) !== estado.grupo || e.telegram.toLowerCase() === yo || !e.slot) return;
      (cuenta[e.slot] = cuenta[e.slot] || []).push(e.equipo);
    });
    Object.keys(cuenta).forEach(function (s) { if (cuenta[s].length >= cfg.maxPorSlot) o[s] = cuenta[s].join(" y "); });
    return o;
  }

  function pintarGrupos() {
    $("grupos").innerHTML = cfg.grupos.map(function (g) {
      return '<button type="button" data-grupo="' + esc(g) + '" aria-pressed="' + (estado.grupo === g) + '">' + esc(g) + "</button>";
    }).join("");
  }

  function pintarSlots() {
    var ocupados = slotsOcupados();
    if (ocupados[estado.slot]) estado.slot = null;
    var html = "";
    for (var i = 1; i <= cfg.equipos; i++) {
      var o = ocupados[i];
      html += '<button type="button" data-slot="' + i + '" aria-pressed="' + (estado.slot === i) + '"' +
        (o ? ' disabled title="Ya lo tiene ' + esc(o) + '"' : "") + ">1." + String(i).padStart(2, "0") + "</button>";
    }
    $("slots").innerHTML = html;
  }

  function pintarTablero() {
    var html = "<thead><tr><th></th>";
    for (var c = 1; c <= cfg.equipos; c++) html += "<th>" + c + "</th>";
    html += "<th></th></tr></thead><tbody>";
    for (var r = 1; r <= cfg.rondas; r++) {
      html += "<tr><th>R" + r + "</th>";
      for (var s = 1; s <= cfg.equipos; s++) {
        // columna = equipo (pick de 1ª ronda); cada celda es el pick de ese equipo en la ronda,
        // así el 2.01 queda debajo del 1.12 y el 3.01 debajo del 2.12 (serpiente)
        var mio = estado.slot === s;
        html += '<td class="' + (mio ? "mine" : "") + '">' + r + "." + String(D.pickEnRonda(s, r, cfg.equipos)).padStart(2, "0") + "</td>";
      }
      html += '<th class="dir">' + (r % 2 ? "→" : "←") + "</th></tr>";
    }
    $("board").innerHTML = html + "</tbody>";
    $("board-titulo").textContent = estado.slot
      ? "Tus picks saliendo desde el 1." + String(estado.slot).padStart(2, "0")
      : "Así quedan tus picks";
  }

  function normalizarTelegram(v) {
    v = v.trim();
    return v && v[0] !== "@" ? "@" + v : v;
  }

  function validarInscripcion() {
    var ok = true;
    var eq = $("in-equipo").value.trim();
    var tg = normalizarTelegram($("in-telegram").value);
    $("err-equipo").textContent = eq.length < 3 ? "Pon un nombre de al menos 3 caracteres." : "";
    $("err-telegram").textContent = /^@[A-Za-z0-9_]{5,32}$/.test(tg) ? "" : "Usuario de Telegram no válido: de 5 a 32 letras, números o _.";
    var repetido = inscritos.find(function (e) { return e.equipo.toLowerCase() === eq.toLowerCase() && e.telegram.toLowerCase() !== tg.toLowerCase(); });
    if (repetido && !managers.length) $("err-equipo").textContent = "Ya hay un equipo con ese nombre.";
    $("err-grupo").textContent = estado.grupo ? "" : "Elige tu grupo.";
    $("err-slot").textContent = estado.slot ? "" : "Elige tu pick de primera ronda.";
    if ($("err-equipo").textContent || $("err-telegram").textContent || $("err-slot").textContent || $("err-grupo").textContent) ok = false;
    return ok ? { equipo: eq, telegram: tg } : null;
  }

  // Las 15 rondas aparecen debajo de la elección de equipo, en la misma página.
  function irPaso2(desplazar) {
    $("paso2").hidden = false;
    pintarDraft();
    if (desplazar) $("paso2").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Con equipo y pick elegidos se muestra el draft sin más pasos.
  function intentarMostrar(desplazar) {
    if (!$("in-equipo").value.trim() || !estado.slot || !estado.grupo || (cfg.servidor && !sesion)) return;
    var datos = validarInscripcion();
    if (!datos) return;
    var cambioPick = estado.slotPicks && estado.slotPicks !== estado.slot && estado.picks.some(Boolean);
    estado.equipo = datos.equipo; estado.telegram = datos.telegram; estado.slotPicks = estado.slot;
    guardar(); irPaso2(desplazar);
    if (cambioPick) toast("Has cambiado de pick: revisa las rondas marcadas en rojo.");
  }

  function pintarManagers() {
    if (!managers.length) return;
    $("campo-manager").hidden = false;
    ["campo-equipo", "campo-telegram", "campo-grupo"].forEach(function (id) { $(id).hidden = true; });
    var actual = managers.findIndex(function (m) { return m.telegram.toLowerCase() === (estado.telegram || "").toLowerCase(); });
    // El desplegable se agrupa por la división del año pasado (o por el grupo, si ya está asignado).
    var bloques = [];
    managers.forEach(function (m) { var b = m.division2025 || m.grupo || "Equipos"; if (bloques.indexOf(b) < 0) bloques.push(b); });
    $("in-manager").innerHTML = '<option value="">Elige tu equipo…</option>' + bloques.map(function (b) {
      return '<optgroup label="' + esc(b) + '">' + managers.map(function (m, i) {
        if ((m.division2025 || m.grupo || "Equipos") !== b) return "";
        if (m.libre) return '<option value="" disabled>' + esc(m.equipo) + "</option>";
        return '<option value="' + i + '"' + (i === actual ? " selected" : "") + ">" + esc(m.equipo) + " · " + esc(m.telegram) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
    if (actual >= 0) usarManager(managers[actual]);
  }

  function usarManager(m) {
    $("in-equipo").value = m ? m.equipo : "";
    $("in-telegram").value = m ? m.telegram : "";
    // Si la lista aún no asigna grupo para esta temporada, el manager lo elige.
    var fijo = !!(m && m.grupo) || cfg.grupos.length === 1;
    if (fijo) estado.grupo = (m && m.grupo) || cfg.grupos[0];
    else if (!m || cfg.grupos.indexOf(estado.grupo) < 0) estado.grupo = "";
    $("campo-grupo").hidden = fijo || !m;
    $("manager-info").textContent = m ? (m.grupo && cfg.grupos.length > 1 ? m.grupo + " · " : "") + "Telegram " + m.telegram +
      (m.puesto2025 ? " · " + m.puesto2025 + "º en 2025" : "") : "";
    pintarGrupos(); pintarSlots(); pintarTablero(); pintarAcceso();
  }

  // ---------- paso 2 ----------
  function picksCalculados() {
    var res = [];
    for (var r = 1; r <= cfg.rondas; r++) {
      var g = D.pickGlobal(estado.slot, r, cfg.equipos);
      var nombre = estado.picks[r - 1] || "";
      var j = nombre ? porNombre[nombre.toLowerCase()] : null;
      var st = { ok: true };
      if (nombre) {
        st = D.validarPick(j, g, cfg);
        if (st.ok) {
          var repetido = estado.picks.findIndex(function (n, i) { return i < r - 1 && n && n.toLowerCase() === nombre.toLowerCase(); });
          if (repetido >= 0) st = { ok: false, motivo: "Ya lo elegiste en la ronda " + (repetido + 1) + "." };
        }
      }
      res.push({ ronda: r, global: g, etiqueta: D.formatoPick(g, cfg.equipos), nombre: nombre, jugador: j, estado: st });
    }
    return res;
  }

  var POSICIONES = ["QB", "RB", "WR", "TE", "K", "DST"];
  var TEXTO_LESION = { IR: "En la lista de lesionados (IR)", IRD: "IR designado para volver", OUT: "Baja (Out)", Q: "Duda (Questionable)", D: "Dudoso (Doubtful)" };
  var filtrosPos = {}; // ronda -> posición elegida en el desplegable ("" = todas)

  // Jugadores que se ofrecen en una ronda: elegibles (si está marcado) y de la posición filtrada.
  function candidatosRonda(r) {
    var solo = $("chk-elegibles").checked;
    var g = D.pickGlobal(estado.slot, r, cfg.equipos);
    var pos = filtrosPos[r] || "";
    return jugadores.filter(function (j) {
      return (!solo || D.validarPick(j, g, cfg).ok) && (!pos || j.pos === pos);
    });
  }

  // Solo importan los byes que caen dentro de las semanas que puntúan.
  function byeEnLiga(j) { return j.bye && j.bye >= cfg.semanaInicio && j.bye <= cfg.semanaFin; }

  // ---------- buscador de jugadores ----------
  // Lista propia en vez de <datalist>: Firefox y los móviles enseñan los datalist cada uno a su manera
  // (Firefox no muestra el nombre), así se ve igual en todos.
  var MAX_SUGERENCIAS = 40;
  var sug = { ronda: null, lista: [], activo: -1 };

  function sinAcentos(t) { return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

  function abrirSugerencias(r) {
    var input = $("pick-" + r);
    if (!input || input.disabled) return;
    var q = sinAcentos(input.value.trim());
    var exacto = porNombre[input.value.trim().toLowerCase()];
    var todos = candidatosRonda(r);
    // con un jugador ya elegido se enseña la lista entera para poder cambiarlo
    sug.lista = (q && !exacto ? todos.filter(function (j) { return sinAcentos(j.nombre + " " + j.equipo).indexOf(q) >= 0; }) : todos).slice(0, MAX_SUGERENCIAS);
    sug.ronda = r; sug.activo = -1;
    var caja = $("sugerencias");
    caja.innerHTML = sug.lista.length ? sug.lista.map(function (j, i) {
      return '<div class="sug" role="option" id="sug-' + i + '" data-i="' + i + '"><b>' + esc(j.nombre) + '</b><span>' + j.pos + " · " + j.equipo +
        " · ADP " + D.formatoADP(j.adp, cfg.equipos) + (byeEnLiga(j) ? " · bye " + j.bye : "") + "</span>" +
        (j.lesion ? '<span class="chip warn">' + esc(j.lesion) + "</span>" : "") + "</div>";
    }).join("") : '<div class="sug vacio">' + (q ? "Ningún jugador elegible con «" + esc(input.value.trim()) + "»" : "No hay jugadores elegibles") + "</div>";
    caja.hidden = false;
    colocarSugerencias();
  }

  function colocarSugerencias() {
    var caja = $("sugerencias");
    if (caja.hidden || !sug.ronda) return;
    var rect = $("pick-" + sug.ronda).getBoundingClientRect();
    var abajo = window.innerHeight - rect.bottom;
    var ancho = Math.min(Math.max(rect.width, 340), window.innerWidth - 16);
    caja.style.width = ancho + "px";
    caja.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - ancho - 8)) + "px";
    // si no cabe debajo, se abre hacia arriba
    if (abajo < 220 && rect.top > abajo) { caja.style.top = ""; caja.style.bottom = (window.innerHeight - rect.top + 4) + "px"; caja.style.maxHeight = Math.min(320, rect.top - 12) + "px"; }
    else { caja.style.bottom = ""; caja.style.top = (rect.bottom + 4) + "px"; caja.style.maxHeight = Math.min(320, abajo - 12) + "px"; }
  }

  function cerrarSugerencias() { $("sugerencias").hidden = true; sug.ronda = null; }

  function marcarActivo(i) {
    var items = $("sugerencias").querySelectorAll(".sug[data-i]");
    if (!items.length) return;
    sug.activo = (i + items.length) % items.length;
    items.forEach(function (el, k) { el.classList.toggle("on", k === sug.activo); });
    items[sug.activo].scrollIntoView({ block: "nearest" });
  }

  function elegirSugerencia(i) {
    var j = sug.lista[i], r = sug.ronda;
    if (!j) return;
    $("pick-" + r).value = j.nombre;
    ponerPick(r, j.nombre);
    cerrarSugerencias();
  }

  function ponerPick(r, v) {
    // si coincide con un jugador (sin distinguir mayúsculas) guardamos el nombre oficial
    var j = porNombre[v.toLowerCase()];
    estado.picks[r - 1] = j ? j.nombre : v;
    guardar(); actualizar();
  }

  function selectorPos(r) {
    return '<select class="sel-pos" id="pos-' + r + '" aria-label="Posición ronda ' + r + '"><option value="">Todas</option>' +
      POSICIONES.map(function (p) { return '<option value="' + p + '">' + p + "</option>"; }).join("") + "</select>";
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  function pintarDraft() {
    $("t-equipo").textContent = estado.equipo;
    $("t-meta").textContent = (cfg.grupos.length > 1 ? estado.grupo + " · " : "") + estado.telegram + " · pick 1." + String(estado.slot).padStart(2, "0");
    var cerrado = plazoCerrado();
    var html = "";
    picksCalculados().forEach(function (p) {
      html += '<tr data-ronda="' + p.ronda + '">' +
        "<td class=\"num\">" + p.ronda + "</td>" +
        '<td class="pick"><b>' + p.etiqueta + "</b><small>#" + p.global + "</small></td>" +
        '<td><input type="text" id="pick-' + p.ronda + '" role="combobox" aria-autocomplete="list" aria-controls="sugerencias" autocomplete="off" placeholder="Buscar jugador…" ' +
        'aria-label="Jugador ronda ' + p.ronda + '"' + (cerrado ? " disabled" : "") + ' value="' + esc(p.nombre) + '"><div class="motivo"></div></td>' +
        '<td class="c-pos">' + selectorPos(p.ronda) + '</td><td class="c-nfl"></td><td class="c-adp num"></td><td class="c-bye num"></td><td class="c-st"></td></tr>';
    });
    $("tbody-picks").innerHTML = html;
    cerrarSugerencias();
    actualizar();
  }

  // Refresca celdas calculadas y panel lateral sin repintar los inputs (no se pierde el foco).
  function actualizar() {
    var picks = picksCalculados();
    picks.forEach(function (p) {
      var tr = document.querySelector('tr[data-ronda="' + p.ronda + '"]');
      var j = p.jugador;
      // mientras se escribe un nombre que aún no existe no se marca en rojo
      var escribiendo = !j && p.nombre && document.activeElement && document.activeElement.id === "pick-" + p.ronda;
      tr.classList.toggle("is-bad", !!p.nombre && !p.estado.ok && !escribiendo);
      // el desplegable de posición muestra la del jugador elegido, o el filtro si aún no hay jugador
      var sel = tr.querySelector(".sel-pos");
      if (j) { sel.value = j.pos; filtrosPos[p.ronda] = j.pos; }
      else sel.value = filtrosPos[p.ronda] || "";
      tr.querySelector(".c-nfl").textContent = j ? j.equipo : "";
      tr.querySelector(".c-adp").textContent = j ? D.formatoADP(j.adp, cfg.equipos) : "";
      tr.querySelector(".c-adp").title = j ? "ADP " + (j.adpExacto != null ? j.adpExacto : j.adp) + (j.ligas ? " · en " + j.ligas + " ligas" : "") : "";
      var cb = tr.querySelector(".c-bye");
      // los byes de antes de la semana de inicio ya no cuentan: se marcan como hechos
      var hecho = !!(j && j.bye && j.bye < cfg.semanaInicio);
      cb.textContent = !j || !j.bye ? "" : hecho ? "Hecho" : j.bye;
      cb.classList.toggle("fuera", hecho);
      cb.title = j && j.bye ? (byeEnLiga(j) ? "Descansa en la semana " + j.bye + ": ese día no puntúa" : "Descansa en la semana " + j.bye + ", antes de que empiece la liga: no le afecta") : "";
      tr.querySelector(".motivo").textContent = p.nombre && !p.estado.ok && !escribiendo ? p.estado.motivo : "";
      tr.querySelector(".c-st").innerHTML = !p.nombre || escribiendo ? '<span class="chip idle">Vacío</span>'
        : (p.estado.ok ? '<span class="chip ok">OK</span>' : '<span class="chip bad">Error</span>') +
          (j && j.lesion ? ' <span class="chip warn" title="' + esc(TEXTO_LESION[j.lesion] || j.lesion) + ' según Fleaflicker">' + esc(j.lesion) + "</span>" : "");
    });

    var an = D.analizarRoster(picks, cfg);
    var validos = picks.filter(function (p) { return p.jugador && p.estado.ok; }).map(function (p) { return p.jugador; });

    $("conteo").innerHTML = ["QB", "RB", "WR", "TE", "K", "DST"].map(function (pos) {
      var corto = an.conteo[pos] < (cfg.minimos[pos] || 0);
      return '<div class="' + (corto ? "short" : "") + '"><b>' + an.conteo[pos] + "</b><small>" + pos + "<br>mín " + (cfg.minimos[pos] || 0) + "</small></div>";
    }).join("");

    var al = D.alineacionTipo(validos, cfg);
    var fila = function (etiqueta, j, vacio) {
      return '<div><span class="slot">' + etiqueta + "</span>" +
        (j ? "<span>" + esc(j.nombre) + "</span><span class=\"pos\">" + j.pos + "</span>"
          : '<span class="empty">' + vacio + "</span><span></span>") + "</div>";
    };
    $("alineacion").innerHTML = al.titulares.map(function (t) { return fila(t.slot, t.jugador, "Sin cubrir"); }).join("");
    // Banquillo: las rondas que no entran en la alineación (15 - 8 = 7).
    var plazas = cfg.rondas - cfg.alineacion.length;
    var html = "";
    for (var b = 0; b < Math.max(plazas, al.banquillo.length); b++) html += fila("BN" + (b + 1), al.banquillo[b], "Libre");
    $("banquillo").innerHTML = html;
    $("banquillo-n").textContent = al.banquillo.length + " / " + plazas;

    pintarByes(validos);

    var items = an.errores.map(function (e) { return '<li class="e">' + esc(e) + "</li>"; })
      .concat(an.avisos.map(function (w) { return '<li class="w">' + esc(w) + "</li>"; }));
    if (an.completo) items.unshift('<li class="g">' + (sesion ? "Equipo completo y guardado. Puedes cambiarlo hasta el cierre." : "Equipo completo y válido.") + "</li>");
    if (plazoCerrado()) items.unshift('<li class="e">El plazo de inscripción está cerrado.</li>');
    $("checks").innerHTML = items.join("");
    $("btn-copiar").disabled = !an.completo;
  }

  function pintarByes(validos) {
    var cont = $("byes");
    // El archivo de ADP puede no traer semanas de bye: entonces no hay nada que analizar.
    var hayByes = jugadores.some(function (j) { return j.bye; });
    cont.closest(".panel").hidden = !hayByes;
    if (!hayByes) return;
    var cob = D.coberturaByes(validos, cfg);
    cont.style.setProperty("--cols", cob.length);
    $("rango-semanas").textContent = cfg.semanaInicio + "–" + cfg.semanaFin;
    var html = '<span class="h"></span>' + cob.map(function (s) { return '<span class="h">' + s.semana + "</span>"; }).join("");
    cfg.alineacion.forEach(function (slot, i) {
      html += '<span class="h" style="text-align:left">' + slot.slot + "</span>";
      cob.forEach(function (s) {
        var t = s.slots[i];
        html += t.jugador ? '<span class="y" title="' + esc(t.jugador.nombre) + '">✓</span>'
          : '<span class="n" title="Sin jugador disponible">✕</span>';
      });
    });
    cont.innerHTML = html;
  }

  // ---------- exportar ----------
  function textoTelegram() {
    var lineas = ["🏈 " + estado.equipo + " (" + estado.telegram + ") · " + (cfg.grupos.length > 1 ? estado.grupo + " · " : "") + "pick 1." + String(estado.slot).padStart(2, "0")];
    picksCalculados().forEach(function (p) {
      lineas.push(p.etiqueta + " " + (p.jugador ? p.jugador.nombre + " (" + p.jugador.pos + ", " + p.jugador.equipo + ")" : "—"));
    });
    return lineas.join("\n");
  }
  function copiar(texto, ok) {
    var ta = $("export");
    ta.value = texto; ta.hidden = false;
    var fallback = function () { ta.focus(); ta.select(); toast("Selecciona el texto y cópialo a mano."); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(function () { toast(ok); }, fallback);
    } else fallback();
  }

  // ---------- carga de ADP ----------
  function usarDatos(res, origen) {
    jugadores = res.jugadores;
    porNombre = {};
    jugadores.forEach(function (j) { porNombre[j.nombre.toLowerCase()] = j; });
    // Solo se avisa si el ADP es de ejemplo o si el archivo trae filas que no se pudieron leer.
    var aviso = $("aviso-datos");
    var partes = [];
    if (cfg.adpEsEjemplo) partes.push(origen + ": " + jugadores.length + " jugadores.");
    if (res.descartados.length) partes.push(res.descartados.length + " filas del ADP descartadas (" + res.descartados.slice(0, 3).join("; ") + (res.descartados.length > 3 ? "…" : "") + ").");
    aviso.textContent = partes.join(" ");
    aviso.hidden = !partes.length;
    if (!$("paso2").hidden) pintarDraft();
  }

  // ---------- eventos ----------
  function enlazar() {
    $("slots").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-slot]");
      if (!b) return;
      estado.slot = parseInt(b.dataset.slot, 10);
      pintarSlots(); pintarTablero();
      intentarMostrar(true);
    });
    $("form-inscripcion").addEventListener("submit", function (e) {
      e.preventDefault();
      if (cfg.servidor && !sesion) { pedirEntrada(); return; } // Intro en la contraseña
      var datos = validarInscripcion();
      if (!datos) return;
      if (estado.picks.length && estado.slotPicks && estado.slotPicks !== estado.slot) {
        // al cambiar de pick, los jugadores pueden dejar de ser válidos: se mantienen y se revalidan
        toast("Has cambiado de pick: revisa las rondas marcadas en rojo.");
      }
      estado.equipo = datos.equipo; estado.telegram = datos.telegram; estado.slotPicks = estado.slot;
      guardar(); irPaso2(true);
    });
    $("in-manager").addEventListener("change", function () {
      var m = managers[Number(this.value)];
      if (this.value === "") m = null;
      if (m && m.telegram.toLowerCase() !== (estado.telegram || "").toLowerCase()) { estado.picks = []; estado.slot = null; estado.slotPicks = null; filtrosPos = {}; }
      if (!m || !sesion || sesion.equipo !== m.equipo) escribirSesion(null);
      usarManager(m);
      $("paso2").hidden = true;
      intentarMostrar(true);
    });
    $("btn-ejemplo").addEventListener("click", function () {
      var i = managers.findIndex(function (m) { return m.telegram.toLowerCase() === "@bocamolls"; });
      if (i >= 0 && !managers[i].grupo) estado.grupo = cfg.grupos[0];
      if (i >= 0) { $("in-manager").value = String(i); usarManager(managers[i]); }
      else { $("in-equipo").value = "Long Snapper"; $("in-telegram").value = "@bocamolls"; estado.grupo = cfg.grupos[0]; }
      pintarGrupos(); pintarSlots();
      if (!estado.slot) {
        var libre = [8, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12].find(function (s) { return !slotsOcupados()[s]; });
        estado.slot = libre || null;
      }
      pintarSlots(); pintarTablero();
      intentarMostrar(true);
    });
    $("grupos").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-grupo]");
      if (!b) return;
      estado.grupo = b.dataset.grupo;
      pintarGrupos(); pintarSlots(); pintarTablero();
      intentarMostrar(true);
    });
    $("btn-editar").addEventListener("click", function () {
      $("paso2").hidden = true; $("paso1").hidden = false;
      $("in-equipo").value = estado.equipo; $("in-telegram").value = estado.telegram;
    });
    $("tbody-picks").addEventListener("input", function (e) {
      if (!e.target.id || e.target.id.indexOf("pick-") !== 0) return;
      var r = parseInt(e.target.id.slice(5), 10);
      ponerPick(r, e.target.value.trim());
      abrirSugerencias(r);
    });
    $("tbody-picks").addEventListener("focusin", function (e) {
      if (e.target.id && e.target.id.indexOf("pick-") === 0) abrirSugerencias(parseInt(e.target.id.slice(5), 10));
    });
    $("tbody-picks").addEventListener("focusout", function (e) {
      if (e.target.id && e.target.id.indexOf("pick-") === 0) setTimeout(function () {
        if (document.activeElement === e.target) return;
        if (sug.ronda === parseInt(e.target.id.slice(5), 10)) cerrarSugerencias(); // no cierra la lista de otra ronda ya abierta
        actualizar();
      }, 150);
    });
    $("tbody-picks").addEventListener("keydown", function (e) {
      if (!sug.ronda || !e.target.id || e.target.id !== "pick-" + sug.ronda) return;
      if (e.key === "ArrowDown") { e.preventDefault(); if ($("sugerencias").hidden) abrirSugerencias(sug.ronda); marcarActivo(sug.activo + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); marcarActivo(sug.activo - 1); }
      else if (e.key === "Enter") { e.preventDefault(); elegirSugerencia(sug.activo >= 0 ? sug.activo : 0); }
      else if (e.key === "Escape") cerrarSugerencias();
    });
    // mousedown en vez de click para que el input no pierda el foco antes de elegir
    $("sugerencias").addEventListener("mousedown", function (e) {
      var el = e.target.closest(".sug[data-i]");
      e.preventDefault();
      if (el) elegirSugerencia(Number(el.dataset.i));
    });
    window.addEventListener("resize", colocarSugerencias);
    window.addEventListener("scroll", colocarSugerencias, true);
    $("chk-elegibles").addEventListener("change", function () { if (sug.ronda) abrirSugerencias(sug.ronda); });
    // Al elegir posición se filtra la lista de esa ronda; si el jugador puesto es de otra posición, se quita.
    $("tbody-picks").addEventListener("change", function (e) {
      if (!e.target.classList.contains("sel-pos")) return;
      var r = parseInt(e.target.id.slice(4), 10);
      filtrosPos[r] = e.target.value;
      var j = porNombre[(estado.picks[r - 1] || "").toLowerCase()];
      var input = $("pick-" + r);
      if (estado.picks[r - 1] && (!j || (e.target.value && j.pos !== e.target.value))) {
        estado.picks[r - 1] = ""; input.value = ""; guardar();
      }
      actualizar();
      input.focus();
      abrirSugerencias(r);
    });
    $("btn-copiar").addEventListener("click", function () { copiar(textoTelegram(), "Copiado. Pégalo en el grupo de Telegram."); });
    $("btn-reset").addEventListener("click", function () { $("confirm-reset").hidden = false; });
    $("btn-reset-no").addEventListener("click", function () { $("confirm-reset").hidden = true; });
    $("btn-reset-si").addEventListener("click", function () {
      estado.picks = []; filtrosPos = {}; guardar(); $("confirm-reset").hidden = true; pintarDraft(); toast("Draft borrado.");
    });
    $("btn-entrar").addEventListener("click", pedirEntrada);
    $("btn-salir").addEventListener("click", function () {
      escribirSesion(null); $("estado-guardado").hidden = true; pintarAcceso();
      $("paso1").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function iniciar() {
    $("scoring").innerHTML = cfg.puntuacion.map(function (p) { return "<span>" + p[0] + "</span><span>" + p[1] + "</span>"; }).join("");
    recuperar();
    if (cfg.servidor) { sesion = leerSesion(); $("btn-salir").hidden = false; }
    pintarGrupos(); pintarSlots(); pintarTablero(); enlazar();
    // Los equipos ya inscritos sirven para bloquear picks de 1ª ronda y nombres repetidos.
    var cargaInscritos = Liga.cargarInscritos(cfg).then(function (e) { inscritos = e; }, function () { inscritos = []; });
    var cargaManagers = Liga.cargarManagers(cfg).then(function (m) { managers = m; }, function () { managers = []; });
    Promise.all([ADP.cargar(cfg), cargaInscritos, cargaManagers]).then(function (r) {
      var res = r[0];
      usarDatos(res, cfg.adpEsEjemplo ? "ADP de EJEMPLO cargado (no son datos reales)" : "ADP oficial cargado");
      pintarManagers();
      pintarSlots(); pintarTablero();
      if (sesion && sesion.equipo === estado.equipo) entrar(sesion.equipo, sesion.clave, true);
      else if (cfg.servidor) { escribirSesion(null); pintarAcceso(); }
      else if (estado.equipo && estado.slot && estado.grupo) irPaso2(false);
    }).catch(function (err) {
      var a = $("aviso-datos");
      a.textContent = "No se pudo cargar " + cfg.archivoADP + " (" + err.message + "). Si abriste el archivo con doble clic, usa un servidor local o carga el CSV desde el panel lateral.";
      a.hidden = false;
    });
  }

  iniciar();
})();
