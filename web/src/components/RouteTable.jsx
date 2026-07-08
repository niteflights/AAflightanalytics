import React from 'react'

export default function RouteTable({ flights }) {
  return (
    <div className="table-panel">
      <div className="table-header">
        <h2>Flights</h2>
        <p>{flights.length.toLocaleString()} visible</p>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Route</th>
              <th>Operator</th>
              <th>Flight</th>
              <th>Aircraft</th>
              <th>Distance</th>
              <th>CO₂e</th>
            </tr>
          </thead>
          <tbody>
            {flights.slice(0, 500).map(f => (
              <tr key={f.id}>
                <td>{f.date}</td>
                <td>{f.from} → {f.to}</td>
                <td>{f.operator}</td>
                <td>{f.flightNumber}</td>
                <td>{f.aircraft}</td>
                <td>{Math.round(f.distanceKm || 0).toLocaleString()} km</td>
                <td>{Math.round(f.co2Kg || 0).toLocaleString()} kg</td>
              </tr>
            ))}
          </tbody>
        </table>

        {flights.length > 500 && (
          <p className="table-note">Showing first 500 rows.</p>
        )}
      </div>
    </div>
  )
}
