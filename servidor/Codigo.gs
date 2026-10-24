/**
 * Servidor de la Liga ADP en Google Apps Script.
 * Guarda los equipos en esta hoja de cálculo, comprueba la contraseña de cada manager
 * y no enseña ningún roster hasta el cierre. Instrucciones en servidor/LEEME.md.
 */

var CONFIG = {
  cierre: new Date("2026-11-04T22:00:00+01:00"),
  // Web publicada (GitHub Pages o similar): de aquí se leen el ADP y la lista de managers
  web: "https://adp.las1001fantasy.com/",
  equipos: 12,       // picks por ronda
  rondas: 15,
  maxPorSlot: 2,     // managers que pueden compartir pick de 1ª ronda
  minimos: { QB: 1, RB: 1, WR: 2, TE: 1, K: 1, DST: 1 },
  minimoFlex: 5,     // RB + WR + TE
  intentos: 10       // contraseñas fallidas por equipo cada 10 minutos
};

var HOJA_MANAGERS = "Managers", HOJA_EQUIPOS = "Equipos";
var POSICIONES = { "D/ST": "DST", DEF: "DST", PK: "K" };

// ---------- puesta en marcha (se ejecuta una vez a mano desde el editor) ----------

function prepararHoja() {
  var libro = SpreadsheetApp.getActive();
  var hm = libro.getSheetByName(HOJA_MANAGERS) || libro.insertSheet(HOJA_MANAGERS);
  var he = libro.getSheetByName(HOJA_EQUIPOS) || libro.insertSheet(HOJA_EQUIPOS);
  if (he.getLastRow() === 0) he.appendRow(["equipo", "telegram", "slot", "picks", "completo", "actualizado"]);
  if (hm.getLastRow() > 1) return; // ya preparada: no se regeneran las contraseñas
  hm.clear();
  hm.appendRow(["equipo", "telegram", "contraseña"]);
  var managers = JSON.parse(UrlFetchApp.fetch(CONFIG.web + "data/managers.json").getContentText());
  managers.forEach(function (m) {
    if (!m.libre) hm.appendRow([m.equipo, m.telegram, contrasenaAleatoria()]);
  });
}

// Para la plaza 24 o un cambio de manager: añade la fila a mano en "Managers" y ejecuta esto.
function rellenarContrasenasVacias() {
  var hm = SpreadsheetApp.getActive().getSheetByName(HOJA_MANAGERS);
  var datos = hm.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (datos[i][0] && !datos[i][2]) hm.getRange(i + 1, 3).setValue(contrasenaAleatoria());
  }
}

function contrasenaAleatoria() {
  var letras = "abcdefghjkmnpqrstuvwxyz23456789"; // sin 0/o, 1/l/i para que no se confundan
  var s = "";
  for (var i = 0; i < 8; i++) s += letras.charAt(Math.floor(Math.random() * letras.length));
  return s;
}

// ---------- API ----------

function doGet(e) {
  return responder(estadoPublico());
}

function doPost(e) {
  var p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { return responder({ ok: false, error: "Petición no válida." }); }
  var m = comprobarClave(p.equipo, p.clave);
  if (!m.ok) return responder(m);
  if (p.accion === "entrar") return responder({ ok: true, equipo: leerEquipo(m.equipo) });
  if (p.accion === "guardar") return responder(guardarEquipo(m, p));
  return responder({ ok: false, error: "Acción desconocida." });
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Lo que ve cualquiera: quién se ha inscrito y su pick de 1ª ronda; los rosters, solo tras el cierre.
function estadoPublico() {
  var cerrado = new Date() >= CONFIG.cierre;
  var filas = leerEquipos();
  return {
    ok: true,
    cierre: CONFIG.cierre.toISOString(),
    cerrado: cerrado,
    inscritos: filas.map(function (f) {
      return { equipo: f.equipo, telegram: f.telegram, slot: f.slot, completo: f.completo, actualizado: f.actualizado };
    }),
    equipos: !cerrado ? [] : filas.map(function (f) {
      var adp = leerADP();
      return {
        equipo: f.equipo, telegram: f.telegram, slot: f.slot,
        // tras el cierre solo cuentan los picks válidos
        picks: f.picks.map(function (n, i) {
          return { ronda: i + 1, jugador: n && validarPick(adp, n, f.slot, i + 1).ok ? n : "" };
        }).filter(function (p) { return p.jugador; })
      };
    })
  };
}

function comprobarClave(equipo, clave) {
  var cache = CacheService.getScriptCache();
  var k = "fallos-" + String(equipo || "").toLowerCase();
  var fallos = Number(cache.get(k) || 0);
  if (fallos >= CONFIG.intentos) return { ok: false, error: "Demasiados intentos. Espera 10 minutos." };
  var hm = SpreadsheetApp.getActive().getSheetByName(HOJA_MANAGERS);
  var datos = hm.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][0]).toLowerCase() === String(equipo || "").toLowerCase()) {
      if (String(datos[i][2]) && String(datos[i][2]) === String(clave || "").trim()) {
        cache.remove(k);
        return { ok: true, equipo: String(datos[i][0]), telegram: String(datos[i][1]) };
      }
      break;
    }
  }
  cache.put(k, String(fallos + 1), 600);
  return { ok: false, error: "Contraseña incorrecta." };
}

function leerEquipos() {
  var he = SpreadsheetApp.getActive().getSheetByName(HOJA_EQUIPOS);
  var datos = he.getDataRange().getValues();
  var res = [];
  for (var i = 1; i < datos.length; i++) {
    if (!datos[i][0]) continue;
    var picks = [];
    try { picks = JSON.parse(datos[i][3] || "[]"); } catch (err) { picks = []; }
    res.push({ fila: i + 1, equipo: String(datos[i][0]), telegram: String(datos[i][1]), slot: Number(datos[i][2]) || null,
      picks: picks, completo: datos[i][4] === true || datos[i][4] === "TRUE", actualizado: datos[i][5] ? new Date(datos[i][5]).toISOString() : null });
  }
  return res;
}

function leerEquipo(nombre) {
  var f = leerEquipos().filter(function (x) { return x.equipo.toLowerCase() === nombre.toLowerCase(); })[0];
  return f ? { slot: f.slot, picks: f.picks, completo: f.completo, actualizado: f.actualizado } : null;
}

function guardarEquipo(m, p) {
  if (new Date() >= CONFIG.cierre) return { ok: false, error: "El plazo de inscripción está cerrado." };
  var slot = Number(p.slot);
  if (!(slot >= 1 && slot <= CONFIG.equipos)) return { ok: false, error: "Pick de 1ª ronda no válido." };
  var picks = [].concat(p.picks || []).slice(0, CONFIG.rondas).map(function (n) { return String(n || "").trim().slice(0, 60); });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var filas = leerEquipos();
    var mismos = filas.filter(function (f) { return f.slot === slot && f.equipo.toLowerCase() !== m.equipo.toLowerCase(); });
    if (mismos.length >= CONFIG.maxPorSlot) {
      return { ok: false, error: "El pick 1." + ("0" + slot).slice(-2) + " ya lo tienen " + mismos.map(function (f) { return f.equipo; }).join(" y ") + "." };
    }
    var revision = revisarRoster(leerADP(), picks, slot);
    var he = SpreadsheetApp.getActive().getSheetByName(HOJA_EQUIPOS);
    var fila = filas.filter(function (f) { return f.equipo.toLowerCase() === m.equipo.toLowerCase(); })[0];
    var valores = [[m.equipo, m.telegram, slot, JSON.stringify(picks), revision.completo, new Date()]];
    if (fila) he.getRange(fila.fila, 1, 1, 6).setValues(valores);
    else he.appendRow(valores[0]);
    return { ok: true, completo: revision.completo, errores: revision.errores, actualizado: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

// ---------- reglas (las mismas que la web, para que no se puedan saltar) ----------

function leerADP() {
  var cache = CacheService.getScriptCache();
  var texto = cache.get("adp");
  if (!texto) {
    texto = UrlFetchApp.fetch(CONFIG.web + "data/adp.csv").getContentText();
    if (texto.length < 90000) cache.put("adp", texto, 3600);
  }
  var filas = Utilities.parseCsv(texto.replace(/^﻿/, ""));
  var cab = filas.shift().map(function (c) { return c.trim().toLowerCase(); });
  var iN = cab.indexOf("jugador"), iP = cab.indexOf("posicion"), iA = cab.indexOf("adp");
  var res = {};
  filas.forEach(function (f) {
    if (!f[iN]) return;
    var pos = f[iP].trim().toUpperCase();
    res[f[iN].trim().toLowerCase()] = { nombre: f[iN].trim(), pos: POSICIONES[pos] || pos, adp: parseFloat(String(f[iA]).replace(",", ".")) };
  });
  return res;
}

function pickGlobal(slot, ronda) {
  var enRonda = ronda % 2 === 1 ? slot : CONFIG.equipos + 1 - slot;
  return (ronda - 1) * CONFIG.equipos + enRonda;
}

function validarPick(adp, nombre, slot, ronda) {
  var j = adp[String(nombre).toLowerCase()];
  if (!j) return { ok: false, error: "Ronda " + ronda + ": " + nombre + " no está en la lista de ADP." };
  if (j.adp < pickGlobal(slot, ronda)) return { ok: false, error: "Ronda " + ronda + ": " + j.nombre + " tiene ADP " + j.adp + " y el pick es el " + pickGlobal(slot, ronda) + "." };
  return { ok: true, jugador: j };
}

function revisarRoster(adp, picks, slot) {
  var errores = [], vistos = {}, cuenta = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 }, validos = 0;
  for (var r = 1; r <= CONFIG.rondas; r++) {
    var n = picks[r - 1];
    if (!n) continue;
    var v = validarPick(adp, n, slot, r);
    if (!v.ok) { errores.push(v.error); continue; }
    if (vistos[v.jugador.nombre]) { errores.push("Ronda " + r + ": " + v.jugador.nombre + " está repetido."); continue; }
    vistos[v.jugador.nombre] = true;
    cuenta[v.jugador.pos]++;
    validos++;
  }
  Object.keys(CONFIG.minimos).forEach(function (pos) {
    if (cuenta[pos] < CONFIG.minimos[pos]) errores.push("Faltan " + pos + ": mínimo " + CONFIG.minimos[pos] + ".");
  });
  if (cuenta.RB + cuenta.WR + cuenta.TE < CONFIG.minimoFlex) errores.push("Faltan RB/WR/TE: mínimo " + CONFIG.minimoFlex + ".");
  return { completo: validos === CONFIG.rondas && !errores.length, errores: errores };
}
