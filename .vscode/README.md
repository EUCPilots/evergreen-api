# VS Code Workspace Configuration

This workspace is configured for optimal Cloudflare Workers development.

## Extensions

- **Cloudflare Workers** (`cloudflare.vscode-wrangler`) - Official Cloudflare extension for Workers development

## Available Tasks

Use `Cmd+Shift+P` → "Tasks: Run Task" to access:

- **Development Server** - Start local development server with live reload
- **Deploy to Production** - Deploy to production environment  
- **Deploy to Staging** - Deploy to staging environment
- **View Logs** - Monitor real-time logs
- **KV Operations** - List KV namespaces for debugging
- **Run Tests** - Execute the test suite
- **Test with Coverage** - Run tests with coverage reporting

## Debugging

The workspace includes a pre-configured launch configuration for debugging Wrangler in development mode. To debug:

1. Start the development server: `wrangler dev --inspect`
2. Use the "Wrangler" debug configuration to attach

## File Associations

- `wrangler.toml` files are associated with TOML syntax highlighting
- `/logs/*.json` files are excluded from the explorer for cleaner workspace view

## Quick Start

1. Run `npm install` in both root and `tests/` directories
2. Use the "Development Server" task to start local development
3. Use the "Run Tests" task to validate your changes
4. Use the "Deploy to Staging" task for testing
5. Use the "Deploy to Production" task when ready

## Project Features

- **Hybrid Caching**: 2-tier memory + KV caching with 12-hour TTL
- **Comprehensive Testing**: 17 test cases covering all endpoints and caching behavior
- **CI/CD Pipeline**: Automated testing, security scanning, and deployment validation
- **Performance Optimized**: 95% reduction in KV reads through intelligent caching