#!/usr/bin/env python3
"""Reescribe data/puntos.csv con los puntos de cada jugador del ADP por semana.

Fuente principal: la ficha de cada jugador en la liga de referencia de Fleaflicker (346180), que ya
trae los puntos con su puntuación exacta. Si una ficha no se puede leer, se calcula con las
estadísticas de Sleeper y las reglas de data/puntuacion.json.

Uso (desde la carpeta de la web):
    python3 tools/actualizar_puntos.py                 # semanas 8 (prueba) a 17 ya terminadas
    python3 tools/actualizar_puntos.py --semanas 9-10  # solo esas
    python3 tools/actualizar_puntos.py --stats-dir muestras/   # sin red: lee stats-<semana>.json y players.json

Cada ejecución recalcula todas las semanas terminadas, así recoge las correcciones de stats.
Si Sleeper devuelve una semana vacía, se conservan las filas que ya hubiera de esa semana.
"""
import argparse, csv, datetime, html, json, os, re, sys, time, unicodedata, urllib.request

API = "https://api.sleeper.app/v1"
FLEA = "https://www.fleaflicker.com/nfl/leagues/346180/players/"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Códigos de equipo del ADP que en Sleeper se escriben distinto
EQUIPOS_SLEEPER = {"JAC": "JAX", "WSH": "WAS", "LA": "LAR"}
POSICIONES = {"D/ST": "DST", "DEF": "DST", "PK": "K"}


def normaliza(nombre):
    s = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", s)
    return re.sub(r"[^a-z]", "", s)


def pedir(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (liga-adp; actualización semanal)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8", "replace")


def pedir_json(url):
    return json.loads(pedir(url))


def slug(nombre):
    s = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().lower().replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def celdas(fila):
    return [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", fila, re.S)]


def puntos_fleaflicker(texto):
    """De la ficha de un jugador: {semana: puntos}. La tabla de partidos empieza por la semana y acaba en los puntos."""
    res = {}
    for tabla in re.findall(r"<table.*?</table>", texto, re.S):
        if not re.search(r">\s*Week\s*<", tabla):
            continue
        for fila in re.findall(r"<tr.*?</tr>", tabla, re.S):
            c = celdas(fila)
            if len(c) < 3 or not re.fullmatch(r"\d{1,2}", c[0]):
                continue
            try:
                res[int(c[0])] = float(c[-1].replace(",", "."))
            except ValueError:
                pass  # partido sin jugar todavía
    return res


def leer_fleaflicker(adp, pausa):
    """{nombre: {semana: puntos}} de los jugadores cuya ficha se ha podido leer."""
    res, fallos = {}, []
    for j in adp:
        if not j["pid"]:
            fallos.append(j["nombre"]); continue
        try:
            res[j["nombre"]] = puntos_fleaflicker(pedir(FLEA + slug(j["nombre"]) + "-" + j["pid"]))
        except Exception as e:  # ficha no encontrada o red: se usará Sleeper
            fallos.append("%s (%s)" % (j["nombre"], e))
        time.sleep(pausa)
    return res, fallos


def semana_terminada(hoy, inicio):
    """Última semana NFL con el Monday Night ya jugado. inicio = miércoles anterior a la semana 1."""
    return max(0, ((hoy - inicio).days + 1) // 7)


def puntos_jugador(st, pos, reglas):
    if pos == "DST":
        d = reglas["dst"]
        pts = sum(st.get(c, 0) * v for c, v in d["porCampo"].items())
        if "pts_allow" in st:
            for tramo in d["puntosPermitidos"]:
                if st["pts_allow"] <= tramo["max"]:
                    pts += tramo["pts"]
                    break
        return pts
    valores = dict(reglas["porCampo"])
    valores.update(reglas["porPosicion"].get(pos, {}))
    pts = sum(st.get(c, 0) * v for c, v in valores.items())
    pts += sum(u["pts"] for u in reglas["umbrales"] if st.get(u["campo"], 0) >= u["min"])
    # TD largos: Sleeper da cuántos de 40+ y el más largo, así que el de 80+ cuenta como uno como mucho
    largos = reglas["tdLargos"]
    for t in largos["tipos"]:
        lng = st.get(t + "_td_lng", 0)
        n40 = st.get(t + "_td_40p", 1 if lng >= 40 else 0)
        n80 = 1 if lng >= 80 and n40 else 0
        pts += (n40 - n80) * largos["de40"] + n80 * largos["de80"]
    return pts


def cruzar(adp, players):
    """Devuelve {nombre ADP: id Sleeper} y la lista de los que no se encuentran."""
    por_nombre_pos, por_nombre = {}, {}
    for pid, p in players.items():
        nombre = p.get("full_name") or "%s %s" % (p.get("first_name", ""), p.get("last_name", ""))
        k = normaliza(nombre)
        if not k:
            continue
        for pos in p.get("fantasy_positions") or [p.get("position")]:
            por_nombre_pos.setdefault((k, pos), []).append((pid, p))
        por_nombre.setdefault(k, []).append((pid, p))
    ids, sin = {}, []
    for j in adp:
        if j["pos"] == "DST":
            ids[j["nombre"]] = EQUIPOS_SLEEPER.get(j["equipo"], j["equipo"])
            continue
        k = normaliza(j["nombre"])
        cands = por_nombre_pos.get((k, j["pos"])) or por_nombre.get(k) or []
        if len(cands) > 1:  # mismo nombre: desempata por equipo y luego por estar en activo
            equipo = EQUIPOS_SLEEPER.get(j["equipo"], j["equipo"])
            cands = [c for c in cands if c[1].get("team") == equipo] or [c for c in cands if c[1].get("active")] or cands
        if cands:
            ids[j["nombre"]] = cands[0][0]
        else:
            sin.append(j["nombre"])
    return ids, sin


def leer_adp(ruta):
    with open(ruta, encoding="utf-8-sig") as f:
        filas = list(csv.DictReader(f))
    return [{"nombre": r["jugador"].strip(), "equipo": r["equipo_nfl"].strip().upper(), "pid": (r.get("player_id") or "").strip(),
             "pos": POSICIONES.get(r["posicion"].strip().upper(), r["posicion"].strip().upper())} for r in filas]


def leer_puntos(ruta):
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8-sig") as f:
        return [r for r in csv.DictReader(f) if r.get("semana")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--temporada", default="2026")
    ap.add_argument("--semanas", default="8-17", help="rango, p. ej. 9-17; solo se procesan las ya terminadas")
    ap.add_argument("--inicio", default="2026-09-09", help="miércoles anterior a la semana 1")
    ap.add_argument("--hoy", help="fecha AAAA-MM-DD (para pruebas)")
    ap.add_argument("--todas", action="store_true", help="no mirar la fecha: procesar todo el rango")
    ap.add_argument("--stats-dir", help="carpeta con players.json y stats-<semana>.json (sin red)")
    ap.add_argument("--fuente", choices=["fleaflicker", "sleeper"], default="fleaflicker")
    ap.add_argument("--pausa", type=float, default=0.4, help="segundos entre fichas de Fleaflicker")
    a = ap.parse_args()

    ini, fin = (int(x) for x in a.semanas.split("-"))
    hoy = datetime.date.fromisoformat(a.hoy) if a.hoy else datetime.date.today()
    if not a.todas:
        fin = min(fin, semana_terminada(hoy, datetime.date.fromisoformat(a.inicio)))
    semanas = list(range(ini, fin + 1))

    datos = os.path.join(RAIZ, "data")
    with open(os.path.join(datos, "puntuacion.json"), encoding="utf-8") as f:
        reglas = json.load(f)
    adp = leer_adp(os.path.join(datos, "adp.csv"))
    ruta_puntos = os.path.join(datos, "puntos.csv")
    anteriores = leer_puntos(ruta_puntos)

    if not semanas:
        print("Ninguna semana del rango ha terminado todavía (%s). No se cambia nada." % hoy)
        return

    def cargar(nombre, url):
        if a.stats_dir:
            with open(os.path.join(a.stats_dir, nombre), encoding="utf-8") as f:
                return json.load(f)
        return pedir_json(url)

    # Sleeper: puntos calculados con nuestras reglas (respaldo y comprobación)
    sleeper, sin = {}, []
    try:
        players = cargar("players.json", API + "/players/nfl")
        ids, sin = cruzar(adp, players)
        pos_de = {j["nombre"]: j["pos"] for j in adp}
        for s in semanas:
            stats = cargar("stats-%d.json" % s, "%s/stats/nfl/regular/%s/%d" % (API, a.temporada, s))
            sleeper[s] = {n: round(puntos_jugador(stats[pid], pos_de[n], reglas), 2) for n, pid in ids.items() if stats.get(pid)}
    except Exception as e:
        print("Sleeper no disponible: %s" % e, file=sys.stderr)

    flea, fallos = ({}, []) if a.fuente == "sleeper" else leer_fleaflicker(adp, a.pausa)
    if a.fuente != "sleeper":
        print("Fleaflicker: %d fichas leídas, %d con respaldo de Sleeper." % (len(flea), len(fallos)))

    filas, hechas, difs = [], set(), []
    for s in semanas:
        n = 0
        for j in adp:
            nombre = j["nombre"]
            if nombre in flea:
                pts = flea[nombre].get(s)
                if pts is not None and s in sleeper and nombre in sleeper[s]:
                    difs.append((abs(pts - sleeper[s][nombre]), nombre, s, pts, sleeper[s][nombre]))
            else:
                pts = sleeper.get(s, {}).get(nombre)
            if pts is not None:
                filas.append({"semana": s, "jugador": nombre, "puntos": round(pts, 2)})
                n += 1
        if n:
            hechas.add(s)
        print("Semana %d: %d jugadores con puntos." % (s, n) if n else "Semana %d: sin datos, se conservan los que hubiera." % s)

    # Conserva las semanas que no se han recalculado
    filas = [r for r in anteriores if int(r["semana"]) not in hechas] + filas
    filas.sort(key=lambda r: (int(r["semana"]), -float(r["puntos"])))
    with open(ruta_puntos, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, ["semana", "jugador", "puntos"], lineterminator="\n")
        w.writeheader()
        w.writerows(filas)

    with open(os.path.join(datos, "puntos_log.txt"), "w", encoding="utf-8") as f:
        f.write("Actualizado %s · semanas %s\n" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), ", ".join(map(str, sorted(hechas))) or "ninguna"))
        f.write("Fichas de Fleaflicker que no se han podido leer (%d): %s\n" % (len(fallos), ", ".join(fallos) or "ninguna"))
        f.write("Jugadores del ADP sin encontrar en Sleeper (%d): %s\n" % (len(sin), ", ".join(sin) or "ninguno"))
        if difs:
            difs.sort(reverse=True)
            f.write("Fleaflicker frente a nuestro cálculo: %d iguales de %d; mayores diferencias: %s\n" % (
                sum(1 for d in difs if d[0] < 0.05), len(difs),
                "; ".join("%s J%d %.2f vs %.2f" % (d[1], d[2], d[3], d[4]) for d in difs[:8] if d[0] >= 0.05) or "ninguna"))


if __name__ == "__main__":
    main()
