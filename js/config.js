/*
 * Configuración de la liga. Todo lo que cambia de un año a otro vive aquí.
 * Los valores marcados con "POR CONFIRMAR" son provisionales.
 */
window.LIGA_CONFIG = {
  nombre: "Liga ADP · Peras y Manzanas",
  temporada: 2026,
  // 2026: una sola liga de 24 plazas (23 equipos de 2025 + 1 por confirmar).
  // El draft sigue siendo de 12 picks por ronda, así que cada pick de 1ª ronda
  // lo pueden coger como mucho 2 managers. POR CONFIRMAR
  grupos: ["Liga ADP"],
  participantes: 24,
  maxPorSlot: 2,
  equipos: 12,
  rondas: 15,

  // Equipos inscritos y puntos por jugador y semana (ver README para el formato).
  // URL del servidor de Apps Script (termina en /exec). Vacío = sin contraseñas, equipos en data/equipos.json
  servidor: "https://script.google.com/macros/s/AKfycbzCo4P7JoHJ5GeuWc-rAgllOayK6g9qqMxiIVXK5nZYuSjyIthPpWeghz4E8FqT2Tag/exec",
  archivoEquipos: "data/equipos.json",
  archivoPuntos: "data/puntos.csv",
  // Lista cerrada de managers (equipo del año pasado + nick de Telegram + grupo).
  // Si existe, en "Crear equipo" cada uno elige su equipo en un desplegable.
  archivoManagers: "data/managers.json",
  // true solo para probar con equipos y puntos inventados (muestra un aviso en todas las páginas).
  datosEsEjemplo: false,
  // ¿Se pueden ver los equipos de los demás antes del cierre? POR CONFIRMAR
  mostrarEquiposAntesDeCierre: false,

  // Archivo con los ADP. Se puede sustituir por el real manteniendo las columnas
  // (ver README). Acepta separador "," o ";" y decimales con punto o coma.
  archivoADP: "data/adp.csv",
  // ADP real: APD2026.xlsx (media corregida de 13 ligas de referencia), recibido el 23/10/2026.
  // Se valida con ADP_REDONDEADO (pick global entero), igual que el Excel de la liga.
  adpEsEjemplo: false,

  // Cómo viene escrito el ADP en el archivo:
  //  "global"     -> número de pick global: 14.3 = pick 14 (1.12 = 12, 2.01 = 13…)
  //  "ronda.pick" -> como en el Excel: 2.1 = ronda 2, pick 1 = pick global 13.
  //                  OJO: con este formato "2.12" es MAYOR que "2.5" (24 > 17).
  formatoADP: "global",

  // ¿Un jugador cuyo ADP coincide exactamente con el pick es válido? POR CONFIRMAR
  adpIgualPermitido: true,

  // Semanas de la fase regular (9 a 14, ambas incluidas).
  semanaInicio: 9,
  semanaFin: 14,
  // Jornada de ensayo: se puntúa y se ve en "Jornada", pero no cuenta para la general ni los playoffs.
  semanaPrueba: 8,

  // Cierre de equipos: miércoles 4 de noviembre de 2026 a las 22:00 (hora de Barcelona).
  fechaLimite: "2026-11-04T22:00:00+01:00",

  // Playoffs: el que más puntúa cada jornada (9 a 14) entra directo (6 plazas).
  // Si ya estaba clasificado, la plaza pasa al segundo de esa jornada, y así sucesivamente.
  // Al acabar la 14 entran los 2 mejores de la general que falten: 8 equipos.
  playoffs: {
    plazasPorClasificacion: 2,
    ganadorRepetidoPasaAlSiguiente: true,
    // Cuadro: cabezas de serie por clasificación general (1-8, 4-5, 2-7, 3-6) y gana
    // quien más puntúa esa semana. Semanas y cruces POR CONFIRMAR.
    cruces: [[1, 8], [4, 5], [2, 7], [3, 6]],
    rondas: [
      { nombre: "Cuartos de final", semana: 15 },
      { nombre: "Semifinales", semana: 16 },
      { nombre: "Final", semana: 17 }
    ]
  },

  // Alineación puntuable semanal (best ball: puntúan automáticamente los mejores).
  alineacion: [
    { slot: "QB", pos: ["QB"] },
    { slot: "RB", pos: ["RB"] },
    { slot: "WR", pos: ["WR"] },
    { slot: "WR", pos: ["WR"] },
    { slot: "TE", pos: ["TE"] },
    { slot: "K", pos: ["K"] },
    { slot: "DST", pos: ["DST"] },
    { slot: "FLEX", pos: ["RB", "WR", "TE"] }
  ],

  // Mínimos obligatorios para poder enviar el equipo (bloquean el envío).
  minimos: { QB: 1, RB: 1, WR: 2, TE: 1, K: 1, DST: 1 },
  // RB + WR + TE necesarios para cubrir RB, 2 WR, TE y FLEX.
  minimoFlex: 5,

  // Máximos recomendados (solo avisan, no bloquean). POR CONFIRMAR
  maximos: { QB: 3, TE: 4, K: 2, DST: 2 },

  // Puntuación (solo la puntuación; la alineación es la nuestra) tomada de la liga de
  // referencia en Fleaflicker 346180, página Scoring, 21/10/2026. Se afinará más adelante.
  puntuacion: [
    ["Recepción RB / WR", "1 pt"],
    ["Recepción TE · premium", "2 pt"],
    ["Yarda de carrera / recepción", "0,1 pt"],
    ["Yarda de pase", "0,05 pt"],
    ["TD de pase", "4 pt"],
    ["TD de carrera / recepción / retorno", "6 pt"],
    ["Bonus TD de 40-79 / 80+ yardas", "+2 / +4"],
    ["Conversión de 2 pt", "2 pt"],
    ["Intercepción lanzada", "-2 pt"],
    ["Fumble / fumble perdido", "-1 / -1 pt"],
    ["Bonus 300 yd pase · 150 yd carrera o recepción", "+1 pt"],
    ["Bonus 25 pases completos · 30 carreras · 9 recepciones", "+2 pt"],
    ["FG · bonus 40-49 / 50+ yd", "3 pt · +1 / +3"],
    ["Extra point", "1 pt"],
    ["DST: sack · intercepción · fumble forzado", "2 pt"],
    ["DST: fumble recuperado", "1 pt"],
    ["DST: safety · TD", "4 · 6 pt"],
    ["DST: 0 puntos permitidos", "+10 pt"]
  ]
};
