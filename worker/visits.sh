#!/bin/bash
# Print the most recent visits from the D1 log.
# Usage: worker/visits.sh [limit] [project]
set -euo pipefail
cd "$(dirname "$0")"
limit=${1:-25}
case "$limit" in ''|*[!0-9]*) echo "limit must be a number" >&2; exit 2;; esac
where=""
if [ -n "${2:-}" ]; then
  case "$2" in *[!A-Za-z0-9._-]*) echo "project must be a plain slug" >&2; exit 2;; esac
  where="WHERE project = '$2'"
fi
npx wrangler d1 execute reyes-visits --remote --json --command \
  "SELECT id, ts, project, host, page_title, ip, city, region, country, network, referrer, path, user_agent, lang, tz, screen FROM visits $where ORDER BY id DESC LIMIT $limit" \
  | jq -r '.[0].results[] | "#\(.id) \(.ts)  [\(.project // "?")] \(.host // "?")\(.path // "")\n    \(.ip)  \([.city,.region,.country]|map(select(.!=null))|join(", "))  (\(.network))\n    ref: \(.referrer // "(none)")\n    ua: \(.user_agent)  \(.lang) \(.tz) \(.screen)"'
