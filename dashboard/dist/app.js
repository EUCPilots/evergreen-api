const state = {
  data: null,
  filter: '',
  sort: {},
  charts: {
    trend: { days: [], panels: [] },
    paths: { items: [] },
    locations: { items: [] },
    organizations: { items: [] },
    bursts: { items: [], heatmapItems: [], hourItems: [], groups: [] }
  },
  burstHourZone: 'UTC'
}

const numberFormat = new Intl.NumberFormat()
const percentFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })
const oneDecimalFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const utcDateFormat = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })
const chartDayFormat = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' })
const chartFullDayFormat = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })

function formatShare(share) {
  return share > 0 && share < 0.001 ? '<0.1%' : percentFormat.format(share)
}

const TABLES = {
  paths: {
    file: 'requests-by-path',
    chart: { labelKey: 'path', rollupLabel: 'All other paths', minBars: 8, maxBars: 20 },
    columns: [
      { key: 'path', label: 'Path' },
      { key: 'count', label: 'Share of all requests', type: 'share', width: '13rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  connectingIps: {
    file: 'requests-by-connecting-ip',
    columns: [
      { key: 'connectingIp', label: 'Connecting IP' },
      { key: 'count', label: 'Share of all requests', type: 'share', width: '13rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  locations: {
    file: 'country-and-region',
    chart: { labelKey: 'country', rollupLabel: 'All other countries', minBars: 8, maxBars: 20 },
    columns: [
      { key: 'country', label: 'Country', fallback: 'Unknown', width: '11rem' },
      { key: 'region', label: 'Region', fallback: 'Unknown' },
      { key: 'count', label: 'Share of all requests', type: 'share', width: '13rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  organizations: {
    file: 'network-organizations',
    chart: { labelKey: 'asOrganization', rollupLabel: 'All other organizations', minBars: 8, maxBars: 20 },
    columns: [
      { key: 'asOrganization', label: 'AS organization' },
      { key: 'count', label: 'Share of all requests', type: 'share', width: '13rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  userAgents: {
    file: 'user-agents',
    columns: [
      { key: 'userAgent', label: 'User agent' },
      { key: 'count', label: 'Share of all requests', type: 'share', width: '13rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  bursts: {
    file: 'high-volume-request-windows',
    columns: [
      { key: 'windowStart', label: 'Window (UTC)', type: 'timestamp', width: '12rem' },
      { key: 'connectingIp', label: 'Connecting IP', width: '11rem' },
      { key: 'path', label: 'Path' },
      { key: 'asOrganization', label: 'Organization', fallback: 'Unknown' },
      { key: 'userAgent', label: 'User agent' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  trend: {
    file: 'daily-traffic-trend',
    columns: [
      { key: 'day', label: 'Day', type: 'date', width: '11rem' },
      { key: 'weekdayName', label: 'Weekday', width: '13rem' },
      { key: 'count', label: 'Requests', type: 'count' },
      { key: 'average', label: '7-day average', type: 'count', width: '11rem' },
      { key: 'uniqueConnectingIps', label: 'Unique IPs', type: 'count' },
      { key: 'requestsPerIp', label: 'Requests per IP', type: 'decimal', width: '11rem' }
    ]
  },
  clientFamilies: {
    file: 'client-families',
    columns: [
      { key: 'family', label: 'Client family' },
      { key: 'variants', label: 'Variants', type: 'count', width: '9rem' },
      { key: 'count', label: 'Share of all requests', type: 'share', width: '13rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  pathDiversity: {
    file: 'ips-with-high-path-diversity',
    columns: [
      { key: 'connectingIp', label: 'Connecting IP', width: '11rem' },
      { key: 'asOrganization', label: 'Organization', fallback: 'Unknown' },
      { key: 'distinctPaths', label: 'Distinct paths', type: 'count', width: '11rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  trendingPaths: {
    file: 'trending-paths',
    columns: [
      { key: 'path', label: 'Path' },
      { key: 'earlierCount', label: 'Earlier period', type: 'count', width: '11rem' },
      { key: 'recentCount', label: 'Recent period', type: 'count', width: '11rem' },
      { key: 'recentCount', label: 'Change', type: 'trendDelta', width: '14rem' }
    ]
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]))
}

function isNumeric(column) {
  return column.type === 'count' || column.type === 'share' || column.type === 'trendDelta' || column.type === 'decimal'
}

function trendDelta(row) {
  const earlier = Number(row.earlierCount) || 0
  const recent = Number(row.recentCount) || 0
  return { delta: recent - earlier, pct: earlier > 0 ? (recent - earlier) / earlier : null }
}

function cellText(column, row) {
  const value = row[column.key]
  // Only the trend table carries nullable measures (no 7-day average until 7 complete days exist).
  if ((column.type === 'count' || column.type === 'decimal') && (value === null || value === undefined || value === '')) return '\u2014'
  if (column.type === 'count') return numberFormat.format(Number(value) || 0)
  if (column.type === 'decimal') return oneDecimalFormat.format(Number(value) || 0)
  if (column.type === 'timestamp') return value ? new Date(`${value}Z`).toLocaleString() : ''
  if (column.type === 'date') return value ? new Date(`${value}Z`).toLocaleDateString() : ''
  if (column.type === 'trendDelta') {
    const { delta, pct } = trendDelta(row)
    const sign = delta > 0 ? '+' : ''
    const pctText = pct === null ? 'new' : percentFormat.format(pct)
    return `${sign}${numberFormat.format(delta)} (${pctText})`
  }
  return String(value ?? '') || column.fallback || ''
}

function tableCellText(column, row) {
  if (column.type === 'timestamp' && row[column.key]) {
    return burstDate(row[column.key]).toLocaleString(undefined, { timeZone: 'UTC' })
  }
  return cellText(column, row)
}

function sortValue(column, row) {
  if (column.type === 'trendDelta') return trendDelta(row).delta
  if (isNumeric(column)) return Number(row[column.key]) || 0
  return String(row[column.key] ?? '').toLowerCase()
}

function applyFilter(rows) {
  const needle = state.filter.toLowerCase()
  if (!needle) return rows
  return rows.filter(row => Object.values(row).some(value => String(value ?? '').toLowerCase().includes(needle)))
}

function visibleRows(name) {
  const rows = applyFilter(state.data[name] || [])
  const sort = state.sort[name]
  if (!sort) return rows
  const column = TABLES[name].columns[sort.index]
  const direction = sort.direction === 'ascending' ? 1 : -1
  return rows.slice().sort((a, b) => {
    const left = sortValue(column, a)
    const right = sortValue(column, b)
    if (left < right) return -direction
    if (left > right) return direction
    return 0
  })
}

function renderTable(name) {
  const figure = document.querySelector(`figure[data-table="${name}"]`)
  if (!figure) return
  const columns = TABLES[name].columns
  const total = Number(state.data.summary?.totalRequests) || 0
  const sort = state.sort[name]

  const cols = columns.map(column => {
    const width = column.width || (isNumeric(column) ? '8rem' : '')
    return `<col${width ? ` style="width:${width}"` : ''} />`
  }).join('')

  const head = columns.map((column, index) => {
    const sorted = sort && sort.index === index
    const arrow = sorted && sort.direction === 'ascending' ? '&uarr;' : '&darr;'
    return `<th class="${isNumeric(column) ? 'count' : ''}"${sorted ? ` aria-sort="${sort.direction}"` : ''}>` +
      `<button type="button" class="sort" data-table="${name}" data-index="${index}">${escapeHtml(column.label)}<span class="arrow">${arrow}</span></button></th>`
  }).join('')

  const rows = visibleRows(name)
  const body = rows.length
    ? rows.map(row => `<tr>${columns.map(column => {
        if (column.type === 'share') {
          const share = total ? (Number(row[column.key]) || 0) / total : 0
          return `<td class="count"><span class="meter"><span style="width:${Math.min(share * 100, 100)}%"></span></span>${formatShare(share)}</td>`
        }
        if (column.type === 'trendDelta') {
          const { delta } = trendDelta(row)
          const trendClass = delta > 0 ? 'trend-up' : delta < 0 ? 'trend-down' : ''
          return `<td class="count ${trendClass}">${cellText(column, row)}</td>`
        }
        const text = tableCellText(column, row)
        return `<td class="${column.type === 'count' ? 'count' : ''}" title="${escapeHtml(text)}">${escapeHtml(text)}</td>`
      }).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" class="empty">No matching data</td></tr>`

  figure.innerHTML = `<table><colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function groupBurstsByIp(rows) {
  const groups = new Map()

  for (const row of rows) {
    const connectingIp = String(row.connectingIp || 'Unknown')
    let group = groups.get(connectingIp)
    if (!group) {
      group = {
        connectingIp,
        requests: 0,
        peak: 0,
        windows: new Set(),
        paths: new Set(),
        userAgents: new Set(),
        organizations: new Map(),
        rows: []
      }
      groups.set(connectingIp, group)
    }

    const count = Number(row.count) || 0
    const organization = String(row.asOrganization || 'Unknown')
    group.requests += count
    group.peak = Math.max(group.peak, count)
    group.windows.add(row.windowStart)
    group.paths.add(row.path)
    group.userAgents.add(row.userAgent)
    group.organizations.set(organization, (group.organizations.get(organization) || 0) + count)
    group.rows.push(row)
  }

  return Array.from(groups.values()).map(group => ({
    ...group,
    organization: Array.from(group.organizations.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || 'Unknown'
  })).sort((left, right) => right.requests - left.requests)
}

function utcDay(value) {
  return utcDateFormat.format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`))
}

// --- Daily traffic chart ----------------------------------------------------
// Two panels sharing one time axis. Requests and unique IPs are on different
// scales, so they get a panel each: a single plot with two y-axes would imply a
// correlation that is not in the data.
const SVG_NS = 'http://www.w3.org/2000/svg'
const VB_W = 920
const CHART_ML = 56
const CHART_MR = 18
const MA_WINDOW = 7
const BAR_MAX = 24
const BAR_RADIUS = 4
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  return node
}

function trendDate(row) {
  return new Date(`${String(row.day).slice(0, 10)}T00:00:00Z`)
}

// Adds weekday, partial-day and 7-day average fields so the chart and the trend
// table (and its CSV export) all read the same derived values.
function enrichTrend(data) {
  const generatedDay = String(data.generatedAt || '').slice(0, 10)
  const rows = data.trend || []

  for (const row of rows) {
    const weekdayIndex = trendDate(row).getUTCDay()
    const requests = Number(row.count) || 0
    const ips = Number(row.uniqueConnectingIps) || 0
    const tags = []
    row.weekdayIndex = weekdayIndex
    row.isWeekend = weekdayIndex === 0 || weekdayIndex === 6
    row.isPartial = String(row.day).slice(0, 10) === generatedDay
    if (row.isWeekend) tags.push('weekend')
    if (row.isPartial) tags.push('partial day')
    row.weekdayName = WEEKDAY_NAMES[weekdayIndex] + (tags.length ? ` (${tags.join(', ')})` : '')
    row.requestsPerIp = ips ? requests / ips : null
  }

  // The partial final day is excluded so the average does not droop at the right edge.
  rows.forEach((row, index) => {
    const window = rows.slice(Math.max(0, index - MA_WINDOW + 1), index + 1)
    row.average = (!row.isPartial && window.length === MA_WINDOW && window.every(entry => !entry.isPartial))
      ? Math.round(window.reduce((sum, entry) => sum + (Number(entry.count) || 0), 0) / MA_WINDOW)
      : null
  })
}

function niceScale(max, tickCount = 4) {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] }
  const rough = max / tickCount
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const normalised = rough / magnitude
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10) * magnitude
  const niceMax = Math.ceil(max / step) * step
  const ticks = []
  for (let value = 0; value <= niceMax + step / 1000; value += step) ticks.push(value)
  return { max: niceMax, ticks }
}

// Square at the baseline, rounded at the data end.
function columnPath(x, y, width, height, radius) {
  if (height <= 0) return ''
  const r = Math.min(radius, width / 2, height)
  const bottom = y + height
  return `M${x} ${bottom} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + width - r} ${y} Q${x + width} ${y} ${x + width} ${y + r} L${x + width} ${bottom} Z`
}

function drawChartPanel(svg, days, options) {
  const { plotTop, plotHeight, viewHeight, values, showXAxis, xAxisBand, axisTitle } = options
  const svgWidth = svg.getBoundingClientRect().width || svg.viewBox.baseVal.width || VB_W
  const plotWidth = svgWidth - CHART_ML - CHART_MR
  const baseline = plotTop + plotHeight
  svg.setAttribute('viewBox', `0 0 ${svgWidth} ${viewHeight}`)
  svg.textContent = ''

  const count = days.length
  const band = plotWidth / Math.max(count, 1)
  const scale = niceScale(Math.max(...values, 1))
  const y = value => baseline - (value / scale.max) * plotHeight

  days.forEach((day, index) => {
    if (!day.isWeekend) return
    svg.appendChild(svgEl('rect', {
      class: 'weekend-band', x: CHART_ML + band * index, y: plotTop - 4, width: band, height: plotHeight + 4
    }))
  })

  for (const name of ['paths', 'locations', 'organizations']) {
    attachChartTooltip(`dimension-chart-${name}`, dimensionTooltipOptions(name))
  }
  setupBurstChartInteractions()

  for (const tick of scale.ticks) {
    const ty = y(tick)
    svg.appendChild(svgEl('line', {
      class: tick === 0 ? 'baseline-rule' : 'grid-line', x1: CHART_ML, x2: CHART_ML + plotWidth, y1: ty, y2: ty
    }))
    const label = svgEl('text', { class: 'tick-text', x: CHART_ML - 8, y: ty + 4, 'text-anchor': 'end' })
    label.textContent = tick >= 1000 ? `${numberFormat.format(tick / 1000)}k` : numberFormat.format(tick)
    svg.appendChild(label)
  }

  // Left-aligned inside the viewBox: an end-anchored title overflows and gets clipped by .plot-scroll.
  const title = svgEl('text', { class: 'axis-title', x: 2, y: plotTop - 8, 'text-anchor': 'start' })
  title.textContent = axisTitle
  svg.appendChild(title)

  options.draw({ svg, days, band, y, baseline })

  if (showXAxis) {
    // Stride from the available band so labels never collide.
    const stride = Math.max(1, Math.ceil(50 / band))
    days.forEach((day, index) => {
      const isLast = index === count - 1
      if (index % stride !== 0 && !isLast) return
      if (!isLast && (count - 1 - index) * band < 50) return
      const cx = CHART_ML + band * (index + 0.5)
      const label = svgEl('text', { class: 'tick-text', x: cx, y: baseline + xAxisBand - 18, 'text-anchor': 'middle' })
      label.textContent = chartDayFormat.format(trendDate(day))
      svg.appendChild(label)
      if (day.isPartial) {
        const note = svgEl('text', { class: 'partial-note', x: cx, y: baseline + xAxisBand - 6, 'text-anchor': 'middle' })
        note.textContent = 'partial'
        svg.appendChild(note)
      }
    })
  }

  const crosshair = svgEl('line', { class: 'crosshair', x1: 0, x2: 0, y1: plotTop - 4, y2: baseline })
  crosshair.setAttribute('hidden', '')
  svg.appendChild(crosshair)
  return { crosshair, svgWidth, plotWidth }
}

function drawRequestsPanel({ svg, days, band, y, baseline }) {
  const width = Math.min(BAR_MAX, Math.max(band - 8, 2))

  days.forEach((day, index) => {
    const requests = Number(day.count) || 0
    const x = CHART_ML + band * (index + 0.5) - width / 2
    const top = y(requests)
    const path = svgEl('path', {
      d: columnPath(x, top, width, baseline - top, BAR_RADIUS),
      fill: day.isPartial ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'var(--accent)'
    })
    if (day.isPartial) {
      path.setAttribute('stroke', 'var(--accent)')
      path.setAttribute('stroke-width', '2')
    }
    svg.appendChild(path)
  })

  const points = days
    .map((day, index) => (day.average === null || day.average === undefined ? null : `${CHART_ML + band * (index + 0.5)},${y(day.average)}`))
    .filter(Boolean)
  if (points.length > 1) {
    svg.appendChild(svgEl('polyline', {
      points: points.join(' '), fill: 'none', stroke: 'var(--chart-average)',
      'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }))
  }

  // Selective direct label: the extreme only. The axis, tooltip and table carry the rest.
  const peak = days.reduce((best, day) => ((Number(day.count) || 0) > (Number(best.count) || 0) ? day : best), days[0])
  const peakIndex = days.indexOf(peak)
  const label = svgEl('text', {
    class: 'direct-label', x: CHART_ML + band * (peakIndex + 0.5), y: y(Number(peak.count) || 0) - 7,
    'text-anchor': 'middle', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke'
  })
  label.textContent = numberFormat.format(Number(peak.count) || 0)
  svg.appendChild(label)
}

function drawIpsPanel({ svg, days, band, y, baseline }) {
  const coords = days.map((day, index) => [CHART_ML + band * (index + 0.5), y(Number(day.uniqueConnectingIps) || 0)])
  const line = coords.map(([x, py]) => `${x},${py}`).join(' ')

  svg.appendChild(svgEl('polygon', {
    points: `${coords[0][0]},${baseline} ${line} ${coords[coords.length - 1][0]},${baseline}`,
    fill: 'var(--chart-ips)', 'fill-opacity': .1
  }))
  svg.appendChild(svgEl('polyline', {
    points: line, fill: 'none', stroke: 'var(--chart-ips)',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  }))

  const [ex, ey] = coords[coords.length - 1]
  svg.appendChild(svgEl('circle', { cx: ex, cy: ey, r: 4, fill: 'var(--chart-ips)', stroke: '#fff', 'stroke-width': 2 }))

  const label = svgEl('text', {
    class: 'direct-label', x: ex + 2, y: ey - 14, 'text-anchor': 'end',
    stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke'
  })
  label.textContent = numberFormat.format(Number(days[days.length - 1].uniqueConnectingIps) || 0)
  svg.appendChild(label)
}

function renderTrendReadout(days) {
  const readout = document.getElementById('trend-readout')
  if (!readout) return
  const complete = days.filter(day => !day.isPartial)
  const mean = rows => (rows.length ? rows.reduce((sum, day) => sum + (Number(day.count) || 0), 0) / rows.length : 0)
  const weekdayMean = mean(complete.filter(day => !day.isWeekend))
  const weekendMean = mean(complete.filter(day => day.isWeekend))

  if (!weekdayMean || !weekendMean) {
    readout.textContent = ''
    return
  }
  const delta = (weekendMean - weekdayMean) / weekdayMean
  readout.textContent =
    `Weekdays average ${numberFormat.format(Math.round(weekdayMean))} requests/day; weekends average ` +
    `${numberFormat.format(Math.round(weekendMean))} (${percentFormat.format(delta)}). Complete days only; ` +
    `the partial final day is excluded from both averages and from the 7-day line.`
}

function attachChartTooltip(chartId, { getItems, indexFromPointer, buildRows, describe, position, onShow, onHide }) {
  const chart = document.getElementById(chartId)
  const tooltip = chart?.querySelector('.chart-tooltip')
  const live = chart?.querySelector('[aria-live]')
  if (!chart || !tooltip || !live) return { show: () => {}, hide: () => {} }
  let active = -1

  const hide = () => {
    active = -1
    tooltip.hidden = true
    onHide?.()
  }

  const show = index => {
    const items = getItems()
    if (!Number.isInteger(index) || index < 0 || index >= items.length) {
      hide()
      return
    }
    active = index
    const item = items[index]
    const content = buildRows(item)
    tooltip.textContent = ''
    const heading = document.createElement('div')
    heading.className = 'tip-date'
    heading.textContent = content.heading
    tooltip.appendChild(heading)

    for (const rowData of content.rows) {
      const row = document.createElement('div')
      row.className = 'tip-row'
      const label = document.createElement('span')
      label.className = 'tip-name'
      if (rowData.colour) {
        const key = document.createElement('i')
        key.className = rowData.keyClass || 'key-rect'
        key.style.background = rowData.colour
        label.appendChild(key)
      }
      label.appendChild(document.createTextNode(rowData.name))
      const amount = document.createElement('span')
      amount.className = 'tip-value'
      amount.textContent = rowData.value
      row.appendChild(label)
      row.appendChild(amount)
      tooltip.appendChild(row)
    }
    if (content.flag) {
      const flag = document.createElement('div')
      flag.className = 'tip-flag'
      flag.textContent = content.flag
      tooltip.appendChild(flag)
    }

    tooltip.hidden = false
    onShow?.(index, item)
    const anchor = position(index, item, chart)
    const width = tooltip.offsetWidth
    const height = tooltip.offsetHeight
    tooltip.style.left = `${Math.min(Math.max(anchor.x - width / 2, 4), Math.max(chart.clientWidth - width - 4, 4))}px`
    tooltip.style.top = `${Math.min(Math.max(anchor.y, 4), Math.max(chart.clientHeight - height - 4, 4))}px`
    live.textContent = describe(item)
  }

  chart.addEventListener('pointermove', event => {
    const index = indexFromPointer(event, chart)
    if (index === null || index === undefined) {
      hide()
      return
    }
    if (index !== active) show(index)
  })
  chart.addEventListener('pointerleave', hide)
  chart.addEventListener('blur', event => {
    if (!chart.contains(event.relatedTarget)) hide()
  })
  chart.addEventListener('keydown', event => {
    if (event.target !== chart) return
    const last = getItems().length - 1
    if (last < 0) return
    if (event.key === 'ArrowRight') { event.preventDefault(); show(Math.min((active < 0 ? -1 : active) + 1, last)) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); show(Math.max((active < 0 ? last + 1 : active) - 1, 0)) }
    else if (event.key === 'Home') { event.preventDefault(); show(0) }
    else if (event.key === 'End') { event.preventDefault(); show(last) }
    else if (event.key === 'Escape') hide()
  })
  return { show, hide }
}

function renderDailyChart() {
  const svgRequests = document.getElementById('svg-requests')
  const svgIps = document.getElementById('svg-ips')
  const empty = document.getElementById('chart-empty')
  if (!svgRequests || !svgIps) return

  // Filtered like every other section, but always chronological - a table sort must not reorder time.
  const days = applyFilter(state.data.trend || [])
    .slice()
    .sort((left, right) => String(left.day).localeCompare(String(right.day)))

  state.charts.trend = { days, panels: [] }

  if (!days.length) {
    svgRequests.textContent = ''
    svgIps.textContent = ''
    empty.hidden = false
    renderTrendReadout(days)
    return
  }
  empty.hidden = true

  state.charts.trend.panels = [
    drawChartPanel(svgRequests, days, {
      plotTop: 26, plotHeight: 130, viewHeight: 180, xAxisBand: 0, showXAxis: false, axisTitle: 'Requests',
      values: days.map(day => Number(day.count) || 0), draw: drawRequestsPanel
    }),
    drawChartPanel(svgIps, days, {
      plotTop: 26, plotHeight: 100, viewHeight: 168, xAxisBand: 42, showXAxis: true, axisTitle: 'Unique IPs',
      values: days.map(day => Number(day.uniqueConnectingIps) || 0), draw: drawIpsPanel
    })
  ]

  renderTrendReadout(days)
}

function setupChartInteractions() {
  const svgRequests = document.getElementById('svg-requests')
  if (!svgRequests) return
  attachChartTooltip('daily-chart', {
    getItems: () => state.charts.trend.days,
    indexFromPointer: event => {
      const days = state.charts.trend.days
      const panel = state.charts.trend.panels[0]
      if (!days.length || !panel) return null
      const plotRect = svgRequests.getBoundingClientRect()
      const vbX = ((event.clientX - plotRect.left) / plotRect.width) * panel.svgWidth
      const index = Math.floor((vbX - CHART_ML) / (panel.plotWidth / days.length))
      return index >= 0 && index < days.length ? index : null
    },
    buildRows: day => ({
      heading: chartFullDayFormat.format(trendDate(day)),
      rows: [
        { name: 'Requests', value: numberFormat.format(Number(day.count) || 0), colour: 'var(--accent)' },
        { name: '7-day average', value: day.average === null || day.average === undefined ? 'not yet available' : numberFormat.format(day.average), colour: 'var(--chart-average)', keyClass: 'key-line' },
        { name: 'Unique IPs', value: numberFormat.format(Number(day.uniqueConnectingIps) || 0), colour: 'var(--chart-ips)', keyClass: 'key-line' }
      ],
      flag: day.isPartial ? 'Partial day - collection stopped mid-day' : ''
    }),
    describe: day => `${chartFullDayFormat.format(trendDate(day))}: ` +
      `${numberFormat.format(Number(day.count) || 0)} requests, ` +
      `${numberFormat.format(Number(day.uniqueConnectingIps) || 0)} unique IPs${day.isPartial ? ', partial day' : ''}`,
    position: (index, day, chart) => {
      const panel = state.charts.trend.panels[0]
      const plotRect = svgRequests.getBoundingClientRect()
      const chartRect = chart.getBoundingClientRect()
      const band = panel.plotWidth / state.charts.trend.days.length
      const vbX = CHART_ML + band * (index + 0.5)
      return {
        x: plotRect.left - chartRect.left + (vbX / panel.svgWidth) * plotRect.width,
        y: plotRect.top - chartRect.top + 8
      }
    },
    onShow: index => {
      const days = state.charts.trend.days
      const panel = state.charts.trend.panels[0]
      if (!panel) return
      const band = panel.plotWidth / days.length
      const vbX = CHART_ML + band * (index + 0.5)
      for (const chartPanel of state.charts.trend.panels) {
        chartPanel.crosshair.setAttribute('x1', vbX)
        chartPanel.crosshair.setAttribute('x2', vbX)
        chartPanel.crosshair.removeAttribute('hidden')
      }
    },
    onHide: () => state.charts.trend.panels.forEach(panel => panel.crosshair.setAttribute('hidden', ''))
  })

  const chartResizeObserver = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width > 0) renderDailyChart()
  })
  chartResizeObserver.observe(svgRequests)
}

function sortedDimensionRows(name) {
  const config = TABLES[name].chart
  let rows = visibleRows(name)
  if (name === 'locations') {
    const countries = new Map()
    for (const row of rows) {
      const country = String(row.country || 'Unknown')
      countries.set(country, (countries.get(country) || 0) + (Number(row.count) || 0))
    }
    rows = Array.from(countries, ([country, count]) => ({ country, count }))
  }
  return rows.map((row, index) => ({ ...row, originalIndex: index }))
    .sort((left, right) => (Number(right.count) || 0) - (Number(left.count) || 0) ||
      String(left[config.labelKey] || '').localeCompare(String(right[config.labelKey] || '')) ||
      left.originalIndex - right.originalIndex)
    .map(({ originalIndex, ...row }) => row)
}

function renderDimensionChart(name) {
  const config = TABLES[name].chart
  const svg = document.getElementById(`svg-dimension-${name}`)
  const empty = document.getElementById(`dimension-empty-${name}`)
  const readout = document.getElementById(`dimension-readout-${name}`)
  if (!config || !svg || !empty || !readout) return

  const rows = sortedDimensionRows(name)
  if (!rows.length) {
    svg.textContent = ''
    svg.hidden = true
    empty.hidden = false
    readout.textContent = ''
    state.charts[name] = { items: [] }
    return
  }

  svg.hidden = false
  empty.hidden = true
  const grandTotal = Number(state.data.summary?.totalRequests) || 0
  const rowsTotal = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0)
  const useRowsDenominator = rowsTotal < grandTotal * 0.8
  const threshold = (useRowsDenominator ? rowsTotal : grandTotal) * 0.8
  let accumulated = 0
  let crossing = rows.length
  for (let index = 0; index < rows.length; index++) {
    accumulated += Number(rows[index].count) || 0
    if (accumulated >= threshold) {
      crossing = index + 1
      break
    }
  }
  const topN = Math.min(rows.length, Math.max(config.minBars, Math.min(config.maxBars, crossing)))
  const items = rows.slice(0, topN).map(row => ({
    label: String(row[config.labelKey] || 'Unknown'),
    count: Number(row.count) || 0
  }))
  const remainder = rows.slice(topN)
  const remainderCount = remainder.reduce((sum, row) => sum + (Number(row.count) || 0), 0)
  if (remainderCount > 0) {
    items.push({
      label: `${config.rollupLabel} (${numberFormat.format(remainder.length)})`,
      count: remainderCount,
      rollup: true
    })
  }

  const width = VB_W
  const rowStep = 26
  const plotTop = 18
  const plotLeft = 350
  const plotWidth = width - plotLeft - CHART_MR
  const axisHeight = 36
  const height = plotTop + items.length * rowStep + axisHeight
  const scale = niceScale(Math.max(...items.map(item => item.count), 1))
  const x = value => plotLeft + (value / scale.max) * plotWidth
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.style.height = `${height}px`
  svg.textContent = ''

  for (const tick of scale.ticks) {
    const tx = x(tick)
    svg.appendChild(svgEl('line', {
      class: 'grid-line', x1: tx, x2: tx, y1: plotTop - 4, y2: height - axisHeight + 2
    }))
    const label = svgEl('text', {
      class: 'tick-text', x: tx, y: height - 10, 'text-anchor': 'middle'
    })
    label.textContent = tick >= 1000 ? `${numberFormat.format(tick / 1000)}k` : numberFormat.format(tick)
    svg.appendChild(label)
  }

  items.forEach((item, index) => {
    const y = plotTop + index * rowStep
    const barHeight = Math.min(BAR_MAX, rowStep - 2)
    const barY = y + (rowStep - barHeight) / 2
    const barEnd = x(item.count)
    const barWidth = Math.max(0, barEnd - plotLeft)
    const group = svgEl('g', { 'data-tooltip-index': index, class: 'dimension-bar' })
    group.appendChild(svgEl('rect', {
      x: 0, y, width, height: rowStep, fill: 'transparent', class: 'chart-hit'
    }))
    const label = svgEl('text', {
      class: 'dimension-label', x: plotLeft - 12, y: y + rowStep / 2 + 4, 'text-anchor': 'end'
    })
    const shortLabel = item.label.length > 46 ? `${item.label.slice(0, 45)}…` : item.label
    label.textContent = shortLabel
    const title = svgEl('title')
    title.textContent = item.label
    label.appendChild(title)
    group.appendChild(label)
    const bar = svgEl('path', {
      d: columnPath(plotLeft, barY, barWidth, barHeight, BAR_RADIUS),
      fill: item.rollup ? 'var(--muted)' : 'var(--accent)'
    })
    group.appendChild(bar)
    const valueLabel = svgEl('text', {
      class: 'direct-label dimension-value',
      x: barEnd + 7,
      y: y + rowStep / 2 + 4,
      'text-anchor': 'start'
    })
    valueLabel.textContent = numberFormat.format(item.count)
    if (barEnd + 58 > width - CHART_MR) {
      valueLabel.setAttribute('x', Math.max(plotLeft + 4, barEnd - 7))
      valueLabel.setAttribute('text-anchor', 'end')
      valueLabel.classList.add('dimension-value-inside')
    }
    group.appendChild(valueLabel)
    svg.appendChild(group)
    item.anchorX = Math.min(barEnd + 28, width - CHART_MR)
    item.anchorY = y + rowStep / 2
  })

  const label = name === 'locations' ? 'countries' : name === 'organizations' ? 'organizations' : 'paths'
  const scope = useRowsDenominator ? 'of the requests this table covers' : 'of requests'
  readout.textContent = `${crossing} of ${numberFormat.format(rows.length)} ${label} account for 80% ${scope}.` +
    (remainder.length && items[topN - 1]?.count === remainder[0]?.count ? ' A tie at the chart cutoff may split equal values.' : '')

  state.charts[name] = { items }
}

function burstDate(value) {
  const text = String(value || '').trim().replace(' ', 'T')
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`)
}

const BURST_BINS = [
  { min: 10, max: 24, label: '10-24', colour: '#93d4bd' },
  { min: 25, max: 59, label: '25-59', colour: '#3fae89' },
  { min: 60, max: 149, label: '60-149', colour: '#0b7a58' },
  { min: 150, max: Infinity, label: '150+', colour: '#06513a' }
]
const MAX_BURST_IP_ROWS = 30
const LOCAL_HOUR_FORMAT = new Intl.DateTimeFormat(undefined, { hour: '2-digit', hourCycle: 'h23' })

function burstBin(value) {
  return BURST_BINS.findIndex(bin => value >= bin.min && value <= bin.max)
}

function buildBurstGrid(rows) {
  const groups = new Map()
  for (const row of rows) {
    const ip = String(row.connectingIp || 'Unknown')
    let group = groups.get(ip)
    if (!group) {
      group = { ip, total: 0, byDay: new Map(), windows: new Map(), organizations: new Map() }
      groups.set(ip, group)
    }
    const count = Number(row.count) || 0
    const day = String(row.windowStart || '').slice(0, 10)
    group.total += count
    group.byDay.set(day, (group.byDay.get(day) || 0) + count)
    if (!group.windows.has(day)) group.windows.set(day, new Set())
    group.windows.get(day).add(row.windowStart)
    const organization = String(row.asOrganization || 'Unknown')
    group.organizations.set(organization, (group.organizations.get(organization) || 0) + count)
  }
  return Array.from(groups.values()).map(group => ({
    ...group,
    organization: Array.from(group.organizations.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || 'Unknown'
  })).sort((left, right) => right.total - left.total)
}

function dimensionTooltipOptions(name) {
  const svg = document.getElementById(`svg-dimension-${name}`)
  return {
    getItems: () => state.charts[name].items,
    indexFromPointer: event => {
      const target = event.target.closest('[data-tooltip-index]')
      return target ? Number(target.getAttribute('data-tooltip-index')) : null
    },
    buildRows: item => ({
      heading: item.label,
      rows: [
        { name: 'Requests', value: numberFormat.format(item.count), colour: item.rollup ? 'var(--muted)' : 'var(--accent)' },
        { name: 'Share of all requests', value: formatShare((Number(state.data.summary?.totalRequests) || 0) ? item.count / Number(state.data.summary.totalRequests) : 0) }
      ]
    }),
    describe: item => `${item.label}: ${numberFormat.format(item.count)} requests, ` +
      `${formatShare((Number(state.data.summary?.totalRequests) || 0) ? item.count / Number(state.data.summary.totalRequests) : 0)} of all requests`,
    position: (index, item, chart) => {
      const svgRect = svg.getBoundingClientRect()
      const chartRect = chart.getBoundingClientRect()
      return {
        x: svgRect.left - chartRect.left + (item.anchorX / VB_W) * svgRect.width,
        y: svgRect.top - chartRect.top + (item.anchorY / (svg.viewBox.baseVal.height || 1)) * svgRect.height
      }
    }
  }
}

function renderBurstSwimlane() {
  const svg = document.getElementById('svg-burst-swimlane')
  const empty = document.getElementById('burst-chart-empty')
  const legend = document.getElementById('burst-bin-legend')
  const shell = document.getElementById('burst-charts')
  if (!svg || !empty || !legend || !shell) return

  if (!(state.data.bursts || []).length) {
    shell.hidden = true
    state.charts.bursts = { items: [], heatmapItems: [], hourItems: [], groups: [] }
    return
  }
  shell.hidden = false
  const rows = visibleRows('bursts')
  const groups = buildBurstGrid(rows)
  const days = (state.data.trend || []).map(row => String(row.day).slice(0, 10))
  const visibleGroups = groups.slice(0, MAX_BURST_IP_ROWS)
  const width = VB_W
  const labelWidth = 222
  const plotLeft = labelWidth
  const plotWidth = width - plotLeft - CHART_MR
  const band = plotWidth / Math.max(days.length, 1)
  const rowHeight = 34
  const plotTop = 38
  const height = plotTop + visibleGroups.length * rowHeight + 14 + (groups.length > MAX_BURST_IP_ROWS ? rowHeight : 0)
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.style.height = `${height}px`
  svg.textContent = ''
  const occupiedBins = new Set()

  days.forEach((day, index) => {
    const date = new Date(`${day}T00:00:00Z`)
    const weekday = date.getUTCDay()
    const x = plotLeft + band * index
    if (weekday === 0 || weekday === 6) {
      svg.appendChild(svgEl('rect', { class: 'weekend-band', x, y: plotTop - 24, width: band, height: visibleGroups.length * rowHeight + 26 }))
    }
  })
  const stride = Math.max(1, Math.ceil(46 / band))
  days.forEach((day, index) => {
    if (index % stride !== 0 && index !== days.length - 1) return
    const label = svgEl('text', {
      class: 'tick-text', x: plotLeft + band * (index + 0.5), y: plotTop - 8, 'text-anchor': 'middle'
    })
    label.textContent = chartDayFormat.format(new Date(`${day}T00:00:00Z`))
    svg.appendChild(label)
  })

  const heatmapItems = []
  visibleGroups.forEach((group, rowIndex) => {
    const rowY = plotTop + rowIndex * rowHeight
    const row = svgEl('g', { 'data-burst-ip': group.ip, class: 'burst-swimlane-row' })
    row.appendChild(svgEl('rect', {
      x: 0, y: rowY, width, height: rowHeight, fill: 'transparent', class: 'chart-hit'
    }))
    const ipLabel = svgEl('text', {
      class: 'burst-axis-label', x: 8, y: rowY + 13
    })
    ipLabel.textContent = group.ip
    const ipTitle = svgEl('title')
    ipTitle.textContent = `${group.ip}; ${group.organization}`
    ipLabel.appendChild(ipTitle)
    row.appendChild(ipLabel)
    const orgLabel = svgEl('text', { class: 'burst-axis-sub-label', x: 8, y: rowY + 27 })
    orgLabel.textContent = group.organization.length > 28 ? `${group.organization.slice(0, 27)}…` : group.organization
    const orgTitle = svgEl('title')
    orgTitle.textContent = group.organization
    orgLabel.appendChild(orgTitle)
    row.appendChild(orgLabel)

    days.forEach((day, dayIndex) => {
      const count = group.byDay.get(day) || 0
      if (!count) return
      const binIndex = burstBin(count)
      if (binIndex < 0) return
      occupiedBins.add(binIndex)
      const windowCount = group.windows.get(day)?.size || 0
      const item = {
        ip: group.ip, organization: group.organization, day, count, windowCount,
        anchorX: plotLeft + band * (dayIndex + 0.5),
        anchorY: rowY + rowHeight / 2,
        svgId: 'svg-burst-swimlane'
      }
      const itemIndex = heatmapItems.push(item) - 1
      const cell = svgEl('g', { 'data-tooltip-index': itemIndex, class: 'burst-cell' })
      cell.appendChild(svgEl('rect', {
        x: plotLeft + band * (dayIndex + 0.5) - Math.min(24, band - 4) / 2,
        y: rowY + (rowHeight - Math.min(24, band - 4)) / 2,
        width: Math.min(24, band - 4),
        height: Math.min(24, band - 4),
        rx: 3,
        fill: BURST_BINS[binIndex].colour,
        stroke: '#fff',
        'stroke-width': 1
      }))
      const title = svgEl('title')
      title.textContent = `${group.ip}, ${day}, ${numberFormat.format(count)} requests`
      cell.appendChild(title)
      row.appendChild(cell)
    })
    svg.appendChild(row)
  })
  if (groups.length > MAX_BURST_IP_ROWS) {
    const more = svgEl('text', {
      class: 'burst-axis-sub-label', x: 8, y: plotTop + visibleGroups.length * rowHeight + 12
    })
    more.textContent = `and ${numberFormat.format(groups.length - MAX_BURST_IP_ROWS)} more IPs`
    svg.appendChild(more)
  }

  legend.innerHTML = BURST_BINS.map((bin, index) => {
    const dimmed = occupiedBins.has(index) ? '' : ' class="unused-bin"'
    return `<span${dimmed}><i style="background:${bin.colour}"></i>${bin.label} requests</span>`
  }).join('')
  empty.hidden = rows.length > 0
  svg.hidden = rows.length === 0
  state.charts.bursts.heatmapItems = heatmapItems
  state.charts.bursts.groups = groups
  state.charts.bursts.items = [...heatmapItems, ...(state.charts.bursts.hourItems || [])]
  svg.querySelectorAll('.burst-swimlane-row').forEach(row => row.addEventListener('click', () => {
    const details = [...document.querySelectorAll('#burst-groups details[data-burst-ip]')]
      .find(item => item.dataset.burstIp === row.dataset.burstIp)
    if (!details) return
    details.open = true
    details.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }))
}

function renderBurstHours() {
  const svg = document.getElementById('svg-burst-hours')
  const readout = document.getElementById('burst-hour-readout')
  const zoneName = document.getElementById('burst-hour-zone-name')
  const empty = document.getElementById('burst-chart-empty')
  if (!svg || !readout || !zoneName || !empty) return

  const rows = visibleRows('bursts')
  if (!rows.length) {
    svg.textContent = ''
    readout.textContent = ''
    svg.hidden = true
    state.charts.bursts.hourItems = []
    state.charts.bursts.items = [...state.charts.bursts.heatmapItems]
    return
  }
  svg.hidden = false
  empty.hidden = true
  const zone = state.burstHourZone
  zoneName.textContent = zone
  const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, windows: 0, requests: 0 }))
  for (const row of rows) {
    const date = burstDate(row.windowStart)
    const hour = zone === 'UTC'
      ? date.getUTCHours()
      : Number(LOCAL_HOUR_FORMAT.formatToParts(date).find(part => part.type === 'hour')?.value)
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue
    counts[hour].windows++
    counts[hour].requests += Number(row.count) || 0
  }

  const totalWindows = rows.length
  const totalRequests = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0)
  let peakStart = 0
  let peakWindows = -1
  for (let start = 0; start < 24; start++) {
    const windows = counts[start].windows + counts[(start + 1) % 24].windows + counts[(start + 2) % 24].windows
    if (windows > peakWindows) {
      peakWindows = windows
      peakStart = start
    }
  }
  const peakEnd = (peakStart + 2) % 24
  const peakRequests = counts[peakStart].requests + counts[(peakStart + 1) % 24].requests + counts[peakEnd].requests
  const windowPercent = totalWindows ? percentFormat.format(peakWindows / totalWindows) : percentFormat.format(0)
  const hourText = hour => String(hour).padStart(2, '0')
  readout.textContent = `${windowPercent} of flagged windows fall between ${hourText(peakStart)}:00 and ${hourText(peakEnd)}:59 ${zone}, carrying ` +
    `${numberFormat.format(peakRequests)} of ${numberFormat.format(totalRequests)} flagged requests; this is consistent with scheduled jobs, not proof of abuse.`

  const width = VB_W
  const plotTop = 36
  const plotHeight = 148
  const baseline = plotTop + plotHeight
  const plotWidth = width - CHART_ML - CHART_MR
  const band = plotWidth / 24
  const scale = niceScale(Math.max(...counts.map(item => item.windows), 1))
  const y = value => baseline - (value / scale.max) * plotHeight
  svg.setAttribute('viewBox', `0 0 ${width} 236`)
  svg.style.height = '236px'
  svg.textContent = ''

  const axisTitle = svgEl('text', { class: 'axis-title', x: 2, y: 18, 'text-anchor': 'start' })
  axisTitle.textContent = `Hour of day (${zone})`
  svg.appendChild(axisTitle)
  for (const tick of scale.ticks) {
    const ty = y(tick)
    svg.appendChild(svgEl('line', {
      class: tick === 0 ? 'baseline-rule' : 'grid-line', x1: CHART_ML, x2: CHART_ML + plotWidth, y1: ty, y2: ty
    }))
    const label = svgEl('text', { class: 'tick-text', x: CHART_ML - 8, y: ty + 4, 'text-anchor': 'end' })
    label.textContent = numberFormat.format(tick)
    svg.appendChild(label)
  }

  const hourItems = []
  counts.forEach((item, index) => {
    const x = CHART_ML + band * index
    const top = y(item.windows)
    const barWidth = Math.min(BAR_MAX, band - 4)
    const barX = x + (band - barWidth) / 2
    const itemIndex = state.charts.bursts.heatmapItems.length + index
    const group = svgEl('g', { 'data-tooltip-index': itemIndex, class: 'hour-bar' })
    group.appendChild(svgEl('path', {
      d: columnPath(barX, top, barWidth, baseline - top, BAR_RADIUS),
      fill: 'var(--accent)'
    }))
    group.appendChild(svgEl('rect', { x, y: plotTop, width: band, height: plotHeight, fill: 'transparent', class: 'chart-hit' }))
    const tickLabel = svgEl('text', {
      class: 'tick-text', x: x + band / 2, y: baseline + 20, 'text-anchor': 'middle'
    })
    tickLabel.textContent = hourText(item.hour)
    svg.appendChild(tickLabel)
    svg.appendChild(group)
    hourItems.push({
      ...item,
      zone,
      anchorX: x + band / 2,
      anchorY: Math.max(plotTop + 4, top),
      svgId: 'svg-burst-hours'
    })
  })
  if (totalWindows) {
    const peak = counts.reduce((best, item) => item.windows > best.windows ? item : best, counts[0])
    const peakX = CHART_ML + band * (peak.hour + 0.5)
    const label = svgEl('text', {
      class: 'direct-label', x: peakX, y: y(peak.windows) - 7, 'text-anchor': 'middle',
      stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke'
    })
    label.textContent = numberFormat.format(peak.windows)
    svg.appendChild(label)
  }
  state.charts.bursts.hourItems = hourItems
  state.charts.bursts.items = [...state.charts.bursts.heatmapItems, ...hourItems]
}

function setupBurstChartInteractions() {
  attachChartTooltip('burst-chart', {
    getItems: () => state.charts.bursts.items,
    indexFromPointer: event => {
      const target = event.target.closest('[data-tooltip-index]')
      return target ? Number(target.getAttribute('data-tooltip-index')) : null
    },
    buildRows: item => item.ip ? ({
      heading: `${item.ip} · ${chartFullDayFormat.format(new Date(`${item.day}T00:00:00Z`))}`,
      rows: [
        { name: 'Requests', value: numberFormat.format(item.count), colour: BURST_BINS[burstBin(item.count)]?.colour },
        { name: 'Flagged windows', value: numberFormat.format(item.windowCount) },
        { name: 'Organization', value: item.organization }
      ]
    }) : ({
      heading: `${String(item.hour).padStart(2, '0')}:00-${String(item.hour).padStart(2, '0')}:59 ${item.zone}`,
      rows: [
        { name: 'Flagged windows', value: numberFormat.format(item.windows), colour: 'var(--accent)' },
        { name: 'Requests', value: numberFormat.format(item.requests) }
      ]
    }),
    describe: item => item.ip
      ? `${item.ip}, ${chartFullDayFormat.format(new Date(`${item.day}T00:00:00Z`))}: ${numberFormat.format(item.count)} requests in ${numberFormat.format(item.windowCount)} flagged windows`
      : `${String(item.hour).padStart(2, '0')}:00 ${item.zone}: ${numberFormat.format(item.windows)} flagged windows, ${numberFormat.format(item.requests)} requests`,
    position: (index, item, chart) => {
      const svg = document.getElementById(item.svgId)
      const svgRect = svg.getBoundingClientRect()
      const chartRect = chart.getBoundingClientRect()
      const viewBox = svg.viewBox.baseVal
      return {
        x: svgRect.left - chartRect.left + (item.anchorX / viewBox.width) * svgRect.width,
        y: svgRect.top - chartRect.top + (item.anchorY / viewBox.height) * svgRect.height
      }
    }
  })

  // This is a display-zone control, not a filter; it only rebuckets the hour histogram.
  document.getElementById('burst-hour-toggle')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-zone]')
    if (!button) return
    state.burstHourZone = button.dataset.zone
    document.querySelectorAll('#burst-hour-toggle button[data-zone]').forEach(item => {
      item.setAttribute('aria-pressed', String(item === button))
    })
    renderBurstHours()
  })
}

function renderCoverage() {
  const data = state.data
  const first = data.trend?.[0]?.day
  const last = data.trend?.at(-1)?.day
  const period = first && last ? `${utcDay(first)} to ${utcDay(last)} UTC` : 'No observed days'
  document.getElementById('meta').textContent =
    `Observed ${period} · requested last ${data.lookbackDays} days · updated ${new Date(data.generatedAt).toLocaleString()}`

  const trendingRows = data.trending || data.trendingPaths || []
  const earlier = trendingRows.reduce((sum, row) => sum + (Number(row.earlierCount) || 0), 0)
  const recent = trendingRows.reduce((sum, row) => sum + (Number(row.recentCount) || 0), 0)
  const available = earlier > 0 && recent > 0
  document.getElementById('trending-section').hidden = !available
  document.getElementById('trending-unavailable').hidden = available
  const note = document.getElementById('coverage-note')
  note.textContent = `Tables show all returned rows. IPs and user agents omit empty values; network organizations include known organizations among repeat IPs. Shares use all requests as the denominator, so displayed rows may not sum to 100%.`
}

function renderDiversityHighlight() {
  const top = (state.data.pathDiversity || []).slice().sort((a, b) => Number(b.distinctPaths) - Number(a.distinctPaths))
  const container = document.getElementById('diversity-highlight')
  container.textContent = top.length > 1
    ? `Highest path diversity: ${top[0].connectingIp} requested ${numberFormat.format(Number(top[0].distinctPaths))} distinct paths; next highest: ${numberFormat.format(Number(top[1].distinctPaths))}. Diversity alone does not establish abuse.`
    : ''
}

function renderBurstGroups() {
  const container = document.getElementById('burst-groups')
  if (!container) return

  const groups = groupBurstsByIp(visibleRows('bursts'))
  if (!groups.length) {
    container.innerHTML = '<div class="burst-group-list"><div class="empty">No matching burst activity</div></div>'
    return
  }

  const maximumRequests = groups[0].requests || 1
  const content = groups.map((group, index) => {
    const activityWidth = Math.max((group.requests / maximumRequests) * 100, 1)
    const windows = group.rows.slice().sort((left, right) => String(right.windowStart).localeCompare(String(left.windowStart)))
      .map(row => {
        const timestamp = cellText(TABLES.bursts.columns[0], row)
        return `<div class="burst-window">` +
          `<span title="${escapeHtml(timestamp)}">${escapeHtml(timestamp)}</span>` +
          `<span title="${escapeHtml(row.path)}">${escapeHtml(row.path)}</span>` +
          `<span title="${escapeHtml(row.userAgent)}">${escapeHtml(row.userAgent)}</span>` +
          `<span class="burst-window-count">${numberFormat.format(Number(row.count) || 0)}</span>` +
          `</div>`
      }).join('')

    return `<details class="burst-group" data-burst-ip="${escapeHtml(group.connectingIp)}"${index === 0 ? ' open' : ''}>` +
      `<summary><div class="burst-group-summary">` +
      `<div class="burst-identity"><strong>${escapeHtml(group.connectingIp)}</strong><span title="${escapeHtml(group.organization)}">${escapeHtml(group.organization)}</span></div>` +
      `<div class="burst-activity" title="${numberFormat.format(group.requests)} requests"><span style="width:${activityWidth}%"></span></div>` +
      `<div class="burst-metric"><strong>${numberFormat.format(group.requests)}</strong><span>flagged requests</span></div>` +
      `<div class="burst-metric"><strong>${numberFormat.format(group.windows.size)}</strong><span>windows</span></div>` +
      `<div class="burst-metric"><strong>${numberFormat.format(group.paths.size)}</strong><span>paths</span></div>` +
      `<div class="burst-metric"><strong>${numberFormat.format(group.peak)}</strong><span>peak per record</span></div>` +
      `</div></summary><div class="burst-window-list">${windows}</div></details>`
  }).join('')

  container.innerHTML = `<div class="burst-overview-header"><h3>Burst activity by connecting IP</h3><span>${numberFormat.format(groups.length)} IPs, ranked by flagged requests</span></div>` +
    `<div class="burst-group-list">${content}</div>`
}

function render() {
  // Every summary chart or grouped view stays paired with its complete, filterable table.
  Object.keys(TABLES).forEach(name => renderTable(name))
  renderDailyChart()
  Object.keys(TABLES).filter(name => TABLES[name].chart).forEach(renderDimensionChart)
  renderBurstSwimlane()
  renderBurstHours()
  renderBurstGroups()
}

function csvValue(value) {
  const text = String(value ?? '')
  // Neutralise spreadsheet formula injection before quoting.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

function exportCsv(name) {
  const config = TABLES[name]
  const total = Number(state.data.summary?.totalRequests) || 0
  const header = config.columns.map(column => csvValue(column.label)).join(',')
  const lines = visibleRows(name).map(row => config.columns.map(column => {
    if (column.type === 'share') {
      const share = total ? (Number(row[column.key]) || 0) / total : 0
      return csvValue(share.toFixed(4))
    }
    if (column.type === 'trendDelta') return csvValue(trendDelta(row).delta)
    if (column.type === 'count' || column.type === 'decimal') {
      const value = row[column.key]
      if (value === null || value === undefined || value === '') return csvValue('')
      const numeric = Number(value) || 0
      return csvValue(column.type === 'decimal' ? numeric.toFixed(2) : numeric)
    }
    return csvValue(cellText(column, row))
  }).join(',')).join('\r\n')

  const blob = new Blob([`\ufeff${header}\r\n${lines}\r\n`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `evergreen-${config.file}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function setupExportButtons() {
  document.querySelectorAll('.section-heading[data-table]').forEach(heading => {
    const name = heading.dataset.table
    if (!TABLES[name]) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'export'
    button.textContent = 'Export to CSV'
    button.addEventListener('click', () => exportCsv(name))
    heading.appendChild(button)
  })
}

function setupSorting() {
  document.addEventListener('click', event => {
    const button = event.target.closest('button.sort')
    if (!button) return
    const name = button.dataset.table
    const index = Number(button.dataset.index)
    const current = state.sort[name]
    state.sort[name] = current && current.index === index
      ? { index, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
      : { index, direction: isNumeric(TABLES[name].columns[index]) ? 'descending' : 'ascending' }
    renderTable(name)
  })
}

function setupBackToTop() {
  const button = document.getElementById('back-to-top')
  const updateVisibility = () => { button.hidden = window.scrollY < 400 }

  window.addEventListener('scroll', updateVisibility, { passive: true })
  updateVisibility()
  button.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    })
  })
}

function setupTabs() {
  document.querySelectorAll('[role="tablist"]').forEach(tablist => {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')]
    const activate = tab => {
      tabs.forEach(item => {
        const selected = item === tab
        item.setAttribute('aria-selected', String(selected))
        item.tabIndex = selected ? 0 : -1
        document.getElementById(item.getAttribute('aria-controls')).hidden = !selected
      })
      const chart = document.getElementById('svg-requests')
      if (state.data && chart.getBoundingClientRect().width > 0) renderDailyChart()
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab))
      tab.addEventListener('keydown', event => {
        let nextIndex
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
        else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
        else if (event.key === 'Home') nextIndex = 0
        else if (event.key === 'End') nextIndex = tabs.length - 1
        else return

        event.preventDefault()
        activate(tabs[nextIndex])
        tabs[nextIndex].focus()
      })
    })
  })
}

async function init() {
  setupBackToTop()
  setupTabs()

  const res = await fetch('data.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  state.data = data

  data.paths ||= []
  data.connectingIps ||= []
  data.locations ||= []
  data.organizations ||= []
  data.userAgents ||= []
  data.bursts ||= []
  data.trend ||= []
  data.clientFamilies ||= []
  data.pathDiversity ||= []
  data.trendingPaths ||= data.trending || []
  enrichTrend(data)

  const total = Number(data.summary?.totalRequests) || 0
  document.getElementById('total-requests').textContent = numberFormat.format(total)
  document.getElementById('unique-ips').textContent = numberFormat.format(data.summary?.uniqueConnectingIps || 0)
  const oneTimeIps = (Number(data.summary?.uniqueConnectingIps) || 0) - (data.connectingIps?.length || 0)
  document.getElementById('one-time-ips').textContent = numberFormat.format(Math.max(oneTimeIps, 0))
  document.getElementById('burst-count').textContent = numberFormat.format(data.bursts?.length || 0)

  renderCoverage()
  renderDiversityHighlight()
  document.getElementById('burst-notice').innerHTML =
    `<strong>Review signal:</strong> ${numberFormat.format(data.burstRequestThreshold)} or more requests from the same IP to the same path with the same user agent within ${numberFormat.format(data.burstWindowMinutes)} minutes. A flagged window is an indicator for investigation, not proof of abuse.`
  document.getElementById('path-diversity-notice').innerHTML =
    `<strong>Review signal:</strong> an IP requesting ${numberFormat.format(data.pathDiversityThreshold)} or more distinct paths within the lookback window. This can indicate scanning or enumeration, independent of total request volume.`

  document.getElementById('filter').addEventListener('input', event => {
    state.filter = event.target.value
    render()
  })

  setupExportButtons()
  setupSorting()
  setupChartInteractions()
  render()
}

init().catch(error => {
  document.getElementById('meta').textContent = `Failed to load data.json: ${error.message}`
})
