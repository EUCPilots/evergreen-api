// Queries the Workers Analytics Engine SQL API and generates dashboard/dist/data.json
const CF_API_TOKEN = process.env.CF_API_TOKEN
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const CF_DATASET = process.env.CF_DATASET || 'evergreen_requests'
const LOOKBACK_DAYS = process.env.LOOKBACK_DAYS || '30'
const BURST_WINDOW_MINUTES = process.env.BURST_WINDOW_MINUTES || '15'
const BURST_REQUEST_THRESHOLD = process.env.BURST_REQUEST_THRESHOLD || '10'

if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
  console.error('CF_API_TOKEN and CF_ACCOUNT_ID environment variables are required')
  process.exit(1)
}

const SQL_API_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql`

const lookbackDays = parsePositiveInteger('LOOKBACK_DAYS', LOOKBACK_DAYS)
const burstWindowMinutes = parsePositiveInteger('BURST_WINDOW_MINUTES', BURST_WINDOW_MINUTES)
const burstRequestThreshold = parsePositiveInteger('BURST_REQUEST_THRESHOLD', BURST_REQUEST_THRESHOLD)

if (!/^[A-Za-z0-9_]+$/.test(CF_DATASET)) {
  throw new Error('CF_DATASET may only contain letters, numbers, and underscores')
}

// blob1=path, blob2=country, blob3=region, blob4=city, blob5=userAgent,
// blob6=connectingIp, blob7=asOrganization (see src/index.js logToAnalyticsEngine)
const recentData = `FROM ${CF_DATASET}
WHERE timestamp > NOW() - INTERVAL '${lookbackDays}' DAY`

function parsePositiveInteger(name, value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function dimensionQuery(column, alias, where = `${column} != ''`) {
  return `SELECT ${column} AS ${alias}, SUM(_sample_interval) AS count
${recentData} AND ${where}
GROUP BY ${column}
ORDER BY count DESC
LIMIT 500`
}

function sqlStringLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

// Analytics Engine SQL doesn't support subqueries, so this is built from connectingIps results at runtime
function organizationsQuery(connectingIps) {
  const inList = connectingIps.map(sqlStringLiteral).join(', ')
  return `SELECT blob7 AS asOrganization, SUM(_sample_interval) AS count
${recentData} AND blob7 != ''
  AND blob6 IN (${inList})
GROUP BY blob7
ORDER BY count DESC
LIMIT 500`
}

const queries = {
  summary: `SELECT
  SUM(_sample_interval) AS totalRequests,
  COUNT(DISTINCT blob6) - if(countIf(blob6 = '') > 0, 1, 0) AS uniqueConnectingIps
${recentData}`,
  connectingIps: `SELECT blob6 AS connectingIp, SUM(_sample_interval) AS count
${recentData} AND blob6 != ''
GROUP BY blob6
HAVING count > 1
ORDER BY count DESC
LIMIT 500`,
  paths: dimensionQuery('blob1', 'path'),
  locations: `SELECT blob2 AS country, blob3 AS region, SUM(_sample_interval) AS count
${recentData} AND (blob2 != '' OR blob3 != '')
GROUP BY blob2, blob3
ORDER BY count DESC
LIMIT 500`,
  userAgents: dimensionQuery('blob5', 'userAgent'),
  bursts: `SELECT
  toStartOfInterval(timestamp, INTERVAL '${burstWindowMinutes}' MINUTE) AS windowStart,
  blob6 AS connectingIp,
  blob1 AS path,
  blob5 AS userAgent,
  blob7 AS asOrganization,
  SUM(_sample_interval) AS count
${recentData} AND blob6 != ''
GROUP BY windowStart, blob6, blob1, blob5, blob7
HAVING count >= ${burstRequestThreshold}
ORDER BY count DESC
LIMIT 500`
}

async function runQuery(sql) {
  const response = await fetch(SQL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'text/plain'
    },
    body: sql
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(`Analytics Engine SQL API error (${response.status}): ${text}`)
  }

  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`Analytics Engine SQL API returned non-JSON response: ${text.slice(0, 500)}`)
  }
}

async function main() {
  const entries = await Promise.all(Object.entries(queries).map(async ([name, sql]) => {
    const result = await runQuery(sql)
    return [name, result.data || []]
  }))
  const data = Object.fromEntries(entries)
  const summary = data.summary[0] || { totalRequests: 0, uniqueConnectingIps: 0 }

  const repeatIps = data.connectingIps.map(row => row.connectingIp)
  data.organizations = repeatIps.length > 0
    ? (await runQuery(organizationsQuery(repeatIps))).data || []
    : []

  const output = {
    generatedAt: new Date().toISOString(),
    lookbackDays,
    dataset: CF_DATASET,
    burstWindowMinutes,
    burstRequestThreshold,
    summary,
    connectingIps: data.connectingIps,
    paths: data.paths,
    locations: data.locations,
    organizations: data.organizations,
    userAgents: data.userAgents,
    bursts: data.bursts
  }

  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')

  await fs.mkdir(distDir, { recursive: true })
  await fs.writeFile(path.join(distDir, 'data.json'), JSON.stringify(output, null, 2))

  console.log(`Wrote dashboard aggregates to ${path.join(distDir, 'data.json')}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
