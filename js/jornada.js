/* Página de jornada: puntos de una semana por grupo + clasificación general. */
(function () {
  "use strict";

  var cfg = window.LIGA_CONFIG, esc = Layout.esc, L = window.Liga;
  var $ = function (id) { return document.getElementById(id); };
  var ctx = null, semana = null, abiertos = {};

  function pintarSemanas(jugadas) {
    var html = "";
    for (var s = cfg.semanaInicio; s <= cfg.semanaFin; s++) {
      var ok = jugadas.indexOf(s) >= 0;
      html += '<button type="button" data-s="' + s + '" aria-pressed="' + (s === semana) + '"' + (ok ? "" : " disabled") + ">J" + s + "</button>";
    }
    $("j-semanas").innerHTML = html;
  }

  function detalle(r) {
    return r.detalle.titulares.map(function (t) {
      return '<span style="white-space:nowrap"><b class="num">' + t.slot + "</b> " +
        (t.jugador ? esc(t.jugador.nombre) + ' <span class="num">' + L.fmt(t.pts) + "</span>" : '<i class="muted">vacío</i>') + "</span>";
    }).join(" · ") + (r.detalle.banquillo.length ? '<div class="muted" style="margin-top:4px">Banquillo: ' +
      r.detalle.banquillo.map(function (b) { return esc(b.jugador.nombre) + " " + L.fmt(b.pts); }).join(", ") + "</div>" : "");
  }

  function pintarJornada() {
    $("j-num").textContent = semana || "–";
    if (!semana) {
      $("j-grupos").innerHTML = '<div class="panel muted">Aún no hay puntos. La primera jornada que cuenta es la ' + cfg.semanaInicio + ".</div>";
      return;
    }
    $("j-grupos").innerHTML = cfg.grupos.map(function (g) {
      var rk = L.rankingSemana(ctx, g, semana);
      return '<div class="panel stack" style="padding:16px"><h3>' + esc(g) + '</h3><div class="table-scroll"><table class="tabla">' +
        '<thead><tr><th>#</th><th>Equipo</th><th>MVP</th><th class="n">Puntos</th></tr></thead><tbody>' +
        rk.map(function (r, i) {
          var k = g + "|" + r.equipo.equipo;
          return '<tr class="' + (i === 0 ? "top" : "") + '"><td class="rk">' + (i + 1) + '</td><td class="eq"><button type="button" class="ver" data-k="' +
            esc(k) + '" aria-expanded="' + !!abiertos[k] + '">' + esc(r.equipo.equipo) + "</button><small>" + esc(r.equipo.telegram) + "</small></td><td>" +
            (r.mvp ? esc(r.mvp.jugador.nombre) + ' <span class="muted num">' + L.fmt(r.mvp.pts) + "</span>" : "") +
            '</td><td class="n"><b>' + L.fmt(r.total) + "</b></td></tr>" +
            (abiertos[k] ? '<tr class="detalle"><td></td><td colspan="3">' + detalle(r) + "</td></tr>" : "");
        }).join("") + "</tbody></table></div></div>";
    }).join("");
  }

  function pintarClasificacion(jugadas) {
    $("c-rango").textContent = cfg.semanaInicio + " a " + cfg.semanaFin + (jugadas.length ? " (jugadas: " + jugadas.length + ")" : "");
    var cols = [];
    for (var s = cfg.semanaInicio; s <= cfg.semanaFin; s++) cols.push(s);
    $("c-grupos").innerHTML = cfg.grupos.map(function (g) {
      var clas = L.clasificacion(ctx, g);
      if (!clas.length) return '<div class="panel muted">Todavía no hay equipos inscritos.</div>';
      var ganadores = {};
      L.playoffs(ctx, g).plazas.forEach(function (p) { if (p.tipo === "jornada" && p.fila) ganadores[p.fila.equipo.equipo] = p.semana; });
      return '<div class="panel stack"><h3>' + esc(g) + '</h3><div class="table-scroll"><table class="tabla" style="min-width:720px">' +
        "<thead><tr><th>#</th><th>Equipo</th>" + cols.map(function (s) { return '<th class="n">J' + s + "</th>"; }).join("") +
        '<th class="n">Total</th></tr></thead><tbody>' +
        clas.map(function (c, i) {
          var dentro = ganadores[c.equipo.equipo];
          return '<tr class="' + (dentro ? "zona" : "") + '"><td class="rk">' + (i + 1) + '</td><td class="eq"><b>' + esc(c.equipo.equipo) + "</b><small>" +
            esc(c.equipo.telegram) + (dentro ? " · en playoffs (J" + dentro + ")" : "") + "</small></td>" +
            cols.map(function (s) { return '<td class="n">' + (c.porSemana[s] != null ? L.fmt(c.porSemana[s]) : '<span class="muted">–</span>') + "</td>"; }).join("") +
            '<td class="n"><b>' + L.fmt(c.total) + "</b></td></tr>";
        }).join("") + "</tbody></table></div></div>";
    }).join("");
  }

  $("j-semanas").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-s]");
    if (!b) return;
    semana = Number(b.dataset.s); abiertos = {};
    pintarSemanas(L.semanasJugadas(ctx)); pintarJornada();
  });
  $("j-grupos").addEventListener("click", function (e) {
    var b = e.target.closest("button.ver");
    if (!b) return;
    abiertos[b.dataset.k] = !abiertos[b.dataset.k];
    pintarJornada();
  });

  L.cargarTodo(cfg).then(function (c) {
    ctx = c;
    Layout.avisoEjemplo();
    var jugadas = L.semanasJugadas(ctx);
    semana = jugadas[jugadas.length - 1] || null;
    pintarSemanas(jugadas); pintarJornada(); pintarClasificacion(jugadas);
  }).catch(Layout.errorCarga);
})();
