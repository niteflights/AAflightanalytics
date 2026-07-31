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

const MAP_STYLE = {
  version: 8,

  sources: {
    'osm-basemap': {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution:
        '© OpenStreetMap contributors'
    }
  },

  layers: [
    {
      id: 'osm-basemap-layer',
      type: 'raster',
      source: 'osm-basemap',
      minzoom: 0,
      maxzoom: 19
    }
  ]
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
      style: MAP_STYLE,
      center: [10, 35],
      zoom: 1.4
    })

    mapRef.current = map

    map.addControl(
      new NavigationControl(),
      'top-right'
    )

    map.addControl(
      new FullscreenControl(),
      'top-right'
    )

    map.on('error', event => {
      console.error(
        'MapLibre error:',
        event.error || event
      )
    })

    map.on('load', () => {
      /*
       * Add flight-route data.
       */
      if (!map.getSource('flight-routes')) {
        map.addSource('flight-routes', {
          type: 'geojson',
          data: routes || EMPTY_GEOJSON
        })
      }

      /*
       * Add airport data.
       */
      if (!map.getSource('flight-airports')) {
        map.addSource('flight-airports', {
          type: 'geojson',
          data: airports || EMPTY_GEOJSON
        })
      }

      /*
       * Draw flight routes.
       */
      if (!map.getLayer('flight-routes-line')) {
        map.addLayer({
          id: 'flight-routes-line',
          type: 'line',
          source: 'flight-routes',

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
              1, 1.2,
              5, 2.5,
              9, 4
            ],

            'line-opacity': 0.7
          }
        })
      }

      /*
       * Draw airports.
       */
      if (!map.getLayer('flight-airports-circle')) {
        map.addLayer({
          id: 'flight-airports-circle',
          type: 'circle',
          source: 'flight-airports',

          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              [
                'coalesce',
                ['get', 'movements'],
                1
              ],
              1, 4,
              20, 7,
              100, 16
            ],

            'circle-color': '#ef4444',
            'circle-opacity': 0.85,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff'
          }
        })
      }

      /*
       * Route click popup.
       */
      map.on(
        'click',
        'flight-routes-line',
        event => {
          const feature = event.features?.[0]

          if (!feature) {
            return
          }

          const flightId = Number(
            feature.properties?.id
          )

          const selectedFlight =
            flightsRef.current.find(
              flight =>
                Number(flight.id) === flightId
            )

          if (
            selectedFlight &&
            onSelectFlight
          ) {
            onSelectFlight(selectedFlight)
          }

          const distance = Number(
            feature.properties?.distanceKm
          )

          const distanceText =
            Number.isFinite(distance)
              ? `${Math.round(
                  distance
                ).toLocaleString()} km`
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
        }
      )

      /*
       * Airport click popup.
       */
      map.on(
        'click',
        'flight-airports-circle',
        event => {
          const properties =
            event.features?.[0]?.properties

          if (!properties) {
            return
          }

          const locationText = [
            properties.city,
            properties.country
          ]
            .filter(Boolean)
            .join(', ')

          new Popup()
            .setLngLat(event.lngLat)
            .setHTML(`
              <strong>
                ${properties.iata || ''}
              </strong>
              <br />
              ${properties.name || ''}
              ${
                locationText
                  ? `<br />${locationText}`
                  : ''
              }
              <br />
              Movements:
              ${properties.movements || 0}
            `)
            .addTo(map)
        }
      )

      /*
       * Pointer cursor over routes and airports.
       */
      map.on(
        'mouseenter',
        'flight-routes-line',
        () => {
          map.getCanvas().style.cursor =
            'pointer'
        }
      )

      map.on(
        'mouseleave',
        'flight-routes-line',
        () => {
          map.getCanvas().style.cursor = ''
        }
      )

      map.on(
        'mouseenter',
        'flight-airports-circle',
        () => {
          map.getCanvas().style.cursor =
            'pointer'
        }
      )

      map.on(
        'mouseleave',
        'flight-airports-circle',
        () => {
          map.getCanvas().style.cursor = ''
        }
      )

      window.setTimeout(() => {
        map.resize()
      }, 250)
    })

    const resizeMap = () => {
      map.resize()
    }

    window.addEventListener(
      'resize',
      resizeMap
    )

    return () => {
      window.removeEventListener(
        'resize',
        resizeMap
      )

      map.remove()
      mapRef.current = null
    }
  }, [onSelectFlight])

  /*
   * Update the displayed routes and airports whenever
   * the filters change.
   *
   * This preserves the current map position and zoom.
   */
  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    const updateSources = () => {
      const routesSource =
        map.getSource('flight-routes')

      const airportsSource =
        map.getSource('flight-airports')

      if (routesSource) {
        routesSource.setData(
          routes || EMPTY_GEOJSON
        )
      }

      if (airportsSource) {
        airportsSource.setData(
          airports || EMPTY_GEOJSON
        )
      }

      window.setTimeout(() => {
        map.resize()
      }, 100)
    }

    if (
      map.loaded() &&
      map.getSource('flight-routes')
    ) {
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
