import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)

async function buildDashboard(userAgents) {
  const directory = await mkdtemp(path.join(tmpdir(), 'evergreen-dashboard-test-'))
  try {
    const buildPath = path.join(directory, 'build.mjs')
    await copyFile(new URL('./build.mjs', import.meta.url), buildPath)
    const script = `
      import assert from 'node:assert/strict'
      const userAgents = ${JSON.stringify(userAgents)}
      globalThis.fetch = async (_url, options) => {
        const sql = options.body
        assert.ok(!sql.includes("AND blob5 != 'EvergreenAPI_Tests/1.0.0'"))
        assert.ok(sql.includes("AND blob5 != 'CustomTests/1.0'"))
        let data = []
        if (sql.startsWith('SELECT blob5 AS userAgent')) data = userAgents
        if (sql.includes('AS totalRequests')) {
          data = [{
            totalRequests: userAgents.reduce((sum, row) => sum + Number(row.count), 0),
            uniqueConnectingIps: 0
          }]
        }
        return { ok: true, text: async () => JSON.stringify({ data }) }
      }
      await import(${JSON.stringify(pathToFileURL(buildPath).href)})
    `
    await execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
      env: {
        ...process.env,
        CF_API_TOKEN: 'test-token',
        CF_ACCOUNT_ID: 'test-account',
        CF_DATASET: 'evergreen_requests',
        API_TEST_USERAGENT: 'CustomTests/1.0'
      }
    })
    return JSON.parse(await readFile(path.join(directory, 'dist', 'data.json'), 'utf8'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('build groups Sweden device agents in both audience tables and preserves totals', async () => {
  const rows = [
    { userAgent: 'sc033/Sweden', count: '2' },
    { userAgent: 'scA9f/Sweden', count: '7' },
    { userAgent: 'sc0/Sweden', count: '3' },
    { userAgent: 'Other/1.0', count: '8' },
    { userAgent: 'Other/2.0', count: '1' },
    { userAgent: 'Standalone', count: '4' }
  ]
  const data = await buildDashboard(rows)
  assert.deepEqual(data.userAgents, [
    { userAgent: 'sc*/Sweden', count: 12 },
    { userAgent: 'Other/1.0', count: 8 },
    { userAgent: 'Standalone', count: 4 },
    { userAgent: 'Other/2.0', count: 1 }
  ])
  assert.deepEqual(data.clientFamilies, [
    { family: 'sc*/Sweden', count: 12, variants: 3 },
    { family: 'Other', count: 9, variants: 2 },
    { family: 'Standalone', count: 4, variants: 1 }
  ])
  for (const name of ['userAgents', 'clientFamilies']) {
    assert.equal(data[name].reduce((sum, row) => sum + row.count, 0), data.summary.totalRequests)
  }
})

test('build leaves near matches unchanged and retains ordinary family grouping', async () => {
  const agents = [
    'sc/Sweden', 'scxyz/Sweden', 'sc12g/Sweden', 'SCabc/Sweden',
    'scabc/sweden', 'scabc/Norway', 'scabc/Sweden/extra',
    'prefixscabc/Sweden', 'scabc/Sweden ', ' scabc/Sweden', 'scabc/Sweden\n'
  ]
  const data = await buildDashboard(agents.map(userAgent => ({ userAgent, count: '1' })))
  assert.deepEqual(data.userAgents.map(row => row.userAgent), agents)
  assert.ok(!data.clientFamilies.some(row => row.family === 'sc*/Sweden'))
  assert.deepEqual(data.clientFamilies.find(row => row.family === 'scabc'), {
    family: 'scabc', count: 5, variants: 5
  })
})

test('build handles empty user-agent results', async () => {
  const data = await buildDashboard([])
  assert.deepEqual(data.userAgents, [])
  assert.deepEqual(data.clientFamilies, [])
})
