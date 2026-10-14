# Plan: dimension bar chart and burst timeline

Follow-on work to the two-panel daily chart already shipped in `dist/index.html` and `dist/app.js`.
Figures below are from `dist/data.json` generated 2026-10-13T17:11:39Z (19 observed days, 89,662 requests).

Companion document: `DASHBOARD-REVIEW.md`.

## Scope

Two additions, planned together because they share groundwork:

- **Part A, dimension bar chart.** A top-N horizontal bar chart above a dimension table. Built once,
  wired into six tables.
- **Part B, burst timeline.** An IP-by-day heatmap plus an hour-of-day histogram for the
  potential-abuse view, which today has no time dimension at all.

Both follow the established rule: the chart answers the question at a glance, the table underneath
keeps every row, and nothing is reachable only by hovering.

## Shared groundwork

### Already in `dist/app.js` and reusable as-is

| Piece | Use |
| --- | --- |
| `svgEl(name, attrs)` | namespaced element creation |
| `niceScale(max, tickCount)` | rounded axis ticks |
| `columnPath(x, y, w, h, r)` | bar/column with a rounded data-end, square baseline |
| `VB_W`, `CHART_ML`, `CHART_MR`, `CHART_PLOT_W`, `BAR_MAX`, `BAR_RADIUS` | chart geometry constants |
| `numberFormat`, `percentFormat`, `oneDecimalFormat`, `formatShare` | number formatting |
| `applyFilter(rows)`, `visibleRows(name)` | filter and sort state |
| `TABLES`, `renderTable`, `exportCsv`, `setupExportButtons`, `setupSorting` | the table layer |

### Already in `dist/index.html` and reusable as-is

`.chart`, `.plot-scroll`, `.plot-inner`, `.panel`, `.panel-head`, `.legend`, `.key-*`, `.tick-text`,
`.axis-title`, `.grid-line`, `.baseline-rule`, `.direct-label`, `.crosshair`, `.chart-tooltip`,
`.tip-date`, `.tip-row`, `.tip-name`, `.tip-value`, `.tip-flag`, `.chart-empty`, `.visually-hidden`.

Tokens: `--accent`, `--chart-ips`, `--chart-average`, `--grid`, `--band`, `--line`, `--muted`, `--ink`.

### Refactor needed first

`setupChartInteraction()` is currently bound to `#daily-chart` and reads `state.chart`. Both new charts
need the same tooltip behaviour, so generalise it before building either:

```js
// Returns { show, hide }. Caller supplies hit-testing and row content.
function attachChartTooltip(chartId, { getItems, indexFromPointer, buildRows, describe })
```

- Keep the existing contract: `textContent` only (never `innerHTML`), tooltip clamped inside the
  container, `aria-live` readout, pointer plus `ArrowLeft`/`ArrowRight`/`Home`/`End`/`Escape`.
- `state.chart` becomes `state.charts = { trend: {...}, paths: {...}, bursts: {...} }`.
- Port the trend chart onto it in the same change, so there is only one tooltip implementation.

Estimated at roughly 60 lines moved and about 20 added. Do this as its own commit, with the trend chart
re-verified, before starting Part A.

## Part A: dimension bar chart

### The problem

`Requests by path` is 634 rows of table. 25 paths account for 80% of traffic and the top three account
for 65%, but the in-table meter bars are 4rem wide and understate that completely.

### Data shape

Every dimension table is already `{ <label field>, count }`, which is why one component covers all of them.

Top 20 paths, which is what the adaptive `topN` rule below yields for this table, with the rollup:

| Rank | Path | Requests | Share |
| --- | --- | --- | --- |
| 1 | `/app/MicrosoftEdgeWebView2Runtime` | 24,379 | 27.2% |
| 2 | `/app/MicrosoftEdge` | 23,929 | 26.7% |
| 3 | `/app/MicrosoftVisualStudioCode` | 10,077 | 11.2% |
| 4 | `/app/GoogleChrome` | 1,408 | 1.6% |
| 5 | `/app/7zip` | 1,094 | 1.2% |
| 6 | `/app/MozillaFirefox` | 1,090 | 1.2% |
| 7 | `/app/NodeJs` | 776 | 0.9% |
| 8 | `/app/VideoLanVlcPlayer` | 725 | 0.8% |
| 9 | `/app/MicrosoftTeams` | 693 | 0.8% |
| 10 | `/apps` | 643 | 0.7% |
| 11 | `/app/NotepadPlusPlus` | 620 | 0.7% |
| 12 | `/app/MicrosoftPowerToys` | 575 | 0.6% |
| 13 | `/app/MozillaThunderbird` | 564 | 0.6% |
| 14 | `/app/LibreOffice` | 520 | 0.6% |
| 15 | `/app/MicrosoftAzureStorageExplorer` | 517 | 0.6% |
| 16 | `/app/AdobeAcrobatReaderDC` | 516 | 0.6% |
| 17 | `/app/MicrosoftOneDrive` | 502 | 0.6% |
| 18 | `/app/Python` | 501 | 0.6% |
| 19 | `/app/Wireshark` | 490 | 0.5% |
| 20 | `/app/Postman` | 424 | 0.5% |
| | **All other paths (614)** | **19,619** | **21.9%** |

Longest path label is 52 characters, which sets the label gutter.

### Design

Horizontal bars, not columns: the category names are long, and horizontal bars give the label a full
line without rotation.

- One series, so one colour for every bar: `--accent`. Do **not** ramp the colour by value. That would
  double-encode bar length as hue and burn the only free channel on information the chart already shows.
- Sorted descending, which is the dimension tables' natural order already.
- Bar height capped at 24px with the band's leftover left as air; a 2px surface gap between neighbours.
- 4px rounded data-end, square at the baseline, matching the trend columns.
- The rollup bar (`All other paths (619)`) is drawn in `--muted` at a lower weight so it reads as
  context rather than a competing category, and is always last regardless of its size.
- Value direct-labelled at the bar tip. At up to 21 bars this stays readable; if the tip label would
  overflow the plot, move it inside the bar end.
- Hairline vertical gridlines from `niceScale`, no vertical axis rule.
- Subtitle readout computed from the data, not hardcoded: "25 of 634 paths account for 80% of requests".

### Adaptive `topN` (decided)

`topN` adapts per table rather than sitting at a fixed 15. The rule is derived, not hand-tuned:

> **`topN` = the number of rows needed to reach 80% of requests, clamped to the range 8 to 20.**

This makes the chart self-describing. The bars are, as closely as the clamp allows, the 80%, which is
exactly what the readout underneath claims. The clamp stops a long-tailed table from producing a
40-bar chart and stops a highly concentrated one from producing a 3-bar chart that should have been a
stat tile.

Computed against the current data:

| Table | Rows | Rows for 80% | `topN` | Bars cover | Rollup |
| --- | --- | --- | --- | --- | --- |
| `paths` | 634 | 25 | **20** (clamped) | 78.1% | 614 paths, 21.9% |
| `locations` grouped to country | 37 | 4 | **8** (clamped) | 94.5% | 29 countries, 5.5% |
| `organizations` | 383 | 23 | **20** (clamped) | 78.6% | 363 orgs, 16.6% |
| `userAgents` | 2,442 | 7 | **8** (clamped) | 84.5% | 2,434 agents, 15.5% |
| `clientFamilies` | 2,377 | 7 | **8** (clamped) | 84.6% | 2,369 families, 15.4% |
| `connectingIps` | 2,667 | 211 | n/a | n/a | **not a bar chart** |

`topN` is recomputed on every render, so it tracks the filtered set rather than being frozen at
load. The clamp bounds live beside the `chart` descriptor as `minBars: 8, maxBars: 20` so a single
table can override them without forking the component.

**Denominator caveat.** `organizations` sums to 85,337, which is 95.2% of all requests, because it
only covers repeat IPs. The share column uses the grand total everywhere in this dashboard, so keep
that denominator for consistency, but guard the `topN` calculation: if a table's own sum never reaches
80% of the grand total, fall back to 80% of that table's own sum and word the readout as
"80% of the requests this table covers". With the current data every charted table reaches the
threshold, so the fallback is defensive only.

### Reuse across the other dimension tables

The same component serves five tables, and one it must not serve:

`connectingIps` is the exception and must not get one. Even at the clamp ceiling its top 20 covers only 48.6% of traffic and it
takes 211 IPs to reach 80%, so a 15-bar chart would misrepresent the distribution as concentrated when
it is not. That table gets a **cumulative concentration curve** instead (share of requests against
ranked IPs, with the 80% threshold marked). Planned as a separate, later item.

`locations` needs a grouping step: its rows are country plus region pairs, so aggregate to 37 countries
before charting and leave the region detail to the table.

Note that `userAgents` and `clientFamilies` will chart cleanly but remain misleading for a different
reason: 2,293 of 2,442 user agents are `sc<hex>/Sweden` per-device identifiers worth 3.7% of traffic.
The bar chart will quietly hide that because the largest such agent has 6 requests against 2,424 for the eighth-ranked agent, so none of them come close to the 8 bars those tables get. Fixing the family
grouping (`DASHBOARD-REVIEW.md`, priority 4) should land before or alongside charting those two.

### Implementation steps

1. Add to `TABLES[name]` an optional `chart` descriptor:
   `{ labelKey, rollupLabel, minBars: 8, maxBars: 20 }`. No fixed `topN`; it is derived.
2. `renderDimensionChart(name)`:
   - read `visibleRows(name)` but re-sort by count descending, so a user sorting the table
     alphabetically does not scramble the ranking (same rule the trend chart already follows for time);
   - walk the sorted rows accumulating counts to find the 80% crossing, then clamp to
     `[minBars, maxBars]` to get `topN`;
   - slice `topN`, sum the remainder into one rollup entry, skip the rollup when the remainder is zero;
   - compute the "N of M rows account for 80%" readout from the full filtered set, not the slice, and
     report the true crossing point even when the clamp cut the bar count short (paths: 20 bars shown,
     readout still says 25 paths reach 80%).
3. Markup per section, mirroring the trend panel: `.chart` wrapper, `.plot-scroll` / `.plot-inner`,
   one `<svg>`, `.chart-empty`, `.chart-tooltip`, then the existing `<figure data-table="...">`.
4. Call `renderDimensionChart` from `render()` for each table that declares a `chart` descriptor.
5. Attach the shared tooltip: each bar is its own hit target, minimum 24px tall including the gap,
   showing label, requests and share.

### Edge cases

- Filter matches fewer than `minBars` rows: chart only what matches, suppress the rollup, keep the
  readout honest. Do not pad to `minBars`.
- Filter narrows the set so the 80% crossing moves: `topN` shrinks or grows with it on the same render.
  This is intended, but it means bar count is not stable across filter states, so never cache it.
- Filter matches nothing: `.chart-empty` shown, table shows "No matching data" (already handled).
- A single row: still a bar chart, not a stat tile, because it sits above a table and the filter can
  return to many rows. Suppress the rollup.
- Ties at the topN boundary: stable sort, document that the cut is arbitrary between equal counts.
- Long labels: truncate with an ellipsis in the SVG, full value in the `title`, tooltip and table.

### Acceptance checks

- Chart ranking is unaffected by table sort direction.
- Bars plus rollup sum to exactly the filtered total for that table, which for an empty filter is
  89,662 on `paths` and 85,337 on `organizations`.
- `topN` matches the rule: 20 for `paths`, 8 for `locations`, 20 for `organizations`, 8 for
  `userAgents`, 8 for `clientFamilies`.
- Readout reports the true 80% crossing, not the clamped bar count (25 for paths, not 20).
- Every bar value also present in the table and in CSV export.
- No page-level horizontal overflow at 375px; plot scrolls inside `.plot-scroll`.

## Part B: burst timeline

### The problem

`High-volume request windows` shows 308 flagged records grouped by IP in `<details>` blocks. The
grouping is good; what is missing is time. You cannot tell "one bad afternoon" from "every morning at
06:00", which is the only question that matters for triage.

### What the data already says

308 records, 22 IPs, 5,232 requests, 2026-09-25 to 2026-10-13. Threshold is 10 or more requests in a
15-minute window.

Concentration is extreme:

| IP | Requests | Windows | Days | Distinct hours | Paths | Peak | Organization |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 192.44.242.20 | 3,765 | 204 | 16 | 5 | 2 | 34 | Region Stockholm |
| 84.17.209.149 | 678 | 41 | 17 | 6 | 1 | 77 | Unknown |
| 91.215.94.90 | 220 | 16 | 5 | 7 | 2 | 26 | Advania Sverige AB |
| 86.7.12.138 | 203 | 15 | 6 | 6 | 3 | 30 | Virgin Media Limited |
| 81.94.170.230 | 101 | 9 | 7 | 7 | 1 | 13 | Visolit 99 Customers |

The top two IPs are 85% of all flagged requests. **13 of the 22 IPs have exactly one flagged window on
one day against one path**, which is a threshold graze, not a pattern.

The hour-of-day distribution is the finding the current UI cannot show at all:

| Hour (UTC) | 05 | 06 | 07 | 23 | 11 | all others |
| --- | --- | --- | --- | --- | --- | --- |
| Records | 33 | 120 | 72 | 17 | 18 | 48 |

**225 of 308 flagged windows (73%), carrying 4,066 of 5,232 requests, fall between 05:00 and 07:59 UTC.**
That is a scheduled-job signature, consistent with overnight update checks, not with abuse. The chart
should make this visible so the section stops implying that 308 records means 308 problems. This is an
indicator, not proof, and the existing "not proof of abuse" notice stays.

### Design

Two small charts stacked in one card, sharing the card's tooltip but not an axis.

**B1. Swimlane heatmap, one row per IP, one column per day.**

Granularity is **day**, decided. The hour question is answered by B2 rather than by a 456-column
hour-granularity strip, which would need horizontal scrolling on every screen size and would make the
per-IP daily pattern harder to read, not easier.

- 22 rows by 19 days = 418 cells, of which 70 are occupied. Sparse, so empty cells are simply absent
  and the pattern reads immediately.
- Day buckets stay **UTC**, matching the trend chart, the axis labels and the rest of the dashboard.
  The local-time toggle in B2 does not apply here: re-bucketing days by viewer timezone would shift
  cells between columns and desynchronise the swimlane from the trend chart above it.
- Cell fill is a **sequential single-hue ramp** derived from `--accent` (magnitude, so one hue
  light to dark, never a rainbow and never a categorical palette).
- Rows ordered by total flagged requests descending, so the two dominant IPs sit at the top.
- Row label is the IP with the organization beneath it in `--muted`, truncated with the full value
  in the tooltip.
- Weekend columns carry the same `--band` wash as the trend chart, for consistency.
- A scale legend is mandatory, because this is colour-on-a-continuous-scale. The table view is the
  accessible twin.

Proposed bins, chosen against the actual distribution of the 70 occupied cells (min 10, max 368,
median 21):

| Bin | Requests in that IP-day | Cells | Hex | OKLCH L |
| --- | --- | --- | --- | --- |
| 1 | 10 to 24 | 40 (57%) | `#93d4bd` | 0.820 |
| 2 | 25 to 59 | 10 (14%) | `#3fae89` | 0.678 |
| 3 | 60 to 149 | 8 (11%) | `#0b7a58` | 0.515 |
| 4 | 150 or more | 12 (17%) | `#06513a` | 0.387 |

Lightness is strictly decreasing, which is the correct check for a sequential ramp (the categorical
validator is the wrong tool here and will fail a good ramp by design). Four bins stays well under the
seven-class ceiling. A fifth, near-white step was tested and rejected: at `#d7eee4` it is only 1.22:1
against the white surface, so a lowest-bin cell would be indistinguishable from an empty one. Any
label placed inside a cell takes ink on bins 1 and 2, white on bins 3 and 4.

Cells carry no inline values. 70 numbers on a grid is the "number on every data point" anti-pattern;
the tooltip and the table carry them.

**B2. Hour-of-day histogram, 24 columns, all IPs combined, with a UTC / local toggle.**

- Single series in `--accent`, same column spec as the trend chart.
- Direct-label the peak column only.
- One-line readout beneath, computed not hardcoded, naming the three-hour window that carries the most
  records: "73% of flagged windows fall between 05:00 and 07:59 UTC, which is consistent with
  scheduled update checks."
- Axis title states the active zone explicitly, for example `HOUR OF DAY (UTC)`.

**The toggle.** Two buttons, UTC and Local, sitting in the panel head beside the chart title.

- This is a **display-unit control, not a data filter**, so it belongs on the chart rather than in the
  dashboard's single filter row. It changes how one chart buckets its x axis; it does not scope any
  data, and no other chart, stat or table reacts to it. Keeping it out of the global filter row is
  deliberate and should be noted in the code so it is not "fixed" later.
- Default is **UTC**, matching the rest of the dashboard. Session-only state on `state.burstHourZone`;
  no `localStorage`, which the dashboard does not currently use anywhere.
- Implement with `Intl.DateTimeFormat(undefined, { hour: 'numeric', hour12: false })` per record, or
  equivalent, and **re-bucket every record from its own timestamp**. Do not rotate the 24 bins by a
  fixed offset. Burst windows start on `:00`, `:15`, `:30` and `:45` boundaries, so under a
  half-hour-offset zone a `06:45` window lands in hour 12 while `06:15` lands in hour 11. A bin
  rotation would silently misplace them.
- The readout recomputes in the active zone, including the window it names, so it can never contradict
  the bars above it.
- The direct-labelled peak recomputes too; under some zones the distribution straddles midnight and the
  peak column moves.

**Caveat worth surfacing in the UI.** "Local" means the *viewer's* timezone, which is not necessarily
the timezone of the traffic. 48.6% of requests come from Sweden, so for most of this data the
interpretive question is "is this an overnight job in Europe/Stockholm?", which a viewer in another
zone will not get from either setting. Add a one-line note beside the toggle to that effect. If this
proves to be the common question, a third named-zone option is a small follow-on; do not build it
speculatively.

### Add the bursts table, keep the `<details>` list

**Decided: add `<figure data-table="bursts">`.** `TABLES.bursts` is already configured with six columns
(window, IP, path, organization, user agent, count) but `index.html` has no figure for it, so
`renderTable('bursts')` hits its `if (!figure) return` guard and does nothing, exactly as the trend
section did before the daily chart landed.

Adding it buys three things:

1. **The accessible twin the heatmap requires.** A sequential colour scale is a continuous encoding,
   and shipping one without a table view is the "color-only encoding" failure. The `<details>` list
   shows the same records but as 22 nested disclosure widgets, which is a poor substitute for a
   sortable grid when the question is "show me every window above 50 requests".
2. **Sorting the flat record set.** The `<details>` list is fixed at "grouped by IP, ranked by flagged
   requests". The table can be sorted by window, path, organization or count.
3. **Consistency.** Every other section pairs a chart with a `<figure>`; bursts becomes the last
   exception to close.

Order within the panel: notice, swimlane, hour histogram, `<details>` groups, table.

Both views stay. They answer different questions, and the `<details>` list remains the drill-down
target: clicking an IP row in the swimlane expands and scrolls to that IP's block, which costs only an
`id` per group plus a click handler.

Performance is a non-issue at 308 rows; this is two orders of magnitude below the 2,667-row
`connectingIps` table that already renders on load. CSV export already works and is unchanged.

### Implementation steps

1. `buildBurstGrid(rows)`: group to `{ ip, organization, total, byDay: Map<dayKey, requests> }`,
   sorted by total descending. Day axis comes from `state.data.trend` so the grid spans the full
   observed window even where an IP has no activity, rather than only the days that happen to appear
   in `bursts`.
2. `renderBurstSwimlane()` and `renderBurstHours()`, both reading `visibleRows('bursts')` so the
   existing filter scopes them like everything else.
3. Bin thresholds as a module constant, with the legend generated from the same constant so the two
   can never drift.
4. Add `<figure data-table="bursts">` to `index.html`, below the `<details>` list. No `app.js` change
   needed; `renderTable('bursts')` starts working the moment the element exists.
5. Add the UTC / local toggle to the histogram panel head, wired to `state.burstHourZone`, re-rendering
   only the histogram and its readout.
6. Call the chart renderers from `render()`, next to `renderBurstGroups()`.
7. Attach the shared tooltip: swimlane cell shows IP, date, requests, window count; histogram column
   shows hour, window count, total requests, in the active zone.

### Edge cases

- An IP active on a single day: one cell, row still full width. Expected and informative.
- Filter narrowing to one IP: swimlane collapses to one row; keep the day axis full width so the
  position of activity stays readable.
- More than about 40 IPs after a future data change: cap rows at 30 by total and add an
  "and N more IPs" footer row rather than letting the card grow without bound.
- All cells in one bin: legend still shows all four, with unused bins dimmed.
- `bursts` empty: hide both charts, keep the existing notice.

### Acceptance checks

- Swimlane cell totals per IP sum to that IP's total in the `<details>` block and in the new table.
- Grand total across all cells equals 5,232 for an unfiltered load.
- Histogram column counts sum to 308 records **in both zones**. Switching the toggle must move records
  between columns, never create or drop any.
- Under a half-hour-offset zone, a `06:45` UTC window appears in hour 12 and a `06:15` window in
  hour 11. Verify explicitly; this is the case a bin rotation would get wrong.
- The readout's named window and the direct-labelled peak both follow the active zone.
- Bins match the documented thresholds; legend generated from the same constant.
- Keyboard navigation reaches every cell and announces the same values as the tooltip.
- Clicking a swimlane row expands the matching `<details>` block.
- `figure[data-table="bursts"]` renders 308 rows, sorts on every column, and its CSV export is
  unchanged from today's output.

## Where the two overlap

| Concern | Shared treatment |
| --- | --- |
| Tooltip | one `attachChartTooltip` helper, built in the refactor step |
| Filter | both read `visibleRows(name)`; both re-sort to their own meaningful order |
| Empty state | `.chart-empty` plus the table's existing "No matching data" |
| Geometry | `VB_W`, `CHART_ML`, `CHART_MR`, `BAR_MAX`, `BAR_RADIUS` |
| Mobile | both inside `.plot-scroll` / `.plot-inner` with a 660px floor |
| Colour | Part A is one flat `--accent`; Part B is a sequential ramp from the same hue. Neither uses `--warning`, which stays reserved for status |
| Table pairing | chart above, full table below, same filter, nothing hover-only. After this work every section has a `<figure>` |
| Time zone | everything buckets in UTC except the B2 hour histogram, which offers an explicit toggle |

## Build order

1. **Refactor the tooltip** into `attachChartTooltip` and port the trend chart onto it. No visible change;
   re-verify the trend chart.
2. **Part A on `paths` only.** Proves the component against the hardest labels (52 characters) and the
   clearest rollup case.
3. **Part A wired into `organizations` and `locations`** (with country grouping). Mechanical once step 2 lands.
4. **Add `<figure data-table="bursts">`.** A one-line HTML change with no `app.js` work, and it gives
   B1 its accessible twin before B1 needs it. Do it first within Part B.
5. **Part B2, the hour-of-day histogram, with the UTC / local toggle.** Small, self-contained, and
   carries the largest single insight in the dataset.
6. **Part B1, the swimlane.** The biggest piece; benefits from the tooltip and bin work already done.
7. **Part A on `userAgents` and `clientFamilies`**, after the family grouping fix, so the chart is not
   built on a broken aggregation.
8. **`connectingIps` concentration curve**, as its own design task.

Steps 2, 4 and 5 are independent of each other and could run in parallel. Everything else is
sequential on step 1.

## Decisions made

All four open questions are now settled and folded into the sections above.

| Question | Decision | Where it lands |
| --- | --- | --- |
| Swimlane granularity | **Day** (19 columns), UTC buckets. The hour question is B2's job | Part B, B1 |
| `topN` | **Adapts per table**: rows to reach 80%, clamped to 8 to 20. Yields 20 / 8 / 20 / 8 / 8 | Part A, "Adaptive `topN`" |
| `<figure data-table="bursts">` | **Add it**, below the `<details>` list, which stays | Part B, "Add the bursts table" |
| Hour histogram time zone | **UTC default with a local toggle**, re-bucketing per record | Part B, B2 |

### Consequences worth tracking

- Adaptive `topN` means the bar count changes with the filter. Intended, but it is the one place where
  the chart's shape is not stable across renders, so it must never be cached.
- The local-time toggle is the dashboard's first display-unit control. It is deliberately not in the
  global filter row, and that distinction should be commented in the source.
- "Local" is the viewer's zone, not the traffic's. With 48.6% of requests from Sweden this may not be
  the comparison a reader actually wants; the UI note covers it, and a named-zone option stays
  unbuilt until there is a reason for it.
- With the bursts figure added, every section of the dashboard pairs a chart or grouped view with a
  full `<figure>` table. That invariant is worth stating in the code so future sections inherit it.
