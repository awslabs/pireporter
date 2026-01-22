#!/usr/bin/env bash

# Node.js SEA (Single Executable Application) build script
# Requires Node.js 20+ and esbuild for bundling

set -e

echo "=== Building pireporter portable executable using Node.js SEA ==="

# Create portable directory
mkdir -p ./portable
cp conf.json pireporterPolicy.json report.css ./portable/
cp -r genai ./portable/

# Step 1: Bundle all JS into a single file using esbuild
echo "Step 1: Bundling with esbuild..."
npx esbuild pireporter.js --bundle --platform=node --target=node20 --outfile=./portable/pireporter-bundle.js

# Step 2: Create SEA config
echo "Step 2: Creating SEA config..."
cat > ./portable/sea-config.json << 'EOF'
{
  "main": "pireporter-bundle.js",
  "output": "sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
EOF

# Step 3: Generate the blob
echo "Step 3: Generating SEA blob..."
cd ./portable
node --experimental-sea-config sea-config.json

# Step 4: Copy node binary
echo "Step 4: Copying node binary..."
cp $(command -v node) pireporter

# Step 5: Inject the blob using postject
echo "Step 5: Injecting blob into binary..."
npx postject pireporter NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# Cleanup
rm -f pireporter-bundle.js sea-config.json sea-prep.blob

echo "=== Build complete! Executable: ./portable/pireporter ==="
