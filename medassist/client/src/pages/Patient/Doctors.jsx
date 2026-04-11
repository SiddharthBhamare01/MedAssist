import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import toast from 'react-hot-toast';
import api from '../../services/api';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const userIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const doctorIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const selectedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [30, 46], iconAnchor: [15, 46], popupAnchor: [1, -34], shadowSize: [41, 41],
});

// Radius options in miles; value is metres sent to the API (1 mi ≈ 1609 m)
const RADIUS_OPTIONS = [
  { label: '2 mi',  value: 3219  },
  { label: '5 mi',  value: 8047  },
  { label: '10 mi', value: 16093 },
  { label: '20 mi', value: 32187 },
  { label: '50 mi', value: 80467 },
];

// Convert km (returned by backend) to miles for display
function toMiles(km) {
  return (km * 0.621371).toFixed(1);
}

// Convert metres radius to miles label for display
function metresToMilesLabel(metres) {
  return `${(metres / 1609.34).toFixed(0)} mi`;
}

function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom || 13);
  }, [center, zoom, map]);
  return null;
}

function SpecialtyBadge({ specialty }) {
  const colors = {
    'Hospital':            'bg-red-100 text-red-700',
    'Clinic':              'bg-blue-100 text-blue-700',
    'General Physician':   'bg-green-100 text-green-700',
    'Healthcare Provider': 'bg-gray-100 text-gray-600',
  };
  const cls = colors[specialty] || 'bg-purple-100 text-purple-700';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {specialty || 'Healthcare'}
    </span>
  );
}

export default function Doctors() {
  const [userLocation, setUserLocation]     = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle'); // idle | locating | granted | denied

  // allDoctors = full API result (never filtered)
  // Specialties dropdown is always derived from allDoctors so it never loses options
  const [allDoctors, setAllDoctors]   = useState([]);
  const [loading, setLoading]         = useState(false);
  const [dataSource, setDataSource]   = useState(null);

  const [radius, setRadius]               = useState(10000);
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [selectedDoctor, setSelectedDoctor]   = useState(null);

  const markerRefs = useRef({});
  const abortRef = useRef(null);
  const hasFetchedRef = useRef(false); // prevent duplicate fetches from StrictMode

  // Derive available specialty options from the FULL (unfiltered) result
  const specialties = [...new Set(
    allDoctors.map(d => d.specialization).filter(Boolean)
  )].sort();

  // Apply specialty filter CLIENT-SIDE — never re-fetches, never loses dropdown options
  const visibleDoctors = specialtyFilter
    ? allDoctors.filter(d =>
        d.specialization && d.specialization.toLowerCase().includes(specialtyFilter.toLowerCase())
      )
    : allDoctors;

  const fetchDoctors = useCallback(async (lat, lng, rad) => {
    // Cancel any in-flight request before starting a new one
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setAllDoctors([]);
    setSelectedDoctor(null);
    try {
      // Always fetch ALL doctors (no specialty param) — filtering is done client-side
      const { data } = await api.get('/doctors/nearby', {
        params: { lat, lng, radius: rad, source: 'osm' },
        signal: controller.signal,
      });
      setAllDoctors(data.doctors || []);
      setDataSource(data.source);
      if (data.source === 'db_fallback') {
        toast('Live data unavailable — showing demo doctors', { icon: 'ℹ️' });
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return; // silently ignore cancelled requests
      toast.error('Failed to load nearby doctors.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  function requestLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      setLocationStatus('denied');
      return;
    }
    setLocationStatus('locating');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setUserLocation([latitude, longitude]);
        setLocationStatus('granted');
        // Only fetch once on initial location grant; radius useEffect handles subsequent fetches
        if (!hasFetchedRef.current) {
          hasFetchedRef.current = true;
          fetchDoctors(latitude, longitude, radius);
        }
      },
      err => {
        console.warn('Geolocation denied:', err.message);
        setLocationStatus('denied');
        toast('Location denied — grant permission to see real doctors near you.', { icon: '📍' });
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { requestLocation(); }, []);

  // Re-fetch when radius changes (not on initial mount — requestLocation handles that)
  const prevRadiusRef = useRef(radius);
  useEffect(() => {
    if (prevRadiusRef.current !== radius && userLocation) {
      fetchDoctors(userLocation[0], userLocation[1], radius);
    }
    prevRadiusRef.current = radius;
  }, [radius, userLocation, fetchDoctors]);

  function handleSidebarClick(doctor) {
    setSelectedDoctor(doctor);
    const ref = markerRefs.current[doctor.id];
    if (ref) ref.openPopup();
  }

  function directionsUrl(doctor) {
    const from = userLocation ? `${userLocation[0]},${userLocation[1]}` : '';
    return `https://www.openstreetmap.org/directions?from=${from}&to=${doctor.latitude},${doctor.longitude}`;
  }

  const mapCenter = userLocation || [20, 0];
  const mapZoom   = userLocation ? 13 : 2;

  // ── Pre-location permission screen ──────────────────────────────────────────
  if (locationStatus === 'idle' || locationStatus === 'locating') {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 min-h-screen">
        <div className="text-center space-y-4 p-8">
          <div className="text-6xl">📍</div>
          <h2 className="text-xl font-semibold text-gray-800">Allow location access</h2>
          <p className="text-gray-500 max-w-sm text-sm">
            MedAssist needs your location to show real doctors and clinics near you
            using live OpenStreetMap data.
          </p>
          {locationStatus === 'locating' && (
            <div className="flex items-center justify-center gap-2 text-blue-600 text-sm">
              <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
              Waiting for browser permission…
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0 z-10">
        <div className="max-w-full flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[160px]">
            <h1 className="text-xl font-bold text-gray-900">Find a Doctor</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {locationStatus === 'granted' && userLocation
                ? `📍 Showing healthcare providers within ${metresToMilesLabel(radius)}`
                : '⚠️ Location denied — grant permission for live data'}
            </p>
          </div>

          {locationStatus === 'denied' && (
            <button
              onClick={requestLocation}
              className="flex items-center gap-2 bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              📍 Allow Location
            </button>
          )}

          {/* Radius selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">Radius</label>
            <select
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {RADIUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Specialty filter — always populated from full result */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">Type</label>
            <select
              value={specialtyFilter}
              onChange={e => setSpecialtyFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
            >
              <option value="">All Types</option>
              {specialties.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Disclaimer bar ── */}
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-1 text-center text-xs text-yellow-700 shrink-0">
        Data from OpenStreetMap contributors. Verify availability before visiting.&nbsp;
        {dataSource === 'osm' && <span className="text-green-600 font-medium">● Live OSM data</span>}
        {dataSource === 'db_fallback' && (
          <>
            <span className="text-orange-500 font-medium">● Demo data (live API busy)</span>
            {userLocation && (
              <button
                onClick={() => fetchDoctors(userLocation[0], userLocation[1], radius)}
                className="ml-2 text-blue-600 underline"
              >
                Retry
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Map + Sidebar ── */}
      {/* sidebar LEFT, map RIGHT, both fill remaining height */}
      <div className="flex flex-row flex-1 overflow-hidden">

        {/* ── LEFT: scrollable doctor list ── */}
        <div className="w-80 xl:w-96 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          {/* Sticky list header */}
          <div className="border-b border-gray-100 px-4 py-2 shrink-0 flex items-center justify-between bg-white">
            <p className="text-sm font-semibold text-gray-700">
              {loading
                ? 'Fetching live data…'
                : `${visibleDoctors.length} of ${allDoctors.length} shown`}
            </p>
            {!loading && userLocation && (
              <button
                onClick={() => fetchDoctors(userLocation[0], userLocation[1], radius)}
                className="text-xs text-blue-600 hover:underline"
              >
                Refresh
              </button>
            )}
          </div>

          {/* Scrollable cards */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                <p className="text-xs text-gray-400">Querying OpenStreetMap…</p>
              </div>
            )}

            {!loading && visibleDoctors.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
                <div className="text-4xl">🔍</div>
                <p className="text-gray-500 text-sm">
                  {allDoctors.length === 0
                    ? `No providers found within ${metresToMilesLabel(radius)}.`
                    : `No "${specialtyFilter}" found. Try another type.`}
                </p>
                {allDoctors.length === 0 ? (
                  <button
                    onClick={() => setRadius(prev => Math.min(prev * 2, 50000))}
                    className="text-sm text-blue-600 border border-blue-300 px-4 py-1.5 rounded-lg hover:bg-blue-50"
                  >
                    Expand search radius
                  </button>
                ) : (
                  <button
                    onClick={() => setSpecialtyFilter('')}
                    className="text-sm text-blue-600 border border-blue-300 px-4 py-1.5 rounded-lg hover:bg-blue-50"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            )}

            {!loading && visibleDoctors.map(doctor => (
              <button
                key={doctor.id}
                onClick={() => handleSidebarClick(doctor)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                  selectedDoctor?.id === doctor.id
                    ? 'bg-blue-50 border-l-4 border-l-blue-600'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
                      {doctor.name}
                    </p>
                    <div className="mt-1">
                      <SpecialtyBadge specialty={doctor.specialization} />
                    </div>
                    {doctor.address && (
                      <p className="text-gray-500 text-xs mt-1 truncate">{doctor.address}</p>
                    )}
                    {(doctor.city || doctor.state) && (
                      <p className="text-gray-400 text-xs truncate">
                        {[doctor.city, doctor.state].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {doctor.phone && (
                      <p className="text-gray-500 text-xs mt-1">📞 {doctor.phone}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full block whitespace-nowrap">
                      {toMiles(doctor.distance_km)} mi
                    </span>
                    <span className="text-xs text-green-600 font-medium">● Open</span>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <a
                    href={directionsUrl(doctor)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Get Directions →
                  </a>
                  {doctor.website && (
                    <a
                      href={doctor.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-gray-500 hover:underline truncate max-w-[100px]"
                    >
                      Website →
                    </a>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Leaflet map fills remaining space ── */}
        <div className="flex-1 relative">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <MapController center={mapCenter} zoom={mapZoom} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {userLocation && (
              <Marker position={userLocation} icon={userIcon}>
                <Popup>
                  <span className="text-sm font-semibold text-blue-700">📍 You are here</span>
                </Popup>
              </Marker>
            )}

            {visibleDoctors.map(doctor => (
              <Marker
                key={doctor.id}
                position={[doctor.latitude, doctor.longitude]}
                icon={selectedDoctor?.id === doctor.id ? selectedIcon : doctorIcon}
                ref={el => { if (el) markerRefs.current[doctor.id] = el; }}
                eventHandlers={{ click: () => setSelectedDoctor(doctor) }}
              >
                <Popup>
                  <div className="min-w-[210px] space-y-1.5">
                    <p className="font-bold text-gray-900 text-sm leading-tight">{doctor.name}</p>
                    <SpecialtyBadge specialty={doctor.specialization} />
                    {doctor.address && (
                      <p className="text-gray-600 text-xs">{doctor.address}</p>
                    )}
                    {(doctor.city || doctor.state) && (
                      <p className="text-gray-500 text-xs">
                        {[doctor.city, doctor.state].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {doctor.phone && (
                      <p className="text-xs text-gray-600">
                        📞 <a href={`tel:${doctor.phone}`} className="hover:underline">{doctor.phone}</a>
                      </p>
                    )}
                    {doctor.website && (
                      <p className="text-xs">
                        🌐 <a
                          href={doctor.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline truncate block max-w-[180px]"
                        >
                          {doctor.website.replace(/^https?:\/\//, '')}
                        </a>
                      </p>
                    )}
                    <p className="text-xs text-gray-500">📏 {toMiles(doctor.distance_km)} mi away</p>
                    <a
                      href={directionsUrl(doctor)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-1 text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                    >
                      Get Directions →
                    </a>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

      </div>
    </div>
  );
}
