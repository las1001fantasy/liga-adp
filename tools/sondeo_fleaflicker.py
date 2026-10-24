"""Sondeo temporal: comprueba si la página de jugadores de Fleaflicker se puede leer y cómo es su tabla."""
import re, html, urllib.request
B = "https://www.fleaflicker.com"
def get(q):
    req = urllib.request.Request(B + q, headers={"User-Agent": "Mozilla/5.0 (liga-adp; consulta semanal)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read().decode("utf-8", "replace")
def texto(h): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "|", h)))
P = "/nfl/leagues/346180/players"
for q in [P + "?statType=2&week=6", P + "?week=6&statType=1", P + "?statType=2&proTeam=DET", P + "?statType=2&position=16", P + "?statType=2&position=256",
          P + "/jahmyr-gibbs-17612", P + "/17612", "/nfl/players/17612", P + "/houston-texans-2340"]:
    try:
        st, h = get(q)
    except Exception as e:
        print("ERR", q, e); continue
    print("=====", q, st, len(h))
    print("H1", texto((re.search(r"<h1.*?</h1>", h, re.S) or re.search("", "")).group(0))[:200])
    print("POSOPTS", sorted(set(re.findall(r"position=(\d+)", h))))
    print("PARAMS", sorted(set(re.findall(r"[?&](\w+)=", h)))[:60])
    for t in re.findall(r"<table.*?</table>", h, re.S)[:3]:
        th = re.search(r"<thead.*?</thead>", t, re.S)
        print("THEAD", texto(th.group(0))[:600] if th else "-")
        for r in re.findall(r"<tr.*?</tr>", t, re.S)[2:6]:
            print("ROW", texto(r)[:400])
