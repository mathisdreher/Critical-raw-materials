# Critical Raw Materials Monitor

A static website that monitors the 34 critical raw materials defined by the European Union (2023 list, Regulation (EU) 2024/1252). For each material it shows prices at the best frequency that open data allows, world supply by country, EU import dependency, and a written profile of what the material is and how it is used in the green and digital transition.

The site is rebuilt once a day by GitHub Actions and served by GitHub Pages. There is no server and no database: every number lives in a JSON file under `data/`, with its full history in git.

## What is covered

The counts below are numbers of materials (out of 34), not of series.

| Layer | Source | Frequency | Materials |
|---|---|---|---|
| Exchange futures | Yahoo Finance (unofficial endpoint) | Daily | 3 (aluminium, copper, platinum group metals), through 4 series |
| Benchmark prices | IMF Primary Commodity Price System, World Bank Pink Sheet | Monthly | 11, through 12 series |
| EU import volumes, origins and unit values | Eurostat Comext | Monthly | 34 (unit value series for 32) |
| Reference prices, including 17 rare earth elements | USGS Mineral Commodity Summaries | Annual | 31, through 54 series |
| World production and reserves by country | USGS Mineral Commodity Summaries | Annual | 29 |
| EU demand of modelled technologies, 2030 and 2050 | JRC foresight study 2023 (Zenodo, CC BY 4.0) | Static | 28 |
| Supply risk, economic importance, import reliance, recycling rate | European Commission, 2023 criticality study | Static | 34 (per element for 15 rare earths) |
| Strategic Projects by country | Commission decisions of 25 Mar 2025, 4 Jun 2025, 9 Oct 2026 | Updated by hand | 106 projects |
| Stage shares for magnet rare earths | IEA, Rare Earth Elements (2026, CC BY 4.0) | Static | Rare earths |

Only 11 materials have a market quotation. The other 23 have only EU import unit values and USGS annual averages, because the market prices of most minor metals are assessed by commercial agencies whose data cannot be republished. Free daily prices exist for three materials.

## Critical Raw Materials Act toolkit

Under `/crma/` the site offers tools for companies facing the Act (Regulation (EU) 2024/1252):

- **Obligations checker**: seven questions, then the articles likely to apply (8, 21, 24, 27, 28, 29, 31), what each requires and by when.
- **Supply chain risk assessment**: a workbook following Article 24 (mapping, risk factors, vulnerability rating, mitigation) that can be pre-filled with the monitor's public data and prints a report for the board. Entries stay in the visitor's browser and can be exported as JSON.
- **Permanent magnet requirements**: for one product, the label, data carrier and recycled content disclosure of Articles 28 and 29, with application dates.
- **Deadlines**: a table of the dates set by the regulation and a calendar file (`/crma/deadlines.ics`) with the company-facing ones.

All legal content lives in `src/i18n/crma.en.ts` and was written against the Official Journal text of 3 May 2024. Three things need upkeep:

1. **Secondary acts.** The dates for magnets depend on an implementing act (Article 28) and a delegated act (Article 29). Their adoption could not be confirmed when the toolkit was written. Once known, set `entryIntoForce` in the `acts` object at the top of that file and the tools compute the real dates.
2. **The pending amendment** (procedure 2025/0385(COD)). It is described as a proposal. When it is adopted, the texts for Articles 24, 28 and 29 must be revised.
3. **The rating method** of the risk workbook is a transparent starting point defined on the page, not a legal standard. The regulation leaves the assessment to the company.

The tools are a reading aid, not legal advice, and say so on every page.

## Languages

The site is published in English (at the root) and in French, German, Dutch and Spanish (under `/fr/`, `/de/`, `/nl/`, `/es/`). The interface text lives in `src/i18n/<lang>.ts` and the toolkit text in `src/i18n/crma.<lang>.ts`; both must have exactly the structure of the English files, which TypeScript enforces. Labels that come with the data (series names, customs product names, source names) are translated in `src/i18n/data-labels.<lang>.ts`, keyed by their English text, and fall back to English when missing. The material profiles are Markdown files in `src/content/materials/<lang>/` and fall back to English when a file is missing. Country names are localised from ISO codes, numbers and dates follow each language's conventions, and every page carries hreflang links.

The four translations were drafted with AI assistance from the official wording of Regulation (EU) 2024/1252 in each language and have not been reviewed by native-speaking domain experts. Have them reviewed before promoting the site in each language.

To change a text, edit the English file and update the four translations. To add a language, copy `en.ts` and `crma.en.ts`, translate them, register the language in `src/i18n/index.ts` and `astro.config.mjs`, and add its name to `LOCALE_NAMES`.

## Project layout

```
data/
  registry/materials.json   the 34 materials and the series, customs codes and USGS tables attached to each
  prices/                   one JSON file per price series, plus index.json
  trade/                    EU imports and exports per material (Eurostat)
  supply/                   world production and reserves per material (USGS)
  eu/criticality.json       2023 EU criticality assessment values, with notes on source conflicts
  eu/rare-earths.json       the same assessment per rare earth element, plus IEA stage figures
  demand/                   EU demand projections of the JRC foresight study
  projects/                 Strategic Projects under the Critical Raw Materials Act
  status.json               outcome of the last pipeline run, per source
pipeline/
  build_registry.py         edit this to change which series a material tracks
  update.py                 fetches every source and rewrites data/
src/
  content/materials/en/     the written profiles, one Markdown file per material
  i18n/en.ts                every interface string (one file per language)
  i18n/crma.en.ts           legal content of the CRMA toolkit (one file per language)
  lib/worldmap.ts           world geometry for the map, computed at build time
  lib/rareEarths.ts         element-level view of the rare earths
  views/                    page templates, language-independent
  pages/                    thin routes that call the views with a language
  components/, scripts/     charts and tables
.github/workflows/update-and-deploy.yml
```

## One-time setup on GitHub

1. The scheduled job and the Pages deployment run from the repository's default branch, whatever its name. Renaming it to `main` is optional.
2. In **Settings > Pages**, set **Source** to **GitHub Actions**.
3. In **Actions**, run the workflow **Update data and deploy** once by hand. Later runs happen every day at 05:17 UTC and on every push to the default branch.
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

- Demand figures cover only the eleven technologies modelled by the JRC. They are not total EU demand, 2050 values leave out information and communication technologies, and the growth multiples are computed by this site. The Commission must publish official consumption projections by 24 November 2026 (Article 44 of the Act), which should replace them.
- Strategic Projects are shown by country because the official lists give no project locations. The list in `data/projects/` is updated by hand when the Commission adopts a new decision.
- The IEA figures on the rare earths page are reused under CC BY 4.0, which requires the credit line and the derived-work disclaimer shown on that page. Keep them if you edit it.

- The daily futures layer uses an unofficial Yahoo Finance endpoint. It is delayed, it can stop working without notice, and Yahoo's terms do not grant redistribution rights. It is displayed as an indication, with attribution. To switch it off, remove the `yahoo(...)` entries from the registry and delete the matching files in `data/prices/`.
- The EU import unit value is customs value divided by net mass for one customs code per material, summed over three months. It is a trade indicator, not a market price, and it is volatile for materials traded in a few tonnes per year.
- The 65% line on import charts refers to the diversification benchmark of the Critical Raw Materials Act, which legally applies to EU consumption of strategic raw materials at each processing stage. The import share of one customs code is only a proxy.
- The criticality scores reflect supply patterns of 2016 to 2020. The 2023 study contradicts itself in places. The file `data/eu/criticality.json` lists every conflict found and leaves a value empty where it could not be settled.
- The written profiles are drafts prepared with AI assistance and describe events up to 2025. They should be reviewed by a subject expert before the site is promoted.

## Licences of the data

Eurostat and European Commission data: reuse authorised with attribution (CC BY 4.0). World Bank: CC BY 4.0. USGS: public domain. IMF: reuse with attribution under the IMF data terms. Yahoo Finance: see the caveat above.
