import React, { useEffect, useRef } from 'react'
import {
  Map,
  NavigationControl,
  FullscreenControl,
  Popup
} from 'maplibre-gl'

const EMPTY = {
  type: 'FeatureCollection',
  features: []
}

export default function FlightMap({
  routes,
  airports,
  flights,
  onSelectFlight
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const flightsRef = useRef([])

  useEffect(() => {
    flightsRef.current = flights || []
  }, [flights])

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    const map = new Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: [10, 35],
      zoom: 1.4
    })

    map.addControl(new NavigationControl(), 'top-right')
    map.addControl(new FullscreenControl(), 'top-right')

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

      map.on('click', 'routes-line', event => {
        const feature = event.features?.[0]
        if (!feature) return

        const flight = flightsRef.current.find(
          item => Number(item.id) === Number(feature.properties.id)
        )

        if (flight && onSelectFlight) {
          onSelectFlight(flight)
        }

        new Popup()
          .setLngLat(event.lngLat)
          .setHTML(`
            <b>${feature.properties.from} → ${feature.properties.to}</b><br/>
            ${feature.properties.date}<br/>
            ${feature.properties.operator || ''}
            ${feature.properties.flightNumber || ''}<br/>
            ${Math.round(
              Number(feature.properties.distanceKm) || 0
            ).toLocaleString()} km
          `)
          .addTo(map)
      })

      map.on('click', 'airports-circle', event => {
        const properties = event.features?.[0]?.properties
        if (!properties) return

        new Popup()
          .setLngLat(event.lngLat)
          .setHTML(`
            <b>${properties.iata}</b><br/>
            ${properties.name || ''}<br/>
            Movements: ${properties.movements || 0}
          `)
          .addTo(map)
      })

      map.on('mouseenter', 'routes-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', 'routes-line', () => {
        map.getCanvas().style.cursor = ''
      })

      window.setTimeout(() => map.resize(), 300)
    })

    const resizeMap = () => map.resize()
    window.addEventListener('resize', resizeMap)

    mapRef.current = map

    return () => {
      window.removeEventListener('resize', resizeMap)
      map.remove()
      mapRef.current = null
    }
  }, [onSelectFlight])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !routes || !airports) return

    const updateSources = () => {
      const routesSource = map.getSource('routes')
      const airportsSource = map.getSource('airports')

      if (routesSource) {
        routesSource.setData(routes)
      }

      if (airportsSource) {
        airportsSource.setData(airports)
      }

      window.setTimeout(() => map.resize(), 100)
    }

    if (map.isStyleLoaded()) {
      updateSources()
    } else {
      map.once('load', updateSources)
    }
  }, [routes, airports])

  return <div className="map" ref={containerRef} />
}
