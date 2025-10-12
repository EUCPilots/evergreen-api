const request = require('supertest')('https://evergreen-api.stealthpuppy.com');
const assert = require('chai').assert;

// Test configuration
const TEST_USER_AGENT = 'EvergreenAPI_Tests/1.0.0';
const TIMEOUT = 30000; // 30 seconds for external API calls

// Helper function to make requests with proper headers
function makeRequest(path) {
    return request
        .get(path)
        .set('User-Agent', TEST_USER_AGENT)
        .timeout(TIMEOUT);
}

// Helper function to check if this is the new caching API
function isNewCachingAPI(headers) {
    return headers['x-cache-status'] !== undefined;
}

// Root endpoint validation
describe('Root API', () => {
    it('GET / should return API information or 404', () => {
        return makeRequest('/')
            .expect('Content-Type', /json/)
            .then((res) => {
                if (res.status === 200) {
                    // New implementation with root endpoint
                    assert.isObject(res.body);
                    assert.property(res.body, 'message');
                    assert.property(res.body, 'documentation');
                    if (res.body.endpoints) {
                        assert.property(res.body, 'endpoints');
                    }
                    if (res.body.caching) {
                        assert.property(res.body, 'caching');
                        assert.include(res.body.caching, '2-tier');
                    }
                } else if (res.status === 404) {
                    // Current production API behavior
                    assert.isObject(res.body);
                    assert.property(res.body, 'message');
                } else {
                    throw new Error(`Unexpected status: ${res.status}`);
                }
            });
    });
});

// Health endpoint validation  
describe('Health API', () => {
    it('GET /health should return system status', () => {
        return makeRequest('/health')
            .expect('Content-Type', /json/)
            .expect(200)
            .then((res) => {
                assert.isObject(res.body);
                assert.property(res.body, 'status');
                assert.property(res.body, 'timestamp');
                assert.property(res.body, 'bindings');
                
                // Validate bindings
                assert.isObject(res.body.bindings);
                assert.property(res.body.bindings, 'evergreen');
                assert.property(res.body.bindings, 'logsBucket');
                
                // Check for new caching implementation
                if (isNewCachingAPI(res.headers)) {
                    assert.property(res.body, 'cache');
                    assert.isObject(res.body.cache);
                    assert.property(res.body.cache, 'ttlSeconds');
                    assert.property(res.body.cache, 'ttlHours');
                    assert.equal(res.body.cache.ttlSeconds, 43200); // 12 hours
                    assert.equal(res.body.cache.ttlHours, 12);
                }
            });
    });

    it('GET /health should have appropriate headers', () => {
        return makeRequest('/health')
            .expect('Content-Type', /json/)
            .expect(200)
            .then((res) => {
                // New implementation should have cache status header
                if (isNewCachingAPI(res.headers)) {
                    assert.property(res.headers, 'x-cache-status');
                }
            });
    });
});

// Apps endpoint validation
describe('Apps API', () => {
    it('GET /apps should return list of applications', () => {
        return makeRequest('/apps')
            .expect('Content-Type', /json/)
            .then((res) => {
                if (res.status === 200) {
                    assert.isArray(res.body);
                    assert.isNotEmpty(res.body);
                    
                    // Validate first app structure
                    const firstApp = res.body[0];
                    assert.property(firstApp, 'Name');
                    assert.property(firstApp, 'Application');
                    assert.property(firstApp, 'Link');
                    assert.isString(firstApp.Name);
                    assert.isString(firstApp.Application);
                    assert.match(firstApp.Link, /^https?:\/\//);
                } else if (res.status === 404) {
                    // Expected if KV store is empty or old API
                    assert.isObject(res.body);
                    assert.property(res.body, 'message');
                } else {
                    throw new Error(`Unexpected status code: ${res.status}`);
                }
            });
    });

    it('GET /apps should have proper caching headers', () => {
        return makeRequest('/apps')
            .then((res) => {
                if (res.status === 200) {
                    assert.property(res.headers, 'cache-control');
                    
                    // Check for new vs old caching implementation
                    if (isNewCachingAPI(res.headers)) {
                        // New implementation: 12 hours
                        assert.include(res.headers['cache-control'], 'max-age=43200');
                        assert.property(res.headers, 'x-cache-status');
                    } else {
                        // Current production: 5 minutes
                        assert.include(res.headers['cache-control'], 'max-age=300');
                    }
                }
            });
    });

    it('GET /apps caching behavior validation', () => {
        // Only test caching behavior on new API
        return makeRequest('/health')
            .then((healthRes) => {
                if (!isNewCachingAPI(healthRes.headers)) {
                    console.log('Skipping caching test - running against production API');
                    return Promise.resolve();
                }
                
                // Clear cache first (only works on new API)
                return makeRequest('/health?clear=true')
                    .then(() => makeRequest('/apps'))
                    .then((firstRes) => {
                        if (firstRes.status === 200) {
                            return makeRequest('/apps')
                                .then((secondRes) => {
                                    // Verify caching headers exist
                                    assert.property(firstRes.headers, 'x-cache-status');
                                    assert.property(secondRes.headers, 'x-cache-status');
                                    
                                    // Data should be identical
                                    assert.deepEqual(firstRes.body, secondRes.body);
                                });
                        }
                    });
            });
    });
});

// Individual app endpoint validation
describe('App API', () => {
    it('GET /app/MicrosoftEdge should return app details or not found', () => {
        return makeRequest('/app/MicrosoftEdge')
            .expect('Content-Type', /json/)
            .then((res) => {
                if (res.status === 200) {
                    // App data exists - validate structure
                    if (Array.isArray(res.body)) {
                        // Production API returns array
                        assert.isArray(res.body);
                        assert.isNotEmpty(res.body);
                        
                        const firstItem = res.body[0];
                        assert.property(firstItem, 'Version');
                        assert.property(firstItem, 'URI');
                    } else {
                        // New API returns object
                        assert.isObject(res.body);
                        assert.property(res.body, 'Version');
                        assert.property(res.body, 'URI');
                    }
                    
                    // Check cache headers
                    assert.property(res.headers, 'cache-control');
                } else if (res.status === 404) {
                    // Expected if no data in KV
                    assert.property(res.body, 'message');
                    assert.include(res.body.message, 'Application not found');
                } else {
                    throw new Error(`Unexpected status code: ${res.status}`);
                }
            });
    });

    it('GET /app without name should return 400 error', () => {
        return makeRequest('/app')
            .expect('Content-Type', /json/)
            .expect(400)
            .then((res) => {
                assert.property(res.body, 'message');
                assert.include(res.body.message, 'Application name is required');
                assert.property(res.body, 'documentation');
            });
    });

    it('GET /app/InvalidApp123!@# should return 400 for invalid app name', () => {
        return makeRequest('/app/InvalidApp123!@#')
            .expect('Content-Type', /json/)
            .expect(400)
            .then((res) => {
                assert.property(res.body, 'message');
                assert.include(res.body.message, 'Invalid application name');
            });
    });

    it('GET /app/NonExistentApp should return 404', () => {
        return makeRequest('/app/NonExistentApp')
            .expect('Content-Type', /json/)
            .expect(404)
            .then((res) => {
                assert.property(res.body, 'message');
                assert.include(res.body.message, 'Application not found');
            });
    });
});

// Endpoints API validation
describe('Endpoints API', () => {
    it('GET /endpoints should return method guidance', () => {
        return makeRequest('/endpoints')
            .expect('Content-Type', /json/)
            .expect(404)
            .then((res) => {
                assert.property(res.body, 'message');
                assert.include(res.body.message, 'Supported endpoint calls are');
                assert.include(res.body.message, '/endpoints/versions');
                assert.include(res.body.message, '/endpoints/downloads');
            });
    });

    it('GET /endpoints/versions should return version endpoints', () => {
        return makeRequest('/endpoints/versions')
            .expect('Content-Type', /json/)
            .then((res) => {
                if (res.status === 200) {
                    assert.isArray(res.body);
                    if (res.body.length > 0) {
                        const firstEndpoint = res.body[0];
                        assert.property(firstEndpoint, 'Application');
                        assert.property(firstEndpoint, 'Endpoints');
                        assert.isArray(firstEndpoint.Endpoints);
                    }
                    
                    // Check cache headers based on implementation
                    assert.property(res.headers, 'cache-control');
                    if (isNewCachingAPI(res.headers)) {
                        assert.include(res.headers['cache-control'], 'max-age=43200');
                        assert.property(res.headers, 'x-cache-status');
                    } else {
                        assert.include(res.headers['cache-control'], 'max-age=300');
                    }
                } else if (res.status === 404) {
                    assert.property(res.body, 'message');
                    assert.include(res.body.message, 'No endpoints data available');
                }
            });
    });

    it('GET /endpoints/downloads should return download endpoints', () => {
        return makeRequest('/endpoints/downloads')
            .expect('Content-Type', /json/)
            .then((res) => {
                if (res.status === 200) {
                    assert.isArray(res.body);
                    if (res.body.length > 0) {
                        const firstEndpoint = res.body[0];
                        assert.property(firstEndpoint, 'Application');
                        assert.property(firstEndpoint, 'Endpoints');
                        assert.isArray(firstEndpoint.Endpoints);
                    }
                    
                    // Check cache headers based on implementation
                    assert.property(res.headers, 'cache-control');
                    if (isNewCachingAPI(res.headers)) {
                        assert.include(res.headers['cache-control'], 'max-age=43200');
                        assert.property(res.headers, 'x-cache-status');
                    } else {
                        assert.include(res.headers['cache-control'], 'max-age=300');
                    }
                } else if (res.status === 404) {
                    assert.property(res.body, 'message');
                    assert.include(res.body.message, 'No endpoints data available');
                }
            });
    });
});

// Performance and caching validation
describe('Caching Performance', () => {
    it('Should work with both old and new caching implementations', () => {
        return makeRequest('/health')
            .then((healthRes) => {
                if (isNewCachingAPI(healthRes.headers)) {
                    console.log('Testing new hybrid caching implementation');
                    
                    // Test new caching system
                    return makeRequest('/health?clear=true')
                        .then(() => makeRequest('/apps'))
                        .then((firstRes) => {
                            if (firstRes.status === 200) {
                                return makeRequest('/apps')
                                    .then((secondRes) => {
                                        assert.deepEqual(firstRes.body, secondRes.body);
                                        assert.property(secondRes.headers, 'x-cache-status');
                                    });
                            }
                        });
                } else {
                    console.log('Testing against production API (old caching)');
                    
                    // Just verify production API is working
                    return makeRequest('/apps')
                        .then((res) => {
                            if (res.status === 200) {
                                assert.isArray(res.body);
                            }
                        });
                }
            });
    });
});

// Error handling validation
describe('Error Handling', () => {
    it('Should handle requests appropriately', () => {
        return request
            .get('/health')
            .timeout(TIMEOUT)
            .then((res) => {
                // API might return 403 for missing User-Agent (production) or 200 (new implementation)
                assert.oneOf(res.status, [200, 403]);
            });
    });

    it('Should return proper documentation links in errors', () => {
        return makeRequest('/app')
            .expect(400)
            .then((res) => {
                assert.property(res.body, 'documentation');
                assert.match(res.body.documentation, /^https?:\/\//);
                assert.include(res.body.documentation, 'eucpilots.com');
            });
    });

    it('Should validate API consistency', () => {
        return makeRequest('/health')
            .then((res) => {
                assert.property(res.body, 'status');
                assert.property(res.body, 'timestamp');
                assert.property(res.body, 'bindings');
                
                console.log(`API Version: ${isNewCachingAPI(res.headers) ? 'New Hybrid Caching' : 'Production'}`);
                console.log(`Environment: ${res.body.environment || 'unknown'}`);
                console.log(`KV Available: ${res.body.bindings.evergreen}`);
                console.log(`R2 Available: ${res.body.bindings.logsBucket}`);
                
                if (res.body.kvTest) {
                    console.log(`KV Data Available: ${res.body.kvTest.hasAllapps || false}`);
                }
            });
    });
});
