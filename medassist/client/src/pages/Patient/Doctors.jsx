import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import toast from 'react-hot-toast';
import api from '../../services/api';
import 'leaflet/dist/leaflet.css';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

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

// ── Filter taxonomy ─────────────────────────────────────────────────────────────

const RADIUS_OPTIONS = [
  { label: '2 mi',  value: 3219  },
  { label: '5 mi',  value: 8047  },
  { label: '10 mi', value: 16093 },
  { label: '20 mi', value: 32187 },
  { label: '50 mi', value: 80467 },
];

/** Broad facility-type categories */
const FACILITY_TYPES = [
  { id: 'hospital',  label: 'Hospital',       icon: '🏨', hex: '#dc2626', tw: 'red',    match: ['hospital', 'medical center', 'medical centre', 'health system'] },
  { id: 'clinic',    label: 'Clinic',         icon: '🏥', hex: '#2563eb', tw: 'blue',   match: ['clinic', 'health centre', 'health center', 'healthcare', 'health care', 'outpatient', 'ambulatory'] },
  { id: 'physician', label: 'General Practice',icon: '👨‍⚕️', hex: '#16a34a', tw: 'green',  match: ['physician', 'general practice', 'family medicine', 'primary care', 'gp ', 'family doctor', 'internist', 'internal medicine'] },
  { id: 'urgent',    label: 'Urgent Care',    icon: '🚑', hex: '#db2777', tw: 'pink',   match: ['urgent', 'emergency', 'walk-in', 'walkin', 'walk in', 'immediate care', 'express care'] },
  { id: 'pharmacy',  label: 'Pharmacy',       icon: '💊', hex: '#ea580c', tw: 'orange', match: ['pharmacy', 'chemist', 'drugstore', 'drug store', 'pharmaceutical', 'apothecary'] },
  { id: 'lab',       label: 'Lab & Imaging',  icon: '🧪', hex: '#0891b2', tw: 'cyan',   match: ['lab', 'laborator', 'diagnostic', 'imaging', 'radiol', 'pathol', 'mri', 'x-ray', 'xray', 'scan center', 'scan centre'] },
  { id: 'dental',    label: 'Dental',         icon: '🦷', hex: '#ca8a04', tw: 'yellow', match: ['dent', 'oral health', 'orthodont'] },
];

/** Medical specialty sub-categories */
const SPECIALTIES = [
  { id: 'orthopedics',     label: 'Orthopedics',     icon: '🦴', hex: '#b45309', match: ['ortho', 'bone', 'joint', 'spine', 'musculoskeletal', 'sports medicine'] },
  { id: 'neurology',       label: 'Neurology',       icon: '🧠', hex: '#7c3aed', match: ['neuro', 'brain', 'nerve', 'stroke', 'epilepsy'] },
  { id: 'cardiology',      label: 'Cardiology',      icon: '❤️', hex: '#dc2626', match: ['cardio', 'heart', 'cardiac', 'vascular'] },
  { id: 'surgery',         label: 'Surgery',         icon: '🔪', hex: '#475569', match: ['surg', 'surgical', 'operation'] },
  { id: 'pediatrics',      label: 'Pediatrics',      icon: '👶', hex: '#0284c7', match: ['pediatr', 'paediatr', 'child', 'children', 'neonat'] },
  { id: 'dermatology',     label: 'Dermatology',     icon: '🧴', hex: '#e11d48', match: ['dermato', 'skin', 'cosmetic dermat'] },
  { id: 'gynecology',      label: 'Gynecology',      icon: '👩', hex: '#9333ea', match: ['gynaecol', 'gynecol', 'obstet', 'maternity', "women's health", 'womens health', 'reproductive'] },
  { id: 'ophthalmology',   label: 'Ophthalmology',   icon: '👁️', hex: '#0369a1', match: ['ophth', 'eye care', 'vision care', 'optom', 'opthal'] },
  { id: 'ent',             label: 'ENT',             icon: '👂', hex: '#065f46', match: ['ent', 'otolaryngol', 'ear nose', 'ear, nose', 'sinus'] },
  { id: 'oncology',        label: 'Oncology',        icon: '🎗️', hex: '#7c3aed', match: ['oncol', 'cancer', 'tumor', 'hematol'] },
  { id: 'psychiatry',      label: 'Psychiatry',      icon: '🧘', hex: '#0f766e', match: ['psychiatr', 'psychol', 'mental health', 'behavioral health', 'behavioral', 'counseling'] },
  { id: 'urology',         label: 'Urology',         icon: '🫀', hex: '#b45309', match: ['urol', 'kidney', 'bladder'] },
  { id: 'gastroenterology',label: 'Gastro',          icon: '🫁', hex: '#6d28d9', match: ['gastro', 'digestive', 'colorectal', 'hepatol', 'gi '] },
  { id: 'pulmonology',     label: 'Pulmonology',     icon: '💨', hex: '#0369a1', match: ['pulmon', 'lung', 'respirat', 'chest', 'thorac', 'allergy'] },
  { id: 'endocrinology',   label: 'Endocrinology',   icon: '💉', hex: '#059669', match: ['endocrin', 'diabetes', 'thyroid', 'hormone'] },
  { id: 'rheumatology',    label: 'Rheumatology',    icon: '🦾', hex: '#dc2626', match: ['rheum', 'arthritis', 'autoimmune'] },
];

/** Returns the best facility type id for a given OSM specialization string */
function getFacilityTypeId(spec) {
  if (!spec) return null;
  const s = spec.toLowerCase();
  // specialties matched first so "Orthopedic Hospital" → specialist, not hospital
  for (const sp of SPECIALTIES) {
    if (sp.match.some(m => s.includes(m))) return '__specialty__';
  }
  for (const ft of FACILITY_TYPES) {
    if (ft.match.some(m => s.includes(m))) return ft.id;
  }
  return 'other';
}

/** Returns the medical specialty id (if any) */
function getSpecialtyId(spec) {
  if (!spec) return null;
  const s = spec.toLowerCase();
  for (const sp of SPECIALTIES) {
    if (sp.match.some(m => s.includes(m))) return sp.id;
  }
  return null;
}

/** Returns display label + color hex for a doctor card/popup badge */
function getDisplayMeta(spec) {
  if (!spec) return { label: 'Healthcare', icon: '🏥', hex: '#64748b' };
  const s = spec.toLowerCase();
  for (const sp of SPECIALTIES) {
    if (sp.match.some(m => s.includes(m))) return sp;
  }
  for (const ft of FACILITY_TYPES) {
    if (ft.match.some(m => s.includes(m))) return ft;
  }
  return { label: spec, icon: '🏥', hex: '#64748b' };
}

function toMiles(km) { return (km * 0.621371).toFixed(1); }
function metresToMilesLabel(m) { return `${(m / 1609.34).toFixed(0)} mi`; }

// ── Tailwind pill helpers (static classes only — no dynamic color interpolation) ──

const TW_CHIPS = {
  red:    { off: 'border-red-300 bg-red-50 text-red-700',    on: 'bg-red-600 border-red-600 text-white' },
  blue:   { off: 'border-blue-300 bg-blue-50 text-blue-700',  on: 'bg-blue-600 border-blue-600 text-white' },
  green:  { off: 'border-green-300 bg-green-50 text-green-700', on: 'bg-green-600 border-green-600 text-white' },
  pink:   { off: 'border-pink-300 bg-pink-50 text-pink-700',   on: 'bg-pink-600 border-pink-600 text-white' },
  orange: { off: 'border-orange-300 bg-orange-50 text-orange-700', on: 'bg-orange-600 border-orange-600 text-white' },
  cyan:   { off: 'border-cyan-300 bg-cyan-50 text-cyan-700',   on: 'bg-cyan-600 border-cyan-600 text-white' },
  yellow: { off: 'border-yellow-300 bg-yellow-50 text-yellow-700', on: 'bg-yellow-500 border-yellow-500 text-white' },
  slate:  { off: 'border-slate-300 bg-slate-50 text-slate-600', on: 'bg-slate-700 border-slate-700 text-white' },
  teal:   { off: 'border-teal-300 bg-teal-50 text-teal-700',   on: 'bg-teal-600 border-teal-600 text-white' },
};

function Chip({ active, onClick, twColor = 'slate', children }) {
  const c = TW_CHIPS[twColor] || TW_CHIPS.slate;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border text-xs font-medium px-2.5 py-1 rounded-full transition-all whitespace-nowrap cursor-pointer
        ${active ? c.on : c.off + ' hover:opacity-80'}`}
    >
      {children}
    </button>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, zoom || 13); }, [center, zoom, map]);
  return null;
}

/** Inline-styled popup — Tailwind doesn't reliably reach Leaflet's shadow DOM */
function DoctorPopup({ doctor, directionsUrl }) {
  const meta = getDisplayMeta(doctor.specialization);
  const fullAddr = [doctor.address, doctor.city, doctor.state].filter(Boolean).join(', ');

  return (
    <div style={{ minWidth: 240, maxWidth: 280, fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 13 }}>
      {/* Colored top accent */}
      <div style={{ borderLeft: `4px solid ${meta.hex}`, paddingLeft: 10, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', lineHeight: 1.35, marginBottom: 6 }}>
          {doctor.name}
        </div>
        {/* Badge */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
          padding: '2px 8px', borderRadius: 20, border: `1px solid ${meta.hex}30`,
          background: `${meta.hex}18`, color: meta.hex,
        }}>
          {meta.icon} {meta.label}
        </span>
      </div>

      {/* Info rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, color: '#475569', fontSize: 12 }}>
        {fullAddr && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0 }}>📍</span>
            <span>{fullAddr}</span>
          </div>
        )}
        {doctor.phone && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>📞</span>
            <a href={`tel:${doctor.phone}`} style={{ color: '#0f766e', textDecoration: 'none' }}>
              {doctor.phone}
            </a>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#64748b' }}>
          <span>📏</span>
          <span>{toMiles(doctor.distance_km)} mi away</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#e2e8f0', margin: '10px 0' }} />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#0f766e', color: '#fff', fontSize: 12, fontWeight: 600,
            padding: '6px 12px', borderRadius: 8, textDecoration: 'none', flex: 1, justifyContent: 'center',
          }}
        >
          🗺️ Directions
        </a>
        {doctor.website && (
          <a
            href={doctor.website}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: '#f1f5f9', color: '#334155', fontSize: 12, fontWeight: 600,
              padding: '6px 12px', borderRadius: 8, textDecoration: 'none', border: '1px solid #cbd5e1',
            }}
          >
            🌐 Website
          </a>
        )}
      </div>
    </div>
  );
}

/** Sidebar doctor card */
function DoctorCard({ doctor, selected, onClick, directionsUrl }) {
  const meta = getDisplayMeta(doctor.specialization);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-all group
        ${selected
          ? 'bg-teal-50 border-l-[3px] border-l-teal-500'
          : 'hover:bg-slate-50 border-l-[3px] border-l-transparent'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm leading-snug line-clamp-2 group-hover:text-teal-700 transition-colors">
            {doctor.name}
          </p>
          {/* Colored badge */}
          <div className="mt-1.5">
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border"
              style={{ color: meta.hex, background: `${meta.hex}18`, borderColor: `${meta.hex}40` }}
            >
              {meta.icon} {meta.label}
            </span>
          </div>
          {doctor.address && (
            <p className="text-slate-500 text-xs mt-1.5 truncate">📍 {doctor.address}</p>
          )}
          {(doctor.city || doctor.state) && (
            <p className="text-slate-400 text-xs truncate">{[doctor.city, doctor.state].filter(Boolean).join(', ')}</p>
          )}
          {doctor.phone && (
            <p className="text-slate-500 text-xs mt-0.5">📞 {doctor.phone}</p>
          )}
        </div>
        <div className="shrink-0 text-right space-y-1.5">
          <span className="block text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
            {toMiles(doctor.distance_km)} mi
          </span>
        </div>
      </div>
      <div className="mt-2 flex gap-3">
        <a
          href={directionsUrl}
          target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-xs text-teal-600 font-medium hover:underline"
        >Directions →</a>
        {doctor.website && (
          <a
            href={doctor.website}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-xs text-slate-400 hover:underline truncate max-w-[110px]"
          >Website →</a>
        )}
      </div>
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Doctors() {
  const [userLocation, setUserLocation]     = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');

  const [allDoctors, setAllDoctors] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [dataSource, setDataSource] = useState(null);

  const [radius, setRadius]                   = useState(16093);
  const [facilityFilter, setFacilityFilter]   = useState('all');   // 'all' | facility type id
  const [specialtyFilter, setSpecialtyFilter] = useState('all');   // 'all' | specialty id
  const [nameSearch, setNameSearch]           = useState('');
  const [sortBy, setSortBy]                   = useState('distance');
  const [filtersOpen, setFiltersOpen]         = useState(true);
  const [activeFilterTab, setActiveFilterTab] = useState('facility'); // 'facility' | 'specialty'

  const [selectedDoctor, setSelectedDoctor] = useState(null);

  const markerRefs    = useRef({});
  const abortRef      = useRef(null);
  const hasFetchedRef = useRef(false);

  // ── Derived counts ───────────────────────────────────────────────────────────

  const facilityCounts = {};
  const specialtyCounts = {};
  for (const d of allDoctors) {
    const ftId = getFacilityTypeId(d.specialization);
    const spId = getSpecialtyId(d.specialization);
    if (ftId && ftId !== '__specialty__') facilityCounts[ftId] = (facilityCounts[ftId] || 0) + 1;
    if (ftId === '__specialty__' || spId) {
      // Count under facility type "other" if it's a specialty-only match
      facilityCounts['other'] = (facilityCounts['other'] || 0) + 1;
    }
    if (spId) specialtyCounts[spId] = (specialtyCounts[spId] || 0) + 1;
  }

  const activeFacilityTypes = FACILITY_TYPES.filter(ft => (facilityCounts[ft.id] || 0) > 0);
  const activeSpecialties   = SPECIALTIES.filter(sp => (specialtyCounts[sp.id] || 0) > 0);

  // ── Filtered + sorted list ───────────────────────────────────────────────────

  let visibleDoctors = allDoctors.filter(d => {
    // Facility type filter
    if (facilityFilter !== 'all') {
      const ftId = getFacilityTypeId(d.specialization);
      if (ftId !== facilityFilter) return false;
    }
    // Specialty filter
    if (specialtyFilter !== 'all') {
      if (getSpecialtyId(d.specialization) !== specialtyFilter) return false;
    }
    // Name search
    if (nameSearch.trim()) {
      const q = nameSearch.toLowerCase();
      const hay = [d.name, d.address, d.city, d.specialization].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (sortBy === 'name') {
    visibleDoctors = [...visibleDoctors].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  const hasActiveFilters = facilityFilter !== 'all' || specialtyFilter !== 'all' || nameSearch;

  // ── Data fetch ───────────────────────────────────────────────────────────────

  const fetchDoctors = useCallback(async (lat, lng, rad) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true); setAllDoctors([]); setSelectedDoctor(null);
    try {
      const { data } = await api.get('/doctors/nearby', {
        params: { lat, lng, radius: rad, source: 'osm' },
        signal: ctrl.signal,
      });
      setAllDoctors(data.doctors || []);
      setDataSource(data.source);
      if (data.source === 'db_fallback') toast('Live data unavailable — showing demo doctors', { icon: 'ℹ️' });
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      toast.error('Failed to load nearby doctors.');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  function requestLocation({ highAccuracy = false } = {}) {
    if (!navigator.geolocation) { toast.error('Geolocation not supported.'); setLocationStatus('denied'); return; }
    setLocationStatus('locating');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setUserLocation([latitude, longitude]);
        setLocationStatus('granted');
        if (!hasFetchedRef.current) { hasFetchedRef.current = true; fetchDoctors(latitude, longitude, radius); }
      },
      err => {
        // code 1 = PERMISSION_DENIED, code 3 = TIMEOUT
        if (err.code === 3 && highAccuracy) {
          // GPS timed out — retry instantly with low-accuracy (IP/WiFi) which is near-instant
          console.warn('Geolocation: GPS timed out, retrying with network location…');
          requestLocation({ highAccuracy: false });
          return;
        }
        if (err.code === 3) {
          // Low-accuracy also timed out — show denied state
          setLocationStatus('denied');
          toast('Location timed out — check your browser permissions.', { icon: '⏱️' });
          return;
        }
        // Actual permission denial
        console.warn('Geolocation denied:', err.message);
        setLocationStatus('denied');
        toast('Location denied — grant permission to see real doctors near you.', { icon: '📍' });
      },
      // Start with low-accuracy (fast, uses Wi-Fi/IP). enableHighAccuracy=true asks for
      // GPS which can time out on desktops or when the browser is busy.
      { timeout: 8000, maximumAge: 60000, enableHighAccuracy: highAccuracy }
    );
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { requestLocation(); }, []);

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

  // ── Pre-location screen ──────────────────────────────────────────────────────

  if (locationStatus === 'idle' || locationStatus === 'locating') {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 min-h-screen">
        <div className="text-center space-y-4 p-8 max-w-sm">
          <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto text-4xl">📍</div>
          <h2 className="text-xl font-bold text-slate-800">Allow location access</h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            MedAssist needs your location to show real doctors, clinics, and pharmacies near you using live OpenStreetMap data.
          </p>
          {locationStatus === 'locating' && (
            <div className="flex items-center justify-center gap-2 text-teal-600 text-sm">
              <div className="animate-spin w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
              Waiting for browser permission…
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main layout ──────────────────────────────────────────────────────────────

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="flex flex-col" style={{ height: '100vh' }}>

      {/* ── Top header bar ── */}
      <div className="bg-white border-b border-slate-200 px-5 py-2.5 shrink-0 z-10 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-slate-800 leading-tight">Find Nearby Healthcare</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {locationStatus === 'granted' && userLocation
              ? `${allDoctors.length} providers found within ${metresToMilesLabel(radius)}`
              : '⚠️ Location denied — grant permission for live data'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {locationStatus === 'denied' && (
            <button onClick={() => requestLocation({ highAccuracy: false })}
              className="flex items-center gap-1.5 bg-teal-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-teal-700">
              📍 Allow Location
            </button>
          )}

          {/* Name search */}
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              placeholder="Search by name…"
              value={nameSearch}
              onChange={e => setNameSearch(e.target.value)}
              className="border border-slate-300 rounded-lg pl-7 pr-3 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 w-44"
            />
          </div>

          {/* Sort toggle */}
          <div className="flex border border-slate-300 rounded-lg overflow-hidden text-xs">
            {[{ id: 'distance', label: '📏 Nearest' }, { id: 'name', label: '🔤 A–Z' }].map(opt => (
              <button key={opt.id} onClick={() => setSortBy(opt.id)}
                className={`px-3 py-1.5 transition-colors ${sortBy === opt.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Filter toggle */}
          <button onClick={() => setFiltersOpen(p => !p)}
            className={`flex items-center gap-1.5 border text-xs px-3 py-1.5 rounded-lg transition-colors font-medium
              ${filtersOpen ? 'bg-teal-600 text-white border-teal-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
            ⚙️ Filters {hasActiveFilters && <span className="bg-white/30 text-[10px] rounded-full px-1.5">●</span>}
          </button>

          {userLocation && (
            <button onClick={() => fetchDoctors(userLocation[0], userLocation[1], radius)} disabled={loading}
              className="text-xs text-teal-600 border border-teal-300 px-3 py-1.5 rounded-lg hover:bg-teal-50 disabled:opacity-40">
              {loading ? '⟳' : '↻ Refresh'}
            </button>
          )}
        </div>
      </div>

      {/* ── Filter panel ── */}
      <AnimatePresence>
        {filtersOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden shrink-0">

            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 space-y-3">

              {/* ── Distance ── */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-20 shrink-0">Distance</span>
                <div className="flex gap-1.5 flex-wrap">
                  {RADIUS_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setRadius(o.value)}
                      className={`border text-xs px-3 py-1 rounded-full font-medium transition-all
                        ${radius === o.value
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400 hover:text-teal-600'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Tab switcher: Facility / Specialty ── */}
              <div className="flex gap-0 border-b border-slate-200">
                {[
                  { id: 'facility',  label: '🏥 Facility Type' },
                  { id: 'specialty', label: '🔬 Medical Specialty' },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setActiveFilterTab(tab.id)}
                    className={`px-4 py-1.5 text-xs font-semibold border-b-2 transition-colors
                      ${activeFilterTab === tab.id
                        ? 'border-teal-600 text-teal-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    {tab.label}
                    {tab.id === 'facility'  && facilityFilter  !== 'all' && <span className="ml-1.5 text-[10px] bg-teal-100 text-teal-700 rounded-full px-1.5 py-0.5">●</span>}
                    {tab.id === 'specialty' && specialtyFilter !== 'all' && <span className="ml-1.5 text-[10px] bg-teal-100 text-teal-700 rounded-full px-1.5 py-0.5">●</span>}
                  </button>
                ))}
              </div>

              {/* ── Facility Type chips ── */}
              {activeFilterTab === 'facility' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Chip active={facilityFilter === 'all'} onClick={() => setFacilityFilter('all')} twColor="teal">
                    🏥 All
                    <span className="text-[10px] rounded-full px-1.5 py-0.5 font-bold bg-white/30">
                      {allDoctors.length}
                    </span>
                  </Chip>
                  {FACILITY_TYPES.map(ft => {
                    const cnt = facilityCounts[ft.id] || 0;
                    if (cnt === 0 && !loading) return null;
                    return (
                      <Chip key={ft.id} active={facilityFilter === ft.id}
                        onClick={() => setFacilityFilter(p => p === ft.id ? 'all' : ft.id)}
                        twColor={ft.tw}>
                        {ft.icon} {ft.label}
                        {cnt > 0 && (
                          <span className="text-[10px] rounded-full px-1.5 py-0.5 font-bold bg-white/30">{cnt}</span>
                        )}
                      </Chip>
                    );
                  })}
                </div>
              )}

              {/* ── Medical Specialty chips ── */}
              {activeFilterTab === 'specialty' && (
                <div className="flex items-start gap-2 flex-wrap">
                  <Chip active={specialtyFilter === 'all'} onClick={() => setSpecialtyFilter('all')} twColor="teal">
                    🔬 All Specialties
                  </Chip>
                  {activeSpecialties.length === 0 && !loading && (
                    <span className="text-xs text-slate-400 py-1">
                      No specialist data in current search area — try expanding radius.
                    </span>
                  )}
                  {SPECIALTIES.map(sp => {
                    const cnt = specialtyCounts[sp.id] || 0;
                    if (cnt === 0) return null;
                    return (
                      <button key={sp.id}
                        onClick={() => setSpecialtyFilter(p => p === sp.id ? 'all' : sp.id)}
                        className="inline-flex items-center gap-1.5 border text-xs font-semibold px-2.5 py-1 rounded-full transition-all whitespace-nowrap cursor-pointer"
                        style={specialtyFilter === sp.id
                          ? { background: sp.hex, color: '#fff', borderColor: sp.hex }
                          : { background: `${sp.hex}12`, color: sp.hex, borderColor: `${sp.hex}40` }}>
                        {sp.icon} {sp.label}
                        <span className="text-[10px] rounded-full px-1.5 py-0.5 font-bold" style={{ background: 'rgba(255,255,255,0.3)' }}>
                          {cnt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Clear filters */}
              {hasActiveFilters && (
                <div className="flex justify-end pt-1">
                  <button onClick={() => { setFacilityFilter('all'); setSpecialtyFilter('all'); setNameSearch(''); }}
                    className="text-[11px] text-red-500 hover:text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full hover:bg-red-50 transition-colors">
                    ✕ Clear all filters
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── OSM notice bar ── */}
      <div className="bg-amber-50 border-b border-amber-200 px-5 py-1 text-center text-[11px] text-amber-700 shrink-0 flex items-center justify-center gap-3">
        <span>Data from OpenStreetMap contributors. Verify availability before visiting.</span>
        {dataSource === 'osm' && <span className="text-green-600 font-semibold">● Live OSM data</span>}
        {dataSource === 'db_fallback' && (
          <>
            <span className="text-orange-500 font-semibold">● Demo data</span>
            {userLocation && (
              <button onClick={() => fetchDoctors(userLocation[0], userLocation[1], radius)}
                className="text-teal-600 underline">Retry</button>
            )}
          </>
        )}
      </div>

      {/* ── Map + Sidebar ── */}
      <div className="flex flex-row flex-1 overflow-hidden">

        {/* ── LEFT: scrollable list ── */}
        <div className="w-80 xl:w-96 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">

          {/* List header */}
          <div className="border-b border-slate-100 px-4 py-2 shrink-0 bg-slate-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600">
              {loading
                ? 'Fetching live data…'
                : visibleDoctors.length === allDoctors.length
                  ? `${allDoctors.length} providers`
                  : `${visibleDoctors.length} of ${allDoctors.length} shown`}
            </p>
            {!loading && hasActiveFilters && (
              <span className="text-[10px] text-teal-600 font-medium bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                Filtered
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="animate-spin w-7 h-7 border-4 border-teal-600 border-t-transparent rounded-full" />
                <p className="text-xs text-slate-400">Querying OpenStreetMap…</p>
              </div>
            )}

            {!loading && visibleDoctors.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
                <div className="text-4xl">🔍</div>
                <p className="text-slate-500 text-sm">
                  {allDoctors.length === 0
                    ? `No providers found within ${metresToMilesLabel(radius)}.`
                    : nameSearch
                      ? `No results for "${nameSearch}".`
                      : 'No providers match the selected filters.'}
                </p>
                {allDoctors.length === 0 ? (
                  <button onClick={() => setRadius(prev => Math.min(prev * 2, 80467))}
                    className="text-sm text-teal-600 border border-teal-300 px-4 py-1.5 rounded-lg hover:bg-teal-50">
                    Expand radius
                  </button>
                ) : (
                  <button onClick={() => { setFacilityFilter('all'); setSpecialtyFilter('all'); setNameSearch(''); }}
                    className="text-sm text-teal-600 border border-teal-300 px-4 py-1.5 rounded-lg hover:bg-teal-50">
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {!loading && visibleDoctors.map(doctor => (
              <DoctorCard
                key={doctor.id}
                doctor={doctor}
                selected={selectedDoctor?.id === doctor.id}
                onClick={() => handleSidebarClick(doctor)}
                directionsUrl={directionsUrl(doctor)}
              />
            ))}
          </div>
        </div>

        {/* ── RIGHT: Leaflet map ── */}
        <div className="flex-1 relative">
          <MapContainer
            center={mapCenter} zoom={mapZoom}
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
                  <div style={{ fontFamily: 'system-ui, sans-serif', fontWeight: 700, color: '#0f766e', fontSize: 13 }}>
                    📍 You are here
                  </div>
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
                <Popup minWidth={240}>
                  <DoctorPopup doctor={doctor} directionsUrl={directionsUrl(doctor)} />
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </motion.div>
  );
}
