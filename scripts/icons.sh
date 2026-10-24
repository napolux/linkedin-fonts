#!/usr/bin/env sh
# Regenerates the PNG icons from src/icons/icon.svg.
# Requires ImageMagick 7 (`magick`). The PNGs are committed, so this only
# needs to run when the SVG changes: regular builds do not depend on it.
set -eu
cd "$(dirname "$0")/../src/icons"
for size in 16 32 48 128; do
  magick -background none -density 384 icon.svg -resize "${size}x${size}" \
    -strip -define png:compression-level=9 -define png:compression-filter=5 "PNG32:icon-${size}.png"
  echo "✔ icon-${size}.png"
done
