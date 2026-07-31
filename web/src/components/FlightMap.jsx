import React, { useEffect, useRef } from 'react'
import {
  Map,
  NavigationControl,
  FullscreenControl,
  Popup
} from 'maplibre-gl'

const EMPTY_GEOJSON = {
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
    if (mapRef.current || !containerRef.current) {
      return
    }

    const map = new Map({
      container: containerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [10, 35],
      zoom: 1.4
    })

    map.on('error', event => {
      console.error('MapLibre error:', event.error || event)
    })

    map.addControl(
      new NavigationControl(),
      'top-right'
    )

    map.addControl(
      new FullscreenControl(),
      'top-right'
    )

    map.on('load', () => {
      if (!map.getSource('routes')) {
        map.addSource('routes', {
          type: 'geojson',
          data: routes || EMPTY_GEOJSON
        })
      }

      if (!map.getSource('airports')) {
        map.addSource('airports', {
          type: 'geojson',
          data: airports || EMPTY_GEOJSON
        })
      }

      if (!map.getLayer('routes-line')) {
        map.addLayer({
          id: 'routes-line',
          type: 'line',
          source: 'routes',
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': '#2563eb',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              1,
              1.2,
              5,
              2.5,
              9,
              4
            ],
            'line-opacity': 0.7
          }
        })
      }

      if (!map.getLayer('airports-circle')) {
        map.addLayer({
          id: 'airports-circle',
          type: 'circle',
          source: 'airports',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'movements'], 1],
              1,
              4,
              20,
              7,
              100,
              16
            ],
            'circle-color': '#ef4444',
            'circle-opacity': 0.85,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff'
          }
        })
      }

      map.on('click', 'routes-line', event => {
        const feature = event.features?.[0]

        if (!feature) {
          return
        }

        const selectedId = Number(feature.properties?.id)

        const selectedFlight = flightsRef.current.find(
          flight => Number(flight.id) === selectedId
        )

        if (selectedFlight && onSelectFlight) {
          onSelectFlight(selectedFlight)
        }

        const distance = Number(
          feature.properties?.distanceKm
        )

        const distanceText = Number.isFinite(distance)
          ? `${Math.round(distance).toLocaleString()} km`
          : 'Distance unavailable'

        new Popup()
          .setLngLat(event.lngLat)
          .setHTML(`
            <strong>
              ${feature.properties?.from || ''}
              →
              ${feature.properties?.to || ''}
            </strong>
            <br />
            ${feature.properties?.date || ''}
            <br />
            ${feature.properties?.operator || ''}
            ${feature.properties?.flightNumber || ''}
            <br />
            ${distanceText}
          `)
          .addTo(map)
      })

      map.on('click', 'airports-circle', event => {
        const properties =
          event.features?.[0]?.properties

        if (!properties) {
          return
        }

        new Popup()
          .setLngLat(event.lngLat)
          .setHTML(`
            <strong>${properties.iata || ''}</strong>
            <br />
            ${properties.name || ''}
            <br />
            ${properties.city || ''}
            ${properties.country
              ? `, ${properties.country}`
              : ''}
            <br />
            Movements:
            ${properties.movements || 0}
          `)
          .addTo(map)
      })

      map.on('mouseenter', 'routes-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', 'routes-line', () => {
        map.getCanvas().style.cursor = ''
      })

      map.on('mouseenter', 'airports-circle', () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', 'airports-circle', () => {
        map.getCanvas().style.cursor = ''
      })

      window.setTimeout(() => {
        map.resize()
      }, 250)
    })

    const resizeMap = () => {
      map.resize()
    }

    window.addEventListener('resize', resizeMap)

    mapRef.current = map

    return () => {
      window.removeEventListener(
        'resize',
        resizeMap
      )

      map.remove()
      mapRef.current = null
    }
  }, [onSelectFlight])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !routes || !airports) {
      return
    }

    const updateSources = () => {
      const routesSource = map.getSource('routes')
      const airportsSource = map.getSource('airports')

      if (routesSource) {
        routesSource.setData(routes)
      }

      if (airportsSource) {
        airportsSource.setData(airports)
      }

      window.setTimeout(() => {
        map.resize()
      }, 100)
    }

    if (map.isStyleLoaded()) {
      updateSources()
    } else {
      map.once('load', updateSources)
    }
  }, [routes, airports])

  return (
    <div
      ref={containerRef}
      className="map"
      aria-label="Interactive flight map"
    />
  )
}
