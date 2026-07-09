import argparse
import json
import math
from pathlib import Path

import pandas as pd


EXPECTED_COLUMNS = {
    "serial": "serial",
    "from": "from",
    "to": "to",
    "date": "date",
    "operator": "operator",
    "flight no": "flight_number",
    "flight_no": "flight_number",
    "flight number": "flight_number",
    "aircraft": "aircraft",
    "boarding pass": "boarding_pass",
    "boarding_pass": "boarding_pass",
}


def clean_for_json(obj):
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_for_json(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if pd.isna(obj):
        return None
    return obj


def normalise_columns(df):
    df.columns = [
        str(c).replace("\ufeff", "").strip().lower()
        for c in df.columns
    ]
    return df.rename(columns={c: EXPECTED_COLUMNS[c] for c in df.columns if c in EXPECTED_COLUMNS})


def read_flights(path):
    ext = Path(path).suffix.lower()

    if ext in [".xlsx", ".xls"]:
        df = pd.read_excel(path)
    elif ext == ".csv":
        df = pd.read_csv(path, sep=None, engine="python")
    else:
        raise ValueError("Flight log must be .xlsx, .xls, or .csv")

    df = normalise_columns(df)

    for col in ["from", "to", "date"]:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}. Columns found: {list(df.columns)}")

    for optional in ["serial", "operator", "flight_number", "aircraft", "boarding_pass"]:
        if optional not in df.columns:
            df[optional] = ""

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["from"] = df["from"].astype(str).str.strip().str.upper()
    df["to"] = df["to"].astype(str).str.strip().str.upper()
    df["operator"] = df["operator"].fillna("Unknown").astype(str).str.strip()
    df["flight_number"] = df["flight_number"].fillna("").astype(str).str.strip()
    df["aircraft"] = df["aircraft"].fillna("").astype(str).str.strip()
    df["boarding_pass"] = df["boarding_pass"].fillna("").astype(str).str.strip()

    df = df.dropna(subset=["date"])
    df = df[(df["from"].str.len() == 3) & (df["to"].str.len() == 3)]

    return df


def read_airports(path):
    ap = pd.read_csv(path, sep=None, engine="python")

    ap.columns = [
        str(c).replace("\ufeff", "").strip().lower()
        for c in ap.columns
    ]

    ap = ap.rename(columns={
        "iata_code": "iata",
        "latitude": "lat",
        "longitude": "lon",
        "lng": "lon",
    })

    for col in ["iata", "lat", "lon"]:
        if col not in ap.columns:
            raise ValueError(f"airports.csv must contain iata, lat, lon. Columns found: {list(ap.columns)}")

    for optional in ["name", "city", "country"]:
        if optional not in ap.columns:
            ap[optional] = ""

    ap["iata"] = ap["iata"].astype(str).str.strip().str.upper()
    ap["lat"] = pd.to_numeric(ap["lat"], errors="coerce")
    ap["lon"] = pd.to_numeric(ap["lon"], errors="coerce")
    ap = ap.dropna(subset=["iata", "lat", "lon"]).drop_duplicates("iata")

    return ap[["iata", "name", "city", "country", "lat", "lon"]]


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    phi1 = math.radians(float(lat1))
    phi2 = math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlambda = math.radians(float(lon2) - float(lon1))
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def safe_float(x):
    if x is None or pd.isna(x):
        return None
    return float(x)


def write_json(path, content):
    content = clean_for_json(content)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(content, f, ensure_ascii=False, indent=2, allow_nan=False)


def process(input_file, airports_file, output_dir, co2_factor=0.115, rfi=1.0):
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)

    flights = read_flights(input_file)
    airports = read_airports(airports_file)

    enriched = flights.merge(
        airports.add_prefix("from_"),
        left_on="from",
        right_on="from_iata",
        how="left",
    ).merge(
        airports.add_prefix("to_"),
        left_on="to",
        right_on="to_iata",
        how="left",
    )

    missing_airports = sorted(
        set(enriched.loc[enriched["from_lat"].isna(), "from"]).union(
            set(enriched.loc[enriched["to_lat"].isna(), "to"])
        )
    )

    if missing_airports:
        print("Warning: missing airport coordinates for:", ", ".join(missing_airports))

    distances = []
    for _, r in enriched.iterrows():
        if pd.notna(r.get("from_lat")) and pd.notna(r.get("to_lat")):
            distances.append(haversine_km(r["from_lat"], r["from_lon"], r["to_lat"], r["to_lon"]))
        else:
            distances.append(None)

    enriched["distance_km"] = distances
    enriched["co2_kg"] = enriched["distance_km"].astype(float) * float(co2_factor) * float(rfi)
    enriched["year"] = enriched["date"].dt.year
    enriched["month"] = enriched["date"].dt.strftime("%Y-%m")
    enriched["date_str"] = enriched["date"].dt.strftime("%Y-%m-%d")

    flight_records = []
    route_features = []

    for idx, r in enriched.reset_index(drop=True).iterrows():
        record = {
            "id": int(idx),
            "serial": "" if pd.isna(r.get("serial")) else str(r.get("serial")),
            "date": r["date_str"],
            "year": int(r["year"]) if pd.notna(r["year"]) else None,
            "month": r["month"],
            "from": r["from"],
            "to": r["to"],
            "operator": r["operator"] or "Unknown",
            "flightNumber": r["flight_number"],
            "aircraft": r["aircraft"],
            "boardingPass": r["boarding_pass"],
            "distanceKm": safe_float(r["distance_km"]),
            "co2Kg": safe_float(r["co2_kg"]),
            "fromAirport": {
                "iata": r.get("from_iata"),
                "name": r.get("from_name"),
                "city": r.get("from_city"),
                "country": r.get("from_country"),
                "lat": safe_float(r.get("from_lat")),
                "lon": safe_float(r.get("from_lon")),
            },
            "toAirport": {
                "iata": r.get("to_iata"),
                "name": r.get("to_name"),
                "city": r.get("to_city"),
                "country": r.get("to_country"),
                "lat": safe_float(r.get("to_lat")),
                "lon": safe_float(r.get("to_lon")),
            },
        }

        flight_records.append(record)

        if record["fromAirport"]["lat"] is not None and record["toAirport"]["lat"] is not None:
            route_features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [record["fromAirport"]["lon"], record["fromAirport"]["lat"]],
                        [record["toAirport"]["lon"], record["toAirport"]["lat"]],
                    ],
                },
                "properties": {
                    "id": record["id"],
                    "date": record["date"],
                    "year": record["year"],
                    "month": record["month"],
                    "from": record["from"],
                    "to": record["to"],
                    "operator": record["operator"],
                    "flightNumber": record["flightNumber"],
                    "aircraft": record["aircraft"],
                    "distanceKm": record["distanceKm"],
                    "co2Kg": record["co2Kg"],
                },
            })

    airports_seen = set(pd.concat([enriched["from"], enriched["to"]]).dropna().unique())
    airport_counts = pd.concat([enriched["from"], enriched["to"]]).value_counts()
    dep = enriched.groupby("from").size()
    arr = enriched.groupby("to").size()

    airport_features = []
    for iata in sorted(airports_seen):
        row = airports[airports["iata"] == iata]
        if row.empty:
            continue
        row = row.iloc[0]
        airport_features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [float(row["lon"]), float(row["lat"])],
            },
            "properties": {
                "iata": iata,
                "name": row.get("name", ""),
                "city": row.get("city", ""),
                "country": row.get("country", ""),
                "movements": int(airport_counts.get(iata, 0)),
                "departures": int(dep.get(iata, 0)),
                "arrivals": int(arr.get(iata, 0)),
            },
        })

    airline_stats = (
        enriched.groupby(enriched["operator"].fillna("Unknown"))
        .agg(
            flights=("operator", "size"),
            totalDistanceKm=("distance_km", "sum"),
            avgLegKm=("distance_km", "mean"),
            totalCo2Kg=("co2_kg", "sum"),
        )
        .reset_index()
        .rename(columns={"operator": "airline"})
        .sort_values(["flights", "totalDistanceKm"], ascending=[False, False])
    )

    route_stats = (
        enriched.assign(route=enriched["from"] + " → " + enriched["to"])
        .groupby("route")
        .agg(flights=("route", "size"), totalDistanceKm=("distance_km", "sum"))
        .reset_index()
        .sort_values(["flights", "totalDistanceKm"], ascending=[False, False])
    )

    # ---------------------------------------------------------
    # FUN FACTS
    # ---------------------------------------------------------

    total_flights = int(len(enriched))
    total_distance = float(enriched["distance_km"].dropna().sum())

    # Reference distances
    EARTH_CIRCUMFERENCE_KM = 40075
    MOON_DISTANCE_KM = 384400
    AVERAGE_MARS_DISTANCE_KM = 225000000

    # Approximate great-circle distance AMS–ATH
    AMS_ATH_DISTANCE_KM = 2183

    # Distance comparisons
    times_around_earth = (
        total_distance / EARTH_CIRCUMFERENCE_KM
        if total_distance > 0 else 0
    )

    percent_to_moon = (
        total_distance / MOON_DISTANCE_KM * 100
        if total_distance > 0 else 0
    )

    percent_to_mars = (
        total_distance / AVERAGE_MARS_DISTANCE_KM * 100
        if total_distance > 0 else 0
    )

    ams_ath_equivalent = (
        total_distance / AMS_ATH_DISTANCE_KM
        if total_distance > 0 else 0
    )

    # ---------------------------------------------------------
    # ESTIMATED TIME IN THE AIR
    #
    # Assumption:
    # distance / 800 km/h
    # + 30 minutes per flight for climb/descent/lower-speed phases
    # ---------------------------------------------------------

    estimated_flight_hours = (
        total_distance / 800
        + total_flights * 0.5
    )

    estimated_days_in_air = estimated_flight_hours / 24

    # ---------------------------------------------------------
    # AVERAGE FLIGHTS PER YEAR AND MONTH
    #
    # Calculated across the full calendar span of the flight log
    # ---------------------------------------------------------

    flight_years = sorted(
        int(y)
        for y in enriched["year"].dropna().unique()
    )

    if flight_years:
        first_year = min(flight_years)
        last_year = max(flight_years)

        calendar_year_span = last_year - first_year + 1
        calendar_month_span = calendar_year_span * 12

        average_flights_per_year = (
            total_flights / calendar_year_span
        )

        average_flights_per_month = (
            total_flights / calendar_month_span
        )

    else:
        first_year = None
        last_year = None
        average_flights_per_year = 0
        average_flights_per_month = 0

    # ---------------------------------------------------------
    # LONGEST CONSECUTIVE STREAK OF YEARS WITH AT LEAST ONE FLIGHT
    # ---------------------------------------------------------

    longest_streak = 0
    current_streak = 0
    streak_start = None
    streak_end = None
    current_start = None
    previous_year = None

    for year in flight_years:

        if previous_year is None or year == previous_year + 1:
            current_streak += 1

            if current_start is None:
                current_start = year

        else:
            current_streak = 1
            current_start = year

        if current_streak > longest_streak:
            longest_streak = current_streak
            streak_start = current_start
            streak_end = year

        previous_year = year

    fun_facts = {
        "timesAroundEarth": times_around_earth,
        "percentToMoon": percent_to_moon,
        "percentToMars": percent_to_mars,
        "amsAthensEquivalent": ams_ath_equivalent,
        "estimatedFlightHours": estimated_flight_hours,
        "estimatedDaysInAir": estimated_days_in_air,
        "averageFlightsPerYear": average_flights_per_year,
        "averageFlightsPerMonth": average_flights_per_month,
        "longestFlyingYearStreak": {
            "years": longest_streak,
            "from": streak_start,
            "to": streak_end
        }
    }
    
    stats = {
        "totals": {
            "flights": int(len(enriched)),
            "distanceKm": float(enriched["distance_km"].dropna().sum()),
            "co2Kg": float(enriched["co2_kg"].dropna().sum()),
            "uniqueAirports": int(len(airports_seen)),
            "years": sorted([int(x) for x in enriched["year"].dropna().unique().tolist()]),
            "months": sorted(enriched["month"].dropna().unique().tolist()),
            "airlines": sorted(enriched["operator"].fillna("Unknown").unique().tolist()),
        },

        "funFacts": fun_facts,
        
        "airlines": airline_stats.to_dict(orient="records"),
        "routes": route_stats.head(100).to_dict(orient="records"),
        "airports": [],
        "newAirportsPerYear": [],
        "longestFlights": [],
        "shortestFlights": [],
        "warnings": {
            "missingAirports": missing_airports,
        },
    }

    valid = enriched.dropna(subset=["distance_km"]).copy()
    valid["route"] = valid["from"] + " → " + valid["to"]

    longest = valid.sort_values("distance_km", ascending=False).head(10)
    shortest = valid.sort_values("distance_km", ascending=True).head(10)

    stats["longestFlights"] = longest[["date_str", "route", "operator", "distance_km", "co2_kg"]].rename(
        columns={"date_str": "date", "distance_km": "distanceKm", "co2_kg": "co2Kg"}
    ).to_dict(orient="records")

    stats["shortestFlights"] = shortest[["date_str", "route", "operator", "distance_km", "co2_kg"]].rename(
        columns={"date_str": "date", "distance_km": "distanceKm", "co2_kg": "co2Kg"}
    ).to_dict(orient="records")

    outputs = {
        "flights.json": flight_records,
        "routes.geojson": {"type": "FeatureCollection", "features": route_features},
        "airports.geojson": {"type": "FeatureCollection", "features": airport_features},
        "stats.json": stats,
    }

    for filename, content in outputs.items():
        write_json(output / filename, content)

    # Validate browser-readable JSON.
    for filename in outputs:
        with open(output / filename, "r", encoding="utf-8") as f:
            json.load(f)

    print(f"Processed {len(enriched)} flights")
    print(f"Wrote outputs to {output}")


def main():
    parser = argparse.ArgumentParser(description="Process a flight log into web app data files.")
    parser.add_argument("--input", default="data/flight_log.csv")
    parser.add_argument("--airports", default="data/airports.csv")
    parser.add_argument("--output", default="web/public/data")
    parser.add_argument("--co2-factor", type=float, default=0.115)
    parser.add_argument("--rfi", type=float, default=1.0)

    args = parser.parse_args()

    process(
        args.input,
        args.airports,
        args.output,
        args.co2_factor,
        args.rfi,
    )


if __name__ == "__main__":
    main()
