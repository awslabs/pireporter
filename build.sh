#!/usr/bin/env bash

mkdir -p ./portable
cp pireporterPolicy.json report.css ./portable
pkg pireporter.js -t node16-linux --out-path ./portable
