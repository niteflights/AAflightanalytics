import React, { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'

export default function FlightMap({ routes, airports, flights, onSelectFlight }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const flightsRef = useRef([])

  useEffect(() => {
    flightsRef.current = flights
  }, [flights])

  useEffect(() => {
    if (mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [10, 35],
      zoom: 1.4
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')

    map.on('load', () => {
      map.addSource('routes', { type: 'geojson', data: routes })
      map.addSource('airports', { type: 'geojson', data: airports })

      map.addLayer({
        id: 'routes-line',
        type: 'line',
        source: 'routes',
        paint: {
          'line-color': '#2563eb',
          'line-width': 2,
          'line-opacity': 0.65
        }
      })

      map.addLayer({
        id: 'airports-circle',
        type: 'circle',
        source: 'airports',
        paint: {
          'circle-radius': 6,
          'circle-color': '#ef4444',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff'
        }
      })

      map.on('click', 'routes-line', (e) => {
        const feature = e.features?.[0]
        if (!feature) return

        const flight = flightsRef.current.find(f => f.id === feature.properties.id)
        if (flight) onSelectFlight(flight)

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <b>${feature.properties.from} → ${feature.properties.to}</b><br/>
            ${feature.properties.date}<br/>
            ${feature.properties.operator || ''} ${feature.properties.flightNumber || ''}<br/>
            ${Math.round(feature.properties.distanceKm || 0).toLocaleString()} km
          `)
          .addTo(map)
      })
    })

    mapRef.current = map
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    if (map.getSource('routes')) map.getSource('routes').setData(routes)
    if (map.getSource('airports')) map.getSource('airports').setData(airports)
  }, [routes, airports])

  return <div className="map" ref={containerRef} />
}
