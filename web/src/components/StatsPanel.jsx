import React from 'react'

const fmt = (n) => Math.round(n || 0).toLocaleString()

export default function StatsPanel({ stats, filteredTotals, filters, setFilters, resetFilters }) {
  const update = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  // Supports both locations:
  // stats.funFacts and stats.totals.funFacts
  const funFacts = stats.funFacts || stats.totals?.funFacts

  return (
    <>      
      <div className="card">
        <h2>Visible selection</h2>
        <div className="metrics">
          <div><span>{fmt(filteredTotals.flights)}</span><small>flights</small></div>
          <div><span>{fmt(filteredTotals.distanceKm)}</span><small>km</small></div>
          <div><span>{fmt(filteredTotals.co2Kg)}</span><small>kg CO₂e</small></div>
          <div><span>{fmt(filteredTotals.uniqueAirports)}</span><small>airports</small></div>
        </div>
      </div>

      {funFacts && (
        <div className="card fun-facts-card">
          <h2>My flight journey</h2>

          <div className="fun-fact">
            <span className="fun-icon">🌍</span>
            <div>
              <strong>{funFacts.timesAroundEarth?.toFixed(2)}×</strong>
              <small>around the Earth</small>
            </div>
          </div>

          <div className="fun-fact">
            <span className="fun-icon">🌕</span>
            <div>
              <strong>{funFacts.percentToMoon?.toFixed(1)}%</strong>
              <small>of the way to the Moon</small>
            </div>
          </div>

          <div className="fun-fact">
            <span className="fun-icon">🔴</span>
            <div>
              <strong>{funFacts.percentToMars?.toFixed(3)}%</strong>
              <small>of the average distance to Mars</small>
            </div>
          </div>

          <div className="fun-fact">
            <span className="fun-icon">✈️</span>
            <div>
              <strong>{funFacts.amsAthensEquivalent?.toFixed(1)}</strong>
              <small>Amsterdam–Athens flight distances</small>
            </div>
          </div>

          <div className="fun-fact">
            <span className="fun-icon">⏱️</span>
            <div>
              <strong>{funFacts.estimatedDaysInAir?.toFixed(1)} days</strong>
              <small>estimated time spent flying</small>
            </div>
          </div>

          <div className="fun-fact">
            <span className="fun-icon">📅</span>
            <div>
              <strong>{funFacts.averageFlightsPerYear?.toFixed(1)}</strong>
              <small>average flights per year</small>
            </div>
          </div>

          <div className="fun-fact">
            <span className="fun-icon">🗓️</span>
            <div>
              <strong>{funFacts.averageFlightsPerMonth?.toFixed(1)}</strong>
              <small>average flights per month</small>
            </div>
          </div>

          <div className="fun-fact">
            <span className="fun-icon">🔥</span>
            <div>
              <strong>{funFacts.longestFlyingYearStreak?.years || 0} years</strong>
              <small>
                longest flying streak ·{' '}
                {funFacts.longestFlyingYearStreak?.from || '—'}
                {'–'}
                {funFacts.longestFlyingYearStreak?.to || '—'}
              </small>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Filters</h2>

        <label>Year</label>
        <select value={filters.year} onChange={e => update('year', e.target.value)}>
          <option value="all">All</option>
          {stats.totals.years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <label>Month</label>
        <select value={filters.month} onChange={e => update('month', e.target.value)}>
          <option value="all">All</option>
          {stats.totals.months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <label>Airline / operator</label>
        <select value={filters.airline} onChange={e => update('airline', e.target.value)}>
          <option value="all">All</option>
          {stats.totals.airlines.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <label>From airport</label>
        <input value={filters.from} onChange={e => update('from', e.target.value)} placeholder="AMS" />

        <label>To airport</label>
        <input value={filters.to} onChange={e => update('to', e.target.value)} placeholder="JFK" />

        <label>Search</label>
        <input value={filters.search} onChange={e => update('search', e.target.value)} placeholder="airline, aircraft, route…" />

        <button className="button" onClick={resetFilters}>Show all</button>
      </div>

      <div className="card">
        <h2>Top airlines</h2>
        <ol className="compact-list">
          {stats.airlines.slice(0, 8).map(a => (
            <li key={a.airline}>
              <span>{a.airline}</span>
              <b>{a.flights}</b>
            </li>
          ))}
        </ol>
      </div>
    </>
  )
}
