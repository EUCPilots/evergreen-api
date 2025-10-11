#!/bin/bash

# Script to view logs from R2 storage using Wrangler CLI

BUCKET_NAME="evergreen-api"
DATE="${1:-$(date +%Y-%m-%d)}"
LIMIT="${2:-10}"

echo "📊 Fetching logs from R2 bucket: $BUCKET_NAME"
echo "📅 Date: $DATE"
echo "📈 Limit: $LIMIT"
echo ""

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

echo "🔍 Listing log files for $DATE..."

# List objects for the specified date
PREFIX="logs/$DATE/"
OBJECTS=$(wrangler r2 object list $BUCKET_NAME --prefix="$PREFIX" 2>/dev/null | head -n $((LIMIT + 1)))

if [ -z "$OBJECTS" ] || [ "$OBJECTS" = "No objects found." ]; then
    echo "📭 No logs found for $DATE"
    echo ""
    echo "💡 Try a different date or check if logging is working:"
    echo "   $0 $(date -d '1 day ago' +%Y-%m-%d) $LIMIT"
    exit 0
fi

echo "📄 Found log files:"
echo "$OBJECTS" | head -n $LIMIT

echo ""
echo "📖 Retrieving log contents..."

# Get the actual log contents
COUNT=0
echo "$OBJECTS" | head -n $LIMIT | while read -r object_line; do
    if [ -n "$object_line" ] && [ "$object_line" != "No objects found." ]; then
        # Extract object key from the line (first field)
        OBJECT_KEY=$(echo "$object_line" | awk '{print $1}')
        
        if [ -n "$OBJECT_KEY" ]; then
            echo ""
            echo "🔸 $OBJECT_KEY"
            echo "$(printf '─%.0s' {1..80})"
            
            # Download and display the log content
            wrangler r2 object get $BUCKET_NAME "$OBJECT_KEY" --file=- 2>/dev/null | jq '.' 2>/dev/null || {
                echo "❌ Failed to retrieve or parse log content"
            }
            
            COUNT=$((COUNT + 1))
            if [ $COUNT -ge $LIMIT ]; then
                break
            fi
        fi
    fi
done

echo ""
echo "💡 Usage: $0 [date] [limit]"
echo "Example: $0 2025-10-10 5"
echo ""
echo "📁 To list all available dates:"
echo "   wrangler r2 object list $BUCKET_NAME --prefix='logs/' | grep -o 'logs/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/' | sort -u"
