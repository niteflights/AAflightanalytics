import React, { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'

const EMPTY = {
  type: 'FeatureCollection',
  features: []
}

export default function FlightMap({ routes, airports, flights, onSelectFlight }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const flightsRef = useRef([])

  useEffect(() => {
    flightsRef.current = flights || []
  }, [flights])

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: [10, 35],
      zoom: 1.4
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')

    map.on('load', () => {
      map.addSource('routes', {
        type: 'geojson',
        data: routes || EMPTY
      })

      map.addSource('airports', {
        type: 'geojson',
        data: airports || EMPTY
      })

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
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'movements'],
            1, 4,
            20, 8,
            100, 18
          ],
          'circle-color': '#ef4444',
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff'
        }
      })

      map.on('click', 'routes-line', (e) => {
        const feature = e.features?.[0]
        if (!feature) return

        const flight = flightsRef.current.find(
          f => Number(f.id) === Number(feature.properties.id)
        )

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

      map.on('click', 'airports-circle', (e) => {
        const p = e.features?.[0]?.properties
        if (!p) return

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <b>${p.iata}</b><br/>
            ${p.name || ''}<br/>
            Movements: ${p.movements || 0}
          `)
          .addTo(map)
      })

      map.on('mouseenter', 'routes-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', 'routes-line', () => {
        map.getCanvas().style.cursor = ''
      })

      setTimeout(() => map.resize(), 300)
    })

    window.addEventListener('resize', () => map.resize())

    mapRef.current = map
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !routes || !airports) return

    const updateSources = () => {
      if (map.getSource('routes')) {
        map.getSource('routes').setData(routes)
      }

      if (map.getSource('airports')) {
        map.getSource('airports').setData(airports)
      }

      setTimeout(() => map.resize(), 100)
    }

    if (map.isStyleLoaded()) {
      updateSources()
    } else {
      map.once('load', updateSources)
    }
  }, [routes, airports])

  return <div className="map" ref={containerRef} />
}
