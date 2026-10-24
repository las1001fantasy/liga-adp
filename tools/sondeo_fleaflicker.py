"""Sondeo temporal: comprueba si la página de jugadores de Fleaflicker se puede leer y cómo es su tabla."""
import re, sys, urllib.request
URL = "https://www.fleaflicker.com/nfl/leagues/346180/players"
def get(q):
    req = urllib.request.Request(URL + q, headers={"User-Agent": "Mozilla/5.0 (liga-adp; consulta semanal)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read().decode("utf-8", "replace")
for q in ["", "?statType=0&sortMode=0&position=287", "?statType=1", "?statType=2", "?statType=7&sortMode=1"]:
    try:
        st, h = get(q)
    except Exception as e:
        print("ERR", q, e); continue
    print("=====", q, st, len(h))
    for sel in re.findall(r"<select[^>]*>.*?</select>", h, re.S)[:6]:
        print("SELECT", re.sub(r"\s+", " ", sel)[:1500])
    t = re.search(r"<table.*?</table>", h, re.S)
    if t:
        tab = t.group(0)
        print("THEAD", re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "|", (re.search(r"<thead.*?</thead>", tab, re.S) or re.search(r".{0,1}", "")).group(0)))[:1500])
        rows = re.findall(r"<tr.*?</tr>", tab, re.S)
        for r in rows[2:5]:
            print("ROW", re.sub(r"\s+", " ", r)[:2500])
    for a in sorted(set(re.findall(r'href="(/nfl/leagues/346180/players\?[^"]+)"', h)))[:40]:
        print("LINK", a)
