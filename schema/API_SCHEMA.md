# OpenAPI Schema

This directory contains the OpenAPI v3 specification for the Evergreen API.

## Files

- `openapi.yml` - Complete OpenAPI v3.0 specification with all endpoints, schemas, and examples
- `swagger.yml` - Legacy Swagger specification (for compatibility)

## API Overview

The Evergreen API provides programmatic access to the latest version information and download URLs for popular software applications. It's designed to help system administrators and IT professionals keep their software up-to-date.

### Main Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /apps` | List all supported applications |
| `GET /app/{appId}` | Get version details for a specific application |
| `GET /endpoints/versions` | Get endpoints used for version checking |
| `GET /endpoints/downloads` | Get endpoints used for downloads |

### Authentication

No authentication is required for public endpoints.

### Rate Limiting

The API includes caching headers to optimize performance:
- Application data is cached for 5 minutes (`max-age=300`)
- Use conditional requests with caching headers when possible

### Example Usage

```bash
# List all applications
curl https://evergreen-api.stealthpuppy.com/apps

# Get Microsoft Edge details
curl https://evergreen-api.stealthpuppy.com/app/MicrosoftEdge

# Get version check endpoints
curl https://evergreen-api.stealthpuppy.com/endpoints/versions
```

## Using the Schema

### Code Generation

You can generate client SDKs using the OpenAPI schema:

```bash
# Generate TypeScript client
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yml \
  -g typescript-fetch \
  -o ./generated/typescript

# Generate Python client
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yml \
  -g python \
  -o ./generated/python

# Generate C# client
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yml \
  -g csharp \
  -o ./generated/csharp
```

### API Documentation

You can serve interactive API documentation using various tools:

#### Swagger UI

```bash
# Using Docker
docker run -p 8080:8080 \
  -e SWAGGER_JSON=/openapi.yml \
  -v $(pwd)/openapi.yml:/openapi.yml \
  swaggerapi/swagger-ui

# Then visit http://localhost:8080
```

#### Redoc

```bash
# Using npx
npx redoc-cli serve openapi.yml

# Or using Docker
docker run -p 8080:80 \
  -v $(pwd)/openapi.yml:/usr/share/nginx/html/openapi.yml \
  redocly/redoc
```

### Validation

Validate the OpenAPI schema:

```bash
# Using swagger-codegen
npx swagger-codegen-cli validate -i openapi.yml

# Using openapi-generator
npx @openapitools/openapi-generator-cli validate -i openapi.yml

# Using spectral (more comprehensive)
npx @stoplight/spectral-cli lint openapi.yml
```

## Schema Features

The OpenAPI schema includes:

- ✅ Complete endpoint documentation
- ✅ Request/response schemas with examples
- ✅ Error response definitions
- ✅ Parameter validation rules
- ✅ Cache control headers
- ✅ Comprehensive descriptions
- ✅ Type definitions for all data structures

## Integration Examples

### JavaScript/TypeScript

```typescript
// Using fetch API
const response = await fetch('https://evergreen-api.stealthpuppy.com/apps');
const apps = await response.json();

// Using generated client
import { DefaultApi } from './generated/typescript';

const api = new DefaultApi();
const apps = await api.appsGet();
```

### Python

```python
import requests

# Direct API call
response = requests.get('https://evergreen-api.stealthpuppy.com/apps')
apps = response.json()

# Using generated client
from generated.python import DefaultApi

api = DefaultApi()
apps = api.apps_get()
```

### PowerShell

```powershell
# Direct API call
$apps = Invoke-RestMethod -Uri 'https://evergreen-api.stealthpuppy.com/apps'

# Get specific app
$edge = Invoke-RestMethod -Uri 'https://evergreen-api.stealthpuppy.com/app/MicrosoftEdge'
```

## Contributing

When updating the API:

1. Update the OpenAPI schema in `openapi.yml`
2. Validate the schema using tools mentioned above
3. Test with generated clients
4. Update version number in the `info` section
5. Add new examples for new endpoints
