const state = {
  data: null,
  activePanel: 'traffic-panel',
  filter: ''
}

const numberFormat = new Intl.NumberFormat()
const percentFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]))
}

function applyFilter(rows) {
  const filter = state.filter
  if (!filter) return rows
  const needle = filter.toLowerCase()
  return rows.filter(row => Object.values(row).some(value => String(value ?? '').toLowerCase().includes(needle)))
}

function shareCell(count, total) {
  const share = total ? Number(count) / total : 0
  return `<td class="count"><span class="meter"><span style="width:${Math.min(share * 100, 100)}%"></span></span>${percentFormat.format(share)}</td>`
}

function renderRows(id, rows, renderRow, columnCount) {
  const filtered = applyFilter(rows)
  document.getElementById(id).innerHTML = filtered.length
    ? filtered.map(renderRow).join('')
    : `<tr><td colspan="${columnCount}" class="empty">No matching data</td></tr>`
}

function render() {
  const data = state.data
  const total = Number(data.summary.totalRequests) || 0

  renderRows('paths', data.paths, row => `<tr><td class="value">${escapeHtml(row.path)}</td>${shareCell(row.count, total)}<td class="count">${numberFormat.format(row.count)}</td></tr>`, 3)
  renderRows('connecting-ips', data.connectingIps, row => `<tr><td class="value">${escapeHtml(row.connectingIp)}</td>${shareCell(row.count, total)}<td class="count">${numberFormat.format(row.count)}</td></tr>`, 3)
  renderRows('locations', data.locations, row => `<tr><td>${escapeHtml(row.country || 'Unknown')}</td><td class="value">${escapeHtml(row.region || 'Unknown')}</td>${shareCell(row.count, total)}<td class="count">${numberFormat.format(row.count)}</td></tr>`, 4)
  renderRows('organizations', data.organizations, row => `<tr><td class="value">${escapeHtml(row.asOrganization)}</td>${shareCell(row.count, total)}<td class="count">${numberFormat.format(row.count)}</td></tr>`, 3)
  renderRows('user-agents', data.userAgents, row => `<tr><td class="value">${escapeHtml(row.userAgent)}</td>${shareCell(row.count, total)}<td class="count">${numberFormat.format(row.count)}</td></tr>`, 3)
  renderRows('bursts', data.bursts, row => `<tr><td>${escapeHtml(new Date(`${row.windowStart}Z`).toLocaleString())}</td><td>${escapeHtml(row.connectingIp)}</td><td class="value">${escapeHtml(row.path)}</td><td class="value">${escapeHtml(row.asOrganization || 'Unknown')}</td><td class="value">${escapeHtml(row.userAgent)}</td><td class="count">${numberFormat.format(row.count)}</td></tr>`, 6)
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
  render()
}

init().catch(error => {
  document.getElementById('meta').textContent = `Failed to load data.json: ${error.message}`
})
