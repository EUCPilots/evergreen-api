const state = {
  rows: [],
  sortKey: 'count',
  sortDir: 'desc',
  filter: ''
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]))
}

function applyFilter(rows, filter) {
  if (!filter) return rows
  const needle = filter.toLowerCase()
  return rows.filter(row =>
    ['path', 'country', 'region', 'city', 'userAgent'].some(key =>
      String(row[key] ?? '').toLowerCase().includes(needle)
    )
  )
}

function sortRows(rows, key, dir) {
  const sorted = [...rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'number' && typeof bv === 'number') return av - bv
    return String(av ?? '').localeCompare(String(bv ?? ''))
  })
  return dir === 'desc' ? sorted.reverse() : sorted
}

function render() {
  const filtered = applyFilter(state.rows, state.filter)
  const sorted = sortRows(filtered, state.sortKey, state.sortDir)

  document.getElementById('rows').innerHTML = sorted.map(row => `
    <tr>
      <td>${escapeHtml(row.path)}</td>
      <td>${escapeHtml(row.country)}</td>
      <td>${escapeHtml(row.region)}</td>
      <td>${escapeHtml(row.city)}</td>
      <td>${escapeHtml(row.userAgent)}</td>
      <td class="count">${escapeHtml(row.count)}</td>
    </tr>
  `).join('')

  document.querySelectorAll('th[data-key]').forEach(th => {
    th.classList.toggle('sorted', th.dataset.key === state.sortKey)
    th.classList.toggle('asc', th.dataset.key === state.sortKey && state.sortDir === 'asc')
  })
}

async function init() {
  const res = await fetch('data.json', { cache: 'no-store' })
  const data = await res.json()
  state.rows = data.rows || []

  document.getElementById('meta').textContent =
    `Generated ${new Date(data.generatedAt).toLocaleString()} · last ${data.lookbackDays} days · ${state.rows.length} unique combinations`

  document.getElementById('filter').addEventListener('input', event => {
    state.filter = event.target.value
    render()
  })

  document.querySelectorAll('th[data-key]').forEach(th => {
    th.addEventListener('click', () => {
      if (state.sortKey === th.dataset.key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc'
      } else {
        state.sortKey = th.dataset.key
        state.sortDir = 'desc'
      }
      render()
    })
  })

  render()
}

init().catch(error => {
  document.getElementById('meta').textContent = `Failed to load data.json: ${error.message}`
})
