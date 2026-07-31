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

    // Useful for checking the live map from Chrome Console.
    window.flightMap = map

    map.addControl(new NavigationControl(), 'top-right')
    map.addControl(new FullscreenControl(), 'top-right')

    map.on('error', event => {
      console.error('MapLibre error:', event.error || event)
    })

    map.on('load', () => {
      console.log(
        'Flight routes received:',
        routesRef.current?.features?.length || 0
      )

      console.log(
        'Airports received:',
        airportsRef.current?.features?.length || 0
      )

      /*
       * Add the latest data directly when creating each source.
       */
      map.addSource('flight-routes', {
        type: 'geojson',
        data: routesRef.current
      })

      map.addSource('flight-airports', {
        type: 'geojson',
        data: airportsRef.current
      })

      /*
       * Use deliberately simple styling first.
       * This avoids expression/type issues while debugging.
       */
      map.addLayer({
        id: 'flight-routes-line',
        type: 'line',
        source: 'flight-routes',
        layout: {
          visibility: 'visible',
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#0057ff',
          'line-width': 3,
          'line-opacity': 0.9
        }
      })

      map.addLayer({
        id: 'flight-airports-circle',
        type: 'circle',
        source: 'flight-airports',
        layout: {
          visibility: 'visible'
        },
        paint: {
          'circle-radius': 7,
          'circle-color': '#ff0000',
          'circle-opacity': 1,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      })

      /*
       * Explicitly move both layers above the raster basemap.
       */
      map.moveLayer('flight-routes-line')
      map.moveLayer('flight-airports-circle')

      map.setLayoutProperty(
        'flight-routes-line',
        'visibility',
        'visible'
      )

      map.setLayoutProperty(
        'flight-airports-circle',
        'visibility',
        'visible'
      )

      map.triggerRepaint()

      console.log(
        'Route layer created:',
        Boolean(map.getLayer('flight-routes-line'))
      )

      console.log(
        'Airport layer created:',
        Boolean(map.getLayer('flight-airports-circle'))
      )

      map.on('click', 'flight-routes-line', event => {
        const feature = event.features?.[0]

        if (!feature) {
          return
        }

        const properties = feature.properties || {}
        const flightId = Number(properties.id)

        const selectedFlight = flightsRef.current.find(
          flight => Number(flight.id) === flightId
        )

        if (
          selectedFlight &&
          onSelectFlightRef.current
        ) {
          onSelectFlightRef.current(selectedFlight)
        }

        const distance = Number(properties.distanceKm)

        const distanceText = Number.isFinite(distance)
          ? `${Math.round(distance).toLocaleString()} km`
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
      })

      map.on('click', 'flight-airports-circle', event => {
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
            <strong>${properties.iata || ''}</strong>
            <br />
            ${properties.name || ''}
            ${locationText ? `<br />${locationText}` : ''}
            <br />
            Movements: ${properties.movements || 0}
          `)
          .addTo(map)
      })

      for (const layerId of [
        'flight-routes-line',
        'flight-airports-circle'
      ]) {
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = ''
        })
      }

      window.setTimeout(() => {
        map.resize()
        map.triggerRepaint()
      }, 300)
    })

    const resizeMap = () => {
      map.resize()
      map.triggerRepaint()
    }

    window.addEventListener('resize', resizeMap)

    return () => {
      window.removeEventListener('resize', resizeMap)
      delete window.flightMap
      map.remove()
      mapRef.current = null
    }
  }, [])

  /*
   * Update the source data when filters change.
   * This does not move or zoom the map.
   */
  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    const updateRoutes = () => {
      const source = map.getSource('flight-routes')

      if (source) {
        source.setData(routes || EMPTY_GEOJSON)
        map.triggerRepaint()

        console.log(
          'Visible routes updated:',
          routes?.features?.length || 0
        )
      }
    }

    if (map.loaded()) {
      updateRoutes()
    } else {
      map.once('load', updateRoutes)
    }
  }, [routes])

  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    const updateAirports = () => {
      const source = map.getSource('flight-airports')

      if (source) {
        source.setData(airports || EMPTY_GEOJSON)
        map.triggerRepaint()

        console.log(
          'Visible airports updated:',
          airports?.features?.length || 0
        )
      }
    }

    if (map.loaded()) {
      updateAirports()
    } else {
      map.once('load', updateAirports)
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
