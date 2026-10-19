#!/bin/bash
# Print the most recent visits from the D1 log. Usage: worker/visits.sh [limit]
set -euo pipefail
cd "$(dirname "$0")"
npx wrangler d1 execute reyes-visits --remote --json --command \
  "SELECT id, ts, ip, city, region, country, network, referrer, path, user_agent, lang, tz, screen FROM visits ORDER BY id DESC LIMIT ${1:-25}" \
  | jq -r '.[0].results[] | "#\(.id) \(.ts)  \(.ip)  \([.city,.region,.country]|map(select(.!=null))|join(", "))  [\(.network)]\n    ref: \(.referrer // "(none)")  path: \(.path)\n    ua: \(.user_agent)  \(.lang) \(.tz) \(.screen)"'
