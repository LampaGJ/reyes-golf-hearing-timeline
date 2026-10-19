#!/bin/bash
# Build index.md from src/timeline.md + citation link definitions from src/data/.
set -euo pipefail
cd "$(dirname "$0")"
{
  printf -- '---\ntitle: East Potomac Golf Course Hearing — Courtroom Timeline\n---\n\n'
  # [P12] -> [P12][] so adjacent citations don't collapse into one kramdown reference link
  perl -pe 's/\[([PR]\d+)\](?![\[:(])/[$1][]/g; s/\]\[([PR]\d+)\]\[\]/][$1]/g' timeline.md
  echo
  jq -r 'to_entries[] | "[P\(.key+1)]: https://bsky.app/profile/rparloff.bsky.social/post/\(.value.id)"' data/parloff.json
  jq -r 'to_entries[] | "[R\(.key+1)]: https://bsky.app/profile/mollyroberts.bsky.social/post/\(.value.id)"' data/roberts.json
} > ../index.md
used=$(grep -o '\[[PR][0-9]*\]' timeline.md | sort -u | tr -d '[]')
missing=0; for u in $used; do grep -q "^\[$u\]:" ../index.md || { echo "UNDEFINED $u"; missing=1; }; done
exit $missing
