@echo off
python -m pip install -r requirements.txt
python scripts\process_flights.py --input data\flight_log.csv --airports data\airports.csv --output web\public\data
cd web
npm install
npm run dev
pause
