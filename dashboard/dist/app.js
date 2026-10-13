const state = {
  data: null,
  filter: '',
  sort: {},
  chart: { days: [], panels: [] }
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
    columns: [
      { key: 'country', label: 'Country', fallback: 'Unknown', width: '11rem' },
      { key: 'region', label: 'Region', fallback: 'Unknown' },
      { key: 'count', label: 'Share of all requests', type: 'share', width: '13rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  organizations: {
    file: 'network-organizations',
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
        const text = cellText(column, row)
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

function renderDailyChart() {
  const svgRequests = document.getElementById('svg-requests')
  const svgIps = document.getElementById('svg-ips')
  const empty = document.getElementById('chart-empty')
  if (!svgRequests || !svgIps) return

  // Filtered like every other section, but always chronological - a table sort must not reorder time.
  const days = applyFilter(state.data.trend || [])
    .slice()
    .sort((left, right) => String(left.day).localeCompare(String(right.day)))

  state.chart = { days, panels: [] }

  if (!days.length) {
    svgRequests.textContent = ''
    svgIps.textContent = ''
    empty.hidden = false
    renderTrendReadout(days)
    return
  }
  empty.hidden = true

  state.chart.panels = [
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

function setupChartInteraction() {
  const chart = document.getElementById('daily-chart')
  const tooltip = document.getElementById('chart-tooltip')
  const live = document.getElementById('chart-live')
  const svgRequests = document.getElementById('svg-requests')
  if (!chart || !tooltip || !svgRequests) return
  let active = -1

  const hide = () => {
    active = -1
    tooltip.hidden = true
    for (const panel of state.chart.panels) panel.crosshair.setAttribute('hidden', '')
  }

  const show = index => {
    const days = state.chart.days
    if (index < 0 || index >= days.length) return
    active = index
    const day = days[index]
    const { svgWidth, plotWidth } = state.chart.panels[0]
    const band = plotWidth / days.length
    const vbX = CHART_ML + band * (index + 0.5)

    for (const panel of state.chart.panels) {
      panel.crosshair.setAttribute('x1', vbX)
      panel.crosshair.setAttribute('x2', vbX)
      panel.crosshair.removeAttribute('hidden')
    }

    tooltip.textContent = ''
    const heading = document.createElement('div')
    heading.className = 'tip-date'
    heading.textContent = chartFullDayFormat.format(trendDate(day))
    tooltip.appendChild(heading)

    const rows = [
      ['Requests', numberFormat.format(Number(day.count) || 0), 'var(--accent)'],
      ['7-day average', day.average === null || day.average === undefined ? 'not yet available' : numberFormat.format(day.average), 'var(--chart-average)'],
      ['Unique IPs', numberFormat.format(Number(day.uniqueConnectingIps) || 0), 'var(--chart-ips)']
    ]
    for (const [name, value, colour] of rows) {
      const row = document.createElement('div')
      row.className = 'tip-row'
      const label = document.createElement('span')
      label.className = 'tip-name'
      const key = document.createElement('i')
      key.className = 'key-line'
      key.style.background = colour
      label.appendChild(key)
      label.appendChild(document.createTextNode(name))
      const amount = document.createElement('span')
      amount.className = 'tip-value'
      amount.textContent = value
      row.appendChild(label)
      row.appendChild(amount)
      tooltip.appendChild(row)
    }
    if (day.isPartial) {
      const flag = document.createElement('div')
      flag.className = 'tip-flag'
      flag.textContent = 'Partial day - collection stopped mid-day'
      tooltip.appendChild(flag)
    }

    tooltip.hidden = false
    const plotRect = svgRequests.getBoundingClientRect()
    const chartRect = chart.getBoundingClientRect()
    const pixelX = plotRect.left - chartRect.left + (vbX / svgWidth) * plotRect.width
    const width = tooltip.offsetWidth
    tooltip.style.left = `${Math.min(Math.max(pixelX - width / 2, 4), chart.clientWidth - width - 4)}px`
    tooltip.style.top = `${plotRect.top - chartRect.top + 8}px`

    live.textContent = `${chartFullDayFormat.format(trendDate(day))}: ` +
      `${numberFormat.format(Number(day.count) || 0)} requests, ` +
      `${numberFormat.format(Number(day.uniqueConnectingIps) || 0)} unique IPs${day.isPartial ? ', partial day' : ''}`
  }

  chart.addEventListener('pointermove', event => {
    const days = state.chart.days
    if (!days.length) return
    const plotRect = svgRequests.getBoundingClientRect()
    const { svgWidth, plotWidth } = state.chart.panels[0]
    const vbX = ((event.clientX - plotRect.left) / plotRect.width) * svgWidth
    const index = Math.floor((vbX - CHART_ML) / (plotWidth / days.length))
    if (index < 0 || index >= days.length) return hide()
    if (index !== active) show(index)
  })
  chart.addEventListener('pointerleave', hide)
  chart.addEventListener('blur', hide)
  chart.addEventListener('keydown', event => {
    const last = state.chart.days.length - 1
    if (last < 0) return
    if (event.key === 'ArrowRight') { event.preventDefault(); show(Math.min((active < 0 ? -1 : active) + 1, last)) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); show(Math.max((active < 0 ? last + 1 : active) - 1, 0)) }
    else if (event.key === 'Home') { event.preventDefault(); show(0) }
    else if (event.key === 'End') { event.preventDefault(); show(last) }
    else if (event.key === 'Escape') hide()
  })
  const chartResizeObserver = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width > 0) renderDailyChart()
  })
  chartResizeObserver.observe(svgRequests)
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

    return `<details class="burst-group"${index === 0 ? ' open' : ''}>` +
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
  Object.keys(TABLES).forEach(name => renderTable(name))
  renderDailyChart()
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
  setupChartInteraction()
  render()
}

init().catch(error => {
  document.getElementById('meta').textContent = `Failed to load data.json: ${error.message}`
})
