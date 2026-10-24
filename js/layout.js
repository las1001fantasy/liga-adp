/*
 * Cabecera, menú, cuenta atrás y pie comunes a todas las páginas.
 * Cada página pone <body data-page="..."> y los huecos #cabecera y #pie.
 */
(function () {
  "use strict";

  var cfg = window.LIGA_CONFIG;
  var PAGINAS = [
    ["inicio", "index.html", "Inicio"],
    ["equipo", "equipo.html", "Crear equipo"],
    ["equipos", "equipos.html", "Equipos"],
    ["jornada", "jornada.html", "Jornada y clasificación"],
    ["playoffs", "playoffs.html", "Playoffs"]
  ];

  function plazoCerrado() { return Date.now() >= new Date(cfg.fechaLimite).getTime(); }

  function fechaCierre() {
    return new Date(cfg.fechaLimite).toLocaleString("es-ES", {
      weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid"
    });
  }

  function pintarReloj() {
    var r = document.getElementById("reloj");
    if (!r) return;
    var ms = new Date(cfg.fechaLimite).getTime() - Date.now();
    if (ms <= 0) {
      r.innerHTML = "<div><b>Cerrado</b><small>inscripción</small></div>";
    } else {
      var d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
      r.innerHTML = [[d, "días"], [h, "horas"], [m, "min"]].map(function (x) {
        return "<div><b>" + String(x[0]).padStart(2, "0") + "</b><small>" + x[1] + "</small></div>";
      }).join("");
    }
    document.getElementById("reloj-label").textContent = "Cierre: " + fechaCierre();
  }

  function pintar() {
    var actual = document.body.getAttribute("data-page");
    var cab = document.getElementById("cabecera");
    if (cab) {
      cab.className = "scoreboard";
      cab.innerHTML =
        '<div class="wrap">' +
          '<a class="brand" href="index.html">' +
            '<img src="img/logo-liga-adp.png" alt="Escudo Liga ADP · Peras y Manzanas Bowl" width="68" height="67">' +
            "<div><div class=\"h1\">Liga ADP</div><div class=\"bowl\">Peras y Manzanas Bowl</div>" +
            '<div class="sub">' + cfg.participantes + " equipos · " + (cfg.grupos.length > 1 ? cfg.grupos.length + " grupos · " : "") +
            cfg.rondas + " rondas snake · semanas " + cfg.semanaInicio + "–" + cfg.semanaFin + "</div></div>" +
          "</a>" +
          '<div><div class="clock" id="reloj" aria-live="polite"></div><div class="clock-label" id="reloj-label"></div></div>' +
        "</div>" +
        '<nav class="menu" aria-label="Secciones"><div class="wrap">' +
          PAGINAS.map(function (p) {
            return '<a href="' + p[1] + '"' + (p[0] === actual ? ' aria-current="page"' : "") + ">" + p[2] + "</a>";
          }).join("") +
        "</div></nav>";
    }
    var pie = document.getElementById("pie");
    if (pie) {
      pie.className = "wrap foot";
      pie.innerHTML = '<img src="img/logo-analytics.png" alt="Las 1001 Analytics" width="40" height="40">' +
        "<span><b>Las 1001 Analytics</b> · temporada " + cfg.temporada + "</span>";
    }
    pintarReloj();
    setInterval(pintarReloj, 30000);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  // Aviso arriba de la página (datos de ejemplo, errores de carga…).
  function aviso(texto) {
    var a = document.getElementById("aviso-datos");
    if (!a) return;
    a.textContent = texto; a.hidden = !texto;
  }

  function avisoEjemplo() {
    if (cfg.datosEsEjemplo) aviso("Equipos y puntos de EJEMPLO, inventados para probar la web. No son datos reales.");
  }

  function errorCarga(err) {
    aviso("No se pudieron cargar los datos (" + err.message + "). Si abriste el archivo con doble clic, usa un servidor local (ver README).");
  }

  window.Layout = { plazoCerrado: plazoCerrado, fechaCierre: fechaCierre, esc: esc, aviso: aviso, avisoEjemplo: avisoEjemplo, errorCarga: errorCarga };
  pintar();
})();
