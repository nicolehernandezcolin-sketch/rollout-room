#!/bin/sh
# Writes dist/artifact.html: the app without the website-only header, for publishing as a Claude artifact.
cd "$(dirname "$0")/.." && mkdir -p dist
sed '/<!--standalone-head-->/,/<!--\/standalone-head-->/d' index.html > dist/artifact.html
echo "Wrote dist/artifact.html"
