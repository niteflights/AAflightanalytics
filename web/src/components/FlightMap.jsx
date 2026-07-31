import React, { useEffect, useRef } from 'react'
import L from 'leaflet'

export default function FlightMap({
  routes,
  airports,
  flights,
  onSelectFlight
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const routeLayerRef = useRef(null)
  const airportLayerRef = useRef(null)
  const flightsRef = useRef(flights || [])
  const onSelectFlightRef = useRef(onSelectFlight)

  useEffect(() => {
    flightsRef.current = flights || []
  }, [flights])

  useEffect(() => {
    onSelectFlightRef.current = onSelectFlight
  }, [onSelectFlight])

  /*
   * Create the Leaflet map once.
   */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    const map = L.map(containerRef.current, {
      center: [35, 10],
      zoom: 2,
      minZoom: 1,
      worldCopyJump: true,
      zoomControl: true
    })

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '&copy; OpenStreetMap contributors'
      }
    ).addTo(map)

    routeLayerRef.current = L.layerGroup().addTo(map)
    airportLayerRef.current = L.layerGroup().addTo(map)

    mapRef.current = map

    /*
     * Leaflet sometimes needs a resize after React creates
     * the page layout.
     */
    window.setTimeout(() => {
      map.invalidateSize()
    }, 250)

    const resizeMap = () => {
      map.invalidateSize()
    }

    window.addEventListener('resize', resizeMap)

    return () => {
      window.removeEventListener('resize', resizeMap)
      map.remove()

      mapRef.current = null
      routeLayerRef.current = null
      airportLayerRef.current = null
    }
  }, [])

  /*
   * Rebuild visible route lines whenever the filters change.
   * The map's centre and zoom remain unchanged.
   */
  useEffect(() => {
    const map = mapRef.current
    const routeLayer = routeLayerRef.current

    if (!map || !routeLayer) {
      return
    }

    routeLayer.clearLayers()

    const features = routes?.features || []

    features.forEach(feature => {
      if (
        feature?.geometry?.type !== 'LineString' ||
        !Array.isArray(feature.geometry.coordinates)
      ) {
        return
      }

      /*
       * GeoJSON stores coordinates as:
       * [longitude, latitude]
       *
       * Leaflet expects:
       * [latitude, longitude]
       */
      const positions = feature.geometry.coordinates
        .map(coordinate => {
          if (
            !Array.isArray(coordinate) ||
            coordinate.length < 2
          ) {
            return null
          }

          const longitude = Number(coordinate[0])
          const latitude = Number(coordinate[1])

          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
          ) {
            return null
          }

          return [latitude, longitude]
        })
        .filter(Boolean)

      if (positions.length < 2) {
        return
      }

      const properties = feature.properties || {}

      const route = L.polyline(positions, {
        color: '#2563eb',
        weight: 2,
        opacity: 0.68,
        lineCap: 'round',
        lineJoin: 'round'
      })

      route.on('mouseover', () => {
        route.setStyle({
          weight: 4,
          opacity: 1
        })
      })

      route.on('mouseout', () => {
        route.setStyle({
          weight: 2,
          opacity: 0.68
        })
      })

      route.on('click', event => {
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

        const operatorText = [
          properties.operator,
          properties.flightNumber
        ]
          .filter(Boolean)
          .join(' ')

        L.popup()
          .setLatLng(event.latlng)
          .setContent(`
            <strong>
              ${properties.from || ''}
              →
              ${properties.to || ''}
            </strong>
            <br>
            ${properties.date || ''}
            ${
              operatorText
                ? `<br>${operatorText}`
                : ''
            }
            <br>
            ${distanceText}
          `)
          .openOn(map)
      })

      route.addTo(routeLayer)
    })

    console.log(
      'Leaflet routes displayed:',
      routeLayer.getLayers().length
    )
  }, [routes])

  /*
   * Rebuild visible airport markers whenever the filters change.
   */
  useEffect(() => {
    const map = mapRef.current
    const airportLayer = airportLayerRef.current

    if (!map || !airportLayer) {
      return
    }

    airportLayer.clearLayers()

    const features = airports?.features || []

    features.forEach(feature => {
      if (
        feature?.geometry?.type !== 'Point' ||
        !Array.isArray(feature.geometry.coordinates)
      ) {
        return
      }

      const longitude = Number(
        feature.geometry.coordinates[0]
      )

      const latitude = Number(
        feature.geometry.coordinates[1]
      )

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return
      }

      const properties = feature.properties || {}
      const movements = Number(properties.movements) || 1

      const radius = Math.min(
        14,
        4 + Math.sqrt(movements) * 0.8
      )

      const marker = L.circleMarker(
        [latitude, longitude],
        {
          radius,
          color: '#ffffff',
          weight: 1.5,
          fillColor: '#ef4444',
          fillOpacity: 0.88
        }
      )

      const locationText = [
        properties.city,
        properties.country
      ]
        .filter(Boolean)
        .join(', ')

      marker.bindPopup(`
        <strong>${properties.iata || ''}</strong>
        ${
          properties.name
            ? `<br>${properties.name}`
            : ''
        }
        ${
          locationText
            ? `<br>${locationText}`
            : ''
        }
        <br>
        Movements: ${movements}
      `)

      marker.bindTooltip(
        `${properties.iata || ''}: ${movements} movements`,
        {
          direction: 'top',
          offset: [0, -4]
        }
      )

      marker.addTo(airportLayer)
    })

    console.log(
      'Leaflet airports displayed:',
      airportLayer.getLayers().length
    )
  }, [airports])

  return (
    <div
      ref={containerRef}
      className="map"
      aria-label="Interactive flight map"
    />
  )
}
