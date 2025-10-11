# Troubleshooting Guide: "Server configuration error"

If you're getting "Server configuration error" when accessing `/apps` or `/app/{appId}`, this indicates that the EVERGREEN KV binding is not available to your Worker. Here's how to diagnose and fix this issue.

## Quick Fix Steps

### 1. Check if Wrangler is installed
```bash
# Install wrangler if not available
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### 2. Test the new health endpoint
```bash
# Deploy with the new health endpoint
wrangler deploy

# Test the health endpoint to see binding status
curl https://your-worker-url.workers.dev/health
```

### 3. Check KV namespace exists and has data
```bash
# List your KV namespaces
wrangler kv:namespace list

# Check if the specific namespace exists
wrangler kv:key list --namespace-id="037069e7da3e4944be2cbc97c92409a5"
```

### 4. Setup sample data (if namespace is empty)
```bash
# Run the setup script to populate with sample data
./scripts/setup-kv-data.sh
```

## Detailed Troubleshooting

### Issue 1: KV Namespace Doesn't Exist

**Symptoms:** Worker throws "Server configuration error"

**Solution:**
```bash
# Create the KV namespace
wrangler kv:namespace create EVERGREEN

# For preview environment
wrangler kv:namespace create EVERGREEN --preview

# Update wrangler.toml with the new namespace IDs
```

### Issue 2: KV Namespace is Empty

**Symptoms:** Health endpoint shows `hasAllapps: false`

**Solution:**
```bash
# Use the setup script
./scripts/setup-kv-data.sh

# Or manually add the minimum required data
wrangler kv:key put "_allapps" '[{"Name":"Test","Application":"Test App","Link":"https://example.com"}]' --namespace-id="037069e7da3e4944be2cbc97c92409a5"
```

### Issue 3: Wrong Environment

**Symptoms:** Works locally but fails when deployed

**Solution:**
```bash
# Deploy to specific environment
wrangler deploy --env production

# Or check which environment you're deploying to
wrangler deploy --dry-run
```

### Issue 4: Permissions Issues

**Symptoms:** KV operations fail with permission errors

**Solution:**
1. Check your Cloudflare account permissions
2. Ensure you have KV read/write permissions
3. Verify the account_id in wrangler.toml matches your account

### Issue 5: Binding Name Mismatch

**Symptoms:** Binding exists but Worker can't access it

**Check:**
1. Verify binding name is exactly "EVERGREEN" in wrangler.toml
2. Ensure there are no typos in the binding configuration
3. Check if binding is defined in the correct environment section

## Testing Your Fix

### 1. Local Development
```bash
# Test locally
wrangler dev

# In another terminal, test endpoints
curl http://localhost:8787/health
curl http://localhost:8787/apps
curl http://localhost:8787/app/MicrosoftEdge
```

### 2. Production Testing
```bash
# Deploy to production
wrangler deploy

# Test production endpoints
curl https://your-worker-url.workers.dev/health
curl https://your-worker-url.workers.dev/apps
```

## Health Check Endpoint

The new `/health` endpoint provides detailed information about binding status:

```json
{
  "status": "ok",
  "timestamp": "2025-10-12T10:30:00.000Z",
  "bindings": {
    "evergreen": true,
    "logsBucket": true
  },
  "environment": "production",
  "kvTest": {
    "accessible": true,
    "hasAllapps": true,
    "allappsType": "object"
  }
}
```

**What to look for:**
- `bindings.evergreen` should be `true`
- `kvTest.accessible` should be `true`
- `kvTest.hasAllapps` should be `true`

## Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| "Server configuration error" | KV binding not available | Check namespace exists and binding is correct |
| "No apps available" | KV namespace empty or _allapps key missing | Run setup script or add data manually |
| "Stored data is corrupted" | Invalid JSON in KV | Check and fix the JSON data in KV |
| "Application not found" | Specific app key doesn't exist | Add the app data to KV |

## Prevention

To avoid these issues in the future:

1. **Always test locally first:** `wrangler dev`
2. **Use the health endpoint:** Monitor binding status
3. **Backup KV data:** Export important keys regularly
4. **Version your data:** Track changes to KV content
5. **Monitor logs:** Watch for binding-related errors

## Get Help

If you're still having issues:

1. Check the health endpoint output
2. Review Wrangler logs: `wrangler tail`
3. Test with minimal data first
4. Verify account permissions in Cloudflare dashboard