# Dashboard review and recommendations

Reviewed against `dist/data.json` generated 2026-10-13T17:11:39Z.

## What the current data actually contains

| Property | Value |
| --- | --- |
| Requested lookback | 30 days |
| Observed days | 19 (2026-09-25 to 2026-10-13) |
| Last day | partial (cut at 17:11 UTC, ~72% of a day) |
| Total requests | 89,662 |
| Unique connecting IPs | 2,906 |
| Rows across all tables | ~9,100 |
| `data.json` size | 807 KB raw, 521 KB minified, ~75 KB gzipped |

Every table reconciles to 89,662 (`paths`, `locations`, `userAgents` and `trend` all sum exactly to the
summary total), so the aggregates themselves are sound. The problems are in how the partial window is
interpreted and how the data is presented.

## Priority 1: the partial window is silently producing a wrong answer

This matters more than any visual change, because the dashboard currently states something confidently
untrue.

### Trending paths is comparing 3.7 days against 15 days

`build.mjs` splits the window at `NOW() - INTERVAL halfLookbackDays DAY`, where `halfLookbackDays` is
derived from the *requested* 30 days, not the *observed* 19. The split lands at 2026-09-28T17:11Z:

- Earlier period: 2026-09-25 to 2026-09-28 17:11 = **3.72 days**, 17,892 requests
- Recent period: 2026-09-28 17:11 to 2026-10-13 17:11 = **15.00 days**, 71,770 requests

The dashboard renders this as **+301% growth**. Normalised per day it is 4,809/day versus 4,785/day,
which is **flat to within 0.5%**. Every single path in the table inherits the same ~4x inflation. The
top row, `/app/MicrosoftEdge`, shows "+14,343 (+299%)" when its real per-day rate barely moved.

The existing guard in `app.js` (`trending-unavailable`) only fires when one half is entirely zero, so it
does not catch this case at all.

Recommended fix, in `build.mjs`:

1. Query the observed data span first (`SELECT MIN(timestamp), MAX(timestamp)`), then derive the split
   from the observed span rather than `lookbackDays`.
2. Emit `earlierDays` and `recentDays` alongside the counts so the UI can normalise.
3. Have the UI compare **requests per day**, not raw totals, and label the section
   "Last 7 days vs previous 7 days" (or whatever the real split is) instead of the vague
   "first and second half of the lookback window".
4. Keep the raw counts as additional columns so no detail is lost.

### The in-progress day distorts the right edge of every trend

2026-10-13 shows 3,644 requests against a Tuesday average of ~5,100, purely because collection stopped
at 17:11 UTC. The chart labels it "in progress" in text but still draws the bar at full height against
complete days, so the trend always appears to be collapsing. Either plot the partial day with a distinct
hatched or outlined style, or extrapolate it and show the estimate separately. Do not let it sit in the
same visual channel as a complete day.

### Coverage deserves more than grey text

"requested last 30 days" buried in the `#meta` line is too quiet for a window that is 63% complete.
Promote it: a fifth stat tile reading "19 of 30 days observed", or a short banner above the stat strip.
It also needs to propagate - any "share of all requests" figure is a share of a partial window.

## Priority 2: the daily chart is the weakest visual on the page

The current `#daily-chart` renders 19 vertically stacked rows, each with two horizontal bars on
**separate scales**. Three problems compound:

- Separate scales mean the two series cannot be compared at all. The legend has to say so out loud
  ("Separate scales per series"), which is a tell that the chart is not doing its job.
- Horizontal bars in a vertical list read as a table with decoration, not as a time series.
- There is no axis, no gridline and no absolute anchor, so a bar's length is meaningless on its own.

The cost of this is concrete. The data has strong weekly seasonality that the chart makes invisible:

| | Average requests/day |
| --- | --- |
| Weekdays | 5,728 |
| Weekends | 2,533 (-56%) |

Every Saturday and Sunday in the window drops to roughly 40% of weekday volume. That is the single most
legible pattern in the dataset and the current rendering hides it completely.

Replace it with a conventional left-to-right time series in inline SVG:

- X axis of calendar days, weekends lightly shaded so the rhythm is self-evident.
- Requests as a column series, on its own panel and its own Y axis.
- Unique IPs as a line on a **second panel stacked beneath it**, sharing the same X axis.
- A 7-day moving average line over requests to separate trend from the weekly cycle.
- Hover readout giving exact values for both measures at once, and the partial final day drawn
  distinctly and excluded from the moving average.

Correcting an earlier draft of this document: it suggested putting unique IPs on a right-hand second
Y axis. That would be a dual-axis chart, and the alignment between two independent scales is arbitrary,
so the chart invents a correlation that is not in the data. Two stacked panels sharing one time axis
give the same density, cost no extra vertical space worth mentioning, and remove the problem entirely.
It also fixes the honest-but-awkward "Separate scales per series" disclaimer in the current legend -
with two panels there is nothing to disclaim.

No library is needed. Nineteen to thirty points of inline SVG is well under 200 lines and keeps the
zero-dependency, single-static-file deployment intact.

A working prototype against the live `data.json` is at `prototype/daily-chart.html`.

## Priority 3: add a chart layer above each table, keep every table

The detail in the tables is genuinely useful and should stay exactly as it is, including sorting,
filtering and CSV export. The fix is a consistent "summary on top, detail underneath" pattern: each
section gets a compact visual that answers the question at a glance, with the full table immediately
below it, driven by the same filter state and the same `visibleRows()` call so the two can never
disagree.

Concretely, per section:

**Requests by path.** 25 paths out of 634 account for 80% of all traffic. Show a horizontal bar chart of
the top 15 with an explicit "all other paths (619)" rollup bar, then the 634-row table. The top three
(`MicrosoftEdgeWebView2Runtime` 24,379, `MicrosoftEdge` 23,929, `MicrosoftVisualStudioCode` 10,077) are
65% of traffic on their own, which the table's tiny meter bars understate.

**Country and region.** 37 countries, with Sweden at 49% of all traffic. A choropleth world map, or if
that is too much machinery, a simple ranked country bar chart with regions expandable underneath. Note
that `blob4` (city) is already written by the Worker's `logToAnalyticsEngine` but is never queried in
`build.mjs` and never surfaced. That is free detail sitting unused, and city-level data is what makes a
map worth having.

**Requests by connecting IP.** 2,667 rows is not a thing anyone reads. 211 IPs account for 80% of
traffic, and a further 239 IPs made exactly one request. Lead with a concentration curve (cumulative
share of requests against ranked IPs) plus a one-line readout of the 80% threshold, then the table.

**High-volume request windows.** The grouped `<details>` treatment here is already the best thing on the
page. What is missing is time: 308 flagged records from 22 IPs spread across 19 days. A swimlane
timeline, one row per IP, dots or blocks positioned by `windowStart` and sized by count, would instantly
separate "one bad afternoon" from "every day at 11:00". The data is already in `data.json`.

**IPs requesting many distinct paths.** The top two IPs (`194.206.254.8` with 575 distinct paths over
1,144 requests, `108.17.114.76` with 570 over 2,396) are an order of magnitude above the third
(`13.81.84.251`, 72 paths). A scatter plot of distinct paths against total requests would make those two
outliers unmissable, and the diagonal would separate "broad and shallow" scanning from "narrow and
heavy" polling.

**Daily traffic trend.** Covered above. Note that this is the one section with *no* table at all:
`TABLES.trend` is fully configured in `app.js` and `setupExportButtons()` attaches a working CSV button
to its heading, but `index.html` contains no `<figure data-table="trend">`, so `renderTable('trend')`
hits its `if (!figure) return` guard and silently does nothing. Adding the figure element is a one-line
fix and it is the clearest example of the chart-plus-table pattern.

## Priority 4: the user agent tables are 94% noise

This is a data quality finding rather than a presentation one, but it is why two of the ten tables are
near-useless.

Of 2,442 distinct user agents, **2,293 match the pattern `sc<hex>/Sweden`** - per-device identifiers from
what appears to be a single customer. Together they account for 3,336 requests, **3.7% of traffic**.
1,546 user agents made exactly one request.

The `clientFamilies` query groups on the text *before* the first `/`, which for this scheme produces a
unique family per device. The result: 2,377 families from 2,442 user agents, with only **17 families
having more than one variant**. The grouping is doing essentially nothing.

Grouping on the suffix instead is dramatically more informative:

| Suffix | Requests |
| --- | --- |
| `Sweden` | 47,540 |
| `1.0` | 20,991 |
| `IntuneDeploy` | 9,510 |
| `1.0 (Intune app deployer)` | 2,424 |
| `1.0 (self-hosted)` | 1,145 |

Recommended approach: keep the prefix grouping, but detect the high-cardinality case - where many
distinct prefixes share one suffix and each has a trivial request count - and collapse those into a
single row such as `sc*/Sweden (2,293 device identifiers, 3,336 requests)`. The individual device IDs
stay available via the table and CSV export, but they stop drowning the top of the list. A "collapse
single-request agents" toggle would achieve most of the benefit with far less logic.

## Priority 5: payload and render cost

- `build.mjs` writes with `JSON.stringify(output, null, 2)`. The indentation costs 286 KB for a file no
  human reads. Dropping it takes 807 KB to 521 KB. Gzipped the difference is small (78 KB to 74 KB), but
  the browser still parses the full uncompressed text.
- `render()` builds **all ten tables on load**, including those behind hidden tabs. That is roughly 9,100
  table rows of DOM, with the 2,667-row IP table and 2,442-row user agent table constructed before
  anything is visible. Render each table lazily on first tab activation, and re-render only the active
  table on filter input. The filter currently triggers a full ten-table rebuild on every keystroke.
- Consider splitting `data.json` into a small core payload (summary, trend, top-N of each dimension) that
  loads immediately, plus per-section detail files fetched on tab activation. `connectingIps` (138 KB),
  `clientFamilies` (108 KB) and `userAgents` (101 KB) are 43% of the file and most visits will never
  open them.

## Smaller items

- `app.js` reads `data.trendingPaths || data.trending`, but `build.mjs` only ever emits `trending`. The
  `trendingPaths` branch is dead; pick one name.
- The "IPs with one request" tile is computed as `uniqueConnectingIps - connectingIps.length`, which is
  correct but indirect, and it is the least actionable of the four tiles. Candidates with more signal:
  requests per day (normalised), the number of paths covering 80% of traffic, or weekday-versus-weekend
  ratio.
- Shares are always "share of all requests", which is the right denominator but means the locations table
  cannot show "share within country". Worth a per-table denominator option.
- There is no time dimension on any individual path, IP or client. The only time-bucketed queries are
  `trend` (global) and `bursts`. A per-top-path daily series would enable sparklines in the paths table,
  which is the cheapest possible way to add a visual without touching the layout at all.

## Suggested order of work

1. Fix the trending split and normalise to requests/day. The dashboard is currently wrong.
   **Still outstanding - this is the highest-value remaining item.**
2. Make the partial window and partial last day explicit in the UI.
   **Done for the daily chart** (outlined column, "partial" axis note, excluded from the 7-day
   average and the weekday/weekend means). The 19-of-30-days coverage figure is still only in the
   small grey `#meta` line.
3. Replace the daily bar list with a real SVG time series including weekend shading. **Done.**
4. Add the chart-above-table pattern to paths, locations and connecting IPs.
   **Pattern established on the trend section**; not yet applied to the other sections.
5. Fix the client family grouping. Still outstanding.
6. Add the burst timeline and path-diversity scatter. Still outstanding.
7. Minify `data.json` and make table rendering lazy. Still outstanding.

### What landed in the dashboard

`dist/index.html` and `dist/app.js` now carry the two-panel daily chart:

- `renderDailyChart()` draws requests as columns with a 7-day average line, and unique IPs as a
  line on a second panel sharing the same time axis. The old `.daily-bars` markup and CSS are gone.
- `enrichTrend()` adds `weekdayName`, `isWeekend`, `isPartial`, `average` and `requestsPerIp` to each
  trend row, so the chart, the table and the CSV export all read the same derived values.
- `TABLES.trend` gained Weekday, 7-day average and Requests per IP columns, and `index.html` now has
  the `<figure data-table="trend">` it was missing, so the trend table renders for the first time.
- A new `decimal` column type, and `count`/`decimal` cells render an em dash (and export as empty)
  when the value is null, rather than a misleading zero.
- The chart re-renders with the filter like every other section, but always draws chronologically,
  so sorting the table by requests cannot reorder time.
- Series colors are `--accent` `#087f5b` for requests and a new `--chart-ips` `#2a78d6`, validated
  for lightness, chroma, colour-vision separation and contrast. The chart deliberately does not
  reuse `--warning` `#a44318` for unique IPs the way the old bar list did, because that token
  carries status meaning elsewhere in the page.
