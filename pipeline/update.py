"""Data pipeline for the critical raw materials monitor.

Fetches every data layer from free public sources and writes plain JSON files
under data/. The website is a static build on top of those files.

    python pipeline/update.py                 # all sources
    python pipeline/update.py yahoo imf       # only some sources

Sources
    yahoo      daily futures settlement (unofficial endpoint, delayed)
    imf        IMF Primary Commodity Price System, monthly benchmark prices
    worldbank  World Bank Commodity Price Data ("Pink Sheet"), monthly
    usgs       USGS Mineral Commodity Summaries, annual prices, production, reserves
    eurostat   Eurostat Comext, monthly EU trade volumes and unit values by origin

A source that fails leaves its previous files untouched, so one outage never
blanks the site. The outcome of each run is recorded in data/status.json.
"""
from __future__ import annotations

import csv
import io
import json
import math
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REGISTRY = DATA / "registry" / "materials.json"
PRICES = DATA / "prices"
TRADE = DATA / "trade"
SUPPLY = DATA / "supply"

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; crm-data-pipeline)"}
TIMEOUT = 90

EU27 = {
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
    "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
}

SOURCES_META = {
    "yahoo": {
        "name": "Yahoo Finance",
        "url": "https://finance.yahoo.com/commodities/",
        "licence": "Unofficial endpoint, delayed exchange data. Indicative only, not for trading or redistribution.",
    },
    "imf": {
        "name": "IMF Primary Commodity Price System",
        "url": "https://data.imf.org/en/datasets/IMF.RES:PCPS",
        "licence": "© International Monetary Fund, reused with attribution under the IMF data terms.",
    },
    "worldbank": {
        "name": "World Bank Commodity Price Data (Pink Sheet)",
        "url": "https://www.worldbank.org/en/research/commodity-markets",
        "licence": "World Bank, CC BY 4.0.",
    },
    "usgs": {
        "name": "USGS Mineral Commodity Summaries",
        "url": "https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries",
        "licence": "U.S. Geological Survey, public domain.",
    },
    "eurostat": {
        "name": "Eurostat Comext (DS-045409)",
        "url": "https://ec.europa.eu/eurostat/web/international-trade-in-goods/database",
        "licence": "© European Union, reuse authorised with attribution (CC BY 4.0).",
    },
}


# --------------------------------------------------------------------------- helpers

def log(msg: str) -> None:
    print(msg, flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get(url: str, *, params=None, tries: int = 4, **kw) -> requests.Response:
    """GET with exponential backoff on network errors, 429 and 5xx."""
    last: Exception | None = None
    for attempt in range(tries):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT, **kw)
            if r.status_code == 429 or r.status_code >= 500:
                raise requests.HTTPError(f"HTTP {r.status_code}", response=r)
            r.raise_for_status()
            return r
        except requests.RequestException as exc:  # noqa: PERF203
            last = exc
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError(f"GET failed after {tries} tries: {url} ({last})")


def sig(x: float, digits: int = 6) -> float:
    """Round to significant digits so that committed diffs stay small and stable."""
    if x == 0 or not math.isfinite(x):
        return 0.0
    return round(x, digits - 1 - int(math.floor(math.log10(abs(x)))))


def write_json(path: Path, obj) -> bool:
    """Write only when the content changed (ignoring the 'updated' stamp)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        try:
            old = json.loads(path.read_text(encoding="utf-8"))
            if _strip(old) == _strip(obj):
                return False
        except json.JSONDecodeError:
            pass
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return True


def _strip(obj):
    if isinstance(obj, dict):
        return {k: v for k, v in obj.items() if k != "updated"}
    return obj


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def load_registry() -> list[dict]:
    return json.loads(REGISTRY.read_text(encoding="utf-8"))["materials"]


def series_doc(*, sid, material, label, unit, frequency, source, points, note=None):
    return {
        "id": sid,
        "material": material,
        "label": label,
        "unit": unit,
        "frequency": frequency,
        "source": source,
        "source_name": SOURCES_META[source]["name"],
        "source_url": SOURCES_META[source]["url"],
        "licence": SOURCES_META[source]["licence"],
        "note": note,
        "updated": now_iso(),
        "points": points,
    }


# --------------------------------------------------------------------------- Yahoo (daily)

def run_yahoo(materials: list[dict]) -> str:
    done, failed = 0, []
    for m in materials:
        for p in m["prices"]:
            if p["source"] != "yahoo":
                continue
            sym = p["symbol"]
            try:
                r = get(
                    f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}",
                    params={"range": "10y", "interval": "1d"},
                )
                res = r.json()["chart"]["result"][0]
                offset = res["meta"].get("gmtoffset", 0)
                closes = res["indicators"]["quote"][0]["close"]
                points = []
                for ts, c in zip(res["timestamp"], closes):
                    if c is None or c <= 0:
                        continue
                    day = datetime.fromtimestamp(ts + offset, timezone.utc).strftime("%Y-%m-%d")
                    val = sig(c * p.get("factor", 1.0))
                    if points and points[-1][0] == day:
                        points[-1][1] = val
                    else:
                        points.append([day, val])
                if len(points) < 100:
                    raise RuntimeError(f"only {len(points)} points")
                last_day = datetime.strptime(points[-1][0], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) - last_day > timedelta(days=10):
                    raise RuntimeError(f"stale, last close {points[-1][0]}")
                sid = f"{m['slug']}--daily-{slugify(sym)}"
                write_json(PRICES / f"{sid}.json", series_doc(
                    sid=sid, material=m["slug"], label=p["label"], unit=p["unit"], frequency="daily",
                    source="yahoo", points=points,
                    note="Front-month futures settlement, continuous series. Delayed and indicative.",
                ))
                done += 1
            except Exception as exc:  # keep the previous file
                failed.append(f"{sym}: {exc}")
            time.sleep(1.5)
    if failed and not done:
        raise RuntimeError("; ".join(failed))
    return f"{done} series" + (f", failed: {'; '.join(failed)}" if failed else "")


# --------------------------------------------------------------------------- IMF (monthly)

def run_imf(materials: list[dict]) -> str:
    wanted = {p["code"]: (m, p) for m in materials for p in m["prices"] if p["source"] == "imf"}
    url = "https://api.imf.org/external/sdmx/2.1/data/PCPS/G001." + "+".join(sorted(wanted)) + ".USD.M"
    xml = get(url, params={"startPeriod": "2000-01"}).text
    done = 0
    for attrs, body in re.findall(r"<Series ([^>]*)>(.*?)</Series>", xml, flags=re.S):
        code = re.search(r'INDICATOR="([^"]+)"', attrs).group(1)
        if code not in wanted:
            continue
        m, p = wanted[code]
        points = []
        for y, mo, value in re.findall(r'TIME_PERIOD="(\d{4})-M(\d{2})" OBS_VALUE="([^"]+)"', body):
            period = f"{y}-{mo}"
            try:
                points.append([period, sig(float(value))])
            except ValueError:
                continue
        points.sort()
        if len(points) < 24:
            continue
        sid = f"{m['slug']}--monthly-imf-{code.lower()}"
        write_json(PRICES / f"{sid}.json", series_doc(
            sid=sid, material=m["slug"], label=p["label"], unit=p["unit"], frequency="monthly",
            source="imf", points=points, note="Monthly average of the benchmark quotation.",
        ))
        done += 1
    if done != len(wanted):
        missing = len(wanted) - done
        if done == 0:
            raise RuntimeError("no series returned")
        return f"{done} series, {missing} missing"
    return f"{done} series"


# --------------------------------------------------------------------------- World Bank (monthly)

def run_worldbank(materials: list[dict]) -> str:
    import openpyxl

    wanted = [(m, p) for m in materials for p in m["prices"] if p["source"] == "worldbank"]
    page = get("https://www.worldbank.org/en/research/commodity-markets").text
    link = re.search(r'https://thedocs\.worldbank\.org[^"\']+CMO-Historical-Data-Monthly\.xlsx', page)
    if not link:
        raise RuntimeError("monthly data link not found on the commodity markets page")
    blob = get(link.group(0)).content
    wb = openpyxl.load_workbook(io.BytesIO(blob), read_only=True, data_only=True)
    rows = list(wb["Monthly Prices"].iter_rows(values_only=True))
    hdr_idx = next(i for i, r in enumerate(rows[:12]) if r and any(str(c).strip() == "Aluminum" for c in r if c))
    header = [str(c).strip() if c else "" for c in rows[hdr_idx]]
    done = 0
    for m, p in wanted:
        col = header.index(p["column"])
        points = []
        for r in rows[hdr_idx + 2:]:
            mt = re.fullmatch(r"(\d{4})M(\d{2})", str(r[0] or ""))
            if not mt or int(mt.group(1)) < 2000:
                continue
            v = r[col]
            if isinstance(v, (int, float)):
                points.append([f"{mt.group(1)}-{mt.group(2)}", sig(float(v))])
        if len(points) < 24:
            continue
        sid = f"{m['slug']}--monthly-wb-{slugify(p['column'])}"
        write_json(PRICES / f"{sid}.json", series_doc(
            sid=sid, material=m["slug"], label=p["label"], unit=p["unit"], frequency="monthly",
            source="worldbank", points=points, note="Monthly average, nominal US dollars.",
        ))
        done += 1
    return f"{done} series"


# --------------------------------------------------------------------------- USGS (annual)

USGS_COUNTRY = {
    "Congo (Kinshasa)": "DR Congo",
    "Congo (Brazzaville)": "Congo",
    "Burma": "Myanmar",
    "Korea, Republic of": "South Korea",
    "Korea, North": "North Korea",
    "Turkey": "Türkiye",
    "Other countries": "Other countries",
}

USGS_UNITS = {
    "dollars per metric ton": "USD/t",
    "dollars per pound": "USD/lb",
    "cents per pound": "USc/lb",
    "dollars per kilogram": "USD/kg",
    "dollars per troy ounce": "USD/oz t",
    "dollars per ton": "USD/t",
    "dollars per dry metric ton unit": "USD/dmtu",
    "metric tons": "t",
    "thousand metric tons": "kt",
    "thousand metric dry tons": "kt (dry)",
    "kilograms": "kg",
    "million cubic meters": "million m³",
}


def _num(v: str):
    v = (v or "").strip().replace(",", "")
    try:
        return float(v)
    except ValueError:
        return None


def _usgs_release() -> tuple[int, str, str]:
    """Find the newest 'Commodity Salient U.S. and World Statistics' data release."""
    year = datetime.now(timezone.utc).year
    for y in (year + 1, year, year - 1, year - 2):
        r = get("https://www.sciencebase.gov/catalog/items", params={
            "q": f'"Mineral Commodity Summaries {y} Data Release"', "format": "json", "max": 20, "fields": "title,files",
        }).json()
        for item in r.get("items", []):
            for f in item.get("files", []) or []:
                if f["name"].endswith("_Commodities_Data.csv"):
                    return y, f["url"], f"https://www.sciencebase.gov/catalog/item/{item['id']}"
    raise RuntimeError("no MCS commodities data release found")


def run_usgs(materials: list[dict]) -> str:
    edition, csv_url, landing = _usgs_release()
    text = get(csv_url).content.decode("cp1252", errors="replace")
    rows = list(csv.DictReader(io.StringIO(text)))
    by_chapter: dict[str, list[dict]] = {}
    for r in rows:
        by_chapter.setdefault(r["MCS chapter"].strip(), []).append(r)

    n_price = n_supply = 0
    for m in materials:
        # annual prices -----------------------------------------------------
        for i, cfg in enumerate(m["usgs_prices"]):
            sel = [r for r in by_chapter.get(cfg["chapter"], [])
                   if r["Statistics"] == "Price" and r["Statistics_detail"].startswith(cfg["detail"])]
            details = {r["Statistics_detail"] for r in sel}
            if len(details) != 1:
                log(f"  usgs price: {m['slug']} '{cfg['detail']}' matched {len(details)} series, skipped")
                continue
            sid = f"{m['slug']}--annual-usgs-{i + 1}"
            path = PRICES / f"{sid}.json"
            merged = {}
            if path.exists():  # keep older years from earlier editions
                merged = {p[0]: p[1] for p in json.loads(path.read_text(encoding="utf-8"))["points"]}
            estimated = None
            for r in sel:
                v = _num(r["Value"])
                if v is not None and re.fullmatch(r"\d{4}", r["Year"].strip()):
                    merged[r["Year"].strip()] = sig(v)
                    if "stimated" in (r["Notes"] or ""):
                        estimated = r["Year"].strip()
            if not merged:
                continue
            unit = USGS_UNITS.get(sel[0]["Unit"].strip(), sel[0]["Unit"].strip())
            note = f"Annual average, MCS {edition}."
            if estimated:
                note += f" {estimated} is a USGS estimate."
            write_json(path, series_doc(
                sid=sid, material=m["slug"], label=cfg["label"], unit=unit, frequency="annual",
                source="usgs", points=sorted([k, v] for k, v in merged.items()), note=note,
            ))
            n_price += 1

        # world production and reserves ------------------------------------
        tables = []
        for cfg in m["production"]:
            chap = [r for r in by_chapter.get(cfg["chapter"], []) if r["Section"].startswith("World")]
            if cfg.get("commodity"):
                chap_p = [r for r in chap if r["Commodity"].strip() == cfg["commodity"]]
            else:
                chap_p = chap
            prod = [r for r in chap_p if r["Statistics"] == "Production" and r["Statistics_detail"].startswith(cfg["detail"])]
            if not prod:
                log(f"  usgs supply: {m['slug']} '{cfg['detail']}' no rows")
                continue
            years = sorted({r["Year"].strip() for r in prod if re.fullmatch(r"\d{4}", r["Year"].strip())})
            world, countries = {}, {}
            for r in prod:
                y, v = r["Year"].strip(), _num(r["Value"])
                name = r["Country"].strip()
                if "rounded" in r["Statistics_detail"].lower() or name.lower().startswith("world total"):
                    if v is not None:
                        world[y] = v
                    continue
                name = USGS_COUNTRY.get(name, name)
                if not cfg["comparable"]:
                    form = r["Statistics_detail"][len(cfg["detail"]):].strip(" :,—-")
                    if form:
                        name = f"{name} ({form})"
                row = countries.setdefault(name, {"country": name, "values": {}, "reserves": None})
                row["values"][y] = v
            res_unit = None
            res_world = None
            if cfg.get("reserves_detail"):
                for r in chap:
                    if r["Statistics"] != "Reserves" or not r["Statistics_detail"].startswith(cfg["reserves_detail"]):
                        continue
                    v, name = _num(r["Value"]), r["Country"].strip()
                    res_unit = USGS_UNITS.get(r["Unit"].strip(), r["Unit"].strip())
                    if "rounded" in r["Statistics_detail"].lower() or name.lower().startswith("world total"):
                        res_world = v
                        continue
                    name = USGS_COUNTRY.get(name, name)
                    if not cfg["comparable"]:
                        form = r["Statistics_detail"][len(cfg["reserves_detail"]):].strip(" :,—-")
                        if form:
                            name = f"{name} ({form})"
                    countries.setdefault(name, {"country": name, "values": {}, "reserves": None})["reserves"] = v
            latest = years[-1]
            out_rows = []
            for row in countries.values():
                v = row["values"].get(latest)
                share = None
                if cfg["comparable"] and v is not None and world.get(latest):
                    share = round(100 * v / world[latest], 1)
                out_rows.append({**row, "share_pct": share})
            out_rows.sort(key=lambda r: (r["country"] == "Other countries", -(r["values"].get(latest) or -1)))
            tables.append({
                "label": cfg["label"],
                "unit": USGS_UNITS.get(prod[0]["Unit"].strip(), prod[0]["Unit"].strip()),
                "comparable": cfg["comparable"],
                "years": years,
                "estimated_year": latest,
                "world": world,
                "reserves_unit": res_unit,
                "reserves_world": res_world,
                "rows": out_rows,
            })
        if tables:
            write_json(SUPPLY / f"{m['slug']}.json", {
                "slug": m["slug"],
                "edition": edition,
                "source_name": f"USGS Mineral Commodity Summaries {edition}",
                "source_url": landing,
                "licence": SOURCES_META["usgs"]["licence"],
                "updated": now_iso(),
                "tables": tables,
            })
            n_supply += 1
    return f"MCS {edition}: {n_price} price series, {n_supply} supply tables"


# --------------------------------------------------------------------------- Eurostat Comext (monthly)

COMEXT = "https://ec.europa.eu/eurostat/api/comext/dissemination/statistics/1.0/data/DS-045409"

COMEXT_COUNTRY = {
    "Russian Federation": "Russia",
    "Congo, Democratic Republic of": "DR Congo",
    "Korea, Republic of": "South Korea",
    "Korea, Democratic People's Republic of": "North Korea",
    "Viet Nam": "Vietnam",
    "Lao People's Democratic Republic": "Laos",
    "Iran, Islamic Republic of": "Iran",
    "Tanzania, United Republic of": "Tanzania",
    "Bolivia, Plurinational State of": "Bolivia",
    "Venezuela, Bolivarian Republic of": "Venezuela",
    "Moldova, Republic of": "Moldova",
    "Syrian Arab Republic": "Syria",
}


def _country(label: str) -> str:
    name = re.sub(r"\s*\(.*\)$", "", label).strip()
    return COMEXT_COUNTRY.get(name, name)


def _jsonstat(doc: dict):
    """Yield (labels_by_dimension, value) for every populated cell of a JSON-stat dataset."""
    ids, size = doc["id"], doc["size"]
    cats = [list(sorted(doc["dimension"][d]["category"]["index"].items(), key=lambda kv: kv[1])) for d in ids]
    strides = [math.prod(size[i + 1:]) for i in range(len(size))]
    for key, val in doc["value"].items():
        k = int(key)
        coord = {}
        for i, d in enumerate(ids):
            coord[d] = cats[i][(k // strides[i]) % size[i]][0]
        yield coord, val


def _comext(products: list[str], extra: list[tuple[str, str]]):
    params = [("freq", "M"), ("reporter", "EU27_2020"),
              ("indicators", "VALUE_IN_EUROS"), ("indicators", "QUANTITY_IN_100KG")]
    params += [("product", p) for p in products] + extra
    return get(COMEXT, params=params).json()


def run_eurostat(materials: list[dict]) -> str:
    codes = sorted({t["code"] for m in materials for t in m["trade"]})
    # 1. monthly extra-EU imports and exports per product -------------------
    monthly: dict[str, dict[str, dict]] = {c: {} for c in codes}
    for i in range(0, len(codes), 20):
        doc = _comext(codes[i:i + 20], [("partner", "EXT_EU27_2020"), ("flow", "1"), ("flow", "2"),
                                        ("sinceTimePeriod", "2015-01")])
        for c, v in _jsonstat(doc):
            cell = monthly[c["product"]].setdefault(c["time"], {})
            flow = "imp" if c["flow"] == "1" else "exp"
            if c["indicators"] == "VALUE_IN_EUROS":
                cell[f"{flow}_eur"] = v
            else:
                cell[f"{flow}_t"] = v / 10.0
        time.sleep(0.5)
    all_months = sorted({t for c in codes for t, cell in monthly[c].items() if cell.get("imp_eur")})
    if not all_months:
        raise RuntimeError("no monthly data returned")
    latest = all_months[-1]
    y, mo = map(int, latest.split("-"))
    window = []
    for _ in range(12):
        window.append(f"{y:04d}-{mo:02d}")
        mo -= 1
        if mo == 0:
            y, mo = y - 1, 12
    window.sort()

    # 2. origin breakdown over the trailing 12 months -----------------------
    origins: dict[str, dict[str, dict]] = {c: {} for c in codes}
    names: dict[str, str] = {}
    for i in range(0, len(codes), 10):
        doc = _comext(codes[i:i + 10], [("flow", "1"), ("sinceTimePeriod", window[0]), ("untilTimePeriod", window[-1])])
        names.update(doc["dimension"]["partner"]["category"]["label"])
        for c, v in _jsonstat(doc):
            if c["time"] not in window:
                continue
            cell = origins[c["product"]].setdefault(c["partner"], {"eur": 0.0, "t": 0.0})
            if c["indicators"] == "VALUE_IN_EUROS":
                cell["eur"] += v
            else:
                cell["t"] += v / 10.0
        time.sleep(0.5)

    written = 0
    for m in materials:
        products = []
        for n, t in enumerate(m["trade"]):
            code = t["code"]
            series = []
            for period in sorted(monthly[code]):
                cell = monthly[code][period]
                it, ie = cell.get("imp_t"), cell.get("imp_eur")
                series.append([
                    period,
                    None if it is None else sig(it, 5),
                    None if ie is None else round(ie),
                    None if cell.get("exp_t") is None else sig(cell["exp_t"], 5),
                    None if cell.get("exp_eur") is None else round(cell["exp_eur"]),
                ])
            ext = origins[code].get("EXT_EU27_2020", {"eur": 0.0, "t": 0.0})
            # rank by tonnage when the product is reported in weight, otherwise by value
            basis = "t" if ext["t"] > 0 else "eur"
            rows = []
            for partner, cell in origins[code].items():
                if len(partner) != 2 or partner in EU27 or cell[basis] <= 0:
                    continue
                rows.append({
                    "code": partner,
                    "country": _country(names.get(partner, partner)),
                    "tonnes": sig(cell["t"], 5) if cell["t"] else 0,
                    "eur": round(cell["eur"]),
                    "share_pct": round(100 * cell[basis] / ext[basis], 1) if ext[basis] else None,
                })
            rows.sort(key=lambda r: -(r["share_pct"] or 0))
            hhi = round(sum((r["share_pct"] or 0) ** 2 for r in rows)) if rows else None
            products.append({
                "code": code,
                "label": t["label"],
                "primary": n == 0,
                "columns": ["period", "import_t", "import_eur", "export_t", "export_eur"],
                "monthly": series,
                "origins": {
                    "from": window[0], "to": window[-1], "basis": "tonnes" if basis == "t" else "value",
                    "total_t": sig(ext["t"], 5) if ext["t"] else 0, "total_eur": round(ext["eur"]),
                    "hhi": hhi, "rows": rows[:12],
                },
            })
            # the primary product also feeds the price layer as an import unit value
            if n == 0:
                pts = []
                for k in range(len(series)):
                    win = series[max(0, k - 2):k + 1]
                    mass = sum(r[1] or 0 for r in win)
                    value = sum(r[2] or 0 for r in win if r[1])
                    if series[k][1] and mass >= 0.5 and value > 0:
                        pts.append([series[k][0], value / mass])
                if len(pts) >= 12:
                    med = sorted(v for _, v in pts)[len(pts) // 2]
                    unit, div = ("EUR/kg", 1000.0) if med >= 100_000 else ("EUR/t", 1.0)
                    pts = [[d, sig(v / div, 5)] for d, v in pts]
                    sid = f"{m['slug']}--monthly-eu-import-{code}"
                    write_json(PRICES / f"{sid}.json", series_doc(
                        sid=sid, material=m["slug"], label=f"EU import unit value: {t['label']}", unit=unit,
                        frequency="monthly", source="eurostat", points=pts,
                        note=f"Customs value of extra-EU imports divided by net mass (CN {code}), three-month rolling. "
                             "A trade-weighted indicator, not a market quotation. Recent months are revised.",
                    ))
        if write_json(TRADE / f"{m['slug']}.json", {
            "slug": m["slug"],
            "source_name": SOURCES_META["eurostat"]["name"],
            "source_url": SOURCES_META["eurostat"]["url"],
            "licence": SOURCES_META["eurostat"]["licence"],
            "latest_period": latest,
            "updated": now_iso(),
            "products": products,
        }):
            written += 1
    return f"{len(codes)} products through {latest}, {written} material files changed"


# --------------------------------------------------------------------------- index

FREQ_RANK = {"daily": 0, "monthly": 1, "annual": 2}
SOURCE_RANK = {"yahoo": 0, "imf": 1, "worldbank": 2, "eurostat": 3, "usgs": 4}


def build_index() -> int:
    """Summarise every price series (latest value and changes) for the overview pages."""
    entries = []
    for path in sorted(PRICES.glob("*--*.json")):
        s = json.loads(path.read_text(encoding="utf-8"))
        pts = s["points"]
        if not pts:
            continue
        last_date, last = pts[-1]
        prev = pts[-2][1] if len(pts) > 1 else None

        def back(n_periods: int):
            return pts[-1 - n_periods][1] if len(pts) > n_periods else None

        year_ago = {"daily": back(252), "monthly": back(12), "annual": back(1)}[s["frequency"]]
        entries.append({
            "id": s["id"], "material": s["material"], "label": s["label"], "unit": s["unit"],
            "frequency": s["frequency"], "source": s["source"], "source_name": s["source_name"],
            "latest_date": last_date, "latest": last,
            "change_pct": None if not prev else round(100 * (last / prev - 1), 2),
            "change_1y_pct": None if not year_ago else round(100 * (last / year_ago - 1), 1),
            "spark": [p[1] for p in pts[-(260 if s["frequency"] == "daily" else 36 if s["frequency"] == "monthly" else 10):]],
            "n": len(pts),
        })
    entries.sort(key=lambda e: (e["material"], FREQ_RANK[e["frequency"]], SOURCE_RANK[e["source"]], e["id"]))
    write_json(PRICES / "index.json", {"updated": now_iso(), "series": entries})
    return len(entries)


RUNNERS = {
    "yahoo": run_yahoo,
    "imf": run_imf,
    "worldbank": run_worldbank,
    "usgs": run_usgs,
    "eurostat": run_eurostat,
}


def main(argv: list[str]) -> int:
    chosen = argv or list(RUNNERS)
    unknown = [c for c in chosen if c not in RUNNERS]
    if unknown:
        log(f"unknown source(s): {', '.join(unknown)}. Choose from: {', '.join(RUNNERS)}")
        return 2
    materials = load_registry()
    status_path = DATA / "status.json"
    status = json.loads(status_path.read_text(encoding="utf-8")) if status_path.exists() else {"sources": {}}
    failures = 0
    for name in chosen:
        log(f"[{name}] fetching")
        entry = {"name": SOURCES_META[name]["name"], "url": SOURCES_META[name]["url"],
                 "licence": SOURCES_META[name]["licence"], "last_attempt": now_iso()}
        try:
            detail = RUNNERS[name](materials)
            entry.update(ok=True, last_success=now_iso(), detail=detail)
            log(f"[{name}] ok: {detail}")
        except Exception as exc:
            failures += 1
            previous = status["sources"].get(name, {})
            entry.update(ok=False, last_success=previous.get("last_success"), detail=str(exc)[:300])
            log(f"[{name}] FAILED: {exc}")
        status["sources"][name] = entry
    n = build_index()
    status["updated"] = now_iso()
    status_path.write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"index: {n} price series")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as fh:
            fh.write("| Source | Result | Detail |\n|---|---|---|\n")
            for name in chosen:
                e = status["sources"][name]
                fh.write(f"| {name} | {'ok' if e['ok'] else 'FAILED'} | {e['detail']} |\n")
    return 1 if failures == len(chosen) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
