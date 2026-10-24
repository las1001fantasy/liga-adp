/* Página de equipos: todos los rosters, con filtro por grupo y buscador. */
(function () {
  "use strict";

  var cfg = window.LIGA_CONFIG, esc = Layout.esc, L = window.Liga, D = window.Draft;
  var $ = function (id) { return document.getElementById(id); };
  var ctx = null, grupo = "Todos";

  function pintarFiltro() {
    $("f-grupo").hidden = cfg.grupos.length < 2;
    $("f-grupo").innerHTML = ["Todos"].concat(cfg.grupos).map(function (g) {
      return '<button type="button" data-g="' + esc(g) + '" aria-pressed="' + (g === grupo) + '">' + esc(g) + "</button>";
    }).join("");
  }

  function pintar() {
    var q = $("f-busca").value.trim().toLowerCase();
    var lista = ctx.equipos.filter(function (e) { return grupo === "Todos" || e.grupo === grupo; })
      .sort(function (a, b) { return a.grupo.localeCompare(b.grupo) || a.slot - b.slot; });
    var visibles = lista.filter(function (e) {
      if (!q) return true;
      return e.equipo.toLowerCase().indexOf(q) >= 0 || e.telegram.toLowerCase().indexOf(q) >= 0 ||
        e.jugadores.some(function (j) { return j.nombre.toLowerCase().indexOf(q) >= 0; });
    });
    $("f-resumen").textContent = visibles.length + " de " + lista.length + " equipos" + (q ? " con «" + q + "»" : "") + ".";
    $("rejilla").innerHTML = visibles.map(function (e) {
      return '<article class="tarjeta"><header><h3>' + esc(e.equipo) + '</h3><span class="chip idle num">1.' +
        String(e.slot).padStart(2, "0") + "</span></header>" +
        '<div class="muted" style="font-size:13px">' + esc(e.telegram) + (cfg.grupos.length > 1 ? " · " + esc(e.grupo) : "") + "</div><ol>" +
        e.jugadores.map(function (j) {
          var g = D.pickGlobal(e.slot, j.ronda, cfg.equipos);
          var match = q && j.nombre.toLowerCase().indexOf(q) >= 0;
          return '<li class="' + (match ? "match" : "") + '"><span class="num">' + D.formatoPick(g, cfg.equipos) + "</span><span>" +
            esc(j.nombre) + '</span><span class="pos">' + j.pos + "</span></li>";
        }).join("") + "</ol></article>";
    }).join("") || '<p class="muted">' + (lista.length ? "Ningún equipo coincide con la búsqueda." : "Todavía no hay equipos inscritos. Aparecerán aquí a medida que se apunten.") + "</p>";
    pintarPopulares(lista);
  }

  function pintarPopulares(lista) {
    var cuenta = {};
    lista.forEach(function (e) { e.jugadores.forEach(function (j) { (cuenta[j.nombre] = cuenta[j.nombre] || { j: j, n: 0 }).n++; }); });
    var top = Object.keys(cuenta).map(function (k) { return cuenta[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 12);
    var max = top.length ? top[0].n : 1;
    $("populares").closest(".panel").hidden = !top.length;
    $("populares").innerHTML = "<thead><tr><th>Jugador</th><th>Pos</th><th class=\"n\">ADP</th><th class=\"n\">Equipos</th><th style=\"width:30%\"></th></tr></thead><tbody>" +
      top.map(function (t) {
        return "<tr><td>" + esc(t.j.nombre) + '</td><td><span class="pos">' + t.j.pos + '</span></td><td class="n">' +
          (t.j.adp != null ? D.formatoADP(t.j.adp, cfg.equipos) : "") + '</td><td class="n">' + t.n + " / " + lista.length +
          '</td><td><div class="barra" style="width:' + Math.round(t.n / max * 100) + '%"></div></td></tr>';
      }).join("") + "</tbody>";
  }

  pintarFiltro();
  $("f-grupo").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-g]");
    if (!b) return;
    grupo = b.dataset.g; pintarFiltro(); pintar();
  });
  $("f-busca").addEventListener("input", function () { if (ctx) pintar(); });

  L.cargarTodo(cfg).then(function (c) {
    ctx = c;
    if (!cfg.mostrarEquiposAntesDeCierre && !Layout.plazoCerrado()) {
      Layout.aviso("Los equipos se podrán ver cuando cierre la inscripción, el " + Layout.fechaCierre() + ". En la portada puedes ver quién ya lo tiene hecho.");
      return;
    }
    Layout.avisoEjemplo();
    pintar();
  }).catch(Layout.errorCarga);
})();
