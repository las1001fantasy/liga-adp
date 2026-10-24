/* Página de playoffs: plazas (ganador de cada jornada + general) y cuadro final. */
(function () {
  "use strict";

  var cfg = window.LIGA_CONFIG, esc = Layout.esc, L = window.Liga;
  var $ = function (id) { return document.getElementById(id); };
  var nJornadas = cfg.semanaFin - cfg.semanaInicio + 1;
  var total = nJornadas + cfg.playoffs.plazasPorClasificacion;

  $("p-texto").textContent = "Entran " + total + " equipos" + (cfg.grupos.length > 1 ? " por grupo" : "") +
    ": el que más puntúa en cada jornada de la " + cfg.semanaInicio + " a la " + cfg.semanaFin + " pasa directo" +
    (cfg.playoffs.ganadorRepetidoPasaAlSiguiente ? " (si ya estaba dentro, pasa el siguiente de esa jornada)" : "") +
    ", y al acabar la " + cfg.semanaFin + " se añaden los " + cfg.playoffs.plazasPorClasificacion +
    " mejores de la clasificación general que falten. Después: " +
    cfg.playoffs.rondas.map(function (r) { return r.nombre.toLowerCase() + " en la semana " + r.semana; }).join(", ") +
    ". Los cruces se ordenan por la clasificación general y en cada uno gana quien más puntúa esa semana.";

  function fila(p) {
    var cuando = p.tipo === "jornada" ? "Jornada " + p.semana : "General " + p.puesto;
    if (p.fila) {
      var pts = p.tipo === "jornada" ? L.fmt(p.fila.total) + " pts en J" + p.semana : L.fmt(p.fila.total) + " pts en total";
      var nota = p.heredada ? "<small>" + esc(p.ganadorReal.equipo.equipo) + " ganó la jornada pero ya estaba dentro</small>" : "";
      return '<div class="plaza dentro"><span class="cuando">' + cuando + "</span><span><b>" + esc(p.fila.equipo.equipo) + "</b><small>" +
        esc(p.fila.equipo.telegram) + "</small>" + nota + '</span><span class="num">' + pts + "</span></div>";
    }
    var pend = p.tipo === "jornada" ? "Por jugar" : "Se decide al acabar la J" + cfg.semanaFin;
    var prov = p.provisional ? "<small>Si acabara hoy: " + esc(p.provisional.equipo.equipo) + " (" + L.fmt(p.provisional.total) + ")</small>" : "";
    return '<div class="plaza"><span class="cuando">' + cuando + '</span><span><span class="pend">' + pend + "</span>" + prov + "</span><span></span></div>";
  }

  function lado(x, pts, gana) {
    if (!x) return '<div class="lado pend">Por decidir</div>';
    return '<div class="lado' + (gana ? " gana" : "") + '"><span class="num seed">' + x.seed + "</span><span>" + esc(x.equipo.equipo) +
      '</span><span class="num">' + (pts != null ? L.fmt(pts) : "") + "</span></div>";
  }

  function pintarCuadro(ctx, g) {
    return '<div class="cuadro">' + L.cuadro(ctx, g).map(function (r) {
      return '<div class="ronda"><div class="eyebrow">' + esc(r.nombre) + " · semana " + r.semana + "</div>" +
        r.partidos.map(function (p) {
          return '<div class="cruce">' + lado(p.a, p.ptsA, p.ganador && p.ganador === p.a) + lado(p.b, p.ptsB, p.ganador && p.ganador === p.b) + "</div>";
        }).join("") + "</div>";
    }).join("") + "</div>";
  }

  L.cargarTodo(cfg).then(function (ctx) {
    Layout.avisoEjemplo();
    $("p-grupos").innerHTML = cfg.grupos.map(function (g) {
      var po = L.playoffs(ctx, g);
      var dentro = po.plazas.filter(function (p) { return p.fila; }).length;
      return '<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>' +
        (cfg.grupos.length > 1 ? esc(g) : "Clasificados") + '</h3><span class="chip ' + (dentro ? "ok" : "idle") + '">' +
        dentro + " / " + po.plazas.length + " plazas</span></div>" +
        '<div class="plazas">' + po.plazas.map(fila).join("") + "</div></div>" +
        '<div class="panel stack"><h3>Cuadro final</h3>' +
        (po.terminada ? "" : '<p class="muted" style="margin:0;font-size:13px">Los cruces se completan al acabar la jornada ' + cfg.semanaFin + ".</p>") +
        '<div class="table-scroll">' + pintarCuadro(ctx, g) + "</div></div>";
    }).join("");
  }).catch(Layout.errorCarga);
})();
