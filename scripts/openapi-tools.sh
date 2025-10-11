#!/bin/bash

# OpenAPI Schema Tools
# Provides validation and documentation serving for the Evergreen API

SCHEMA_FILE="../schema/openapi.yml"

function show_help() {
    echo "🔧 OpenAPI Schema Tools"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  validate         Validate the OpenAPI schema"
    echo "  serve-swagger    Serve Swagger UI documentation (port 8080)"
    echo "  serve-redoc      Serve ReDoc documentation (port 8081)"
    echo "  generate-ts      Generate TypeScript client"
    echo "  generate-python  Generate Python client"
    echo "  generate-csharp  Generate C# client"
    echo "  lint             Lint the schema with Spectral"
    echo ""
    echo "Examples:"
    echo "  $0 validate"
    echo "  $0 serve-swagger"
    echo "  $0 generate-ts"
}

function check_file() {
    if [ ! -f "$SCHEMA_FILE" ]; then
        echo "❌ OpenAPI schema file not found: $SCHEMA_FILE"
        exit 1
    fi
}

function validate_schema() {
    echo "🔍 Validating OpenAPI schema..."
    
    if command -v npx &> /dev/null; then
        echo "Using OpenAPI Generator CLI..."
        npx @openapitools/openapi-generator-cli validate -i "$SCHEMA_FILE"
        echo "✅ Validation complete"
    else
        echo "❌ npx not found. Please install Node.js and npm"
        exit 1
    fi
}

function serve_swagger() {
    echo "🚀 Starting Swagger UI server..."
    echo "📖 Documentation will be available at: http://localhost:8080"
    echo "Press Ctrl+C to stop"
    
    if command -v docker &> /dev/null; then
        docker run --rm -p 8080:8080 \
            -e SWAGGER_JSON="/openapi.yml" \
            -v "$(pwd)/$SCHEMA_FILE:/openapi.yml" \
            swaggerapi/swagger-ui
    else
        echo "❌ Docker not found. Please install Docker or use online tools"
        echo "🌐 Alternative: Visit https://editor.swagger.io and upload $SCHEMA_FILE"
        exit 1
    fi
}

function serve_redoc() {
    echo "🚀 Starting ReDoc server..."
    echo "📖 Documentation will be available at: http://localhost:8081"
    echo "Press Ctrl+C to stop"
    
    if command -v docker &> /dev/null; then
        docker run --rm -p 8081:80 \
            -v "$(pwd)/$SCHEMA_FILE:/usr/share/nginx/html/openapi.yml" \
            redocly/redoc
    else
        echo "❌ Docker not found. Please install Docker"
        exit 1
    fi
}

function generate_typescript() {
    echo "🔧 Generating TypeScript client..."
    
    if command -v npx &> /dev/null; then
        npx @openapitools/openapi-generator-cli generate \
            -i "$SCHEMA_FILE" \
            -g typescript-fetch \
            -o ./generated/typescript \
            --additional-properties=npmName=evergreen-api-client,npmVersion=1.0.0
        echo "✅ TypeScript client generated in ./generated/typescript"
    else
        echo "❌ npx not found. Please install Node.js and npm"
        exit 1
    fi
}

function generate_python() {
    echo "🔧 Generating Python client..."
    
    if command -v npx &> /dev/null; then
        npx @openapitools/openapi-generator-cli generate \
            -i "$SCHEMA_FILE" \
            -g python \
            -o ./generated/python \
            --additional-properties=packageName=evergreen_api_client,projectName=evergreen-api-client
        echo "✅ Python client generated in ./generated/python"
    else
        echo "❌ npx not found. Please install Node.js and npm"
        exit 1
    fi
}

function generate_csharp() {
    echo "🔧 Generating C# client..."
    
    if command -v npx &> /dev/null; then
        npx @openapitools/openapi-generator-cli generate \
            -i "$SCHEMA_FILE" \
            -g csharp \
            -o ./generated/csharp \
            --additional-properties=packageName=EvergreenApiClient,clientPackage=EvergreenApiClient
        echo "✅ C# client generated in ./generated/csharp"
    else
        echo "❌ npx not found. Please install Node.js and npm"
        exit 1
    fi
}

function lint_schema() {
    echo "🔍 Linting OpenAPI schema with Spectral..."
    
    if command -v npx &> /dev/null; then
        npx @stoplight/spectral-cli lint "$SCHEMA_FILE"
        echo "✅ Linting complete"
    else
        echo "❌ npx not found. Please install Node.js and npm"
        exit 1
    fi
}

# Check prerequisites
check_file

# Main command processing
case "$1" in
    "validate")
        validate_schema
        ;;
    "serve-swagger")
        serve_swagger
        ;;
    "serve-redoc")
        serve_redoc
        ;;
    "generate-ts")
        generate_typescript
        ;;
    "generate-python")
        generate_python
        ;;
    "generate-csharp")
        generate_csharp
        ;;
    "lint")
        lint_schema
        ;;
    "help"|"--help"|"-h"|"")
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac