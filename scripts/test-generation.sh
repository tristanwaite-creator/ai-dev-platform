#!/bin/bash

echo "🚀 Generating test website..."

RESPONSE=$(curl -s -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"very simple: big text WORKS! on green background"}' \
  --no-buffer)

# Extract sandbox URL
SANDBOX_URL=$(echo "$RESPONSE" | grep -o 'https://[^"]*\.e2b\.dev:8000' | tail -1)

if [ -n "$SANDBOX_URL" ]; then
    echo ""
    echo "✅ GENERATION COMPLETE!"
    echo ""
    echo "🌐 Your live website:"
    echo "$SANDBOX_URL"
    echo ""
else
    echo "❌ Failed to extract URL"
    echo "Response: $RESPONSE" | tail -20
fi
