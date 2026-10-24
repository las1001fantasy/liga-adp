/*
 * Carga y normaliza la lista de ADP desde CSV o JSON.
 * Columnas aceptadas (sin importar mayúsculas ni el orden):
 *   jugador | nombre | player     -> nombre
 *   equipo_nfl | equipo | team    -> equipo NFL
 *   posicion | pos | position     -> QB, RB, WR, TE, K, DST (D/ST, DEF, PK también valen)
 *   adp                           -> según LIGA_CONFIG.formatoADP
 *   bye                           -> semana de descanso (opcional)
 *   adp_exacto                    -> ADP con decimales, solo para ordenar y mostrar (opcional)
 *   n_ligas                       -> en cuántas ligas de referencia salió (opcional)
 *   player_id                     -> id del jugador (Fleaflicker), útil para cruzar puntos (opcional)
 */
(function (global) {
  "use strict";

  var ALIAS = {
    nombre: ["jugador", "nombre", "player", "name"],
    equipo: ["equipo_nfl", "equipo", "team", "nfl"],
    pos: ["posicion", "posición", "pos", "position"],
    adp: ["adp"],
    bye: ["bye", "bye_week", "semana_bye"],
    exacto: ["adp_exacto", "adp_cor"],
    ligas: ["n_ligas", "nligas"],
    pid: ["player_id", "id"],
    lesion: ["lesion", "lesión", "injury", "estado"]
  };
  var POSICIONES = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", K: "K", PK: "K", DST: "DST", "D/ST": "DST", DEF: "DST", DEF_ST: "DST" };

  // Parser CSV con comillas; detecta "," o ";" (Excel en español exporta con ";").
  function parseCSV(texto) {
    texto = texto.replace(/^﻿/, "");
    var primera = texto.split(/\r?\n/)[0] || "";
    var sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ";" : ",";
    var filas = [], fila = [], campo = "", comillas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (comillas) {
        if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (ch === '"') comillas = false;
        else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) { fila.push(campo); campo = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && texto[i + 1] === "\n") i++;
        fila.push(campo); filas.push(fila); fila = []; campo = "";
      } else campo += ch;
    }
    if (campo || fila.length) { fila.push(campo); filas.push(fila); }
    filas = filas.filter(function (f) { return f.some(function (c) { return c.trim(); }); });
    var cab = (filas.shift() || []).map(function (c) { return c.trim().toLowerCase(); });
    return filas.map(function (f) {
      var o = {};
      cab.forEach(function (k, i) { o[k] = (f[i] || "").trim(); });
      return o;
    });
  }

  function leerCampo(fila, nombre) {
    var claves = ALIAS[nombre];
    for (var i = 0; i < claves.length; i++) if (fila[claves[i]] != null && fila[claves[i]] !== "") return fila[claves[i]];
    return "";
  }

  // Devuelve { jugadores, descartados } con los jugadores ordenados por ADP.
  function normalizar(filas, cfg) {
    var jugadores = [], descartados = [], vistos = {};
    filas.forEach(function (f, i) {
      var nombre = String(leerCampo(f, "nombre")).trim();
      var pos = POSICIONES[String(leerCampo(f, "pos")).trim().toUpperCase()];
      var adp = global.Draft.parseADP(leerCampo(f, "adp"), cfg.formatoADP, cfg.equipos);
      if (!nombre || !pos || !isFinite(adp)) { descartados.push("Fila " + (i + 2) + ": " + (nombre || "sin nombre")); return; }
      var clave = nombre.toLowerCase();
      if (vistos[clave]) { descartados.push("Fila " + (i + 2) + ": " + nombre + " está repetido"); return; }
      vistos[clave] = true;
      var bye = parseInt(leerCampo(f, "bye"), 10);
      var exacto = parseFloat(String(leerCampo(f, "exacto")).replace(",", "."));
      var ligas = parseInt(leerCampo(f, "ligas"), 10);
      jugadores.push({
        id: clave.replace(/[^a-z0-9]+/g, "-"),
        nombre: nombre,
        equipo: String(leerCampo(f, "equipo")).toUpperCase(),
        pos: pos,
        adp: Math.round(adp * 10) / 10,
        bye: isFinite(bye) ? bye : null,
        adpExacto: isFinite(exacto) ? exacto : null,
        ligas: isFinite(ligas) ? ligas : null,
        playerId: String(leerCampo(f, "pid")) || null,
        lesion: String(leerCampo(f, "lesion")).trim().toUpperCase() || null
      });
    });
    jugadores.sort(function (a, b) { return a.adp - b.adp || (a.adpExacto || 0) - (b.adpExacto || 0); });
    return { jugadores: jugadores, descartados: descartados };
  }

  function desdeTexto(texto, nombreArchivo, cfg) {
    var filas = /\.json$/i.test(nombreArchivo || "") || /^\s*[\[{]/.test(texto)
      ? [].concat(JSON.parse(texto)).map(function (o) {
          var r = {}; Object.keys(o).forEach(function (k) { r[k.toLowerCase()] = o[k]; }); return r;
        })
      : parseCSV(texto);
    return normalizar(filas, cfg);
  }

  // Orden: datos incrustados (vista previa) -> archivo configurado.
  function cargar(cfg) {
    if (global.ADP_EMBEBIDO) return Promise.resolve(desdeTexto(global.ADP_EMBEBIDO, cfg.archivoADP, cfg));
    return fetch(cfg.archivoADP, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (t) { return desdeTexto(t, cfg.archivoADP, cfg); });
  }

  global.ADP = { cargar: cargar, desdeTexto: desdeTexto, parseCSV: parseCSV };
})(window);
