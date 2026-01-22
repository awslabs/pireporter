#!/usr/bin/env bash

# Using @yao-pkg/pkg - the maintained fork of vercel/pkg
# Install with: npm install -g @yao-pkg/pkg

mkdir -p ./portable
cp conf.json pireporterPolicy.json report.css ./portable
cp -r genai ./portable/
pkg pireporter.js -t node20-linux --out-path ./portable
