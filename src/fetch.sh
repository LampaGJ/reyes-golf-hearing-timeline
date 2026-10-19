#!/bin/bash
# Fetch both reporters' Oct 19 2026 posts from the public Bluesky API into src/data/.
set -euo pipefail
cd "$(dirname "$0")"; mkdir -p data
API=https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed
fetch_feed() { # actor outfile
  : > "$2.raw"; local c="" i
  for i in 1 2 3 4 5; do
    if [ -n "$c" ]; then curl -sf -G "$API" --data-urlencode "actor=$1" --data-urlencode limit=100 --data-urlencode filter=posts_with_replies --data-urlencode "cursor=$c" > data/p.json
    else curl -sf -G "$API" --data-urlencode "actor=$1" --data-urlencode limit=100 --data-urlencode filter=posts_with_replies > data/p.json; fi
    jq -c '.feed[]' data/p.json >> "$2.raw"
    c=$(jq -r '.cursor // empty' data/p.json)
    [ -z "$c" ] && break
    [[ "$(jq -r '.feed[-1].post.record.createdAt' data/p.json)" < "2026-10-19T13:00" ]] && break
  done
}
SEL='{t:.post.record.createdAt, id:(.post.uri|split("/")|last), handle:.post.author.handle, text:.post.record.text}'
fetch_feed rparloff.bsky.social data/parloff
jq -s -c "[.[] | select(.post.author.handle==\"rparloff.bsky.social\") | select((.post.record.reply.root.uri // .post.uri) | endswith(\"3myaamheol22p\")) | $SEL] | unique_by(.id) | sort_by(.t)" data/parloff.raw > data/parloff.json
fetch_feed mollyroberts.bsky.social data/roberts
jq -s -c "[.[] | select(.post.author.handle==\"mollyroberts.bsky.social\") | select(.post.record.createdAt >= \"2026-10-19T13:40\" and .post.record.createdAt < \"2026-10-20T04:00\") | $SEL] | unique_by(.id) | sort_by(.t)" data/roberts.raw > data/roberts.json
rm -f data/*.raw data/p.json
echo "parloff=$(jq length data/parloff.json) roberts=$(jq length data/roberts.json)"
