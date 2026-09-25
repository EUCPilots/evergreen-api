// Queries the Workers Analytics Engine SQL API and generates dashboard/dist/data.json
const CF_API_TOKEN = process.env.CF_API_TOKEN
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const CF_DATASET = process.env.CF_DATASET || 'evergreen_requests'
const LOOKBACK_DAYS = process.env.LOOKBACK_DAYS || '30'

if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
  console.error('CF_API_TOKEN and CF_ACCOUNT_ID environment variables are required')
  process.exit(1)
}

const SQL_API_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql`

// blob1=path, blob2=country, blob3=region, blob4=city, blob5=userAgent, blob6=realIp (see src/index.js logToAnalyticsEngine)
const query = `
SELECT
  blob1 AS path,
  blob2 AS country,
  blob3 AS region,
  blob4 AS city,
  blob5 AS userAgent,
  SUM(_sample_interval) AS count,
  COUNT(DISTINCT blob6) AS uniqueRequests
FROM ${CF_DATASET}
WHERE timestamp > NOW() - INTERVAL '${LOOKBACK_DAYS}' DAY
GROUP BY blob1, blob2, blob3, blob4, blob5
ORDER BY count DESC
`

async function runQuery(sql) {
  const response = await fetch(SQL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'text/plain'
    },
    body: sql
  })

  const body = await response.json()

  if (!response.ok) {
    throw new Error(`Analytics Engine SQL API error (${response.status}): ${JSON.stringify(body)}`)
  }

  return body
}

async function main() {
  const result = await runQuery(query)
  const rows = result.data || []

  const output = {
    generatedAt: new Date().toISOString(),
    lookbackDays: Number(LOOKBACK_DAYS),
    dataset: CF_DATASET,
    rows
  }

  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')

  await fs.mkdir(distDir, { recursive: true })
  await fs.writeFile(path.join(distDir, 'data.json'), JSON.stringify(output, null, 2))

  console.log(`Wrote ${rows.length} rows to ${path.join(distDir, 'data.json')}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
