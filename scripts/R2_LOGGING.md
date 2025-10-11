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