/*
 * Lógica pura del draft: snake, validación ADP, roster, alineación y byes.
 * No toca el DOM, así se puede reutilizar tal cual en Power Pages o en un backend.
 */
(function (global) {
  "use strict";

  // Pick dentro de la ronda (1..equipos) en formato snake.
  function pickEnRonda(slot, ronda, equipos) {
    return ronda % 2 === 1 ? slot : equipos + 1 - slot;
  }

  // Número de pick global (1..equipos*rondas).
  function pickGlobal(slot, ronda, equipos) {
    return (ronda - 1) * equipos + pickEnRonda(slot, ronda, equipos);
  }

  // 20 -> "2.08" con 12 equipos.
  function formatoPick(globalPick, equipos) {
    var p = Math.ceil(globalPick) || 1;
    var ronda = Math.ceil(p / equipos);
    var enRonda = p - (ronda - 1) * equipos;
    return ronda + "." + String(enRonda).padStart(2, "0");
  }

  // ADP decimal global a texto "ronda.pick" (8.4 -> "1.08").
  function formatoADP(adp, equipos) {
    return formatoPick(Math.max(1, Math.floor(adp)), equipos);
  }

  // Convierte el ADP del archivo a pick global según el formato configurado.
  function parseADP(valor, formato, equipos) {
    var txt = String(valor == null ? "" : valor).trim().replace(",", ".");
    if (!txt) return NaN;
    if (formato === "ronda.pick") {
      var partes = txt.split(".");
      var ronda = parseInt(partes[0], 10);
      var pick = parseInt(partes[1] || "0", 10);
      if (!ronda || !pick || pick > equipos) return NaN;
      return (ronda - 1) * equipos + pick;
    }
    return parseFloat(txt);
  }

  function validarPick(jugador, globalPick, cfg) {
    if (!jugador) return { ok: false, motivo: "Jugador no encontrado en la lista de ADP." };
    var ok = cfg.adpIgualPermitido ? jugador.adp >= globalPick : jugador.adp > globalPick;
    if (ok) return { ok: true };
    return {
      ok: false,
      motivo: jugador.nombre + " tiene ADP " + formatoADP(jugador.adp, cfg.equipos) +
        " (" + jugador.adp + ") y este pick es el " + formatoPick(globalPick, cfg.equipos) +
        " (#" + globalPick + "). Elige un jugador con ADP " + (cfg.adpIgualPermitido ? "≥ " : "> ") + globalPick + "."
    };
  }

  function contarPosiciones(jugadores) {
    var c = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
    jugadores.forEach(function (j) { if (c[j.pos] != null) c[j.pos]++; });
    return c;
  }

  // Comprobaciones del roster completo. errores bloquean el envío, avisos no.
  function analizarRoster(picks, cfg) {
    var errores = [], avisos = [];
    var elegidos = picks.filter(function (p) { return p.jugador; });
    var validos = elegidos.filter(function (p) { return p.estado.ok; });
    var jugadores = validos.map(function (p) { return p.jugador; });
    var c = contarPosiciones(jugadores);

    var vacios = cfg.rondas - elegidos.length;
    if (vacios > 0) errores.push("Faltan " + vacios + " de " + cfg.rondas + " rondas por rellenar.");
    var invalidos = elegidos.length - validos.length;
    if (invalidos > 0) errores.push(invalidos + (invalidos === 1 ? " pick no cumple" : " picks no cumplen") + " la regla del ADP.");

    Object.keys(cfg.minimos).forEach(function (pos) {
      if (c[pos] < cfg.minimos[pos]) errores.push("Necesitas al menos " + cfg.minimos[pos] + " " + pos + " (tienes " + c[pos] + ").");
    });
    var flex = c.RB + c.WR + c.TE;
    if (flex < cfg.minimoFlex) errores.push("Necesitas " + cfg.minimoFlex + " RB/WR/TE entre todos para cubrir el FLEX (tienes " + flex + ").");

    Object.keys(cfg.maximos).forEach(function (pos) {
      if (c[pos] > cfg.maximos[pos]) avisos.push("Llevas " + c[pos] + " " + pos + "; más de " + cfg.maximos[pos] + " rara vez puntúa.");
    });

    // Los byes solo se avisan con el roster completo; mientras tanto se ven en la tabla.
    var huecos = vacios > 0 ? [] : coberturaByes(jugadores, cfg).filter(function (s) { return s.huecos.length; });
    huecos.forEach(function (s) {
      avisos.push("Semana " + s.semana + ": sin " + s.huecos.join(", ") + " por bye.");
    });

    return { conteo: c, errores: errores, avisos: avisos, completo: errores.length === 0 };
  }

  // Asigna jugadores a la alineación: primero los slots fijos, luego el FLEX,
  // cogiendo siempre el de mejor ADP disponible (aproximación hasta tener puntos reales).
  function alineacionTipo(jugadores, cfg, semana) {
    var disponibles = jugadores
      .filter(function (j) { return semana == null || j.bye !== semana; })
      .slice().sort(function (a, b) { return a.adp - b.adp; });
    var usados = {};
    var orden = cfg.alineacion.map(function (s, i) { return { s: s, i: i }; })
      .sort(function (a, b) { return a.s.pos.length - b.s.pos.length; });
    var resultado = new Array(cfg.alineacion.length);
    orden.forEach(function (o) {
      var j = disponibles.find(function (x) { return !usados[x.id] && o.s.pos.indexOf(x.pos) >= 0; });
      if (j) usados[j.id] = true;
      resultado[o.i] = { slot: o.s.slot, jugador: j || null };
    });
    var banquillo = jugadores.filter(function (j) { return !usados[j.id]; })
      .sort(function (a, b) { return a.adp - b.adp; });
    return { titulares: resultado, banquillo: banquillo };
  }

  // Para cada semana puntuable, qué slots quedarían vacíos por bye.
  function coberturaByes(jugadores, cfg) {
    var semanas = [];
    for (var s = cfg.semanaInicio; s <= cfg.semanaFin; s++) {
      var al = alineacionTipo(jugadores, cfg, s);
      semanas.push({
        semana: s,
        slots: al.titulares,
        huecos: al.titulares.filter(function (t) { return !t.jugador; }).map(function (t) { return t.slot; })
      });
    }
    return semanas;
  }

  global.Draft = {
    pickEnRonda: pickEnRonda,
    pickGlobal: pickGlobal,
    formatoPick: formatoPick,
    formatoADP: formatoADP,
    parseADP: parseADP,
    validarPick: validarPick,
    contarPosiciones: contarPosiciones,
    analizarRoster: analizarRoster,
    alineacionTipo: alineacionTipo,
    coberturaByes: coberturaByes
  };
})(typeof window !== "undefined" ? window : globalThis);
