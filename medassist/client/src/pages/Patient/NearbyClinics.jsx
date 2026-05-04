import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon   from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import toast from 'react-hot-toast';
import api from '../../services/api';

// Fix Leaflet default marker icons broken by Vite's asset pipeline
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl:       markerIcon,
  shadowUrl:     markerShadow,
});

const FILTERS = ['All', 'Hospital', 'Clinic', 'Lab & Diagnostics', 'Pharmacy', 'Blood Bank', 'General Physician'];

const BADGE_STYLES = {
  'Hospital':            'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'Clinic':              'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'Lab & Diagnostics':   'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Pharmacy':            'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Blood Bank':          'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'General Physician':   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Dental':              'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  'Physiotherapy':       'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'Ophthalmology':       'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'Health Centre':       'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'Healthcare Provider': 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Flyto helper — re-centres the map when userLoc changes
function MapController({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 13, { animate: true, duration: 1 });
  }, [center, map]);
  return null;
}

function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
      <div className="flex justify-between">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16" />
      </div>
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
    </div>
  );
}

export default function NearbyClinics() {
  const [status, setStatus]   = useState('idle');   // idle | locating | loading | done | error
  const [errorType, setErrorType] = useState('');   // denied | circuit_open | overpass_failed | unknown
  const [userLoc, setUserLoc] = useState(null);     // { lat, lng }
  const [places, setPlaces]   = useState([]);
  const [filter, setFilter]   = useState('All');

  const fetchClinics = (lat, lng) => {
    setStatus('loading');
    api.get(`/patient/clinics?lat=${lat}&lng=${lng}&radius=10000`)
      .then(res => {
        setPlaces(res.data.places || []);
        setStatus('done');
      })
      .catch(err => {
        const errCode = err.response?.data?.error || 'unknown';
        setErrorType(errCode);
        setStatus('error');
        toast.error('Could not load nearby clinics.');
      });
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setErrorType('denied');
      setStatus('error');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(loc);
        fetchClinics(loc.lat, loc.lng);
      },
      () => {
        setErrorType('denied');
        setStatus('error');
      },
      { timeout: 12000 }
    );
  };

  useEffect(() => { requestLocation(); }, []);

  const filtered = useMemo(() => {
    if (filter === 'All') return places;
    return places.filter(p => p.specialization === filter);
  }, [places, filter]);

  const mapCenter = userLoc ? [userLoc.lat, userLoc.lng] : [41.8781, -87.6298]; // Chicago fallback

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Nearby Clinics &amp; Labs</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Healthcare providers within 10 km of your location · OpenStreetMap
          </p>
        </div>
        {(status === 'done' || status === 'error') && (
          <button
            onClick={requestLocation}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Refresh
          </button>
        )}
      </div>

      {/* Locating state */}
      {status === 'locating' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500 dark:text-slate-400">
          <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
          <p className="text-sm font-medium">Getting your location…</p>
        </div>
      )}

      {/* Error states */}
      {status === 'error' && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            {errorType === 'denied' ? (
              <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            )}
          </div>
          <div className="text-center max-w-sm">
            {errorType === 'denied' && (
              <>
                <p className="font-semibold text-slate-700 dark:text-slate-200">Location access denied</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Allow location access in your browser settings, then click Refresh.
                </p>
              </>
            )}
            {errorType === 'circuit_open' && (
              <>
                <p className="font-semibold text-slate-700 dark:text-slate-200">Map service temporarily unavailable</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  The OpenStreetMap API is cooling down. Try again in a few minutes.
                </p>
              </>
            )}
            {(errorType === 'overpass_failed' || errorType === 'unknown') && (
              <>
                <p className="font-semibold text-slate-700 dark:text-slate-200">Could not fetch nearby places</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  All map mirrors failed. Check your connection and try again.
                </p>
              </>
            )}
          </div>
          <button
            onClick={requestLocation}
            className="px-5 py-2.5 rounded-xl text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Map + results */}
      {(status === 'loading' || status === 'done') && (
        <>
          {/* Leaflet Map */}
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm" style={{ height: '360px' }}>
            <MapContainer
              center={mapCenter}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapController center={userLoc ? [userLoc.lat, userLoc.lng] : null} />

              {/* User location pulse */}
              {userLoc && (
                <Circle
                  center={[userLoc.lat, userLoc.lng]}
                  radius={150}
                  pathOptions={{ color: '#0d9488', fillColor: '#0d9488', fillOpacity: 0.25, weight: 2 }}
                />
              )}

              {/* Place markers */}
              {filtered.map(place => (
                <Marker key={place.id} position={[place.latitude, place.longitude]}>
                  <Popup>
                    <div className="text-sm space-y-0.5 min-w-[160px]">
                      <p className="font-semibold text-slate-800">{place.name}</p>
                      {place.specialization && (
                        <p className="text-teal-600 text-xs">{place.specialization}</p>
                      )}
                      {userLoc && (
                        <p className="text-slate-500 text-xs">
                          {haversineKm(userLoc.lat, userLoc.lng, place.latitude, place.longitude).toFixed(1)} km away
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  filter === f
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-400'
                }`}
              >
                {f}
                {f === 'All'
                  ? ` (${places.length})`
                  : places.filter(p => p.specialization === f).length > 0
                    ? ` (${places.filter(p => p.specialization === f).length})`
                    : ''}
              </button>
            ))}
          </div>

          {/* Results list */}
          <div className="space-y-3">
            {status === 'loading' && [1, 2, 3].map(i => <SkeletonCard key={i} />)}

            {status === 'done' && filtered.length === 0 && (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                <p className="font-medium">No results for &ldquo;{filter}&rdquo; within 10 km</p>
                <p className="text-sm mt-1">Try selecting a different category or refresh your location.</p>
              </div>
            )}

            {status === 'done' && filtered.map(place => {
              const distKm = userLoc
                ? haversineKm(userLoc.lat, userLoc.lng, place.latitude, place.longitude).toFixed(1)
                : null;
              const badgeClass = BADGE_STYLES[place.specialization] || BADGE_STYLES['Healthcare Provider'];
              const addressLine = [place.address, place.city, place.state].filter(Boolean).join(', ');

              return (
                <div
                  key={place.id}
                  className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 hover:border-teal-300 dark:hover:border-teal-600 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 leading-tight">{place.name}</h3>
                        {place.specialization && (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${badgeClass}`}>
                            {place.specialization}
                          </span>
                        )}
                      </div>
                      {addressLine && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">{addressLine}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        {place.phone && (
                          <a
                            href={`tel:${place.phone}`}
                            className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                            </svg>
                            {place.phone}
                          </a>
                        )}
                        {place.website && (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.919 17.919 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                            </svg>
                            Website
                          </a>
                        )}
                      </div>
                    </div>
                    {distKm && (
                      <div className="shrink-0 text-right">
                        <span className="text-lg font-bold text-teal-600 dark:text-teal-400">{distKm}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 ml-0.5">km</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
