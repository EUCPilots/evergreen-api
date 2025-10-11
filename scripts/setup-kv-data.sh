#!/bin/bash

# KV Data Setup Script
# Populates the EVERGREEN KV namespace with sample data for testing

KV_NAMESPACE_ID="037069e7da3e4944be2cbc97c92409a5"

echo "🗂️  Setting up sample data for EVERGREEN KV namespace"
echo "Namespace ID: $KV_NAMESPACE_ID"
echo ""

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

echo "📝 Adding sample applications list..."
wrangler kv:key put "_allapps" '[
  {
    "Name": "MicrosoftEdge",
    "Application": "Microsoft Edge",
    "Link": "https://www.microsoft.com/edge"
  },
  {
    "Name": "MozillaFirefox", 
    "Application": "Mozilla Firefox",
    "Link": "https://www.mozilla.org/firefox/"
  },
  {
    "Name": "GoogleChrome",
    "Application": "Google Chrome", 
    "Link": "https://www.google.com/chrome/"
  }
]' --namespace-id="$KV_NAMESPACE_ID"

echo "📝 Adding sample Microsoft Edge data..."
wrangler kv:key put "microsoftedge" '{
  "Version": "119.0.2151.44",
  "URI": "https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/df5f91af-5996-41be-b122-e2c697f911fe/MicrosoftEdgeEnterpriseX64.msi",
  "Size": 157286400,
  "Architecture": "x64",
  "Type": "msi"
}' --namespace-id="$KV_NAMESPACE_ID"

echo "📝 Adding sample Mozilla Firefox data..."
wrangler kv:key put "mozillafirefox" '{
  "Version": "119.0.1",
  "URI": "https://download.mozilla.org/?product=firefox-latest&os=win64&lang=en-US",
  "Architecture": "x64",
  "Type": "exe"
}' --namespace-id="$KV_NAMESPACE_ID"

echo "📝 Adding sample Google Chrome data..."
wrangler kv:key put "googlechrome" '{
  "Version": "119.0.6045.105",
  "URI": "https://dl.google.com/chrome/install/GoogleChromeStandaloneEnterprise64.msi",
  "Architecture": "x64", 
  "Type": "msi"
}' --namespace-id="$KV_NAMESPACE_ID"

echo "📝 Adding endpoints-versions data..."
wrangler kv:key put "endpoints-versions" '[
  {
    "Application": "Microsoft Edge",
    "Endpoints": ["edgeupdates.microsoft.com", "www.microsoft.com"]
  },
  {
    "Application": "Mozilla Firefox", 
    "Endpoints": ["aus5.mozilla.org", "download.mozilla.org"]
  },
  {
    "Application": "Google Chrome",
    "Endpoints": ["update.googleapis.com", "dl.google.com"]
  }
]' --namespace-id="$KV_NAMESPACE_ID"

echo "📝 Adding endpoints-downloads data..."
wrangler kv:key put "endpoints-downloads" '[
  {
    "Application": "Microsoft Edge",
    "Endpoints": ["msedge.sf.dl.delivery.mp.microsoft.com"]
  },
  {
    "Application": "Mozilla Firefox",
    "Endpoints": ["download.mozilla.org", "ftp.mozilla.org"]
  },
  {
    "Application": "Google Chrome", 
    "Endpoints": ["dl.google.com"]
  }
]' --namespace-id="$KV_NAMESPACE_ID"

echo ""
echo "✅ Sample data setup complete!"
echo ""
echo "🔍 Verify the data was added:"
echo "wrangler kv:key list --namespace-id='$KV_NAMESPACE_ID'"
echo ""
echo "🧪 Test your API:"
echo "1. Deploy your worker: wrangler deploy"
echo "2. Test health endpoint: curl https://your-worker.workers.dev/health"
echo "3. Test apps endpoint: curl https://your-worker.workers.dev/apps"
echo "4. Test specific app: curl https://your-worker.workers.dev/app/MicrosoftEdge"