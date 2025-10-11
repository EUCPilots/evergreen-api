#!/bin/bash

# Evergreen API Diagnostics Script
# Helps troubleshoot common issues with KV bindings and data

echo "🔍 Evergreen API Diagnostics"
echo "============================"
echo ""

# Check if wrangler is installed and user is logged in
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

if ! wrangler whoami &> /dev/null; then
    echo "❌ Not logged in to Cloudflare. Please run:"
    echo "wrangler login"
    exit 1
fi

echo "✅ Wrangler CLI is available and authenticated"
echo ""

# Get KV namespace info from wrangler.toml
KV_ID="037069e7da3e4944be2cbc97c92409a5"
echo "🗂️  Checking KV namespace: $KV_ID"
echo ""

# List KV namespaces to verify it exists
echo "📋 Available KV namespaces:"
wrangler kv namespace list 2>/dev/null | head -10

echo ""

# Check if the specific namespace exists
echo "🔍 Checking if EVERGREEN namespace exists..."
if wrangler kv namespace list 2>/dev/null | grep -q "$KV_ID"; then
    echo "✅ EVERGREEN KV namespace found"
else
    echo "❌ EVERGREEN KV namespace not found"
    echo ""
    echo "🔧 To create the namespace:"
    echo "wrangler kv namespace create EVERGREEN"
    echo "wrangler kv namespace create EVERGREEN --preview"
    echo ""
    echo "Then update wrangler.toml with the new namespace IDs"
    exit 1
fi

echo ""

# Check if namespace has data
echo "🗃️  Checking KV namespace contents..."
KEYS=$(wrangler kv key list --namespace-id="$KV_ID" 2>/dev/null)

if [ -z "$KEYS" ] || [ "$KEYS" = "[]" ]; then
    echo "❌ KV namespace is empty"
    echo ""
    echo "🔧 The namespace exists but has no data. You need to populate it with:"
    echo "1. Application data (e.g., 'microsoftedge', 'mozillafirefox')"
    echo "2. Apps list ('_allapps')"
    echo "3. Endpoints data ('endpoints-versions', 'endpoints-downloads')"
    echo ""
    echo "📝 Example commands to add test data:"
    echo "wrangler kv key put '_allapps' '[{\"Name\":\"MicrosoftEdge\",\"Application\":\"Microsoft Edge\",\"Link\":\"https://www.microsoft.com/edge\"}]' --namespace-id='$KV_ID'"
    echo "wrangler kv key put 'microsoftedge' '{\"Version\":\"119.0.2151.44\",\"URI\":\"https://example.com/edge.msi\"}' --namespace-id='$KV_ID'"
else
    echo "✅ KV namespace contains data"
    echo ""
    echo "🗂️  Found keys:"
    echo "$KEYS" | jq -r '.[] | .name' 2>/dev/null || echo "$KEYS"
    
    echo ""
    echo "🔍 Checking critical keys:"
    
    # Check for _allapps
    if echo "$KEYS" | grep -q "_allapps"; then
        echo "✅ _allapps key found"
        echo "📄 Sample content:"
        wrangler kv key get "_allapps" --namespace-id="$KV_ID" 2>/dev/null | jq . 2>/dev/null | head -10
    else
        echo "❌ _allapps key missing"
    fi
    
    echo ""
    
    # Check for endpoints data
    if echo "$KEYS" | grep -q "endpoints-versions"; then
        echo "✅ endpoints-versions key found"
    else
        echo "❌ endpoints-versions key missing"
    fi
    
    if echo "$KEYS" | grep -q "endpoints-downloads"; then
        echo "✅ endpoints-downloads key found"
    else
        echo "❌ endpoints-downloads key missing"
    fi
fi

echo ""

# Check R2 bucket
echo "🪣 Checking R2 bucket..."
if wrangler r2 bucket list 2>/dev/null | grep -q "evergreen-api"; then
    echo "✅ R2 bucket 'evergreen-api' found"
else
    echo "❌ R2 bucket 'evergreen-api' not found"
    echo "🔧 Create it with: wrangler r2 bucket create evergreen-api"
fi

echo ""

# Test deployment
echo "🚀 Testing deployment..."
echo "💡 To test your worker locally:"
echo "wrangler dev"
echo ""
echo "💡 To deploy to production:"
echo "wrangler deploy"
echo ""

# Environment check
echo "🌍 Environment information:"
echo "Current directory: $(pwd)"
echo "Wrangler version: $(wrangler --version 2>/dev/null || echo 'unknown')"
echo ""

echo "🔧 Common fixes:"
echo "1. If KV namespace is empty, populate it with application data"
echo "2. If namespace doesn't exist, create it and update wrangler.toml"
echo "3. If still getting errors, try: wrangler dev --local"
echo "4. Check account permissions for KV and R2 access"
echo ""

echo "✅ Diagnostics complete!"