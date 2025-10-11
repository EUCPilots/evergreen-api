#!/bin/bash

# Advanced log analysis script for R2 storage
# Provides various analytics and filtering options

BUCKET_NAME="evergreen-api"

function show_help() {
    echo "🔍 Advanced Log Analysis Tool"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  dates                    List all available log dates"
    echo "  count [date]            Count logs for a specific date"
    echo "  summary [date]          Show traffic summary for a date"
    echo "  countries [date]        Show requests by country"
    echo "  regions [date]          Show requests by region/state"
    echo "  organizations [date]    Show requests by ISP/organization"
    echo "  endpoints [date]        Show most requested endpoints"
    echo "  ips [date]              Show top IP addresses"
    echo "  errors [date]           Show error analysis (if available)"
    echo "  raw [date] [limit]      Show raw logs (same as view-logs.sh)"
    echo ""
    echo "Options:"
    echo "  date: YYYY-MM-DD format (default: today)"
    echo "  limit: number of results (default: 10)"
    echo ""
    echo "Examples:"
    echo "  $0 dates"
    echo "  $0 summary 2025-10-10"
    echo "  $0 countries 2025-10-10"
    echo "  $0 regions 2025-10-10"
    echo "  $0 organizations 2025-10-10"
    echo "  $0 endpoints $(date +%Y-%m-%d)"
}

function check_prerequisites() {
    if ! command -v wrangler &> /dev/null; then
        echo "❌ Wrangler CLI not found. Please install it first:"
        echo "npm install -g wrangler"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        echo "❌ jq not found. Please install it first:"
        echo "brew install jq  # on macOS"
        echo "sudo apt-get install jq  # on Ubuntu"
        exit 1
    fi

    if ! wrangler whoami &> /dev/null; then
        echo "❌ Not logged in to Cloudflare. Please run:"
        echo "wrangler login"
        exit 1
    fi
}

function list_dates() {
    echo "📅 Available log dates:"
    wrangler r2 object list $BUCKET_NAME --prefix='logs/' 2>/dev/null | \
    grep -o 'logs/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/' | \
    sed 's/logs\///; s/\///' | \
    sort -u | \
    while read -r date; do
        count=$(wrangler r2 object list $BUCKET_NAME --prefix="logs/$date/" 2>/dev/null | wc -l)
        echo "  📆 $date ($count logs)"
    done
}

function get_logs_for_date() {
    local date="$1"
    local limit="$2"
    
    echo "🔍 Retrieving logs for $date..."
    
    # Get all log files for the date and process them
    wrangler r2 object list $BUCKET_NAME --prefix="logs/$date/" 2>/dev/null | \
    head -n "${limit:-1000}" | \
    while read -r object_line; do
        if [ -n "$object_line" ] && [ "$object_line" != "No objects found." ]; then
            OBJECT_KEY=$(echo "$object_line" | awk '{print $1}')
            if [ -n "$OBJECT_KEY" ]; then
                wrangler r2 object get $BUCKET_NAME "$OBJECT_KEY" --file=- 2>/dev/null
            fi
        fi
    done
}

function count_logs() {
    local date="${1:-$(date +%Y-%m-%d)}"
    echo "📊 Counting logs for $date..."
    
    count=$(wrangler r2 object list $BUCKET_NAME --prefix="logs/$date/" 2>/dev/null | wc -l)
    echo "📈 Total logs: $count"
}

function traffic_summary() {
    local date="${1:-$(date +%Y-%m-%d)}"
    echo "📊 Traffic summary for $date..."
    
    # Create temporary file for processing
    temp_file=$(mktemp)
    
    get_logs_for_date "$date" 1000 > "$temp_file"
    
    if [ ! -s "$temp_file" ]; then
        echo "📭 No logs found for $date"
        rm "$temp_file"
        return
    fi
    
    total_requests=$(cat "$temp_file" | jq -s length)
    unique_ips=$(cat "$temp_file" | jq -r '.connectingIp' | sort -u | wc -l)
    countries=$(cat "$temp_file" | jq -r '.country' | sort -u | wc -l)
    regions=$(cat "$temp_file" | jq -r '.region // "null"' | sort -u | wc -l)
    organizations=$(cat "$temp_file" | jq -r '.asOrganization // "null"' | sort -u | wc -l)
    avg_processing_time=$(cat "$temp_file" | jq '.processingTimeMs' | awk '{sum+=$1; count++} END {if(count>0) print sum/count; else print 0}')
    
    echo "📈 Total requests: $total_requests"
    echo "🌐 Unique IPs: $unique_ips"
    echo "🗺️  Countries: $countries"
    echo "📍 Regions: $regions"
    echo "🏢 Organizations: $organizations"
    echo "⏱️  Average processing time: ${avg_processing_time}ms"
    
    rm "$temp_file"
}

function analyze_countries() {
    local date="${1:-$(date +%Y-%m-%d)}"
    echo "🗺️ Requests by country for $date..."
    
    temp_file=$(mktemp)
    get_logs_for_date "$date" 1000 > "$temp_file"
    
    if [ ! -s "$temp_file" ]; then
        echo "📭 No logs found for $date"
        rm "$temp_file"
        return
    fi
    
    echo "Top countries:"
    cat "$temp_file" | jq -r '.country' | sort | uniq -c | sort -nr | head -10 | \
    while read -r count country; do
        echo "  🌍 $country: $count requests"
    done
    
    rm "$temp_file"
}

function analyze_regions() {
    local date="${1:-$(date +%Y-%m-%d)}"
    echo "📍 Requests by region/state for $date..."
    
    temp_file=$(mktemp)
    get_logs_for_date "$date" 1000 > "$temp_file"
    
    if [ ! -s "$temp_file" ]; then
        echo "📭 No logs found for $date"
        rm "$temp_file"
        return
    fi
    
    echo "Top regions:"
    cat "$temp_file" | jq -r '.region // "Unknown"' | sort | uniq -c | sort -nr | head -10 | \
    while read -r count region; do
        echo "  📍 $region: $count requests"
    done
    
    rm "$temp_file"
}

function analyze_organizations() {
    local date="${1:-$(date +%Y-%m-%d)}"
    echo "🏢 Requests by ISP/organization for $date..."
    
    temp_file=$(mktemp)
    get_logs_for_date "$date" 1000 > "$temp_file"
    
    if [ ! -s "$temp_file" ]; then
        echo "📭 No logs found for $date"
        rm "$temp_file"
        return
    fi
    
    echo "Top organizations:"
    cat "$temp_file" | jq -r '.asOrganization // "Unknown"' | sort | uniq -c | sort -nr | head -10 | \
    while read -r count org; do
        echo "  🏢 $org: $count requests"
    done
    
    rm "$temp_file"
}

function analyze_endpoints() {
    local date="${1:-$(date +%Y-%m-%d)}"
    echo "🔗 Most requested endpoints for $date..."
    
    temp_file=$(mktemp)
    get_logs_for_date "$date" 1000 > "$temp_file"
    
    if [ ! -s "$temp_file" ]; then
        echo "📭 No logs found for $date"
        rm "$temp_file"
        return
    fi
    
    echo "Top endpoints:"
    cat "$temp_file" | jq -r '.path' | sort | uniq -c | sort -nr | head -10 | \
    while read -r count path; do
        echo "  📍 $path: $count requests"
    done
    
    rm "$temp_file"
}

function analyze_ips() {
    local date="${1:-$(date +%Y-%m-%d)}"
    echo "🔍 Top IP addresses for $date..."
    
    temp_file=$(mktemp)
    get_logs_for_date "$date" 1000 > "$temp_file"
    
    if [ ! -s "$temp_file" ]; then
        echo "📭 No logs found for $date"
        rm "$temp_file"
        return
    fi
    
    echo "Top IPs:"
    cat "$temp_file" | jq -r '.connectingIp' | sort | uniq -c | sort -nr | head -10 | \
    while read -r count ip; do
        echo "  🖥️  $ip: $count requests"
    done
    
    rm "$temp_file"
}

function show_raw_logs() {
    local date="${1:-$(date +%Y-%m-%d)}"
    local limit="${2:-10}"
    
    echo "📄 Raw logs for $date (limit: $limit)..."
    
    wrangler r2 object list $BUCKET_NAME --prefix="logs/$date/" 2>/dev/null | \
    head -n $limit | \
    while read -r object_line; do
        if [ -n "$object_line" ] && [ "$object_line" != "No objects found." ]; then
            OBJECT_KEY=$(echo "$object_line" | awk '{print $1}')
            if [ -n "$OBJECT_KEY" ]; then
                echo ""
                echo "🔸 $OBJECT_KEY"
                echo "$(printf '─%.0s' {1..80})"
                wrangler r2 object get $BUCKET_NAME "$OBJECT_KEY" --file=- 2>/dev/null | jq '.'
            fi
        fi
    done
}

# Main script logic
check_prerequisites

case "$1" in
    "dates")
        list_dates
        ;;
    "count")
        count_logs "$2"
        ;;
    "summary")
        traffic_summary "$2"
        ;;
    "countries")
        analyze_countries "$2"
        ;;
    "regions")
        analyze_regions "$2"
        ;;
    "organizations")
        analyze_organizations "$2"
        ;;
    "endpoints")
        analyze_endpoints "$2"
        ;;
    "ips")
        analyze_ips "$2"
        ;;
    "raw")
        show_raw_logs "$2" "$3"
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