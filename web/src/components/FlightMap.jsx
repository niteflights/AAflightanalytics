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
    basemap: {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors'
    }
  },

  layers: [
    {
      id: 'basemap-layer',
      type: 'raster',
      source: 'basemap',
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

  /*
   * These refs always hold the newest React props.
   * This prevents the map load event from using stale data.
   */
  const routesRef = useRef(routes || EMPTY_GEOJSON)
  const airportsRef = useRef(airports || EMPTY_GEOJSON)
  const flightsRef = useRef(flights || [])
  const onSelectFlightRef = useRef(onSelectFlight)

  useEffect(() => {
    routesRef.current = routes || EMPTY_GEOJSON
  }, [routes])

  useEffect(() => {
    airportsRef.current = airports || EMPTY_GEOJSON
  }, [airports])

  useEffect(() => {
    flightsRef.current = flights || []
  }, [flights])

  useEffect(() => {
    onSelectFlightRef.current = onSelectFlight
  }, [onSelectFlight])

  /*
   * Create the map only once.
   */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    const map = new Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [10, 35],
      zoom: 1.4,
      renderWorldCopies: true
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
       * Always create sources with empty GeoJSON first.
       */
      if (!map.getSource('flight-routes')) {
        map.addSource('flight-routes', {
          type: 'geojson',
          data: EMPTY_GEOJSON
        })
      }

      if (!map.getSource('flight-airports')) {
        map.addSource('flight-airports', {
          type: 'geojson',
          data: EMPTY_GEOJSON
        })
      }

      /*
       * Draw the flight routes.
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
              0,
              1.5,
              4,
              2.5,
              8,
              4
            ],

            'line-opacity': 0.75
          }
        })
      }

      /*
       * Draw airport markers.
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
              1,
              4,
              20,
              7,
              100,
              15
            ],

            'circle-color': '#ef4444',
            'circle-opacity': 0.9,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff'
          }
        })
      }

      /*
       * The sources now exist.
       * Insert the latest available data.
       */
      const routeSource =
        map.getSource('flight-routes')

      const airportSource =
        map.getSource('flight-airports')

      if (routeSource) {
        routeSource.setData(
          routesRef.current
        )
      }

      if (airportSource) {
        airportSource.setData(
          airportsRef.current
        )
      }

      console.log(
        'Flight routes loaded:',
        routesRef.current?.features?.length || 0
      )

      console.log(
        'Airports loaded:',
        airportsRef.current?.features?.length || 0
      )

      /*
       * Route popup.
       */
      map.on(
        'click',
        'flight-routes-line',
        event => {
          const feature = event.features?.[0]

          if (!feature) {
            return
          }

          const properties =
            feature.properties || {}

          const flightId =
            Number(properties.id)

          const selectedFlight =
            flightsRef.current.find(
              flight =>
                Number(flight.id) === flightId
            )

          if (
            selectedFlight &&
            onSelectFlightRef.current
          ) {
            onSelectFlightRef.current(
              selectedFlight
            )
          }

          const distance =
            Number(properties.distanceKm)

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
                ${properties.from || ''}
                →
                ${properties.to || ''}
              </strong>
              <br />
              ${properties.date || ''}
              <br />
              ${properties.operator || ''}
              ${properties.flightNumber || ''}
              <br />
              ${distanceText}
            `)
            .addTo(map)
        }
      )

      /*
       * Airport popup.
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
  }, [])

  /*
   * Update routes whenever filters change.
   */
  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    const source =
      map.getSource('flight-routes')

    if (source) {
      source.setData(
        routes || EMPTY_GEOJSON
      )

      console.log(
        'Updated visible routes:',
        routes?.features?.length || 0
      )
    }
  }, [routes])

  /*
   * Update airport markers whenever filters change.
   */
  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    const source =
      map.getSource('flight-airports')

    if (source) {
      source.setData(
        airports || EMPTY_GEOJSON
      )

      console.log(
        'Updated visible airports:',
        airports?.features?.length || 0
      )
    }
  }, [airports])

  return (
    <div
      ref={containerRef}
      className="map"
      aria-label="Interactive flight map"
    />
  )
}
