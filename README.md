# Flightlog Web Starter

Fresh web-based version of your flight analytics tool.

## What it includes
- React + Vite web app
- MapLibre interactive map
- Real filters: year, month, airline, from, to, free text
- Routes and airports disappear when filtered out
- Flight table and selected-flight popup
- Python preprocessing from Excel/CSV to JSON/GeoJSON
- GitHub Pages workflow

## Mac quick start
1. Install Python: https://www.python.org/downloads/
2. Install Node.js LTS: https://nodejs.org/
3. Open Terminal and go to the project folder:

```bash
cd ~/Downloads/flightlog-web-starter
```

4. Run:

```bash
chmod +x run_mac.sh
./run_mac.sh
```

Open the local address shown by Vite, usually `http://localhost:5173/`.

## Use your own data
Replace `data/flight_log.csv` with your own CSV, or put `flight_log.xlsx` there and run:

```bash
python3 scripts/process_flights.py --input data/flight_log.xlsx --airports data/airports.csv --output web/public/data
cd web
npm run dev
```

Expected columns:

```text
Serial, From, To, Date, Operator, Flight No, Aircraft, Boarding Pass
```

## Airport data
A tiny sample `data/airports.csv` is included. For real use, download OpenFlights airports.dat, save as `data/airports.dat`, then run:

```bash
python3 scripts/build_airports_from_openflights.py --input data/airports.dat --output data/airports.csv
```

OpenFlights airport data URL:
https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat

## GitHub Pages
Push this repo to GitHub, then set `Settings → Pages → Source → GitHub Actions`.

Privacy: if the repo is public, your flight data is public too.
