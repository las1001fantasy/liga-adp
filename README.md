# Liga ADP · Peras y Manzanas (web)

Esqueleto estático (HTML + CSS + JS, sin dependencias ni compilación) para que cada manager
rellene sus 15 rondas con la regla del ADP. Pensado para subirlo después a Power Pages.

## Estructura

```
index.html          Inicio: accesos, top 5 y reglas
equipo.html         Crear equipo (contraseña + 15 rondas con validación ADP, guardado automático)
equipos.html        Todos los equipos, buscador y jugadores más elegidos
jornada.html        Puntos de cada jornada + clasificación general (J9–J14)
playoffs.html       6 ganadores semanales + 2 de la general y cuadro (cuartos J15, semis J16, final J17)
css/styles.css      Estilos (colores del escudo, tema claro/oscuro)
img/                Logos Liga ADP y Las 1001 Analytics
js/config.js        TODO lo configurable: grupos, cierre, semanas, playoffs, puntuación…
js/layout.js        Cabecera, menú, cuenta atrás y pie comunes
js/draft.js         Lógica del draft: snake, validación ADP, roster, byes
js/liga.js          Lógica de la liga: best ball semanal, clasificación, playoffs
js/adp.js           Lectura del CSV/JSON de ADP
js/app.js, inicio.js, equipos.js, jornada.js, playoffs.js   Una por página
data/adp.csv        ADP REAL 2026 (de APD2026.xlsx, 240 jugadores)
data/managers.json  Los 23 equipos de 2025 + nick de Telegram, y la plaza 24 libre ("libre": true)
data/equipos.json   Equipos inscritos si no hay servidor (vacío)
data/puntos.csv     Puntos por jugador y semana (lo rellena tools/actualizar_puntos.py)
data/puntuacion.json Reglas de puntuación para el script de puntos
servidor/           Apps Script que guarda los equipos con contraseña (ver servidor/LEEME.md)
tools/              actualizar_puntos.py (puntos de Sleeper cada martes)
```

## Cómo probarlo en local

`fetch` no funciona abriendo el archivo con doble clic. Desde esta carpeta:

```
python -m http.server 8000      # y abre http://localhost:8000
```


## Sustituir el ADP

Reemplaza `data/adp.csv` manteniendo la cabecera:

```
jugador,equipo_nfl,posicion,adp,bye
"Bijan Robinson",ATL,RB,2,11
```

- Separador `,` o `;` (Excel en español guarda con `;`), decimales con punto o coma.
- Posiciones: QB, RB, WR, TE, K, DST (también acepta D/ST, DEF, PK).
- `adp` en formato **global** (14.3 = pick 14) por defecto. Si viene como en el Excel
  (`2.1` = ronda 2, pick 1), pon `formatoADP: "ronda.pick"` en `js/config.js`.
  Cuidado: en ese formato `2.10` y `2.1` NO son lo mismo, y Excel convierte `2.10` en `2.1`
  si la celda es numérica. Guarda la columna como texto.
- Cambia `adpEsEjemplo` a `false` cuando el archivo sea el oficial.
- Columna opcional `lesion` (IR, IRD, OUT, Q, D): sale como aviso amarillo en la lista y en la fila,
  pero no bloquea el pick. Cargada de Fleaflicker (liga 346180) el 24/10/2026, semana 7; hay que refrescarla a mano.
- También vale un JSON con un array de objetos con esas mismas claves.

## Publicar cambios

GitHub Pages guarda los archivos en caché unos 10 minutos. Al cambiar JS o CSS, sube el número `?v=` de las
etiquetas `<script>` y `<link>` de los `.html` para que los navegadores bajen la versión nueva.

## Reglas implementadas

- Snake de 12 equipos y 15 rondas: pick 1.08 → 2.05 → 3.08 → 4.05…
- Un jugador es válido si `ADP ≥ número de pick global` (configurable `adpIgualPermitido`).
  Se compara siempre el pick global, nunca "1.8" como decimal.
- Jugador repetido dentro del mismo equipo: error.
- Mínimos para enviar: 1 QB, 1 RB, 2 WR, 1 TE, 1 K, 1 DST y 5 RB/WR/TE (para el FLEX).
- Máximos recomendados (avisos): 3 QB, 4 TE, 2 K, 2 DST.
- Cobertura de byes semanas 9–14 (solo si el ADP trae columna bye): avisa si alguna semana quedaría un slot vacío.
- Cuenta atrás y bloqueo de edición al pasar `fechaLimite`.
- Guardado automático en el navegador, exportación a texto para Telegram y JSON.

## Cómo se alimenta la liga (mientras no haya backend)

1. Cada manager entra con su contraseña y su equipo se guarda solo en el servidor (Google Sheets).
   Los rosters no se ven hasta el cierre; la portada enseña quién falta.
2. Sin servidor (`servidor: ""`), la web lee los equipos de `data/equipos.json`.
3. Los puntos de `data/puntos.csv` (`semana,jugador,puntos`) los genera `tools/actualizar_puntos.py`:
   lee la ficha de cada jugador en la liga de referencia de Fleaflicker (346180), que trae sus puntos
   con la puntuación exacta de la liga, usando el `player_id` del ADP. Si una ficha falla, calcula ese
   jugador con las stats de Sleeper y `data/puntuacion.json`. Recalcula todas las semanas terminadas
   de la 8 (jornada de prueba, no cuenta) a la 17. `.github/workflows/puntos.yml` lo lanza cada martes a las 13:00
   de Barcelona si la web está en un repositorio de GitHub. `data/puntos_log.txt` lista los jugadores
   del ADP que no se han encontrado en Sleeper.
   La web calcula sola la mejor alineación de cada equipo, la jornada, la general y los playoffs.
   El log compara Fleaflicker con nuestro cálculo de Sleeper, para detectar si cambia la puntuación.

## Pendiente (necesita decisión o backend)

Ver el mensaje del hilo del proyecto; resumen en `PENDIENTE.md`.
