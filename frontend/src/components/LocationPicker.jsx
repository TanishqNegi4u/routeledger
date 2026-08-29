import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default Leaflet marker icon asset resolution in bundlers
const customMarkerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const DEFAULT_CENTER = [18.5204, 73.8567]; // Pune default
const DEFAULT_ZOOM = 13;

/** Handles map clicks to position the marker */
function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click(event) {
      const { lat, lng } = event.latlng;
      onLocationSelect(lat.toFixed(6), lng.toFixed(6));
    },
  });
  return null;
}

/** Synchronizes map view when coordinates change from inputs or geolocation */
function ViewSync({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && !Number.isNaN(center[0]) && !Number.isNaN(center[1])) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [center, zoom, map]);
  return null;
}

export default function LocationPicker({ lat, lng, onChange }) {
  const [geoError, setGeoError] = useState(null);
  const [locating, setLocating] = useState(false);

  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);
  const hasValidCoords = !Number.isNaN(numLat) && !Number.isNaN(numLng) && numLat !== 0 && numLng !== 0;

  const center = useMemo(() => {
    if (hasValidCoords) return [numLat, numLng];
    return DEFAULT_CENTER;
  }, [hasValidCoords, numLat, numLng]);

  const markerRef = useRef(null);

  const markerEventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker) {
          const newPos = marker.getLatLng();
          onChange(newPos.lat.toFixed(6), newPos.lng.toFixed(6));
        }
      },
    }),
    [onChange],
  );

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const { latitude, longitude } = position.coords;
        onChange(latitude.toFixed(6), longitude.toFixed(6));
      },
      (error) => {
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setGeoError('Location permission was denied. Tap on the map to place a pin manually.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setGeoError('Location information is unavailable. Tap on the map to set location.');
        } else {
          setGeoError('Could not determine your location. Tap on the map to set location.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleClear = () => {
    onChange('', '');
    setGeoError(null);
  };

  return (
    <div className="col" style={{ gap: 'var(--s-2)', width: '100%' }}>
      <div className="row spread wrap" style={{ gap: 'var(--s-2)' }}>
        <span className="label">Map pin</span>
        <div className="row" style={{ gap: 'var(--s-2)' }}>
          {hasValidCoords ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleClear}
              style={{ fontSize: '0.75rem', padding: '0 var(--s-2)' }}
            >
              Clear pin
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleUseCurrentLocation}
            disabled={locating}
            style={{ fontSize: '0.75rem', padding: '0 var(--s-2)' }}
          >
            {locating ? <span className="spinner" style={{ width: 10, height: 10 }} /> : '📍'}
            {locating ? 'Locating…' : 'Use current location'}
          </button>
        </div>
      </div>

      {geoError ? (
        <div
          style={{
            font: 'var(--t-small)',
            color: 'var(--warn-700)',
            background: 'var(--warn-50)',
            border: '1px solid var(--warn-100)',
            borderRadius: 'var(--r-xs)',
            padding: 'var(--s-2) var(--s-3)',
          }}
        >
          {geoError}
        </div>
      ) : null}

      <div
        style={{
          width: '100%',
          height: '220px',
          borderRadius: 'var(--r-sm)',
          overflow: 'hidden',
          border: '1px solid var(--border-strong)',
          position: 'relative',
          zIndex: 0,
        }}
      >
        <MapContainer
          center={center}
          zoom={hasValidCoords ? 15 : DEFAULT_ZOOM}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%', minWidth: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onLocationSelect={onChange} />
          <ViewSync center={center} zoom={hasValidCoords ? 15 : undefined} />
          {hasValidCoords ? (
            <Marker
              draggable={true}
              eventHandlers={markerEventHandlers}
              position={[numLat, numLng]}
              ref={markerRef}
              icon={customMarkerIcon}
            />
          ) : null}
        </MapContainer>
      </div>
      <div className="hint" style={{ fontSize: '0.75rem' }}>
        Tap map or drag the pin to set doorstep coordinates.
      </div>
    </div>
  );
}
