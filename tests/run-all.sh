#!/usr/bin/env bash
# 跑全部模擬測試（Playwright + 假 DOM，不連遊戲）。需要：node、playwright（npm i playwright && npx playwright install chromium）
cd "$(dirname "$0")" && mkdir -p out && cd out
for f in ../*.test.js; do echo "=== $f"; node "$f" 2>&1 | tail -6; done
