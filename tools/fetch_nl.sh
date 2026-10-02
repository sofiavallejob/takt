#!/bin/sh
# Fetch the Dutch open data that tools/build_nl.py turns into data/replay/nl.bin.
# Nothing downloaded here is committed; build/ is gitignored.
#
#   sh tools/fetch_nl.sh 2026-01 2026-03
#
# Arguments are the YYYY-MM service archives to pull (one per day you want to
# build). With no arguments it fetches the two months the shipped pack uses.
set -e

cd "$(dirname "$0")/.."
DIR=build/nl
mkdir -p "$DIR"

MONTHS="${*:-2026-01 2026-03}"

echo "stations"
curl -fsS -o "$DIR/stations.csv" \
  https://opendata.rijdendetreinen.nl/public/stations/stations-2023-09.csv

echo "provinces"
curl -fsS -o "$DIR/provinces.geojson" \
  https://cartomap.github.io/nl/wgs84/provincie_2023.geojson

for m in $MONTHS; do
  echo "services $m"
  curl -fsS -o "$DIR/services-$m.csv.gz" \
    "https://opendata.rijdendetreinen.nl/public/services/services-$m.csv.gz"
done

echo "done -> $DIR"
