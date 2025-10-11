# R2 Logging Implementation

This implementation adds automatic logging of API requests to Cloudflare R2 object storage.

## Features

- **Selective Field Logging**: Only stores essential fields to minimize storage costs
- **Organized Storage**: Logs are organized by date in R2 (`logs/YYYY-MM-DD/`)
- **Performance Optimized**: Logging happens asynchronously to avoid impacting response times
- **Built-in Log Viewer**: `/logs` endpoint for retrieving stored logs

## Logged Fields

Each log entry contains:
- `timestamp`: ISO 8601 timestamp
- `url`: Full request URL
- `path`: Request path
- `connectingIp`: Client IP address (from cf-connecting-ip header)
- `country`: Client country code (from cf-ipcountry header)  
- `userAgent`: Client user agent string
- `processingTimeMs`: Request processing time in milliseconds

## R2 Bucket Structure

```
evergreen-api/
└── logs/
    ├── 2025-10-10/
    │   ├── 2025-10-10T14:30:15.123Z_abc123def.json
    │   ├── 2025-10-10T14:31:22.456Z_xyz789ghi.json
    │   └── ...
    ├── 2025-10-11/
    │   └── ...
    └── ...
```

## Local Log Access

Logs are accessed locally using Wrangler CLI scripts for security. The API does not expose any public log endpoints.

### View Recent Logs
```bash
./scripts/view-logs.sh [date] [limit]
```

Example:
```bash
./scripts/view-logs.sh 2025-10-10 5
```

### Advanced Log Analysis
```bash
./scripts/analyze-logs.sh [command] [options]
```

Available commands:
- `dates` - List all available log dates
- `summary [date]` - Show traffic summary for a date
- `countries [date]` - Show requests by country
- `endpoints [date]` - Show most requested endpoints
- `ips [date]` - Show top IP addresses
- `count [date]` - Count logs for a specific date
- `raw [date] [limit]` - Show raw logs

Examples:
```bash
./scripts/analyze-logs.sh dates
./scripts/analyze-logs.sh summary 2025-10-10
./scripts/analyze-logs.sh countries 2025-10-10
./scripts/analyze-logs.sh endpoints $(date +%Y-%m-%d)
```

## Deployment

1. **Update Wrangler Configuration**: The R2 bucket binding has been added to `wrangler.toml`
2. **Create R2 Bucket**: Run `wrangler r2 bucket create evergreen-api`
3. **Deploy Worker**: Run `wrangler deploy`

Or use the provided script:
```bash
./scripts/deploy-with-r2.sh
```

## Monitoring Logs

Use the provided scripts to view and analyze logs locally:

### Basic Log Viewing
```bash
./scripts/view-logs.sh [date] [limit]
```

### Advanced Analytics
```bash
./scripts/analyze-logs.sh summary 2025-10-10
./scripts/analyze-logs.sh countries $(date +%Y-%m-%d)
```

## Cost Considerations

- **Storage**: R2 storage costs $0.015/GB/month
- **Operations**: Class A operations (PUT) cost $4.50/million
- **Bandwidth**: Egress is free for the first 10GB/month

For a typical API with 10,000 requests/day:
- ~30MB storage/month (assuming 100 bytes per log entry)
- ~300,000 PUT operations/month
- Estimated cost: ~$1.50/month

## Security Notes

- Logs contain IP addresses and user agent strings
- Logs are only accessible locally via Wrangler CLI - no public API endpoints
- Requires Cloudflare authentication to access logs
- Logs are stored indefinitely - implement retention policies as needed