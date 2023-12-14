#!/usr/bin/env bash

mkdir -p ./portable
cp baselineNetworkPerformance.json report.css ./portable
pkg pireporter.js -t node16-linux --out-path ./portable
