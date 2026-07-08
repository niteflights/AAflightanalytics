#!/usr/bin/env bash
set -e
python3 -m pip install -r requirements.txt
python3 scripts/process_flights.py --input data/flight_log.csv --airports data/airports.csv --output web/public/data
cd web
npm install
npm run dev
