// Uses the cloudflare-worker-rest-api package
import restCfWorker from 'cloudflare-worker-rest-api'
const app = new restCfWorker()

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
  if (typeof EVERGREEN === 'undefined') {
    console.error('EVERGREEN KV binding is not available')
    return false
  }
  return true
}

function ensureLogsBucketBinding() {
  if (typeof LOGS_BUCKET === 'undefined') {
    console.error('LOGS_BUCKET R2 binding is not available')
    return false
  }
  return true
}

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
    const data = await EVERGREEN.get(key)

    if (data === null) {
      console.log("No data found for app:", key)
      return jsonResponse({
        message: 'Application not found. Call /apps for a list of available applications.',
        documentation: 'https://eucpilots.com/evergreen-docs/api/'
      }, 404)
    }

    const parsed = safeJsonParse(data)
    if (parsed === null) {
      console.error(`Invalid JSON data for app: ${key}`)
      return jsonResponse({ message: 'Stored data is corrupted' }, 500)
    }

    console.log("Returning data for app:", key)
    return jsonResponse(parsed, 200, { 'Cache-Control': 'public, max-age=300' })

  } catch (err) {
    console.error('Error fetching app data:', err)
    return jsonResponse({ message: 'Internal server error' }, 500)
  }
});

// Returns data for all supported apps
app.get("/apps", async (req, res) => {
  if (!ensureEvergreenBinding()) {
    return jsonResponse({ message: 'Server configuration error' }, 500)
  }

  console.log("get all apps.")

  try {
    const data = await EVERGREEN.get("_allapps")

    if (data === null) {
      console.log("No data found.")
      return jsonResponse({ message: 'No apps available' }, 404)
    }

    const parsed = safeJsonParse(data)
    if (parsed === null) {
      console.error('Invalid JSON data for _allapps')
      return jsonResponse({ message: 'Stored data is corrupted' }, 500)
    }

    return jsonResponse(parsed, 200, { 'Cache-Control': 'public, max-age=300' })

  } catch (err) {
    console.error('Error fetching apps list:', err)
    return jsonResponse({ message: 'Internal server error' }, 500)
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
  console.log(req.params)

  try {
    const data = await EVERGREEN.get("endpoints-versions")

    if (data === null) {
      console.log("No data found.")
      return jsonResponse({ message: 'No endpoints data available' }, 404)
    }

    const parsed = safeJsonParse(data)
    if (parsed === null) {
      console.error('Invalid JSON data for endpoints-versions')
      return jsonResponse({ message: 'Stored data is corrupted' }, 500)
    }

    return jsonResponse(parsed, 200, { 'Cache-Control': 'public, max-age=300' })

  } catch (err) {
    console.error('Error fetching endpoints-versions:', err)
    return jsonResponse({ message: 'Internal server error' }, 500)
  }
});

// Returns endpoints data for URLs used by Evergreen to download application installers with Save-EvergreenApp
app.get("/endpoints/downloads", async (req, res) => {
  if (!ensureEvergreenBinding()) {
    return jsonResponse({ message: 'Server configuration error' }, 500)
  }

  console.log("get endpoints from downloads returned by Evergreen.")
  console.log(req.params)

  try {
    const data = await EVERGREEN.get("endpoints-downloads")

    if (data === null) {
      console.log("No data found.")
      return jsonResponse({ message: 'No endpoints data available' }, 404)
    }

    const parsed = safeJsonParse(data)
    if (parsed === null) {
      console.error('Invalid JSON data for endpoints-downloads')
      return jsonResponse({ message: 'Stored data is corrupted' }, 500)
    }

    return jsonResponse(parsed, 200, { 'Cache-Control': 'public, max-age=300' })

  } catch (err) {
    console.error('Error fetching endpoints-downloads:', err)
    return jsonResponse({ message: 'Internal server error' }, 500)
  }
});

// Return data for /*
app.get('/', async (req, res) => {
  console.log(`Received request: ${req.method} ${req.url}`);
  return jsonResponse({
    message: 'Method not found.',
    documentation: 'https://eucpilots.com/evergreen-docs/api/'
  }, 404)
});

// Responder
addEventListener('fetch', event => {
  const startTime = Date.now()
  
  event.respondWith(
    app.handleRequest(event.request).then(response => {
      // Store log to R2 asynchronously (don't await to avoid delaying response)
      event.waitUntil(storeLogToR2(event.request, startTime))
      return response
    })
  )
})
