#!/usr/bin/env python3
"""Baja las estadísticas de Sleeper, aplica data/puntuacion.json y reescribe data/puntos.csv.

Uso (desde la carpeta de la web):
    python3 tools/actualizar_puntos.py                 # semanas 9..17 ya terminadas
    python3 tools/actualizar_puntos.py --semanas 9-10  # solo esas
    python3 tools/actualizar_puntos.py --stats-dir muestras/   # sin red: lee stats-<semana>.json y players.json

Cada ejecución recalcula todas las semanas terminadas, así recoge las correcciones de stats.
Si Sleeper devuelve una semana vacía, se conservan las filas que ya hubiera de esa semana.
"""
import argparse, csv, datetime, json, os, re, sys, unicodedata, urllib.request

API = "https://api.sleeper.app/v1"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Códigos de equipo del ADP que en Sleeper se escriben distinto
EQUIPOS_SLEEPER = {"JAC": "JAX", "WSH": "WAS", "LA": "LAR"}
POSICIONES = {"D/ST": "DST", "DEF": "DST", "PK": "K"}


def normaliza(nombre):
    s = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", s)
    return re.sub(r"[^a-z]", "", s)


def pedir_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "liga-adp/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


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
    return [{"nombre": r["jugador"].strip(), "equipo": r["equipo_nfl"].strip().upper(),
             "pos": POSICIONES.get(r["posicion"].strip().upper(), r["posicion"].strip().upper())} for r in filas]


def leer_puntos(ruta):
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8-sig") as f:
        return [r for r in csv.DictReader(f) if r.get("semana")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--temporada", default="2026")
    ap.add_argument("--semanas", default="9-17", help="rango, p. ej. 9-17; solo se procesan las ya terminadas")
    ap.add_argument("--inicio", default="2026-09-09", help="miércoles anterior a la semana 1")
    ap.add_argument("--hoy", help="fecha AAAA-MM-DD (para pruebas)")
    ap.add_argument("--todas", action="store_true", help="no mirar la fecha: procesar todo el rango")
    ap.add_argument("--stats-dir", help="carpeta con players.json y stats-<semana>.json (sin red)")
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

    players = cargar("players.json", API + "/players/nfl")
    ids, sin = cruzar(adp, players)
    pos_de = {j["nombre"]: j["pos"] for j in adp}

    filas, hechas = [], set()
    for s in semanas:
        stats = cargar("stats-%d.json" % s, "%s/stats/nfl/regular/%s/%d" % (API, a.temporada, s))
        if not stats:
            print("Semana %d: Sleeper no devuelve datos, se conservan los que hubiera." % s)
            continue
        hechas.add(s)
        n = 0
        for nombre, pid in ids.items():
            st = stats.get(pid)
            if st:
                filas.append({"semana": s, "jugador": nombre, "puntos": round(puntos_jugador(st, pos_de[nombre], reglas), 2)})
                n += 1
        print("Semana %d: %d jugadores con puntos." % (s, n))

    # Conserva las semanas que no se han recalculado
    filas = [r for r in anteriores if int(r["semana"]) not in hechas] + filas
    filas.sort(key=lambda r: (int(r["semana"]), -float(r["puntos"])))
    with open(ruta_puntos, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, ["semana", "jugador", "puntos"], lineterminator="\n")
        w.writeheader()
        w.writerows(filas)

    with open(os.path.join(datos, "puntos_log.txt"), "w", encoding="utf-8") as f:
        f.write("Actualizado %s · semanas %s\n" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), ", ".join(map(str, sorted(hechas))) or "ninguna"))
        f.write("Jugadores del ADP sin encontrar en Sleeper (%d): %s\n" % (len(sin), ", ".join(sin) or "ninguno"))
    if sin:
        print("Sin encontrar en Sleeper: " + ", ".join(sin), file=sys.stderr)


if __name__ == "__main__":
    main()
