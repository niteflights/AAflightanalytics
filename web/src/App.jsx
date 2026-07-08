import React, { useEffect, useMemo, useState } from 'react'
import FlightMap from './components/FlightMap.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import RouteTable from './components/RouteTable.jsx'

const DATA_BASE = './data/'

function matchesFilters(f, filters) {
  if (filters.year !== 'all' && String(f.year) !== String(filters.year)) return false
  if (filters.month !== 'all' && f.month !== filters.month) return false
  if (filters.airline !== 'all' && f.operator !== filters.airline) return false
  if (filters.from && f.from.toUpperCase() !== filters.from.toUpperCase()) return false
  if (filters.to && f.to.toUpperCase() !== filters.to.toUpperCase()) return false

  if (filters.search) {
    const q = filters.search.toLowerCase()
    const hay = `${f.from} ${f.to} ${f.operator} ${f.flightNumber} ${f.aircraft} ${f.date}`.toLowerCase()
    if (!hay.includes(q)) return false
  }

  return true
}

export default function App() {
  const [flights, setFlights] = useState([])
  const [routes, setRoutes] = useState(null)
  const [airports, setAirports] = useState(null)
  const [stats, setStats] = useState(null)
  const [selectedFlight, setSelectedFlight] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const [filters, setFilters] = useState({
    year: 'all',
    month: 'all',
    airline: 'all',
    from: '',
    to: '',
    search: ''
  })

  useEffect(() => {
    async function loadData() {
      try {
        const files = [
          ['flights', 'flights.json'],
          ['routes', 'routes.geojson'],
          ['airports', 'airports.geojson'],
          ['stats', 'stats.json']
        ]

        const loaded = {}

        for (const [key, file] of files) {
          const response = await fetch(DATA_BASE + file)

          if (!response.ok) {
            throw new Error(`Could not load ${file}: HTTP ${response.status}`)
          }

          try {
            loaded[key] = await response.json()
          } catch (jsonError) {
            throw new Error(`Could not parse ${file} as JSON: ${jsonError.message}`)
          }
        }

        setFlights(loaded.flights)
        setRoutes(loaded.routes)
        setAirports(loaded.airports)
        setStats(loaded.stats)
      } catch (err) {
        console.error(err)
        setLoadError(err.message)
      }
    }

    loadData()
  }, [])

  const filteredFlights = useMemo(
    () => flights.filter(f => matchesFilters(f, filters)),
    [flights, filters]
  )

  const visibleIds = useMemo(
    () => new Set(filteredFlights.map(f => f.id)),
    [filteredFlights]
  )

  const filteredRoutes = useMemo(() => {
    if (!routes) return null

    return {
      ...routes,
      features: routes.features.filter(feature =>
        visibleIds.has(feature.properties.id)
      )
    }
  }, [routes, visibleIds])

  const filteredAirports = useMemo(() => {
    if (!airports) return null

    const iatas = new Set()

    filteredFlights.forEach(f => {
      iatas.add(f.from)
      iatas.add(f.to)
    })

    return {
      ...airports,
      features: airports.features.filter(feature =>
        iatas.has(feature.properties.iata)
      )
    }
  }, [airports, filteredFlights])

  const filteredTotals = useMemo(() => ({
    flights: filteredFlights.length,
    distanceKm: filteredFlights.reduce((s, f) => s + (f.distanceKm || 0), 0),
    co2Kg: filteredFlights.reduce((s, f) => s + (f.co2Kg || 0), 0),
    uniqueAirports: new Set(filteredFlights.flatMap(f => [f.from, f.to])).size
  }), [filteredFlights])

  const resetFilters = () => setFilters({
    year: 'all',
    month: 'all',
    airline: 'all',
    from: '',
    to: '',
    search: ''
  })

  if (loadError) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>Could not load flight data</h1>
        <p>The app loaded, but one of the data files could not be read.</p>
        <pre style={{
          background: '#111827',
          color: '#fff',
          padding: '1rem',
          borderRadius: '8px',
          whiteSpace: 'pre-wrap'
        }}>
          {loadError}
        </pre>
        <p>
          Check that the GitHub Action created these files in <code>web/public/data</code>:
        </p>
        <ul>
          <li><code>flights.json</code></li>
          <li><code>routes.geojson</code></li>
          <li><code>airports.geojson</code></li>
          <li><code>stats.json</code></li>
        </ul>
      </div>
    )
  }

  if (!stats || !routes || !airports) {
    return <div className="loading">Loading flight data…</div>
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div>
            <h1>Flightlog Web</h1>
            <p>Your personal aviation dashboard</p>
          </div>
        </div>

        <StatsPanel
          stats={stats}
          filteredTotals={filteredTotals}
          filters={filters}
          setFilters={setFilters}
          resetFilters={resetFilters}
        />

        {stats?.warnings?.missingAirports?.length > 0 && (
          <div className="card">
            <h2>Missing airport coordinates</h2>
            <p>
              Some airport codes were not found in <code>airports.csv</code>:
            </p>
            <p>{stats.warnings.missingAirports.join(', ')}</p>
          </div>
        )}

        {selectedFlight && (
          <div className="card">
            <h2>Selected flight</h2>
            <p><b>{selectedFlight.from} → {selectedFlight.to}</b></p>
            <p>{selectedFlight.date} · {selectedFlight.operator} {selectedFlight.flightNumber}</p>
            <p>
              {Math.round(selectedFlight.distanceKm || 0).toLocaleString()} km ·{' '}
              {Math.round(selectedFlight.co2Kg || 0).toLocaleString()} kg CO₂e
            </p>
          </div>
        )}
      </aside>

      <main className="main">
        <FlightMap
          routes={filteredRoutes}
          airports={filteredAirports}
          flights={flights}
          onSelectFlight={setSelectedFlight}
        />

        <RouteTable flights={filteredFlights} />
      </main>
    </div>
  )
}
