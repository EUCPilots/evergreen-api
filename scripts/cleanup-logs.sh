#!/bin/bash

# Script to clean up old logs from R2 storage
# Usage: ./cleanup-logs.sh [days_to_keep]

DAYS_TO_KEEP="${1:-30}"
BUCKET_NAME="evergreen-api"

echo "🧹 Cleaning up logs older than $DAYS_TO_KEEP days..."

# Calculate cutoff date
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    CUTOFF_DATE=$(date -v-${DAYS_TO_KEEP}d +%Y-%m-%d)
else
    # Linux
    CUTOFF_DATE=$(date -d "$DAYS_TO_KEEP days ago" +%Y-%m-%d)
fi

echo "📅 Cutoff date: $CUTOFF_DATE"

# List all log prefixes (dates)
echo "🔍 Finding log directories to clean..."
wrangler r2 object list $BUCKET_NAME --prefix="logs/" | \
grep "logs/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/" | \
awk '{print $1}' | \
sort -u | \
while read -r log_dir; do
    # Extract date from directory path
    log_date=$(echo "$log_dir" | sed 's/logs\///; s/\///')
    
    # Compare dates
    if [[ "$log_date" < "$CUTOFF_DATE" ]]; then
        echo "🗑️  Deleting logs from $log_date..."
        
        # List and delete all objects in this date directory
        wrangler r2 object list $BUCKET_NAME --prefix="$log_dir" | \
        awk '{print $1}' | \
        while read -r object_key; do
            if [[ -n "$object_key" ]]; then
                wrangler r2 object delete $BUCKET_NAME "$object_key" --force
            fi
        done
    else
        echo "📁 Keeping logs from $log_date"
    fi
done

echo "✅ Cleanup complete!"
echo ""
echo "💡 To automate this cleanup, consider:"
echo "1. Setting up a cron job to run this script weekly"
echo "2. Using Cloudflare Workers Cron Triggers"
echo "3. Implementing R2 lifecycle policies when available"
