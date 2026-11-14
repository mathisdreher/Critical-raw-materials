# Critical Raw Materials Monitor

A static website that monitors the 34 critical raw materials defined by the European Union (2023 list, Regulation (EU) 2024/1252). For each material it shows prices at the best frequency that open data allows, world supply by country, EU import dependency, and a written profile of what the material is and how it is used in the green and digital transition.

The site is rebuilt once a day by GitHub Actions and served by GitHub Pages. There is no server and no database: every number lives in a JSON file under `data/`, with its full history in git.

## What is covered

| Layer | Source | Frequency | Materials |
|---|---|---|---|
| Exchange futures | Yahoo Finance (unofficial endpoint) | Daily | 4 (copper, aluminium, platinum, palladium) |
| Benchmark prices | IMF Primary Commodity Price System, World Bank Pink Sheet | Monthly | 12 |
| EU import unit values and volumes by origin | Eurostat Comext | Monthly | 34 |
| Reference prices | USGS Mineral Commodity Summaries | Annual | 31 |
| World production and reserves by country | USGS Mineral Commodity Summaries | Annual | 28 |
| Supply risk, economic importance, import reliance, recycling rate | European Commission, 2023 criticality study | Static | 34 |

Free daily prices exist only for a few exchange-traded metals. Most critical raw materials are priced by commercial reporting agencies whose data cannot be republished, so the monitor falls back on monthly and annual open sources and labels each series with its frequency and origin.

## Project layout

```
data/
  registry/materials.json   the 34 materials and the series, customs codes and USGS tables attached to each
  prices/                   one JSON file per price series, plus index.json
  trade/                    EU imports and exports per material (Eurostat)
  supply/                   world production and reserves per material (USGS)
  eu/criticality.json       2023 EU criticality assessment values, with notes on source conflicts
  status.json               outcome of the last pipeline run, per source
pipeline/
  build_registry.py         edit this to change which series a material tracks
  update.py                 fetches every source and rewrites data/
src/
  content/materials/en/     the written profiles, one Markdown file per material
  i18n/en.ts                every interface string
  views/                    page templates, language-independent
  pages/                    thin routes that call the views with a language
  components/, scripts/     charts and tables
.github/workflows/update-and-deploy.yml
```

## One-time setup on GitHub

1. Make sure the default branch is `main` and contains this code. The scheduled job and the Pages deployment only run from the default branch.
2. In **Settings > Pages**, set **Source** to **GitHub Actions**.
3. In **Actions**, run the workflow **Update data and deploy** once by hand. Later runs happen every day at 05:17 UTC and on every push to `main`.
4. Optional, for the sign-up page: publish the Tally form, then add a repository variable `PUBLIC_TALLY_FORM_ID` with the form id under **Settings > Secrets and variables > Actions > Variables**. Without it the page shows a "being set up" notice.

The workflow reads the site address and base path from GitHub Pages, so a custom domain works without code changes.

## Running locally

```bash
npm install
```

```bash
npm run dev
```

To refresh the data yourself (Python 3.10 or later):

```bash
pip install -r requirements.txt
```

```bash
python pipeline/update.py
```

A single source can be refreshed on its own, for example `python pipeline/update.py yahoo imf`. A source that fails keeps its previous files, and the result of every run is written to `data/status.json` and shown on the Methodology page.

## Common changes

**Add or change a price series.** Edit `pipeline/build_registry.py`, run it to regenerate `data/registry/materials.json`, then run `pipeline/update.py`. The site picks up any series present in `data/prices/`.

**Plug in a paid or keyed price API.** Add a function to `pipeline/update.py` that writes files in the same format as the others (see `series_doc`) and register it in `RUNNERS`. Read the key from an environment variable and store it as a repository secret. Check that the provider's licence allows public display before publishing its data.

**Edit a profile.** Each file in `src/content/materials/en/` has a short front matter (`summary`, `uses`) and four sections of text. Numbers shown in tiles and charts do not come from these files, they come from `data/`.

**Add a language.** Copy `src/i18n/en.ts` to, for example, `fr.ts` and register it in `src/i18n/index.ts`. Translate the profiles into `src/content/materials/fr/` (missing ones fall back to English). Add `fr` to `locales` in `astro.config.mjs` and `src/site.config.ts`, then copy the files of `src/pages/` into `src/pages/fr/` with `locale="fr"`.

## Caveats to keep in mind

- The daily futures layer uses an unofficial Yahoo Finance endpoint. It is delayed, it can stop working without notice, and Yahoo's terms do not grant redistribution rights. It is displayed as an indication, with attribution. To switch it off, remove the `yahoo(...)` entries from the registry and delete the matching files in `data/prices/`.
- The EU import unit value is customs value divided by net mass for one customs code per material, summed over three months. It is a trade indicator, not a market price, and it is volatile for materials traded in a few tonnes per year.
- The 65% line on import charts refers to the diversification benchmark of the Critical Raw Materials Act, which legally applies to EU consumption of strategic raw materials at each processing stage. The import share of one customs code is only a proxy.
- The criticality scores reflect supply patterns of 2016 to 2020. The 2023 study contradicts itself in places. The file `data/eu/criticality.json` lists every conflict found and leaves a value empty where it could not be settled.
- The written profiles are drafts prepared with AI assistance and describe events up to 2025. They should be reviewed by a subject expert before the site is promoted.

## Licences of the data

Eurostat and European Commission data: reuse authorised with attribution (CC BY 4.0). World Bank: CC BY 4.0. USGS: public domain. IMF: reuse with attribution under the IMF data terms. Yahoo Finance: see the caveat above.
