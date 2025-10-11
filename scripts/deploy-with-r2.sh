#!/bin/bash

# Script to deploy Evergreen API with R2 logging support

echo "🚀 Deploying Evergreen API with R2 logging..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    echo "❌ Not logged in to Cloudflare. Please run:"
    echo "wrangler login"
    exit 1
fi

echo "📦 Creating R2 bucket if it doesn't exist..."
wrangler r2 bucket create evergreen-api 2>/dev/null || echo "Bucket already exists or you don't have permission to create it"

echo "🔧 Deploying worker..."
wrangler deploy

echo "✅ Deployment complete!"
echo ""
echo "📊 Test the logging functionality:"
echo "1. Make a request to your API endpoint"
echo "2. Check logs with: curl 'https://evergreen-api.your-account.workers.dev/logs?date=$(date +%Y-%m-%d)&limit=5'"
echo ""
echo "🗂️ R2 bucket structure:"
echo "evergreen-api/"
echo "└── logs/"
echo "    └── YYYY-MM-DD/"
echo "        └── timestamp_randomid.json"
