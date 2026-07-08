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


def normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [
        str(c)
        .replace("\ufeff", "")
        .strip()
        .lower()
        for c in df.columns
    ]

    df = df.rename(
        columns={c: EXPECTED_COLUMNS[c] for c in df.columns if c in EXPECTED_COLUMNS}
    )

    return df


def read_flights(path: str) -> pd.DataFrame:
    ext = Path(path).suffix.lower()

    if ext in [".xlsx", ".xls"]:
        df = pd.read_excel(path)

    elif ext == ".csv":
        # Auto-detect comma, semicolon, tab, etc.
        df = pd.read_csv(path, sep=None, engine="python")

    else:
        raise ValueError("Flight log must be .xlsx, .xls, or .csv")

    df = normalise_columns(df)

    for col in ["from", "to", "date"]:
        if col not in df.columns:
            raise ValueError(
                f"Missing required column: {col}. "
                f"Columns found: {list(df.columns)}"
            )

    for optional in ["serial", "operator", "flight_number", "aircraft", "boarding_pass"]:
        if optional not in df.columns:
            df[optional] = ""

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["from"] = df["from"].astype(str).str.strip().str.upper()
    df["to"] = df["to"].astype(str).str.strip().str.upper()
    df["operator"] = df["operator"].fillna("Unknown").astype(str).str.strip()
    df["aircraft"] = df["aircraft"].fillna("").astype(str).str.strip()
    df["flight_number"] = df["flight_number"].fillna("").astype(str).str.strip()
    df["boarding_pass"] = df["boarding_pass"].fillna("").astype(str).str.strip()

    df = df.dropna(subset=["date"])
    df = df[(df["from"].str.len() == 3) & (df["to"].str.len() == 3)]

    return df


def read_airports(path: str) -> pd.DataFrame:
    ap = pd.read_csv(path, sep=None, engine="python")

    ap.columns = [
        str(c)
        .replace("\ufeff", "")
        .strip()
        .lower()
        for c in ap.columns
    ]

    rename = {}
    for c in ap.columns:
        if c in ["iata_code", "iata"]:
            rename[c] = "iata"
        if c in ["latitude", "lat"]:
            rename[c] = "lat"
        if c in ["longitude", "lon", "lng"]:
            rename[c] = "lon"

    ap = ap.rename(columns=rename)

    for col in ["iata", "lat", "lon"]:
        if col not in ap.columns:
            raise ValueError(
                f"airports.csv must contain at least iata, lat, lon columns. "
                f"Columns found: {list(ap.columns)}"
            )

    for optional in ["name", "city", "country"]:
        if optional not in ap.columns:
            ap[optional] = ""

    ap["iata"] = ap["iata"].astype(str).str.strip().str.upper()
    ap = ap.dropna(subset=["iata", "lat", "lon"]).drop_duplicates("iata")

    return ap[["iata", "name", "city", "country", "lat", "lon"]]


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088

    phi1 = math.radians(float(lat1))
    phi2 = math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlambda = math.radians(float(lon2) - float(lon1))

    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(dlambda / 2) ** 2
    )

    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def safe_float(x):
    if pd.isna(x):
        return None
    return float(x)


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
    )

    enriched = enriched.merge(
        airports.add_prefix("to_"),
        left_on="to",
        right_on="to_iata",
        how="left",
    )

    distances = []

    for _, r in enriched.iterrows():
        if pd.notna(r.get("from_lat")) and pd.notna(r.get("to_lat")):
            distances.append(
                haversine_km(
                    r["from_lat"],
                    r["from_lon"],
                    r["to_lat"],
                    r["to_lon"],
                )
            )
        else:
            distances.append(None)

    enriched["distance_km"] = distances
    enriched["co2_kg"] = (
        enriched["distance_km"].astype(float)
        * float(co2_factor)
        * float(rfi)
    )
    enriched["year"] = enriched["date"].dt.year
    enriched["month"] = enriched["date"].dt.strftime("%Y-%m")
    enriched["date_str"] = enriched["date"].dt.strftime("%Y-%m-%d")

    flight_records = []
    route_features = []

    for idx, r in enriched.reset_index(drop=True).iterrows():
        flight_id = int(idx)

        record = {
            "id": flight_id,
            "serial": "" if pd.isna(r.get("serial")) else str(r.get("serial")),
            "date": r["date_str"],
            "year": int(r["year"]) if pd.notna(r["year"]) else None,
            "month": r["month"],
            "from": r["from"],
            "to": r["to"],
            "operator": r["operator"] if r["operator"] else "Unknown",
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

        if (
            record["fromAirport"]["lat"] is not None
            and record["toAirport"]["lat"] is not None
        ):
            route_features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [
                                record["fromAirport"]["lon"],
                                record["fromAirport"]["lat"],
                            ],
                            [
                                record["toAirport"]["lon"],
                                record["toAirport"]["lat"],
                            ],
                        ],
                    },
                    "properties": {
                        "id": flight_id,
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
                }
            )

    airport_counts = pd.concat([enriched["from"], enriched["to"]]).value_counts()
    dep = enriched.groupby("from").size()
    arr = enriched.groupby("to").size()

    airports_seen = set(
        pd.concat([enriched["from"], enriched["to"]])
        .dropna()
        .unique()
    )

    airport_features = []

    for iata in sorted(airports_seen):
        row = airports[airports["iata"] == iata]

        if row.empty:
            continue

        row = row.iloc[0]

        airport_features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        float(row["lon"]),
                        float(row["lat"]),
                    ],
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
            }
        )

    total_flights = len(enriched)
    total_distance = float(enriched["distance_km"].dropna().sum())
    total_co2 = float(enriched["co2_kg"].dropna().sum())
    unique_airports = int(len(airports_seen))

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
        .sort_values(
            ["flights", "totalDistanceKm"],
            ascending=[False, False],
        )
    )

    route_stats = (
        enriched.assign(route=enriched["from"] + " → " + enriched["to"])
        .groupby("route")
        .agg(
            flights=("route", "size"),
            totalDistanceKm=("distance_km", "sum"),
        )
        .reset_index()
        .sort_values(
            ["flights", "totalDistanceKm"],
            ascending=[False, False],
        )
    )

    airport_stats = []

    for iata in sorted(airports_seen):
        destinations = set(enriched.loc[enriched["from"] == iata, "to"].tolist())
        origins = set(enriched.loc[enriched["to"] == iata, "from"].tolist())

        airport_stats.append(
            {
                "iata": iata,
                "departures": int(dep.get(iata, 0)),
                "arrivals": int(arr.get(iata, 0)),
                "movements": int(airport_counts.get(iata, 0)),
                "uniqueConnections": len(destinations.union(origins)),
            }
        )

    airport_stats = sorted(
        airport_stats,
        key=lambda x: x["movements"],
        reverse=True,
    )

    first_airport_year = {}

    for _, r in enriched.sort_values("date").iterrows():
        for code in [r["from"], r["to"]]:
            if code not in first_airport_year:
                first_airport_year[code] = int(r["year"])

    new_airports_per_year = {}

    for _, year in first_airport_year.items():
        new_airports_per_year[year] = (
            new_airports_per_year.get(year, 0) + 1
        )

    valid = enriched.dropna(subset=["distance_km"]).copy()
    valid["route"] = valid["from"] + " → " + valid["to"]

    longest = valid.sort_values("distance_km", ascending=False).head(10)
    shortest = valid.sort_values("distance_km", ascending=True).head(10)

    stats = {
        "totals": {
            "flights": total_flights,
            "distanceKm": total_distance,
            "co2Kg": total_co2,
            "uniqueAirports": unique_airports,
            "years": sorted(
                [int(x) for x in enriched["year"].dropna().unique().tolist()]
            ),
            "months": sorted(enriched["month"].dropna().unique().tolist()),
            "airlines": sorted(
                enriched["operator"].fillna("Unknown").unique().tolist()
            ),
        },
        "airlines": airline_stats.to_dict(orient="records"),
        "routes": route_stats.head(100).to_dict(orient="records"),
        "airports": airport_stats,
        "newAirportsPerYear": [
            {"year": k, "newAirports": v}
            for k, v in sorted(new_airports_per_year.items())
        ],
        "longestFlights": longest[
            ["date_str", "route", "operator", "distance_km", "co2_kg"]
        ]
        .rename(
            columns={
                "date_str": "date",
                "distance_km": "distanceKm",
                "co2_kg": "co2Kg",
            }
        )
        .to_dict(orient="records"),
        "shortestFlights": shortest[
            ["date_str", "route", "operator", "distance_km", "co2_kg"]
        ]
        .rename(
            columns={
                "date_str": "date",
                "distance_km": "distanceKm",
                "co2_kg": "co2Kg",
            }
        )
        .to_dict(orient="records"),
    }

    outputs = {
        "flights.json": flight_records,
        "routes.geojson": {
            "type": "FeatureCollection",
            "features": route_features,
        },
        "airports.geojson": {
            "type": "FeatureCollection",
            "features": airport_features,
        },
        "stats.json": stats,
    }

    for filename, content in outputs.items():
        with open(output / filename, "w", encoding="utf-8") as f:
            json.dump(content, f, ensure_ascii=False, indent=2)

    print(f"Processed {total_flights} flights")
    print(f"Wrote outputs to {output}")


def main():
    parser = argparse.ArgumentParser(
        description="Process a flight log into web app data files."
    )

    parser.add_argument(
        "--input",
        default="data/flight_log.csv",
    )

    parser.add_argument(
        "--airports",
        default="data/airports.csv",
    )

    parser.add_argument(
        "--output",
        default="web/public/data",
    )

    parser.add_argument(
        "--co2-factor",
        type=float,
        default=0.115,
    )

    parser.add_argument(
        "--rfi",
        type=float,
        default=1.0,
    )

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
