import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Empty } from './ui.jsx';
import { count, money } from '../lib/format.js';
import styles from './RouteMap.module.css';

/**
 * The agent's round drawn on a map instead of read as a list.
 *
 * Stops are plotted in the sequence the backend's RouteOptimizer already produced — the
 * polyline is that walking order, not a road route — so the map is a visual read of the
 * same plan StopBoard renders as rows. Coordinates come straight off RunDtos.StopView.
 */

const PUNE_FALLBACK = [18.5204, 73.8567];

/** RunService treats a near-zero pair as "this customer was never located". */
function isLocated(stop) {
  return Math.abs(Number(stop?.lat) || 0) > 1e-6 && Math.abs(Number(stop?.lng) || 0) > 1e-6;
}

const PIN_COLOUR = {
  DELIVERED: 'var(--good-600)',
  PENDING: 'var(--brand-600)',
  ABSENT: 'var(--risk-500)',
  SKIPPED: 'var(--n-400)',
};

function stopIcon(stop) {
  const colour = PIN_COLOUR[stop.status] || PIN_COLOUR.PENDING;
  return L.divIcon({
    className: '',
    html: `<div class="${styles.pin}" style="background:${colour}">${stop.seq}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

const agentIcon = L.divIcon({
  className: '',
  html: `<div class="${styles.agentDot}" aria-hidden="true"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -10],
});

/** Frames the whole beat once the stops are known, and again if the beat changes. */
function FitBounds({ points }) {
  const map = useMap();
  const signature = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 16);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [42, 42] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map]);
  return null;
}

/** Leaflet measures its container on mount; a freshly revealed map needs a nudge. */
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

const LIVE_THROTTLE_MS = 10_000;

/**
 * The agent's own position, refreshed at most once every ~10s.
 *
 * Every failure path is silent by design: if permission is denied, or the device has no
 * fix, the live marker simply never appears and the rest of the map keeps working.
 */
function useLivePosition(enabled) {
  const [position, setPosition] = useState(null);
  const lastAt = useRef(0);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.geolocation) return undefined;

    const watchId = navigator.geolocation.watchPosition(
      (fix) => {
        const now = Date.now();
        if (now - lastAt.current < LIVE_THROTTLE_MS) return;
        lastAt.current = now;
        setPosition({
          lat: fix.coords.latitude,
          lng: fix.coords.longitude,
          accuracy: Math.round(fix.coords.accuracy || 0),
        });
      },
      () => setPosition(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: LIVE_THROTTLE_MS },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return position;
}

/**
 * @param stops     StopView rows, already in backend `seq` order.
 * @param onDeliver Optional — omit (or pass readOnly) to render popups without the action.
 */
export default function RouteMap({ stops = [], onDeliver, busyId = null, readOnly = false, showLive = true }) {
  const located = useMemo(() => stops.filter(isLocated), [stops]);
  const points = useMemo(() => located.map((stop) => [Number(stop.lat), Number(stop.lng)]), [located]);
  const live = useLivePosition(showLive);

  const centre = useMemo(() => {
    if (points.length === 0) return PUNE_FALLBACK;
    const sum = points.reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0]);
    return [sum[0] / points.length, sum[1] / points.length];
  }, [points]);

  const unlocated = stops.length - located.length;

  if (stops.length === 0) {
    return (
      <Empty
        glyph="◌"
        title="No stops on this sheet"
        text="Nothing was scheduled for this beat, so there is no route to draw."
      />
    );
  }

  if (located.length === 0) {
    return (
      <Empty
        glyph="⌖"
        title="No doorstep coordinates on this beat"
        text="These customers have no map pin saved yet. Add one from the household's record and the route will draw itself."
      />
    );
  }

  return (
    <>
      <div className={styles.wrap}>
        <MapContainer center={centre} zoom={15} scrollWheelZoom className={styles.map}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <InvalidateOnMount />
          <FitBounds points={points} />

          {/* The optimised walking order, not a road route. Leaflet writes stroke as an SVG
              attribute, where var() does not resolve — so this is --brand-600 by value. */}
          <Polyline
            positions={points}
            pathOptions={{ color: '#4f46e5', weight: 3, opacity: 0.75, dashArray: '7 7' }}
          />

          {located.map((stop) => (
            <Marker key={stop.id} position={[Number(stop.lat), Number(stop.lng)]} icon={stopIcon(stop)}>
              <Popup>
                <div className={styles.popup}>
                  <h4>
                    {stop.seq}. {stop.customerName}
                  </h4>
                  <div className={styles.meta}>
                    <div>{stop.address}</div>
                    {stop.landmark ? <div>{stop.landmark}</div> : null}
                    <div style={{ marginTop: 'var(--s-1)' }}>
                      {stop.amountPaise > 0 ? `${money(stop.amountPaise)} on this drop` : 'Nothing to collect'}
                    </div>
                  </div>
                  {!readOnly && onDeliver && stop.status === 'PENDING' ? (
                    <button
                      type="button"
                      className="btn btn-good btn-sm"
                      onClick={() => onDeliver(stop)}
                      disabled={busyId === stop.id}
                    >
                      {busyId === stop.id ? <span className="spinner" style={{ width: 11, height: 11 }} /> : null}
                      Mark delivered
                    </button>
                  ) : (
                    <span className="badge badge-plain">{stop.status}</span>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {live ? (
            <Marker position={[live.lat, live.lng]} icon={agentIcon} zIndexOffset={1000}>
              <Popup>
                <div className={styles.popup}>
                  <h4>You are here</h4>
                  <div className={styles.meta}>
                    Accurate to about {count(live.accuracy)} m. Updates every 10 seconds.
                  </div>
                </div>
              </Popup>
            </Marker>
          ) : null}
        </MapContainer>
      </div>

      <div className={styles.legend}>
        <span>
          <i className={styles.swatch} style={{ background: 'var(--brand-600)' }} />
          Pending
        </span>
        <span>
          <i className={styles.swatch} style={{ background: 'var(--good-600)' }} />
          Delivered
        </span>
        <span>
          <i className={styles.swatch} style={{ background: 'var(--risk-500)' }} />
          Absent
        </span>
        <span>
          <i className={styles.swatch} style={{ background: 'var(--n-400)' }} />
          Skipped
        </span>
        <span style={{ marginLeft: 'auto' }}>
          {live ? 'Live position on' : 'Live position unavailable'}
          {unlocated > 0 ? ` · ${count(unlocated)} stop(s) without a map pin` : ''}
        </span>
      </div>
    </>
  );
}
