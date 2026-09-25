const state = {
  data: null,
  activePanel: 'traffic-panel',
  filter: '',
  sort: {}
}

const numberFormat = new Intl.NumberFormat()
const percentFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })

const TABLES = {
  paths: {
    file: 'requests-by-path',
    columns: [
      { key: 'path', label: 'Path' },
      { key: 'count', label: 'Share', type: 'share', width: '11rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  connectingIps: {
    file: 'requests-by-connecting-ip',
    columns: [
      { key: 'connectingIp', label: 'Connecting IP' },
      { key: 'count', label: 'Share', type: 'share', width: '11rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  locations: {
    file: 'country-and-region',
    columns: [
      { key: 'country', label: 'Country', fallback: 'Unknown', width: '10rem' },
      { key: 'region', label: 'Region', fallback: 'Unknown' },
      { key: 'count', label: 'Share', type: 'share', width: '11rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  organizations: {
    file: 'network-organizations',
    columns: [
      { key: 'asOrganization', label: 'AS organization' },
      { key: 'count', label: 'Share', type: 'share', width: '11rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  userAgents: {
    file: 'user-agents',
    columns: [
      { key: 'userAgent', label: 'User agent' },
      { key: 'count', label: 'Share', type: 'share', width: '11rem' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  },
  bursts: {
    file: 'high-volume-request-windows',
    columns: [
      { key: 'windowStart', label: 'Window (UTC)', type: 'timestamp', width: '12rem' },
      { key: 'connectingIp', label: 'Connecting IP', width: '10rem' },
      { key: 'path', label: 'Path' },
      { key: 'asOrganization', label: 'Organization', fallback: 'Unknown' },
      { key: 'userAgent', label: 'User agent' },
      { key: 'count', label: 'Requests', type: 'count' }
    ]
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]))
}

function isNumeric(column) {
  return column.type === 'count' || column.type === 'share'
}

function cellText(column, row) {
  const value = row[column.key]
  if (column.type === 'count') return numberFormat.format(Number(value) || 0)
  if (column.type === 'timestamp') return value ? new Date(`${value}Z`).toLocaleString() : ''
  return String(value ?? '') || column.fallback || ''
}

function sortValue(column, row) {
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
          return `<td class="count"><span class="meter"><span style="width:${Math.min(share * 100, 100)}%"></span></span>${percentFormat.format(share)}</td>`
        }
        const text = cellText(column, row)
        return `<td class="${column.type === 'count' ? 'count' : ''}" title="${escapeHtml(text)}">${escapeHtml(text)}</td>`
      }).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" class="empty">No matching data</td></tr>`

  figure.innerHTML = `<table><colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function render() {
  Object.keys(TABLES).forEach(renderTable)
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
    if (column.type === 'count') return csvValue(Number(row[column.key]) || 0)
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

async function init() {
  const res = await fetch('data.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  state.data = data

  const total = Number(data.summary?.totalRequests) || 0
  document.getElementById('total-requests').textContent = numberFormat.format(total)
  document.getElementById('unique-ips').textContent = numberFormat.format(data.summary?.uniqueConnectingIps || 0)
  document.getElementById('burst-count').textContent = numberFormat.format(data.bursts?.length || 0)

  document.getElementById('meta').textContent =
    `Last ${data.lookbackDays} days · updated ${new Date(data.generatedAt).toLocaleString()}`
  document.getElementById('burst-notice').innerHTML =
    `<strong>Review signal:</strong> ${numberFormat.format(data.burstRequestThreshold)} or more requests from the same IP to the same path with the same user agent within ${numberFormat.format(data.burstWindowMinutes)} minutes. A flagged window is an indicator for investigation, not proof of abuse.`

  document.getElementById('filter').addEventListener('input', event => {
    state.filter = event.target.value
    render()
  })

  document.querySelectorAll('[role="tab"]').forEach(tab => {
    tab.addEventListener('click', () => {
      state.activePanel = tab.getAttribute('aria-controls')
      document.querySelectorAll('[role="tab"]').forEach(item => item.setAttribute('aria-selected', String(item === tab)))
      document.querySelectorAll('[role="tabpanel"]').forEach(panel => { panel.hidden = panel.id !== state.activePanel })
    })
  })

  data.paths ||= []
  data.connectingIps ||= []
  data.locations ||= []
  data.organizations ||= []
  data.userAgents ||= []
  data.bursts ||= []

  setupExportButtons()
  setupSorting()
  render()
}

init().catch(error => {
  document.getElementById('meta').textContent = `Failed to load data.json: ${error.message}`
})
