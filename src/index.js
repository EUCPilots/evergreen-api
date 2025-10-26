// Uses the cloudflare-worker-rest-api package
import restCfWorker from 'cloudflare-worker-rest-api'
const app = new restCfWorker()

// === CACHING INFRASTRUCTURE ===
// In-memory cache for fastest access (survives during worker execution)
const memoryCache = new Map()
const CACHE_TTL = 12 * 60 * 60 * 1000 // 12 hours in milliseconds

// Helper functions for consistent responses and error handling
const JSON_HEADERS = { 'Content-Type': 'application/json' }

function jsonResponse(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({ ...JSON_HEADERS, ...extraHeaders })
  return new Response(JSON.stringify(body), { status, headers })
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.error('JSON parse error:', err.message)
    return null
  }
}

function validateAppId(appId) {
  if (!appId || typeof appId !== 'string') return false
  // Allow letters, numbers, dashes and underscores; max length to avoid abuse
  return /^[A-Za-z0-9-_]{1,64}$/.test(appId)
}

function ensureEvergreenBinding() {
  console.log('Checking EVERGREEN binding...', typeof EVERGREEN)
  if (typeof EVERGREEN === 'undefined') {
    console.error('EVERGREEN KV binding is not available')
    return false
  }
  console.log('EVERGREEN binding is available')
  return true
}

function ensureLogsBucketBinding() {
  if (typeof LOGS_BUCKET === 'undefined') {
    console.error('LOGS_BUCKET R2 binding is not available')
    return false
  }
  return true
}

// === MEMORY + KV CACHING (SIMPLIFIED) ===

// In-memory cache functions
function getFromMemoryCache(key) {
  const cached = memoryCache.get(key)
  if (!cached) return null
  
  if (Date.now() > cached.expiry) {
    memoryCache.delete(key)
    return null
  }
  
  console.log(`Memory cache HIT for: ${key}`)
  return cached.data
}

function setMemoryCache(key, data, ttl = CACHE_TTL) {
  memoryCache.set(key, {
    data: data,
    expiry: Date.now() + ttl
  })
  console.log(`Memory cached: ${key}`)
}

// Simple 2-tier caching: Memory + KV only (no Cloudflare Cache API)
async function getCachedDataSimple(request, key, kvKey) {
  try {
    console.log(`getCachedDataSimple called: key=${key}, kvKey=${kvKey}`)
    
    // 1. Try memory cache first
    const memCached = getFromMemoryCache(key)
    if (memCached) {
      console.log(`Memory cache hit for: ${key}`)
      return {
        data: memCached,
        source: 'MEMORY',
        response: jsonResponse(memCached, 200, { 
          'Cache-Control': 'public, max-age=43200',
          'X-Cache-Status': 'MEMORY-HIT'
        })
      }
    }

    // 2. Fetch from KV
    if (!ensureEvergreenBinding()) {
      throw new Error('KV binding not available')
    }

    console.log(`Fetching from KV: ${kvKey}`)
    const data = await EVERGREEN.get(kvKey)
    console.log(`KV response for ${kvKey}:`, data ? 'data found' : 'null')
    
    if (data === null) {
      console.log(`No data found in KV for: ${kvKey}`)
      return null
    }

    const parsed = safeJsonParse(data)
    if (parsed === null) {
      throw new Error(`Invalid JSON data for key: ${kvKey}`)
    }

    // Store in memory cache for next time
    setMemoryCache(key, parsed)
    
    console.log(`Returning KV data for: ${kvKey}`)
    return {
      data: parsed,
      source: 'KV',
      response: jsonResponse(parsed, 200, { 
        'Cache-Control': 'public, max-age=43200',
        'X-Cache-Status': 'KV-MISS'
      })
    }
  } catch (error) {
    console.error(`Error in getCachedDataSimple for ${key}:`, error)
    throw error
  }
}

// R2 logging function - only logs requests to valid endpoints
async function storeLogToR2(request, startTime) {
  if (!ensureLogsBucketBinding()) {
    return
  }

  try {
    const endTime = Date.now()
    const timestamp = new Date().toISOString()
    
    // Extract only the fields we want to store
    const logData = {
      timestamp: timestamp,
      url: request.url,
      path: new URL(request.url).pathname,
      connectingIp: request.headers.get('cf-connecting-ip'),
      country: request.headers.get('cf-ipcountry'),
      region: request.cf?.region || null,
      asOrganization: request.cf?.asOrganization || null,
      userAgent: request.headers.get('user-agent'),
      processingTimeMs: endTime - startTime
    }

    // Generate a unique key for the log entry
    const logKey = `logs/${timestamp.slice(0, 10)}/${timestamp}_${Math.random().toString(36).substr(2, 9)}.json`
    
    // Store the log data in R2
    await LOGS_BUCKET.put(logKey, JSON.stringify(logData, null, 2), {
      httpMetadata: {
        contentType: 'application/json'
      }
    })
    
    console.log(`Log stored to R2: ${logKey}`)
  } catch (error) {
    console.error('Failed to store log to R2:', error)
  }
}

// Handle /app endpoint without application name
app.get("/app", async (req, res) => {
  return jsonResponse({
    message: 'Application name is required. Please specify a valid application name in the URL (e.g., /app/MicrosoftEdge). Call /apps for a list of available applications.',
    documentation: 'https://eucpilots.com/evergreen-docs/api/'
  }, 400)
})

// Returns data for a specific app
app.get("/app/:appId", async (req, res) => {
  if (!ensureEvergreenBinding()) {
    return jsonResponse({ message: 'Server configuration error' }, 500)
  }

  const rawAppId = req.params.appId
  if (!validateAppId(rawAppId)) {
    return jsonResponse({
      message: 'Invalid application name. Call /apps for a list of available applications.',
      documentation: 'https://eucpilots.com/evergreen-docs/api/'
    }, 400)
  }

  // Convert to lowercase for consistent key lookup
  const key = rawAppId.toLowerCase()
  console.log("Fetching app:", key)

  try {
    // Use 2-tier caching (memory + KV)
    const cached = await getCachedDataSimple(req, `app:${key}`, key)
    
    if (cached === null) {
      console.log("No data found for app:", key)
      return jsonResponse({
        message: 'Application not found. Call /apps for a list of available applications.',
        documentation: 'https://eucpilots.com/evergreen-docs/api/'
      }, 404, { 'X-Cache-Status': 'NOT-FOUND' })
    }

    console.log(`Returning data for app: ${key} from ${cached.source} cache`)
    return cached.response

  } catch (err) {
    console.error('Error fetching app data:', err)
    console.error('Error stack:', err.stack)
    return jsonResponse({ 
      message: 'Internal server error',
      error: err.message 
    }, 500, { 'X-Cache-Status': 'ERROR' })
  }
});

// Returns data for all supported apps
app.get("/apps", async (req, res) => {
  if (!ensureEvergreenBinding()) {
    return jsonResponse({ message: 'Server configuration error' }, 500)
  }

  console.log("get all apps.")

  try {
    // Use 2-tier caching (memory + KV)
    const cached = await getCachedDataSimple(req, 'apps:all', '_allapps')
    
    if (cached === null) {
      console.log("No data found.")
      return jsonResponse({ message: 'No apps available' }, 404, { 'X-Cache-Status': 'NOT-FOUND' })
    }

    console.log(`Returning apps list from ${cached.source} cache`)
    return cached.response

  } catch (err) {
    console.error('Error fetching apps list:', err)
    console.error('Error stack:', err.stack)
    return jsonResponse({ 
      message: 'Internal server error',
      error: err.message 
    }, 500, { 'X-Cache-Status': 'ERROR' })
  }
});

// Return a message if someone calls /endpoints
app.get('/endpoints', async (req, res) => {
  console.log("GET /endpoints called");
  return jsonResponse({
    message: 'Method not found. Supported endpoint calls are /endpoints/versions and /endpoints/downloads.',
    documentation: 'https://eucpilots.com/evergreen-docs/api/'
  }, 404)
});

// Returns endpoints data for URLs used by Evergreen when finding application versions
app.get("/endpoints/versions", async (req, res) => {
  if (!ensureEvergreenBinding()) {
    return jsonResponse({ message: 'Server configuration error' }, 500)
  }

  console.log("get endpoints from Evergreen manifests.")

  try {
    // Use 2-tier caching (memory + KV)
    const cached = await getCachedDataSimple(req, 'endpoints:versions', 'endpoints-versions')
    
    if (cached === null) {
      console.log("No data found.")
      return jsonResponse({ message: 'No endpoints data available' }, 404, { 'X-Cache-Status': 'NOT-FOUND' })
    }

    console.log(`Returning endpoints/versions from ${cached.source} cache`)
    return cached.response

  } catch (err) {
    console.error('Error fetching endpoints-versions:', err)
    return jsonResponse({ message: 'Internal server error' }, 500, { 'X-Cache-Status': 'ERROR' })
  }
});

// Returns endpoints data for URLs used by Evergreen to download application installers with Save-EvergreenApp
app.get("/endpoints/downloads", async (req, res) => {
  if (!ensureEvergreenBinding()) {
    return jsonResponse({ message: 'Server configuration error' }, 500)
  }

  console.log("get endpoints from downloads returned by Evergreen.")

  try {
    // Use 2-tier caching (memory + KV)
    const cached = await getCachedDataSimple(req, 'endpoints:downloads', 'endpoints-downloads')
    
    if (cached === null) {
      console.log("No data found.")
      return jsonResponse({ message: 'No endpoints data available' }, 404, { 'X-Cache-Status': 'NOT-FOUND' })
    }

    console.log(`Returning endpoints/downloads from ${cached.source} cache`)
    return cached.response

  } catch (err) {
    console.error('Error fetching endpoints-downloads:', err)
    return jsonResponse({ message: 'Internal server error' }, 500, { 'X-Cache-Status': 'ERROR' })
  }
});

// Health check endpoint with cache diagnostics
app.get("/health", async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      bindings: {
        evergreen: typeof EVERGREEN !== 'undefined',
        logsBucket: typeof LOGS_BUCKET !== 'undefined'
      },
      environment: typeof ENVIRONMENT !== 'undefined' ? ENVIRONMENT : 'unknown',
      cache: {
        memorySize: memoryCache.size,
        memoryKeys: Array.from(memoryCache.keys()),
        ttlSeconds: CACHE_TTL / 1000,
        ttlHours: CACHE_TTL / (1000 * 60 * 60)
      }
    }

    // Check for cache clearing request
    let clearCache = false
    try {
      const url = new URL(req.url)
      clearCache = url.searchParams.get('clear') === 'true'
    } catch (e) {
      // If URL parsing fails, just ignore the clear parameter
      console.log('URL parsing failed, ignoring clear parameter')
    }
    
    if (clearCache) {
      memoryCache.clear()
      health.cache.cleared = true
      health.cache.memorySize = 0
      health.cache.memoryKeys = []
      console.log('Memory cache cleared via health endpoint')
    }

    // Try to test KV access if available
    if (typeof EVERGREEN !== 'undefined') {
      try {
        console.log('Testing KV access...')
        // Test if we can access the _allapps key
        const testResult = await EVERGREEN.get('_allapps')
        console.log('KV _allapps result:', testResult ? 'data found' : 'null')
        
        const parsedResult = testResult ? safeJsonParse(testResult) : null
        console.log('Parsed result type:', typeof parsedResult)
        
        health.kvTest = {
          accessible: true,
          hasAllapps: testResult !== null,
          allappsType: typeof parsedResult,
          allappsLength: Array.isArray(parsedResult) ? parsedResult.length : 'not-array',
          rawDataPreview: testResult ? testResult.substring(0, 100) : null
        }
      } catch (error) {
        console.error('KV test error:', error)
        health.kvTest = {
          accessible: false,
          error: error.message
        }
        health.status = 'warning'
      }
    } else {
      health.kvTest = {
        accessible: false,
        error: 'EVERGREEN KV binding is not available'
      }
      health.status = 'warning'
    }

    console.log('Health check result:', JSON.stringify(health, null, 2))
    return jsonResponse(health, 200, { 'X-Cache-Status': clearCache ? 'CLEARED' : 'INFO' })
  } catch (error) {
    console.error('Health check error:', error)
    return jsonResponse({ 
      status: 'error', 
      message: 'Health check failed',
      error: error.message 
    }, 500)
  }
})

// Root endpoint
app.get('/', async (req, res) => {
  console.log(`Root endpoint called!`);
  return jsonResponse({
    message: 'Evergreen API with hybrid caching',
    documentation: 'https://eucpilots.com/evergreen-docs/api/',
    endpoints: ['/apps', '/app/{appId}', '/endpoints/versions', '/endpoints/downloads', '/health'],
    caching: '2-tier: Memory + KV (12h TTL)'
  })
});

// Event listener with R2 logging
addEventListener('fetch', event => {
  const startTime = Date.now()
  const url = new URL(event.request.url)
  const path = url.pathname
  
  console.log('Event received:', event.request.method, event.request.url)
  
  // Determine if this request should be logged to R2
  // Only log requests to main API endpoints, exclude health checks and invalid paths
  // Define exact match endpoints and prefix match endpoints separately
  const exactEndpoints = ['/apps', '/app', '/endpoints/versions', '/endpoints/downloads'];
  const prefixEndpoints = ['/app/', '/apps/', '/endpoints/versions/', '/endpoints/downloads/'];
  const shouldLog = (
    exactEndpoints.includes(path) ||
    prefixEndpoints.some(endpoint => path.startsWith(endpoint))
  ) && path !== '/health';
  
  event.respondWith(
    app.handleRequest(event.request).then(response => {
      // Store log to R2 asynchronously (don't await to avoid delaying response)
      // Only log if it's a valid endpoint
      if (shouldLog) {
        event.waitUntil(storeLogToR2(event.request, startTime))
      }
      return response
    })
  )
})
