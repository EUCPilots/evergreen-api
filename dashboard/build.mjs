// Queries the Workers Analytics Engine SQL API and generates dashboard/dist/data.json
const CF_API_TOKEN = process.env.CF_API_TOKEN
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const CF_ZONE_ID = process.env.CF_ZONE_ID || ''
const CF_DATASET = process.env.CF_DATASET || 'evergreen_requests'
const LOOKBACK_DAYS = process.env.LOOKBACK_DAYS || '30'
const BURST_WINDOW_MINUTES = process.env.BURST_WINDOW_MINUTES || '15'
const BURST_REQUEST_THRESHOLD = process.env.BURST_REQUEST_THRESHOLD || '10'
const PATH_DIVERSITY_THRESHOLD = process.env.PATH_DIVERSITY_THRESHOLD || '5'
// Same value as the Worker's API_TEST_USERAGENT variable; test traffic is excluded from all aggregates
const API_TEST_USERAGENT = process.env.API_TEST_USERAGENT || ''
// Known automated test suite user agent, always excluded regardless of API_TEST_USERAGENT configuration
const KNOWN_TEST_USERAGENT = 'EvergreenAPI_Tests/1.0.0'

if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
  console.error('CF_API_TOKEN and CF_ACCOUNT_ID environment variables are required')
  process.exit(1)
}

const SQL_API_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql`
const GRAPHQL_API_URL = 'https://api.cloudflare.com/client/v4/graphql'

const lookbackDays = parsePositiveInteger('LOOKBACK_DAYS', LOOKBACK_DAYS)
const burstWindowMinutes = parsePositiveInteger('BURST_WINDOW_MINUTES', BURST_WINDOW_MINUTES)
const burstRequestThreshold = parsePositiveInteger('BURST_REQUEST_THRESHOLD', BURST_REQUEST_THRESHOLD)
const pathDiversityThreshold = parsePositiveInteger('PATH_DIVERSITY_THRESHOLD', PATH_DIVERSITY_THRESHOLD)
// Splits the lookback window in half to compare recent vs earlier traffic per path
const halfLookbackDays = Math.max(1, Math.floor(lookbackDays / 2))

if (!/^[A-Za-z0-9_]+$/.test(CF_DATASET)) {
  throw new Error('CF_DATASET may only contain letters, numbers, and underscores')
}

// blob1=path, blob2=country, blob3=region, blob4=city, blob5=userAgent,
// blob6=connectingIp, blob7=asOrganization (see src/index.js logToAnalyticsEngine)
// trend/clientFamilies/pathDiversity/trending below reuse these same blobs
if (!API_TEST_USERAGENT) {
  console.warn('API_TEST_USERAGENT is not set; only the built-in known test user agent will be excluded from the dashboard')
}

const excludedTestUserAgents = [...new Set([API_TEST_USERAGENT, KNOWN_TEST_USERAGENT].filter(Boolean))]
const testUserAgentFilter = excludedTestUserAgents
  .map(userAgent => `\n  AND blob5 != ${sqlStringLiteral(userAgent)}`)
  .join('')

const recentData = `FROM ${CF_DATASET}
WHERE timestamp > NOW() - INTERVAL '${lookbackDays}' DAY${testUserAgentFilter}`

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

// Analytics Engine SQL API rejects queries over 10000 chars, so the IN list is split into batches
const MAX_QUERY_LENGTH = 10000
const QUERY_LENGTH_SAFETY_MARGIN = 500

function chunkConnectingIps(connectingIps) {
  const baseLength = organizationsQuery([]).length
  const budget = MAX_QUERY_LENGTH - QUERY_LENGTH_SAFETY_MARGIN - baseLength
  const chunks = []
  let current = []
  let currentLength = 0

  for (const ip of connectingIps) {
    // +2 accounts for the ", " separator between items
    const itemLength = sqlStringLiteral(ip).length + 2
    if (current.length > 0 && currentLength + itemLength > budget) {
      chunks.push(current)
      current = []
      currentLength = 0
    }
    current.push(ip)
    currentLength += itemLength
  }
  if (current.length > 0) chunks.push(current)

  return chunks
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
LIMIT 500`,
  trend: `SELECT
  toStartOfDay(timestamp) AS day,
  SUM(_sample_interval) AS count,
  COUNT(DISTINCT blob6) - if(countIf(blob6 = '') > 0, 1, 0) AS uniqueConnectingIps
${recentData}
GROUP BY day
ORDER BY day ASC`,
  // Groups the text before the first '/' in the user agent, collapsing noisy version/build suffixes
  clientFamilies: `SELECT
  if(position('/' IN blob5) > 0, substring(blob5, 1, position('/' IN blob5) - 1), blob5) AS family,
  SUM(_sample_interval) AS count,
  COUNT(DISTINCT blob5) AS variants
${recentData} AND blob5 != ''
GROUP BY family
ORDER BY count DESC
LIMIT 500`,
  pathDiversity: `SELECT
  blob6 AS connectingIp,
  argMax(blob7, _sample_interval) AS asOrganization,
  COUNT(DISTINCT blob1) AS distinctPaths,
  SUM(_sample_interval) AS count
${recentData} AND blob6 != ''
GROUP BY blob6
HAVING distinctPaths >= ${pathDiversityThreshold}
ORDER BY distinctPaths DESC, count DESC
LIMIT 500`,
  trending: `SELECT
  blob1 AS path,
  sumIf(_sample_interval, timestamp < NOW() - INTERVAL '${halfLookbackDays}' DAY) AS earlierCount,
  sumIf(_sample_interval, timestamp >= NOW() - INTERVAL '${halfLookbackDays}' DAY) AS recentCount
${recentData}
GROUP BY blob1
HAVING earlierCount > 0 OR recentCount > 0
ORDER BY recentCount DESC
LIMIT 500`
}

const QUERY_RETRY_ATTEMPTS = 3
const QUERY_RETRY_DELAY_MS = 1000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runQuery(sql, name = 'query') {
  let lastError

  for (let attempt = 1; attempt <= QUERY_RETRY_ATTEMPTS; attempt++) {
    try {
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
        // Analytics Engine SQL API returns opaque 5xx errors intermittently; these are worth retrying
        if (response.status >= 500 && attempt < QUERY_RETRY_ATTEMPTS) {
          lastError = new Error(`[${name}] Analytics Engine SQL API error (${response.status}): ${text}`)
          await sleep(QUERY_RETRY_DELAY_MS * attempt)
          continue
        }
        throw new Error(`[${name}] Analytics Engine SQL API error (${response.status}): ${text}`)
      }

      try {
        return JSON.parse(text)
      } catch (err) {
        throw new Error(`[${name}] Analytics Engine SQL API returned non-JSON response: ${text.slice(0, 500)}`)
      }
    } catch (err) {
      lastError = err
      if (attempt >= QUERY_RETRY_ATTEMPTS) break
    }
  }

  throw lastError
}

async function fetchBlockedSecurityEvents() {
  if (!CF_ZONE_ID) return null

  const now = new Date()
  const query = `query BlockedSecurityEvents($zoneTag: String!, $filter: FirewallEventsAdaptiveFilter_InputObject!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        firewallEventsAdaptiveGroups(limit: 1, filter: $filter) {
          count
          dimensions { action }
        }
      }
    }
  }`
  const response = await fetch(GRAPHQL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      variables: {
        zoneTag: CF_ZONE_ID,
        filter: {
          datetime_geq: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          datetime_leq: now.toISOString(),
          action: 'block'
        }
      }
    })
  })

  const result = await response.json()
  if (!response.ok || result.errors?.length) {
    throw new Error(`Cloudflare security events query failed: ${JSON.stringify(result.errors || result)}`)
  }

  const groups = result.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || []
  return groups.reduce((total, group) => total + Number(group.count || 0), 0)
}

async function fetchOptionalBlockedSecurityEvents() {
  try {
    return await fetchBlockedSecurityEvents()
  } catch (error) {
    console.warn(`Blocked security events are unavailable: ${error.message}`)
    return null
  }
}

async function fetchOrganizations(connectingIps) {
  if (connectingIps.length === 0) return []

  const chunks = chunkConnectingIps(connectingIps)
  const results = await Promise.all(
    chunks.map((chunk, i) => runQuery(organizationsQuery(chunk), `organizations[${i}]`))
  )

  const counts = new Map()
  for (const result of results) {
    for (const row of result.data || []) {
      const currentCount = Number(counts.get(row.asOrganization) || 0)
      counts.set(row.asOrganization, currentCount + Number(row.count))
    }
  }

  return Array.from(counts, ([asOrganization, count]) => ({ asOrganization, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25)
}

async function main() {
  const entries = await Promise.all(Object.entries(queries).map(async ([name, sql]) => {
    const result = await runQuery(sql, name)
    return [name, result.data || []]
  }))
  const data = Object.fromEntries(entries)
  const summary = data.summary[0] || { totalRequests: 0, uniqueConnectingIps: 0 }
  const blockedSecurityEventsLast24Hours = await fetchOptionalBlockedSecurityEvents()

  const repeatIps = data.connectingIps.map(row => row.connectingIp)
  data.organizations = await fetchOrganizations(repeatIps)

  const output = {
    generatedAt: new Date().toISOString(),
    lookbackDays,
    dataset: CF_DATASET,
    burstWindowMinutes,
    burstRequestThreshold,
    pathDiversityThreshold,
    halfLookbackDays,
    summary,
    blockedSecurityEventsLast24Hours,
    connectingIps: data.connectingIps,
    paths: data.paths,
    locations: data.locations,
    organizations: data.organizations,
    userAgents: data.userAgents,
    bursts: data.bursts,
    trend: data.trend,
    clientFamilies: data.clientFamilies,
    pathDiversity: data.pathDiversity,
    trending: data.trending
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
