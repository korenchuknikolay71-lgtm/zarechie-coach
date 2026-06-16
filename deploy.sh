#!/bin/bash
set -e
echo "Deploying to Vercel..."
OUTPUT=$(vercel --prod 2>&1)
echo "$OUTPUT"
LATEST_URL=$(echo "$OUTPUT" | grep -o 'zarechie-coach-[a-z0-9]*-nikolay-korenchuk-s-projects\.vercel\.app' | head -1)
if [ -n "$LATEST_URL" ]; then
  echo "Setting alias: zarechie-coach.vercel.app → $LATEST_URL"
  vercel alias "$LATEST_URL" zarechie-coach.vercel.app
  echo "✅ Done!"
else
  echo "⚠️ Could not extract URL, setting alias manually..."
  vercel alias $(vercel inspect --format json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('url',''))" 2>/dev/null || echo "") zarechie-coach.vercel.app 2>/dev/null || true
fi
