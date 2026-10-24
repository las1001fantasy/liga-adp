/* Página de inicio: accesos, resumen de cada grupo y reglas. */
(function () {
  "use strict";

  var cfg = window.LIGA_CONFIG, esc = Layout.esc, L = window.Liga;
  var $ = function (id) { return document.getElementById(id); };

  $("h-temporada").textContent = cfg.temporada;
  $("h-texto").textContent = cfg.participantes + " managers" + (cfg.grupos.length > 1 ? " en " + cfg.grupos.length + " grupos" : "") +
    ". Cada uno monta su equipo de " + cfg.rondas +
    " jugadores eligiendo por ADP y puntúa de la semana " + cfg.semanaInicio + " a la " + cfg.semanaFin +
    " de la NFL. Inscripción abierta hasta el " + Layout.fechaCierre() + ".";
  $("h-reglas").innerHTML = [
    "Eliges tu equipo y tu pick de 1ª ronda (del 1 al 12; cada pick lo pueden coger " + cfg.maxPorSlot + " managers). El orden es snake: si sales 1.08, luego vas 2.05, 3.08, 4.05…",
    "En cada ronda solo puedes elegir jugadores con ADP igual o mayor que tu pick.",
    "Cada semana puntúa sola tu mejor alineación: QB, RB, 2 WR, TE, FLEX (RB/WR/TE), K y DST. El TE cobra 2 puntos por recepción.",
    "No hay enfrentamientos: cuenta la puntuación. El mejor de cada jornada (" + cfg.semanaInicio + " a " + cfg.semanaFin + ") pasa directo a playoffs; si ya estaba dentro, pasa el siguiente de esa jornada.",
    "Al acabar la jornada " + cfg.semanaFin + " entran también los " + cfg.playoffs.plazasPorClasificacion + " mejores de la clasificación general que aún no estén dentro.",
    "Playoffs: " + cfg.playoffs.rondas.map(function (r) { return r.nombre.toLowerCase() + " (semana " + r.semana + ")"; }).join(", ") + ". En cada cruce gana quien más puntúa esa semana."
  ].map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");

  // Seguimiento de la inscripción: qué equipos ya tienen roster y cuáles faltan.
  Promise.all([L.cargarManagers(cfg), L.cargarInscritos(cfg)]).then(function (r) {
    var managers = r[0].filter(function (m) { return !m.libre; }), inscritos = {};
    r[1].forEach(function (e) { inscritos[e.equipo.toLowerCase()] = e; });
    var estadoDe = function (m) { var e = inscritos[m.equipo.toLowerCase()]; return !e ? "falta" : e.completo ? "ok" : "medias"; };
    var orden = { falta: 0, medias: 1, ok: 2 }, texto = { falta: "Sin empezar", medias: "A medias", ok: "Completo" };
    var clase = { falta: "bad", medias: "warn", ok: "ok" };
    var n = { falta: 0, medias: 0, ok: 0 };
    managers.forEach(function (m) { n[estadoDe(m)]++; });
    var lista = managers.slice().sort(function (a, b) { return orden[estadoDe(a)] - orden[estadoDe(b)] || a.equipo.localeCompare(b.equipo); });
    var cerrado = Layout.plazoCerrado();
    $("pendientes").hidden = false;
    $("pendientes").innerHTML = '<div class="row" style="justify-content:space-between"><h3>' + (cerrado ? "Inscripción cerrada" : "¿Quién falta por hacer su equipo?") +
      '</h3><span class="chip idle">' + n.ok + " de " + managers.length + " completos</span></div>" +
      '<p class="muted" style="margin:0;font-size:14px">' + (n.falta ? n.falta + " sin empezar" : "Todos han empezado") + (n.medias ? " · " + n.medias + " a medias" : "") +
      (cerrado ? "." : ". Los rosters se verán en Equipos a partir del " + Layout.fechaCierre() + ".") + "</p>" +
      '<ul class="pendientes">' + lista.map(function (m) {
        var e = estadoDe(m);
        return '<li><span><b>' + esc(m.equipo) + '</b> <span class="muted">' + esc(m.telegram) + '</span></span><span class="chip ' + clase[e] + '">' + texto[e] + "</span></li>";
      }).join("") + "</ul>";
  }).catch(function () { /* sin lista de managers: no se muestra el seguimiento */ });

  L.cargarTodo(cfg).then(function (ctx) {
    Layout.avisoEjemplo();
    var semanas = L.semanasJugadas(ctx), ultima = semanas[semanas.length - 1];
    $("resumen").innerHTML = cfg.grupos.map(function (g) {
      var clas = L.clasificacion(ctx, g).slice(0, 5);
      var n = L.equiposDe(ctx, g).length;
      var cuerpo = !ultima
        ? '<p class="muted" style="margin:0">Todavía no se ha jugado ninguna jornada. La primera que cuenta es la ' + cfg.semanaInicio + ".</p>"
        : '<div class="table-scroll"><table class="tabla"><thead><tr><th>#</th><th>Equipo</th><th class="n">J' + ultima +
          '</th><th class="n">Total</th></tr></thead><tbody>' + clas.map(function (c, i) {
            return "<tr><td class=\"rk\">" + (i + 1) + '</td><td class="eq"><b>' + esc(c.equipo.equipo) + "</b><small>" + esc(c.equipo.telegram) +
              '</small></td><td class="n">' + L.fmt(c.porSemana[ultima]) + '</td><td class="n"><b>' + L.fmt(c.total) + "</b></td></tr>";
          }).join("") + "</tbody></table></div>";
      return '<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>' + esc(g) +
        "</h3>" + (n ? '<span class="chip idle">' + n + " equipos</span>" : "") + "</div>" + cuerpo +
        '<a href="jornada.html" class="muted" style="font-size:13px">Ver clasificación completa</a></div>';
    }).join("");
  }).catch(Layout.errorCarga);
})();
