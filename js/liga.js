/*
 * Datos de la liga: equipos inscritos, puntos semanales, clasificación y playoffs.
 * Lógica sin DOM para poder moverla a Power Pages / Power Automate tal cual.
 *
 * Con cfg.servidor (Apps Script, ver servidor/LEEME.md) los equipos vienen del servidor, que no da
 * ningún roster hasta el cierre. Sin servidor se leen de data/equipos.json:
 *   [{ grupo, equipo, telegram, slot, picks: [{ ronda, jugador }] }]
 * data/puntos.csv:   semana,jugador,puntos   (una fila por jugador y semana jugada)
 */
(function (global) {
  "use strict";

  function pedir(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(url + ": HTTP " + r.status);
      return r.text();
    });
  }

  function normalizarEquipo(e, cfg) {
    return {
      grupo: e.grupo || cfg.grupos[0], equipo: e.equipo, telegram: e.telegram || "", slot: Number(e.slot),
      picks: (e.picks || []).map(function (p) { return { ronda: Number(p.ronda), jugador: p.jugador || "" }; })
    };
  }

  // Lo público del servidor: { cerrado, inscritos: [{ equipo, telegram, slot, completo }], equipos (tras el cierre) }
  var promesaEstado = null;
  function estadoServidor(cfg) {
    if (!promesaEstado) promesaEstado = fetch(cfg.servidor, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("servidor: HTTP " + r.status);
      return r.json();
    });
    return promesaEstado;
  }

  // Petición con contraseña. El cuerpo va como texto plano para que Apps Script no pida permiso CORS previo.
  function llamarServidor(cfg, datos) {
    return fetch(cfg.servidor, { method: "POST", body: JSON.stringify(datos) }).then(function (r) {
      if (!r.ok) throw new Error("servidor: HTTP " + r.status);
      return r.json();
    });
  }

  function cargarEquipos(cfg) {
    if (cfg.servidor) return estadoServidor(cfg).then(function (s) { return (s.equipos || []).map(function (e) { return normalizarEquipo(e, cfg); }); });
    return pedir(cfg.archivoEquipos).then(function (t) {
      return [].concat(JSON.parse(t)).map(function (e) { return normalizarEquipo(e, cfg); });
    });
  }

  // Quién se ha inscrito (sin rosters): [{ equipo, telegram, slot, completo }]
  function cargarInscritos(cfg) {
    if (cfg.servidor) return estadoServidor(cfg).then(function (s) { return s.inscritos || []; });
    return cargarEquipos(cfg).then(function (eqs) {
      return eqs.map(function (e) { return { equipo: e.equipo, telegram: e.telegram, slot: e.slot, completo: e.picks.length >= cfg.rondas }; });
    });
  }

  function cargarManagers(cfg) {
    return pedir(cfg.archivoManagers).then(function (t) { return [].concat(JSON.parse(t)); });
  }

  // Devuelve { semana: { "nombre en minúsculas": puntos } }
  function cargarPuntos(cfg) {
    return pedir(cfg.archivoPuntos).then(function (t) {
      var res = {};
      global.ADP.parseCSV(t).forEach(function (f) {
        var s = parseInt(f.semana, 10), n = (f.jugador || "").trim().toLowerCase();
        var pts = parseFloat(String(f.puntos || "").replace(",", "."));
        if (!s || !n || !isFinite(pts)) return;
        (res[s] = res[s] || {})[n] = pts;
      });
      return res;
    }).catch(function () { return {}; }); // sin puntos todavía: la temporada no ha empezado
  }

  // Une equipos + ADP + puntos en un contexto listo para pintar.
  function cargarTodo(cfg) {
    return Promise.all([global.ADP.cargar(cfg), cargarEquipos(cfg), cargarPuntos(cfg)]).then(function (r) {
      var porNombre = {};
      r[0].jugadores.forEach(function (j) { porNombre[j.nombre.toLowerCase()] = j; });
      var equipos = r[1].map(function (e) {
        e.jugadores = e.picks.map(function (p) {
          var j = porNombre[p.jugador.toLowerCase()];
          return Object.assign({ ronda: p.ronda }, j || { id: p.jugador.toLowerCase(), nombre: p.jugador, pos: "?", equipo: "", adp: null, bye: null });
        });
        return e;
      });
      return { cfg: cfg, jugadores: r[0].jugadores, porNombre: porNombre, equipos: equipos, puntos: r[2] };
    });
  }

  function semanasJugadas(ctx) {
    return Object.keys(ctx.puntos).map(Number)
      .filter(function (s) { return s >= ctx.cfg.semanaInicio && s <= ctx.cfg.semanaFin; })
      .sort(function (a, b) { return a - b; });
  }

  function puntosDe(ctx, semana, jugador) {
    var t = ctx.puntos[semana] || {};
    return t[jugador.nombre.toLowerCase()] || 0;
  }

  // Best ball: con los puntos reales de la semana se elige la mejor alineación posible.
  // Primero los slots de una sola posición y luego el FLEX con el mejor sobrante (es óptimo
  // para esta alineación porque el FLEX admite todo lo que admiten RB, WR y TE).
  function puntuarSemana(ctx, eq, semana) {
    var conPts = eq.jugadores.map(function (j) { return { jugador: j, pts: puntosDe(ctx, semana, j) }; })
      .sort(function (a, b) { return b.pts - a.pts; });
    var usados = {};
    var orden = ctx.cfg.alineacion.map(function (s, i) { return { s: s, i: i }; })
      .sort(function (a, b) { return a.s.pos.length - b.s.pos.length; });
    var titulares = new Array(ctx.cfg.alineacion.length);
    orden.forEach(function (o) {
      var x = conPts.find(function (c) { return !usados[c.jugador.id] && o.s.pos.indexOf(c.jugador.pos) >= 0; });
      if (x) usados[x.jugador.id] = true;
      titulares[o.i] = { slot: o.s.slot, jugador: x ? x.jugador : null, pts: x ? x.pts : 0 };
    });
    var total = titulares.reduce(function (s, t) { return s + t.pts; }, 0);
    return {
      total: Math.round(total * 100) / 100,
      titulares: titulares,
      banquillo: conPts.filter(function (c) { return !usados[c.jugador.id]; })
    };
  }

  function equiposDe(ctx, grupo) {
    return ctx.equipos.filter(function (e) { return e.grupo === grupo; });
  }

  // Ranking de una jornada dentro de un grupo.
  function rankingSemana(ctx, grupo, semana) {
    return equiposDe(ctx, grupo).map(function (e) {
      var r = puntuarSemana(ctx, e, semana);
      var top = r.titulares.filter(function (t) { return t.jugador; }).sort(function (a, b) { return b.pts - a.pts; })[0];
      return { equipo: e, total: r.total, detalle: r, mvp: top || null };
    }).sort(function (a, b) { return b.total - a.total; });
  }

  // Clasificación general: suma de las semanas jugadas. Desempate: mejor jornada.
  function clasificacion(ctx, grupo) {
    var semanas = semanasJugadas(ctx);
    return equiposDe(ctx, grupo).map(function (e) {
      var porSemana = {}, total = 0, mejor = 0;
      semanas.forEach(function (s) {
        var p = puntuarSemana(ctx, e, s).total;
        porSemana[s] = p; total += p; mejor = Math.max(mejor, p);
      });
      return { equipo: e, porSemana: porSemana, total: Math.round(total * 100) / 100, mejor: mejor };
    }).sort(function (a, b) { return b.total - a.total || b.mejor - a.mejor; });
  }

  // Playoffs de un grupo: ganador de cada jornada + los mejores restantes al acabar la última.
  function playoffs(ctx, grupo) {
    var cfg = ctx.cfg, jugadas = semanasJugadas(ctx), clasificados = {}, plazas = [];
    for (var s = cfg.semanaInicio; s <= cfg.semanaFin; s++) {
      if (jugadas.indexOf(s) < 0) { plazas.push({ tipo: "jornada", semana: s, fila: null }); continue; }
      var rk = rankingSemana(ctx, grupo, s);
      var ganador = cfg.playoffs.ganadorRepetidoPasaAlSiguiente
        ? rk.find(function (r) { return !clasificados[r.equipo.equipo]; })
        : rk[0];
      var repetido = !!(rk[0] && ganador && ganador !== rk[0]);
      if (ganador) clasificados[ganador.equipo.equipo] = true;
      plazas.push({ tipo: "jornada", semana: s, fila: ganador || null, heredada: repetido, ganadorReal: rk[0] || null });
    }
    var terminada = jugadas.indexOf(cfg.semanaFin) >= 0;
    var restantes = clasificacion(ctx, grupo).filter(function (c) { return !clasificados[c.equipo.equipo]; });
    for (var i = 0; i < cfg.playoffs.plazasPorClasificacion; i++) {
      plazas.push({ tipo: "clasificacion", puesto: i + 1, fila: terminada ? restantes[i] || null : null, provisional: terminada ? null : restantes[i] || null });
    }
    return { plazas: plazas, terminada: terminada };
  }

  // Cuadro final: los clasificados, ordenados por la general, se cruzan según cfg.playoffs.cruces.
  // En cada cruce gana quien más puntúa en la semana de esa ronda; si empatan, el mejor cabeza de serie.
  function cuadro(ctx, grupo) {
    var cfg = ctx.cfg, po = playoffs(ctx, grupo);
    var dentro = {};
    po.plazas.forEach(function (p) { if (p.fila) dentro[p.fila.equipo.equipo] = true; });
    var semillas = po.terminada
      ? clasificacion(ctx, grupo).filter(function (c) { return dentro[c.equipo.equipo]; }).map(function (c, i) { return { seed: i + 1, equipo: c.equipo }; })
      : [];
    var lado = cfg.playoffs.cruces.map(function (c) {
      return [semillas[c[0] - 1] || null, semillas[c[1] - 1] || null];
    });
    return cfg.playoffs.rondas.map(function (ronda, ri) {
      var jugada = !!ctx.puntos[ronda.semana];
      var partidos = lado.map(function (par) {
        var pts = par.map(function (x) { return x && jugada ? puntuarSemana(ctx, x.equipo, ronda.semana).total : null; });
        var ganador = null;
        if (par[0] && par[1] && jugada) ganador = pts[0] > pts[1] || (pts[0] === pts[1] && par[0].seed < par[1].seed) ? par[0] : par[1];
        return { a: par[0], b: par[1], ptsA: pts[0], ptsB: pts[1], ganador: ganador };
      });
      // los ganadores se cruzan en orden para la ronda siguiente
      var sig = [];
      for (var i = 0; i < partidos.length; i += 2) sig.push([partidos[i].ganador, partidos[i + 1] ? partidos[i + 1].ganador : null]);
      lado = sig;
      return { nombre: ronda.nombre, semana: ronda.semana, jugada: jugada, partidos: partidos };
    });
  }

  function fmt(n) { return (Math.round(n * 100) / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  global.Liga = {
    estadoServidor: estadoServidor, llamarServidor: llamarServidor, cargarInscritos: cargarInscritos, cargarManagers: cargarManagers,
    cargarEquipos: cargarEquipos, cargarPuntos: cargarPuntos, cargarTodo: cargarTodo,
    semanasJugadas: semanasJugadas, puntuarSemana: puntuarSemana, rankingSemana: rankingSemana,
    clasificacion: clasificacion, playoffs: playoffs, cuadro: cuadro, equiposDe: equiposDe, fmt: fmt
  };
})(window);
