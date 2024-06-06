#!/usr/bin/env bash

mkdir -p ./portable
cp conf.json pireporterPolicy.json report.css ./portable
cp -r genai ./portable/
pkg pireporter.js -t node16-linux --out-path ./portable
