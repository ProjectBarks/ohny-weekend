#!/bin/sh
# usage: build/shot.sh <out.png> <width> <height> "<query>"   e.g. build/shot.sh /tmp/a.png 390 844 "theme=dark&view=map"
# query options: theme=light|dark  day=sat|sun  view=plan|map|explore|saved  plan=<preset id>  leg=<n>
# Phone widths render inside an exact-size iframe (headless Chrome can't go below ~500px), then get cropped.
OUT="$1"; W="$2"; H="$3"; Q="$4"
PROFILE=$(mktemp -d /tmp/odr-chrome.XXXXXX)
if [ "$W" -lt 600 ]; then
  ENC=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$Q&t=$(date +%s)")
  URL="http://localhost:8790/test/frame.html?w=$W&h=$H&q=$ENC"; WIN="700,$H"
else
  URL="http://localhost:8790/?$Q&t=$(date +%s)"; WIN="$W,$H"
fi
perl -e 'alarm 40; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --user-data-dir="$PROFILE" --window-size="$WIN" --virtual-time-budget=8000 --screenshot="$OUT" "$URL" >/dev/null 2>&1
pkill -f "$PROFILE" >/dev/null 2>&1; rm -rf "$PROFILE"
if [ -s "$OUT" ] && [ "$W" -lt 600 ]; then magick "$OUT" -crop "${W}x${H}+0+0" +repage "$OUT"; fi
[ -s "$OUT" ] && echo "$OUT" || echo "FAILED $OUT"
