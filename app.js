const tr = (key, values = {}) => window.tpwI18n?.t(key, values) || key;
const statusLabel = (status) => tr(status);
const TUNISIA_TIME_ZONE = "Africa/Tunis";

function interfaceLocale() {
  return window.tpwI18n?.language === "ar" ? "ar-TN" : "fr-TN";
}

function asUtcDate(value) {
  if (value instanceof Date) return value;
  const raw = String(value || "").trim();
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  return new Date(hasTimeZone || !/^\d{4}-\d{2}-\d{2}[ T]/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`);
}

function formatTunisiaTime(value = new Date(), includeSeconds = false) {
  const date = asUtcDate(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleTimeString(interfaceLocale(), {
    timeZone: TUNISIA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  });
}

function formatTunisiaDateTime(value) {
  const date = asUtcDate(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleString(interfaceLocale(), {
    timeZone: TUNISIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function tunisiaDateKey(value = new Date()) {
  const date = asUtcDate(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: TUNISIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function tunisiaHour(value = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: TUNISIA_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(value));
}

const zones = [
  { id: "tunis", city: "Tunis", governorate: "Tunis", lat: 36.8065, lng: 10.1815, reports: 88, status: "confirmed", trust: 91 },
  { id: "ariana", city: "Ariana", governorate: "Ariana", lat: 36.8625, lng: 10.1956, reports: 36, status: "probable", trust: 72 },
  { id: "bizerte", city: "Bizerte", governorate: "Bizerte", lat: 37.2744, lng: 9.8739, reports: 42, status: "confirmed", trust: 86 },
  { id: "nabeul", city: "Nabeul", governorate: "Nabeul", lat: 36.4513, lng: 10.7359, reports: 24, status: "probable", trust: 69 },
  { id: "sousse", city: "Sousse", governorate: "Sousse", lat: 35.8256, lng: 10.63699, reports: 64, status: "confirmed", trust: 89 },
  { id: "monastir", city: "Monastir", governorate: "Monastir", lat: 35.7643, lng: 10.8113, reports: 31, status: "probable", trust: 78 },
  { id: "mahdia", city: "Mahdia", governorate: "Mahdia", lat: 35.5047, lng: 11.0622, reports: 19, status: "resolved", trust: 83 },
  { id: "sfax", city: "Sfax", governorate: "Sfax", lat: 34.7406, lng: 10.7603, reports: 96, status: "confirmed", trust: 94 },
  { id: "kairouan", city: "Kairouan", governorate: "Kairouan", lat: 35.6781, lng: 10.0963, reports: 51, status: "probable", trust: 75 },
  { id: "gafsa", city: "Gafsa", governorate: "Gafsa", lat: 34.425, lng: 8.7842, reports: 45, status: "confirmed", trust: 87 },
  { id: "gabes", city: "Gabès", governorate: "Gabès", lat: 33.8815, lng: 10.0982, reports: 57, status: "confirmed", trust: 90 },
  { id: "medenine", city: "Médenine", governorate: "Médenine", lat: 33.3549, lng: 10.5055, reports: 34, status: "probable", trust: 73 },
  { id: "tozeur", city: "Tozeur", governorate: "Tozeur", lat: 33.9197, lng: 8.1335, reports: 18, status: "resolved", trust: 80 },
  { id: "kef", city: "Le Kef", governorate: "Le Kef", lat: 36.1822, lng: 8.7148, reports: 22, status: "probable", trust: 71 },
];

if (window.stegZones?.length) {
  zones.splice(0, zones.length, ...window.stegZones);
}

const legacyPointZones = zones.map((zone) => ({ ...zone }));
const zoneIndex = new Map();

function rebuildZoneIndex() {
  zoneIndex.clear();
  zones.forEach((zone) => zoneIndex.set(zone.id, zone));
}

zones.forEach((zone, index) => {
  zone.history = emptyHistory();
  zone.hourly = emptyHourlySeries();
});
rebuildZoneIndex();

const state = {
  user: null,
  pushConfigured: false,
  pushPublicKey: null,
  whatsappUrl: null,
  serverReady: false,
  filters: { governorate: "all", status: "all", minimum: 0 },
  feed: [],
  seenReportIds: new Set(),
  socket: null,
  demoTimer: null,
  map: null,
  tileLayer: null,
  zoneAreas: new Map(),
  geographyReady: false,
  sectorGeoJson: null,
  sectorSpatialIndex: [],
  legacyPointMappings: [],
  legacyZoneAliases: new Map(),
  geographicZoneLayersReady: false,
  statsDays: 7,
  stats: null,
  statsRequestId: 0,
  reportCooldownUntil: 0,
  reportCooldownMs: 20 * 60 * 1000,
  reportCooldownExempt: false,
  reportSubmitting: false,
  lowData: localStorage.getItem("tpw-low-data") === "true"
    || (!localStorage.getItem("tpw-low-data") && Boolean(navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || ""))),
  selectedZoneId: new URL(location.href).searchParams.get("zone") || localStorage.getItem("tpw-zone") || zones.find((zone) => zone.city === "Tunis centre")?.id || zones[0]?.id,
};

const $ = (selector) => document.querySelector(selector);

function collectGeometryCoordinates(coordinates, visitor) {
  if (!Array.isArray(coordinates)) return;
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    visitor(coordinates);
    return;
  }
  coordinates.forEach((entry) => collectGeometryCoordinates(entry, visitor));
}

function geometryBounds(geometry) {
  const bounds = { minLat: Infinity, minLng: Infinity, maxLat: -Infinity, maxLng: -Infinity };
  collectGeometryCoordinates(geometry.coordinates, ([lng, lat]) => {
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
  });
  return bounds;
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    if ((y > lat) !== (previousY > lat)
      && lng < ((previousX - x) * (lat - y)) / (previousY - y) + x) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng, lat, polygon) {
  if (!polygon.length || !pointInRing(lng, lat, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(lng, lat, hole));
}

function featureContainsPoint(feature, lat, lng) {
  const geometry = feature.geometry;
  if (geometry.type === "Polygon") return pointInPolygon(lng, lat, geometry.coordinates);
  return geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
}

function geographicZoneAtPoint(lat, lng) {
  const match = state.sectorSpatialIndex.find(({ feature, bounds }) => (
    lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng
    && featureContainsPoint(feature, lat, lng)
  ));
  return match ? zoneIndex.get(match.feature.properties.id) : null;
}

function nearestGeographicZone(lat, lng) {
  return zones.reduce((nearest, zone) => {
    const distance = distanceBetween(lat, lng, zone.lat, zone.lng);
    return !nearest || distance < nearest.distance ? { zone, distance } : nearest;
  }, null)?.zone || null;
}

async function loadGeographicZones() {
  try {
    const response = await fetch("data/tn-imadas.geojson?v=1", { cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geoJson = await response.json();
    if (geoJson.type !== "FeatureCollection" || !Array.isArray(geoJson.features)) throw new Error("GeoJSON invalide");
    const geographicZones = geoJson.features.map((feature) => {
      const properties = feature.properties || {};
      return {
        id: properties.id,
        city: properties.name,
        cityAr: properties.nameAr,
        delegation: properties.delegation,
        delegationAr: properties.delegationAr,
        governorate: properties.governorate,
        governorateAr: properties.governorateAr,
        direction: "Découpage administratif des imadas",
        lat: Number(properties.lat),
        lng: Number(properties.lng),
        reports: 0,
        status: "resolved",
        trust: 0,
        source: "hdx-cod-ab",
        history: emptyHistory(),
        hourly: emptyHourlySeries(),
      };
    });
    zones.splice(0, zones.length, ...geographicZones);
    rebuildZoneIndex();
    state.sectorGeoJson = geoJson;
    state.sectorSpatialIndex = geoJson.features.map((feature) => ({ feature, bounds: geometryBounds(feature.geometry) }));
    state.legacyPointMappings = legacyPointZones.map((point) => {
      const reportZone = geographicZoneAtPoint(point.lat, point.lng) || nearestGeographicZone(point.lat, point.lng);
      return { point, zoneId: reportZone?.id || null };
    }).filter((entry) => entry.zoneId);
    state.legacyZoneAliases = new Map(state.legacyPointMappings.map(({ point, zoneId }) => [point.id, zoneId]));
    state.geographyReady = true;

    const requestedId = new URL(location.href).searchParams.get("zone") || localStorage.getItem("tpw-zone");
    const legacyPoint = requestedId && legacyPointZones.find((zone) => zone.id === requestedId);
    const mappedLegacyZone = legacyPoint && (geographicZoneAtPoint(legacyPoint.lat, legacyPoint.lng) || nearestGeographicZone(legacyPoint.lat, legacyPoint.lng));
    state.selectedZoneId = zoneIndex.has(requestedId)
      ? requestedId
      : mappedLegacyZone?.id || geographicZoneAtPoint(36.8065, 10.1815)?.id || zones[0]?.id;
  } catch (error) {
    console.warn("Limites géographiques indisponibles, utilisation des zones ponctuelles.", error);
    state.geographyReady = false;
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Le serveur n'a pas pu traiter la demande.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function resetZoneStats() {
  zones.forEach((zone) => {
    zone.reports = 0;
    zone.status = "resolved";
    zone.trust = 0;
    zone.confirmations = 0;
    zone.resolutions = 0;
    zone.myVote = null;
    zone.periodDays = 7;
    zone.periodReports = 0;
    zone.history = emptyHistory();
    zone.hourly = emptyHourlySeries();
    zone.peakHour = null;
  });
}

function applySharedState(payload) {
  resetZoneStats();
  payload.zones.forEach((summary) => {
    const targetId = state.legacyZoneAliases.get(summary.id) || summary.id;
    const zone = zoneIndex.get(targetId);
    if (!zone) return;
    if (targetId === summary.id) {
      Object.assign(zone, summary);
      zone.history = Array.isArray(summary.history) ? summary.history.map(Number) : emptyHistory();
      zone.hourly = Array.isArray(summary.hourly) ? summary.hourly.map(Number) : emptyHourlySeries();
      return;
    }
    zone.reports += Number(summary.reports || 0);
    zone.periodReports += Number(summary.periodReports || 0);
    zone.confirmations += Number(summary.confirmations || 0);
    zone.resolutions += Number(summary.resolutions || 0);
    zone.trust = Math.max(zone.trust, Number(summary.trust || 0));
    if (summary.status === "confirmed" || (summary.status === "probable" && zone.status === "resolved")) zone.status = summary.status;
    zone.history = zone.history.map((value, index) => value + Number(summary.history?.[index] || 0));
    zone.hourly = zone.hourly.map((value, index) => value + Number(summary.hourly?.[index] || 0));
  });
  state.user = payload.user;
  state.pushConfigured = Boolean(payload.push?.configured);
  state.pushPublicKey = payload.push?.publicKey || null;
  state.whatsappUrl = payload.whatsapp?.configured ? payload.whatsapp.url || null : null;
  state.reportCooldownUntil = Number(payload.reporting?.cooldownUntil || 0);
  state.reportCooldownMs = Number(payload.reporting?.cooldownMs ?? (payload.user ? 10 : 20) * 60 * 1000);
  state.reportCooldownExempt = Boolean(payload.reporting?.cooldownExempt || payload.user?.isAdmin);
  state.feed = payload.feed || [];
  state.seenReportIds = new Set(state.feed.map((item) => item.id));
  state.stats = null;
  state.serverReady = true;
  if (!zones.some((zone) => zone.id === state.selectedZoneId)) state.selectedZoneId = zones[0]?.id;
}

async function loadSharedState() {
  try {
    applySharedState(await api("/api/bootstrap"));
  } catch (error) {
    state.serverReady = false;
    toast(`Connexion au serveur impossible: ${error.message}`);
  }
  renderAll();
  updateTrustPreview();
  updateNotificationControls();
  if (state.serverReady) await loadZoneStatistics();
  if (state.user?.isAdmin) void loadAdminModeration();
}

function applyReportEvent(payload) {
  if (!payload?.zone || state.seenReportIds.has(payload.reportId)) return;
  state.seenReportIds.add(payload.reportId);
  const targetId = state.legacyZoneAliases.get(payload.zone.id) || payload.zone.id;
  const zone = zoneIndex.get(targetId);
  if (zone) {
    if (targetId === payload.zone.id) {
      Object.assign(zone, payload.zone);
      zone.history = Array.isArray(payload.zone.history) ? payload.zone.history.map(Number) : zone.history;
      zone.hourly = Array.isArray(payload.zone.hourly) ? payload.zone.hourly.map(Number) : zone.hourly;
    } else {
      zone.reports += 1;
      zone.periodReports += 1;
      pushHourly(zone, 1);
      zone.trust = Math.max(zone.trust, Number(payload.zone.trust || 0));
      if (payload.zone.status !== "resolved") zone.status = payload.zone.status;
    }
  }
  if (payload.feedItem) state.feed.unshift(payload.feedItem);
  state.feed = state.feed.slice(0, 30);
  if (payload.zone.id === state.selectedZoneId) state.stats = null;
  renderAll();
  if (payload.zone.id === state.selectedZoneId) void loadZoneStatistics();
}

function heatColor(reports) {
  if (reports >= 80) return "#d71920";
  if (reports >= 50) return "#f77f00";
  if (reports >= 25) return "#ffd166";
  return "#28b487";
}

function statusClass(status) {
  return status === "confirmed" ? "confirmed" : status === "resolved" ? "resolved" : "probable";
}

function emptyHistory() {
  return Array(7).fill(0);
}

function emptyHourlySeries() {
  return Array(24).fill(0);
}

function pushHistory(zone) {
  zone.history = [...(zone.history || emptyHistory()).slice(-6), zone.reports];
}

function pushHourly(zone, bump = 1) {
  const hour = tunisiaHour();
  zone.hourly = zone.hourly || emptyHourlySeries();
  zone.hourly[hour] = Math.max(0, zone.hourly[hour] + bump);
}

function filteredZones() {
  return zones.filter((zone) => {
    const governorateMatch = state.filters.governorate === "all" || zone.governorate === state.filters.governorate;
    const statusMatch = state.filters.status === "all" || zone.status === state.filters.status;
    const reportsMatch = zone.reports >= state.filters.minimum;
    return governorateMatch && statusMatch && reportsMatch;
  });
}

function clipZoneCell(polygon, center, neighbor) {
  const normalX = neighbor.x - center.x;
  const normalY = neighbor.y - center.y;
  if (Math.hypot(normalX, normalY) < 1e-8) return polygon;
  const middleX = (center.x + neighbor.x) / 2;
  const middleY = (center.y + neighbor.y) / 2;
  const side = (point) => (point.x - middleX) * normalX + (point.y - middleY) * normalY;
  const clipped = [];

  polygon.forEach((end, index) => {
    const start = polygon[(index + polygon.length - 1) % polygon.length];
    const startSide = side(start);
    const endSide = side(end);
    const startInside = startSide <= 1e-10;
    const endInside = endSide <= 1e-10;
    if (startInside !== endInside) {
      const ratio = startSide / (startSide - endSide);
      clipped.push({
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      });
    }
    if (endInside) clipped.push(end);
  });
  return clipped;
}

function zoneAreaCoordinates(zone) {
  const longitudeScale = Math.max(0.72, Math.cos(zone.lat * Math.PI / 180));
  const center = { x: zone.lng * longitudeScale, y: zone.lat };
  const neighbors = zones
    .filter((entry) => entry.id !== zone.id)
    .map((entry) => ({ x: entry.lng * longitudeScale, y: entry.lat }));
  const nearestDistance = neighbors.reduce((nearest, point) => {
    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    return distance > 1e-8 ? Math.min(nearest, distance) : nearest;
  }, Number.POSITIVE_INFINITY);
  const radius = Number.isFinite(nearestDistance)
    ? Math.min(0.16, Math.max(0.045, nearestDistance * 0.72))
    : 0.12;
  const rotation = [...zone.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 36;
  const initialCell = Array.from({ length: 10 }, (_, index) => {
    const angle = ((rotation + index * 36) * Math.PI) / 180;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
  const cell = neighbors.reduce((polygon, neighbor) => {
    if (polygon.length < 3) return polygon;
    return clipZoneCell(polygon, center, neighbor);
  }, initialCell);
  const usableCell = cell.length >= 3 ? cell : initialCell;
  return usableCell.map((point) => [point.y, point.x / longitudeScale]);
}

function configureMapGestures(map, mapNode) {
  const gestureHint = $("#mapGestureHint");
  const mobileTouchQuery = window.matchMedia("(max-width: 900px) and (pointer: coarse)");
  let hintTimer;

  function hideGestureHint() {
    clearTimeout(hintTimer);
    gestureHint.hidden = true;
  }

  function showGestureHint() {
    clearTimeout(hintTimer);
    gestureHint.hidden = false;
    hintTimer = setTimeout(hideGestureHint, 1800);
  }

  function applyGestureMode() {
    if (mobileTouchQuery.matches) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.touchZoom.enable();
      mapNode.classList.add("two-finger-navigation");
    } else {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      mapNode.classList.remove("two-finger-navigation");
      hideGestureHint();
    }
  }

  mapNode.addEventListener("touchstart", (event) => {
    if (!mobileTouchQuery.matches) return;
    if (event.touches.length === 1) showGestureHint();
    if (event.touches.length >= 2) hideGestureHint();
  }, { passive: true });

  mapNode.addEventListener("touchend", (event) => {
    if (mobileTouchQuery.matches && event.touches.length === 0) {
      hintTimer = setTimeout(hideGestureHint, 500);
    }
  }, { passive: true });

  mobileTouchQuery.addEventListener?.("change", applyGestureMode);
  applyGestureMode();
}

function renderMetrics() {
  const active = zones.filter((zone) => zone.status !== "resolved");
  const totalReports = active.reduce((sum, zone) => sum + zone.reports, 0);
  const reportedZones = zones.filter((zone) => zone.reports > 0);
  const trust = reportedZones.length
    ? Math.round(reportedZones.reduce((sum, zone) => sum + zone.trust, 0) / reportedZones.length)
    : 0;
  $("#activeReports").textContent = totalReports.toLocaleString("fr-FR");
  $("#affectedZones").textContent = active.length.toString();
  $("#trustAverage").textContent = `${trust}%`;
}

function mapAreaStyle(zone) {
  const status = statusClass(zone.status);
  return {
    pane: "zoneAreas",
    color: status === "confirmed" ? "#a31217" : status === "probable" ? "#a96300" : "#24755f",
    fillColor: status === "confirmed" ? "#d71920" : status === "probable" ? "#f4a62a" : "#58aa91",
    fillOpacity: status === "resolved" ? 0.14 : 0.42,
    opacity: 0.9,
    weight: zone.id === state.selectedZoneId ? 3 : 0.85,
  };
}

function ensureGeographicZoneLayers() {
  if (!state.geographyReady || state.geographicZoneLayersReady || !state.map) return;
  state.zoneAreas.forEach((area) => area.remove());
  state.zoneAreas.clear();
  state.sectorGeoJson.features.forEach((feature) => {
    const zone = zoneIndex.get(feature.properties.id);
    if (!zone) return;
    const area = L.geoJSON(feature, { style: mapAreaStyle(zone), pane: "zoneAreas" }).getLayers()[0];
    if (!area) return;
    area.bindTooltip(`${zone.city} · ${zone.delegation} · ${zone.governorate}`, { sticky: true });
    area.on("click", () => handleMapZoneClick(zone.id));
    state.zoneAreas.set(zone.id, area);
  });
  state.geographicZoneLayersReady = true;
}

function renderMap() {
  const mapNode = $("#osmMap");
  if (!window.L) {
    mapNode.innerHTML = "<div class=\"map-error\">OpenStreetMap nécessite la librairie Leaflet. Vérifie la connexion internet puis recharge la page.</div>";
    return;
  }
  if (!state.map) {
    state.map = L.map("osmMap", { zoomControl: true, scrollWheelZoom: true, preferCanvas: true }).setView([34.85, 9.55], 6);
    configureMapGestures(state.map, mapNode);
    state.map.createPane("zoneAreas");
    state.map.getPane("zoneAreas").style.zIndex = "330";
    state.tileLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap",
    });
    if (!state.lowData) state.tileLayer.addTo(state.map);
    state.map.fitBounds([[30.2, 7.1], [37.6, 11.8]], { padding: [18, 18] });
  }
  mapNode.classList.toggle("low-data-map", state.lowData);
  const visibleZones = filteredZones();
  const visibleZoneIds = new Set(visibleZones.map((zone) => zone.id));
  if (state.geographyReady) {
    ensureGeographicZoneLayers();
    state.zoneAreas.forEach((area, zoneId) => {
      const zone = zoneIndex.get(zoneId);
      const visible = visibleZoneIds.has(zoneId);
      if (visible && !state.map.hasLayer(area)) area.addTo(state.map);
      if (!visible && state.map.hasLayer(area)) area.remove();
      if (visible && zone) {
        area.setStyle(mapAreaStyle(zone));
        area.setTooltipContent(`${zone.city} · ${zone.delegation} · ${zone.governorate} · ${zone.reports} ${tr("periodReports").toLowerCase()}`);
      }
    });
  } else {
    state.zoneAreas.forEach((area) => area.remove());
    state.zoneAreas.clear();
  }
  if (!state.geographyReady) {
    visibleZones.forEach((zone) => {
      const status = statusClass(zone.status);
      const area = L.polygon(zoneAreaCoordinates(zone), {
        pane: "zoneAreas",
        className: `zone-area ${status} ${zone.id === state.selectedZoneId ? "selected" : ""}`,
        color: status === "confirmed" ? "#a31217" : status === "probable" ? "#a96300" : "#24755f",
        fillColor: status === "confirmed" ? "#d71920" : status === "probable" ? "#f4a62a" : "#58aa91",
        fillOpacity: status === "resolved" ? 0.18 : 0.3,
        opacity: 0.9,
        weight: zone.id === state.selectedZoneId ? 3 : 1.25,
      }).addTo(state.map);
      area.bindTooltip(`${zone.city} · ${zone.governorate} · ${zone.reports} ${tr("periodReports").toLowerCase()}`, { sticky: true });
      area.on("click", () => handleMapZoneClick(zone.id));
      state.zoneAreas.set(zone.id, area);
    });
  }
  renderCityDetail();
}

function focusZone(id) {
  const element = document.querySelector(`[data-zone-card="${id}"]`);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.animate([{ background: "#fff3f4" }, { background: "#ffffff" }], { duration: 900 });
}

function selectZone(id, panMap = false) {
  state.selectedZoneId = id;
  const zone = zoneIndex.get(id);
  if (!zone) return;
  localStorage.setItem("tpw-zone", id);
  const url = new URL(location.href);
  url.searchParams.set("zone", id);
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  if (zone && panMap && state.map) {
    const area = state.zoneAreas.get(zone.id);
    if (state.geographyReady && area?.getBounds) {
      state.map.flyToBounds(area.getBounds(), { padding: [28, 28], duration: 0.6, maxZoom: 13 });
    } else {
      state.map.flyTo([zone.lat, zone.lng], Math.max(state.map.getZoom(), 11), { duration: 0.6 });
    }
  }
  focusZone(id);
  renderAll();
  void loadZoneStatistics();
}

function handleMapZoneClick(id) {
  const zone = zoneIndex.get(id);
  if (!zone) return;
  selectZone(id, true);
  openZoneQuickReport(zone);
}

function openZoneQuickReport(zone) {
  const dialog = $("#zoneQuickReportDialog");
  dialog.dataset.zoneId = zone.id;
  $("#zoneQuickReportName").textContent = zone.city;
  $("#zoneQuickReportDistrict").textContent = [zone.delegation, zone.governorate].filter(Boolean).join(" · ");
  if (dialog.open && typeof dialog.close === "function") dialog.close();
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeZoneQuickReport() {
  const dialog = $("#zoneQuickReportDialog");
  if (dialog.open && typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function prefillReportFromMap(zone, status) {
  if (!zone || !["confirmed", "resolved"].includes(status)) return;
  const statusSelect = $("#reportStatus");
  delete $("#reportForm").dataset.qrPreset;
  syncReportStatusOptions();
  const qrNotice = $("#qrReportNotice");
  qrNotice.hidden = true;
  delete qrNotice.dataset.zoneId;
  delete qrNotice.dataset.status;
  const url = new URL(location.href);
  url.searchParams.delete("source");
  url.searchParams.delete("reportStatus");
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  selectReportZone(zone);
  statusSelect.value = status;
  updateTrustPreview();
  closeZoneQuickReport();
  requestAnimationFrame(() => $("#reportForm").scrollIntoView({ behavior: "smooth", block: "start" }));
  toast(tr("quickReportPrefilled", { city: zone.city, status: statusLabel(status) }));
}

function renderZones() {
  const list = $("#zoneList");
  const template = $("#zoneTemplate");
  list.textContent = "";
  const visible = filteredZones().sort((a, b) => b.reports - a.reports || a.city.localeCompare(b.city, "fr"));
  const displayed = visible.slice(0, 30);
  const selected = zoneIndex.get(state.selectedZoneId);
  if (selected && visible.includes(selected) && !displayed.includes(selected)) displayed.push(selected);
  displayed
    .forEach((zone) => {
      const card = template.content.firstElementChild.cloneNode(true);
      card.classList.add(statusClass(zone.status));
      if (zone.id === state.selectedZoneId) {
        card.classList.add("selected");
      }
      card.dataset.zoneCard = zone.id;
      card.querySelector("strong").textContent = zone.city;
      card.querySelector("span").textContent = `${zone.delegation ? `${zone.delegation} · ` : ""}${zone.governorate} · confiance ${zone.trust}%`;
      renderCityChart(card.querySelector(".city-chart"), zone);
      card.querySelector("b").textContent = zone.reports;
      card.querySelector("em").textContent = statusLabel(zone.status);
      card.addEventListener("click", () => selectZone(zone.id, true));
      list.append(card);
    });
}

function renderCityChart(svg, zone) {
  const values = zone.history || emptyHistory();
  const max = Math.max(...values, 1);
  const width = 118;
  const height = 42;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - 5 - (value / max) * 31;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const bars = values.map((value, index) => {
    const barHeight = Math.max(4, (value / max) * 28);
    const x = index * 9.8 + 1;
    const y = height - barHeight - 3;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="5.8" height="${barHeight.toFixed(1)}" rx="1.5"></rect>`;
  }).join("");
  const lastY = points.split(" ").at(-1).split(",")[1];
  svg.innerHTML = `
    <g class="chart-bars">${bars}</g>
    <polyline points="${points}"></polyline>
    <circle cx="116" cy="${lastY}" r="2.8"></circle>
  `;
}

function renderCityDetail() {
  const detail = $("#cityDetail");
  const zone = zoneIndex.get(state.selectedZoneId) || filteredZones()[0] || zones[0];
  if (!zone) {
    detail.hidden = true;
    return;
  }
  state.selectedZoneId = zone.id;
  detail.hidden = false;
  $("#detailTitle").textContent = `${zone.city}, ${zone.governorate}`;
  $("#detailStatus").textContent = statusLabel(zone.status);
  $("#detailTerritory").innerHTML = `
    <span>${state.geographyReady ? "Limite administrative HDX / OpenStreetMap" : zone.direction || "Direction STEG"}</span>
    <strong>${zone.governorate}${zone.delegation ? ` · ${zone.delegation}` : ""}</strong>
    <small>Zone locale: ${zone.city}${zone.agencies?.length ? ` · Agences: ${zone.agencies.join(", ")}` : ""}</small>
  `;
  const statistics = state.stats?.zoneId === zone.id && state.stats?.days === state.statsDays ? state.stats : null;
  const summaryMatchesPeriod = zone.periodDays === state.statsDays;
  const periodReports = statistics?.totalReports ?? (summaryMatchesPeriod ? zone.periodReports : 0) ?? 0;
  $("#detailReports").textContent = periodReports.toString();
  $("#detailTrust").textContent = `${zone.trust}%`;
  const hourly = statistics?.hourly || (summaryMatchesPeriod ? zone.hourly : null) || emptyHourlySeries();
  const peakValue = Math.max(...hourly);
  const peakHour = periodReports > 0 && peakValue > 0
    ? (Number.isInteger(statistics?.peakHour) ? statistics.peakHour : hourly.indexOf(peakValue))
    : null;
  $("#detailPeak").textContent = peakHour === null ? "—" : `${peakHour.toString().padStart(2, "0")}:00`;
  $("#confirmOutageButton").classList.toggle("active", zone.myVote === "outage");
  $("#confirmResolvedButton").classList.toggle("active", zone.myVote === "resolved");
  $("#confirmOutageButton").disabled = !state.user;
  $("#confirmResolvedButton").disabled = !state.user;
  $("#communityVoteSummary").textContent = tr("communitySummary", { outage: zone.confirmations || 0, resolved: zone.resolutions || 0 });
  const verificationSummary = $("#verificationSummary");
  if (zone.authoritative) {
    verificationSummary.hidden = false;
    verificationSummary.className = `verification-summary decided ${statusClass(zone.status)}`;
    verificationSummary.textContent = tr("adminAuthority");
  } else if (zone.verification?.active) {
    verificationSummary.hidden = false;
    verificationSummary.className = "verification-summary active";
    verificationSummary.textContent = tr("verificationActive", {
      minutes: Math.max(1, Math.ceil(Number(zone.verification.remainingMs || 0) / 60000)),
      outage: Number(zone.verification.signals?.outage || 0),
      resolved: Number(zone.verification.signals?.resolved || 0),
      score: Number(zone.verification.triggerScore || 0),
    });
  } else if (zone.verification?.finalizedAt) {
    verificationSummary.hidden = false;
    verificationSummary.className = `verification-summary decided ${statusClass(zone.verification.decisionStatus)}`;
    verificationSummary.textContent = tr("verificationDecided", {
      status: statusLabel(zone.verification.decisionStatus),
      outage: Number(zone.verification.signals?.outage || 0),
      resolved: Number(zone.verification.signals?.resolved || 0),
    });
  } else {
    verificationSummary.hidden = true;
    verificationSummary.textContent = "";
  }
  renderHourlyChart($("#hourlyChart"), zone, hourly, peakHour, peakValue);
}

function renderHourlyChart(svg, zone, values, peakHour, peakValue) {
  const timezoneLabel = tr("chartTunisiaTime");
  svg.setAttribute("aria-label", tr("hourlyChartLabel", { city: zone.city }));
  const max = Math.max(...values, 1);
  const plot = { left: 34, top: 12, width: 462, height: 132 };
  const step = plot.width / 23;
  const bars = values.map((value, hour) => {
    const height = Math.max(3, (value / max) * plot.height);
    const x = plot.left + hour * step - 6;
    const y = plot.top + plot.height - height;
    const peak = peakHour !== null && hour === peakHour ? " peak" : "";
    return `<rect class="hour-bar${peak}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="12" height="${height.toFixed(1)}" rx="2"><title>${hour.toString().padStart(2, "0")}:00 · ${value} signalements</title></rect>`;
  }).join("");
  const labels = [0, 6, 12, 18, 23].map((hour) => {
    const x = plot.left + hour * step;
    return `<text x="${x.toFixed(1)}" y="176" text-anchor="middle">${hour.toString().padStart(2, "0")}h</text>`;
  }).join("");
  const peakX = peakHour === null ? 0 : plot.left + peakHour * step;
  const peakY = plot.top + plot.height - (peakValue / max) * plot.height - 7;
  const description = peakHour === null
    ? `Aucun signalement horaire pour ${zone.city} sur la période.`
    : `Le pic est à ${peakHour.toString().padStart(2, "0")}:00 avec ${peakValue} signalements.`;
  const peakLabel = peakHour === null
    ? ""
    : `<text class="peak-label" x="${Math.min(peakX + 12, 438).toFixed(1)}" y="${Math.max(18, peakY).toFixed(1)}">Pic ${peakValue}</text>`;
  svg.innerHTML = `
    <title>${tr("hourlyChartLabel", { city: zone.city })}</title>
    <desc>${description} ${timezoneLabel}</desc>
    <line class="axis" x1="${plot.left}" y1="${plot.top + plot.height}" x2="${plot.left + plot.width}" y2="${plot.top + plot.height}"></line>
    <g>${bars}</g>
    ${peakLabel}
    ${labels}
  `;
}

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return tr("noStats");
  if (minutes < 60) return tr("minutes", { value: minutes });
  return tr("hoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

function renderDailyStatistics(statistics) {
  $("#statsTotal").textContent = statistics.totalReports.toString();
  $("#statsDuration").textContent = formatDuration(statistics.averageDurationMinutes);
  $("#statsPeak").textContent = statistics.totalReports && Number.isInteger(statistics.peakHour)
    ? `${String(statistics.peakHour).padStart(2, "0")}:00`
    : "—";
  const svg = $("#dailyStatsChart");
  const values = statistics.daily.map((entry) => entry.reports);
  const max = Math.max(...values, 1);
  const width = 486;
  const step = width / values.length;
  const bars = values.map((value, index) => {
    const height = Math.max(value ? 4 : 1, (value / max) * 78);
    const x = 22 + index * step;
    const y = 92 - height;
    const barWidth = Math.max(3, step - 3);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" rx="2"><title>${statistics.daily[index].date} · ${value}</title></rect>`;
  }).join("");
  const first = statistics.daily[0]?.date.slice(5).replace("-", "/") || "";
  const last = statistics.daily.at(-1)?.date.slice(5).replace("-", "/") || "";
  svg.innerHTML = `<title>${tr("statistics")}</title>${bars}<text x="22" y="112">${first}</text><text x="508" y="112" text-anchor="end">${last}</text>`;
}

async function loadZoneStatistics() {
  const zoneId = state.selectedZoneId;
  if (!zoneId || !state.serverReady) return;
  const requestId = ++state.statsRequestId;
  try {
    const statistics = await api(`/api/stats?zoneId=${encodeURIComponent(zoneId)}&days=${state.statsDays}`);
    if (requestId !== state.statsRequestId || zoneId !== state.selectedZoneId) return;
    state.stats = statistics;
    renderDailyStatistics(statistics);
    renderCityDetail();
  } catch {
    if (requestId === state.statsRequestId) {
      $("#statsTotal").textContent = "—";
      $("#statsDuration").textContent = tr("noStats");
      $("#statsPeak").textContent = "—";
    }
  }
}

async function submitCommunityVote(choice) {
  if (!state.user) {
    toast(tr("loginToVote"));
    $("#account").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  try {
    const payload = await api(`/api/zones/${encodeURIComponent(state.selectedZoneId)}/vote`, {
      method: "POST",
      body: JSON.stringify({ choice }),
    });
    const zone = zoneIndex.get(payload.zone?.id);
    if (zone) Object.assign(zone, payload.zone);
    renderAll();
    toast(payload.authoritative ? tr("adminDecisionSaved") : tr("voteSaved"));
  } catch (error) {
    toast(error.message);
  }
}

async function shareSelectedZone() {
  const zone = zoneIndex.get(state.selectedZoneId);
  if (!zone) return;
  const url = new URL(location.href);
  url.searchParams.set("zone", zone.id);
  const shareData = { title: tr("shareTitle", { city: zone.city }), text: `${zone.city} · ${statusLabel(zone.status)}`, url: url.href };
  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(url.href);
      toast(tr("shareCopied"));
    }
  } catch (error) {
    if (error.name !== "AbortError") toast(error.message);
  }
}

function distanceBetween(lat1, lon1, lat2, lon2) {
  const radians = (value) => value * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function locateNearestZone() {
  if (!("geolocation" in navigator)) {
    toast(tr("geolocationDenied"));
    return;
  }
  const button = $("#gpsLocateButton");
  button.disabled = true;
  navigator.geolocation.getCurrentPosition((position) => {
    const nearest = (state.geographyReady
      ? geographicZoneAtPoint(position.coords.latitude, position.coords.longitude)
      : null) || nearestGeographicZone(position.coords.latitude, position.coords.longitude);
    button.disabled = false;
    if (!nearest) return;
    state.filters.governorate = nearest.governorate;
    $("#governorateFilter").value = nearest.governorate;
    selectZone(nearest.id, true);
    toast(tr("nearestZone", { city: nearest.city }));
  }, () => {
    button.disabled = false;
    toast(tr("geolocationDenied"));
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

function renderFeed() {
  const feed = $("#feed");
  feed.textContent = "";
  state.feed.slice(0, 18).forEach((item) => {
    const row = document.createElement("article");
    row.className = "feed-item";
    row.dataset.reportId = item.id || "";
    const content = document.createElement("div");
    content.className = "feed-item-content";
    const title = document.createElement("strong");
    const description = document.createElement("span");
    const time = formatTunisiaTime(item.time);
    title.textContent = `${item.city}, ${item.governorate}`;
    const localizedMessage = item.userName && item.status
      ? tr("reportByUser", { user: item.userName, status: statusLabel(item.status).toLowerCase(), trust: item.trust })
      : item.message;
    description.textContent = `${localizedMessage} · ${time}`;
    content.append(title, description);
    row.append(content);
    if (item.id) {
      const flag = document.createElement("button");
      flag.type = "button";
      flag.className = "flag-button";
      flag.dataset.action = "flag-report";
      flag.textContent = tr("flag");
      row.append(flag);
    }
    feed.append(row);
  });
  $("#feedCount").textContent = tr("events", { count: state.feed.length });
}

function renderUser() {
  const badge = $("#accountBadge");
  const card = $("#userCard");
  const authForms = $("#authForms");
  const deleteForm = $("#deleteAccountForm");
  if (!state.user) {
    badge.textContent = "Invité";
    card.hidden = true;
    authForms.hidden = false;
    deleteForm.hidden = true;
    $("#adminPanel").hidden = true;
    renderReportAccess();
    updateTrustPreview();
    return;
  }
  badge.textContent = tr("connected");
  authForms.hidden = true;
  card.hidden = false;
  card.textContent = "";
  const name = document.createElement("strong");
  const provider = document.createElement("span");
  const details = document.createElement("small");
  const actions = document.createElement("div");
  const logout = document.createElement("button");
  const exportData = document.createElement("button");
  const deleteAccount = document.createElement("button");
  name.textContent = state.user.name;
  provider.textContent = tr("localAccount");
  details.textContent = `Réputation ${state.user.reputation}/100 · confidentialité ${state.user.privacyNoticeVersion || "antérieure"} · CGU ${state.user.termsVersion || "antérieures"}`;
  actions.className = "account-actions";
  logout.type = "button";
  logout.className = "ghost-button";
  logout.dataset.action = "logout";
  logout.textContent = "Se déconnecter";
  exportData.type = "button";
  exportData.className = "ghost-button";
  exportData.dataset.action = "export";
  exportData.textContent = "Exporter mes données";
  deleteAccount.type = "button";
  deleteAccount.className = "ghost-button";
  deleteAccount.dataset.action = "delete";
  deleteAccount.textContent = "Supprimer mon compte";
  actions.append(exportData, deleteAccount, logout);
  card.append(name, provider, details, actions);
  $("#adminPanel").hidden = !state.user.isAdmin;
  renderReportAccess();
  updateTrustPreview();
}

function syncReportStatusOptions() {
  const statusSelect = $("#reportStatus");
  const reportForm = $("#reportForm");
  if (!statusSelect || !reportForm) return;
  const probableOption = statusSelect.querySelector("option[value='probable']");
  if (!probableOption) return;
  const admin = Boolean(state.user?.isAdmin);
  const hideProbable = admin || reportForm.dataset.qrPreset === "true";
  probableOption.textContent = "Coupure probable";
  probableOption.disabled = hideProbable;
  probableOption.hidden = hideProbable;
  if (admin && statusSelect.value === "probable") statusSelect.value = "confirmed";
}

function renderReportAccess() {
  const submit = $("#reportSubmit");
  const hint = $("#reportAuthHint");
  if (!submit || !hint) return;
  const cooldownExempt = Boolean(state.reportCooldownExempt || state.user?.isAdmin);
  syncReportStatusOptions();
  const remainingSeconds = cooldownExempt ? 0 : Math.max(0, Math.ceil((state.reportCooldownUntil - Date.now()) / 1000));
  submit.disabled = state.reportSubmitting || !state.serverReady || remainingSeconds > 0;
  hint.classList.toggle("authenticated", remainingSeconds === 0 && state.serverReady);
  if (state.reportSubmitting) {
    hint.textContent = "Vérification ALTCHA et envoi en cours…";
  } else if (cooldownExempt) {
    hint.textContent = "Compte administrateur · confiance 100 % · décision prioritaire · aucun délai entre les signalements.";
  } else if (remainingSeconds > 0) {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    hint.textContent = `Nouveau signalement possible dans ${minutes}:${seconds.toString().padStart(2, "0")}.`;
  } else if (!state.serverReady) {
    hint.textContent = "Le serveur doit être connecté pour envoyer un signalement.";
  } else if (state.user) {
    hint.textContent = "Compte connecté · un signalement toutes les 10 minutes.";
  } else {
    hint.textContent = "Sans compte · un signalement anonyme toutes les 20 minutes.";
  }
}

function renderWhatsAppOption() {
  const option = $("#whatsappReportOption");
  const link = $("#whatsappReportLink");
  option.hidden = !state.whatsappUrl;
  if (state.whatsappUrl) link.href = state.whatsappUrl;
}

function renderAll() {
  renderMetrics();
  renderMap();
  renderZones();
  renderFeed();
  renderUser();
  renderWhatsAppOption();
  $("#lastUpdate").textContent = tr("tunisiaTime", { time: formatTunisiaTime(new Date(), true) });
}

function addFeed(zone, message) {
  state.feed.unshift({
    city: zone.city,
    governorate: zone.governorate,
    message,
    time: new Date().toISOString(),
  });
  renderFeed();
}

function updateZone(id, patch, message) {
  const zone = zoneIndex.get(id);
  if (!zone) return;
  const previousReports = zone.reports;
  Object.assign(zone, patch);
  if (Object.prototype.hasOwnProperty.call(patch, "reports")) {
    const bump = Math.max(1, patch.reports - previousReports);
    pushHistory(zone);
    pushHourly(zone, bump);
  }
  addFeed(zone, message);
  renderAll();
}

function calculateTrust() {
  if (state.user?.isAdmin) return 100;
  const noteLength = $("#reportNote").value.trim().length;
  const noteBonus = Math.min(12, Math.floor(noteLength / 8));
  return Math.min(76, 64 + noteBonus);
}

function updateTrustPreview() {
  $("#trustPreview").textContent = `${calculateTrust()}%`;
}

function configureReportCaptchaLanguage() {
  const language = window.tpwI18n?.language === "ar" ? "ar" : "fr-fr";
  const captchas = [$("#reportCaptcha"), $("#registerCaptcha")].filter(Boolean);
  captchas.forEach((captcha) => captcha.setAttribute("language", language));
  void customElements.whenDefined("altcha-widget").then(() => {
    captchas.forEach((captcha) => {
      if (typeof captcha.configure === "function") captcha.configure({ language });
    });
  });
}

async function handleReport(event) {
  event.preventDefault();
  const selectedZone = zoneIndex.get($("#cityInput").value);
  const cooldownExempt = Boolean(state.reportCooldownExempt || state.user?.isAdmin);
  const remainingSeconds = cooldownExempt ? 0 : Math.max(0, Math.ceil((state.reportCooldownUntil - Date.now()) / 1000));
  if (remainingSeconds > 0) {
    toast(`Réessayez dans ${Math.ceil(remainingSeconds / 60)} minute(s).`);
    return;
  }
  if (!selectedZone) {
    toast("Sélectionnez une zone valide.");
    return;
  }
  const captcha = $("#reportCaptcha");
  try {
    state.reportSubmitting = true;
    renderReportAccess();
    await customElements.whenDefined("altcha-widget");
    const verification = await captcha.verify({ minDuration: 500 });
    if (!verification?.payload) throw new Error("La vérification anti-robot ALTCHA n’a pas abouti.");
    const payload = await api("/api/reports", {
      method: "POST",
      body: JSON.stringify({
        zoneId: selectedZone.id,
        status: state.user?.isAdmin && $("#reportStatus").value !== "resolved"
          ? "confirmed"
          : $("#reportStatus").value,
        note: $("#reportNote").value.trim(),
        termsAccepted: $("#reportTermsAcknowledged").checked,
        captcha: verification.payload,
      }),
    });
    state.reportCooldownExempt = Boolean(payload.cooldownExempt || state.user?.isAdmin);
    state.reportCooldownMs = Number(payload.cooldownMs ?? state.reportCooldownMs);
    state.reportCooldownUntil = state.reportCooldownExempt ? 0 : Number(payload.cooldownUntil ?? Date.now() + state.reportCooldownMs);
    applyReportEvent(payload);
    event.target.reset();
    captcha.reset();
    hideReportZoneSearchResults();
    $("#reportZoneSearchStatus").textContent = tr("zoneSearchHelp");
    fillReportZones();
    applyQrReportPreset(false);
    updateTrustPreview();
    toast(state.user?.isAdmin ? tr("adminDecisionSaved") : "Votre signalement a été enregistré. Merci !");
  } catch (error) {
    captcha?.reset();
    if (error.payload?.retryAfterSeconds) state.reportCooldownUntil = Date.now() + Number(error.payload.retryAfterSeconds) * 1000;
    toast(error.message);
  } finally {
    state.reportSubmitting = false;
    renderReportAccess();
  }
}

function connectSocket() {
  const stateEl = $("#socketState");
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  if (location.protocol === "file:") {
    startDemoRealtime();
    return;
  }
  try {
    state.socket = new WebSocket(`${protocol}://${location.host}/ws`);
    state.socket.addEventListener("open", () => {
      stateEl.classList.add("online");
      stateEl.lastChild.textContent = " Synchronisé";
      state.serverReady = true;
    });
    state.socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "report") {
        applyReportEvent(payload);
      } else if (payload.type === "refresh") {
        loadSharedState();
      }
    });
    state.socket.addEventListener("close", startDemoRealtime);
    state.socket.addEventListener("error", startDemoRealtime);
  } catch {
    startDemoRealtime();
  }
}

function startDemoRealtime() {
  const stateEl = $("#socketState");
  stateEl.classList.remove("online");
  stateEl.lastChild.textContent = " Hors ligne";
  state.serverReady = false;
}

function stopDemoRealtime() {
  clearInterval(state.demoTimer);
  state.demoTimer = null;
}

function simulateLiveReport(showToast = true) {
  const activeZones = zones.filter((zone) => zone.status !== "resolved");
  const zone = activeZones[Math.floor(Math.random() * activeZones.length)];
  const bump = 1 + Math.floor(Math.random() * 5);
  const nextStatus = zone.reports + bump > 70 ? "confirmed" : zone.status;
  updateZone(zone.id, {
    reports: zone.reports + bump,
    status: nextStatus,
    trust: Math.min(98, zone.trust + Math.floor(Math.random() * 3)),
  }, `+${bump} signalements live`);
  if (showToast) toast(`${zone.city}: +${bump} signalements`);
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.append(node);
  window.setTimeout(() => node.remove(), 3200);
}

function setLowDataMode(enabled, announce = true) {
  state.lowData = Boolean(enabled);
  localStorage.setItem("tpw-low-data", String(state.lowData));
  $("#lowDataToggle").checked = state.lowData;
  if (state.map && state.tileLayer) {
    if (state.lowData && state.map.hasLayer(state.tileLayer)) state.map.removeLayer(state.tileLayer);
    if (!state.lowData && !state.map.hasLayer(state.tileLayer)) state.tileLayer.addTo(state.map);
    $("#osmMap").classList.toggle("low-data-map", state.lowData);
  }
  if (announce) toast(tr(state.lowData ? "lowDataEnabled" : "lowDataDisabled"));
}

async function requestAppInstallation() {
  const installed = await window.tpwPwa?.install();
  if (!installed) $("#installStatus").textContent = tr("installManual");
}

function base64UrlToBytes(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function updateNotificationControls() {
  const enable = $("#enableNotificationsButton");
  const disable = $("#disableNotificationsButton");
  const status = $("#notificationStatus");
  const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  enable.disabled = !state.user || !state.pushConfigured || !supported;
  if (!state.user) status.textContent = tr("pushLogin");
  else if (!state.pushConfigured || !supported) status.textContent = tr("pushUnavailable");
  else status.textContent = "";
  try {
    const registration = await window.tpwPwa?.registration;
    const subscription = await registration?.pushManager.getSubscription();
    disable.hidden = !subscription;
    enable.hidden = Boolean(subscription);
    if (subscription) {
      const zone = zoneIndex.get(localStorage.getItem("tpw-notification-zone"));
      status.textContent = zone ? tr("pushEnabled", { city: zone.city }) : tr("notifications");
    }
  } catch {
    disable.hidden = true;
    enable.hidden = false;
  }
}

async function enableNotifications() {
  if (!state.user) return toast(tr("pushLogin"));
  if (!state.pushConfigured || !state.pushPublicKey) return toast(tr("pushUnavailable"));
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return toast(tr("pushDenied"));
    const registration = await window.tpwPwa?.registration;
    if (!registration) throw new Error(tr("pushUnavailable"));
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(state.pushPublicKey),
      });
    }
    const zoneId = $("#notificationZone").value;
    await api("/api/push/subscriptions", {
      method: "POST",
      body: JSON.stringify({ subscription: subscription.toJSON(), zoneId }),
    });
    localStorage.setItem("tpw-notification-zone", zoneId);
    await updateNotificationControls();
    const zone = zoneIndex.get(zoneId);
    toast(tr("pushEnabled", { city: zone?.city || zoneId }));
  } catch (error) {
    toast(error.message);
  }
}

async function disableNotifications() {
  try {
    const registration = await window.tpwPwa?.registration;
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await api("/api/push/subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) });
      await subscription.unsubscribe();
    }
    localStorage.removeItem("tpw-notification-zone");
    await updateNotificationControls();
    toast(tr("pushDisabled"));
  } catch (error) {
    toast(error.message);
  }
}

async function flagReport(reportId) {
  if (!state.user) return toast(tr("loginToFlag"));
  const reason = window.prompt(tr("flagReason"));
  if (!reason?.trim()) return;
  try {
    await api("/api/content-flags", { method: "POST", body: JSON.stringify({ reportId, reason: reason.trim() }) });
    toast(tr("flagSaved"));
  } catch (error) {
    toast(error.message);
  }
}

function renderAdminModeration(payload) {
  const list = $("#adminList");
  list.textContent = "";
  if (!payload.reports?.length) {
    list.textContent = tr("adminEmpty");
    return;
  }
  const flagsByReport = new Map();
  (payload.flags || []).forEach((flag) => {
    const items = flagsByReport.get(Number(flag.report_id)) || [];
    items.push(flag);
    flagsByReport.set(Number(flag.report_id), items);
  });
  payload.reports.forEach((report) => {
    const item = document.createElement("article");
    const reportFlags = flagsByReport.get(Number(report.id)) || [];
    item.className = `admin-item${reportFlags.length ? " flagged" : ""}`;
    const content = document.createElement("div");
    const title = document.createElement("strong");
    const metadata = document.createElement("span");
    const note = document.createElement("small");
    const reasons = document.createElement("small");
    title.textContent = `${report.city} · ${statusLabel(report.status)}`;
    metadata.textContent = `#${report.id} · ${report.user_name} · ${report.trust}% · ${formatTunisiaDateTime(report.created_at)}`;
    note.textContent = report.note || "Aucune note";
    reasons.textContent = reportFlags.length ? `Alertes : ${reportFlags.map((flag) => flag.reason).join(" · ")}` : "";
    content.append(title, metadata, note, reasons);
    const actions = document.createElement("div");
    actions.className = "admin-actions";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-button";
    remove.dataset.adminAction = "delete-report";
    remove.dataset.reportId = report.id;
    remove.textContent = tr("adminDelete");
    actions.append(remove);
    if (report.auth_provider !== "anonymous") {
      const block = document.createElement("button");
      block.type = "button";
      block.className = "ghost-button";
      block.dataset.adminAction = "toggle-block";
      block.dataset.userId = report.user_id;
      block.dataset.blocked = report.is_blocked ? "true" : "false";
      block.textContent = tr(report.is_blocked ? "adminUnblock" : "adminBlock");
      actions.append(block);
    }
    if (reportFlags.length) {
      const resolve = document.createElement("button");
      resolve.type = "button";
      resolve.className = "ghost-button";
      resolve.dataset.adminAction = "resolve-flags";
      resolve.dataset.flagIds = reportFlags.map((flag) => flag.id).join(",");
      resolve.textContent = tr("adminResolveFlags");
      actions.append(resolve);
    }
    item.append(content, actions);
    list.append(item);
  });
}

async function loadAdminModeration() {
  if (!state.user?.isAdmin) return;
  try {
    renderAdminModeration(await api("/api/admin/moderation"));
  } catch (error) {
    toast(error.message);
  }
}

async function handleAdminAction(button) {
  const action = button.dataset.adminAction;
  try {
    if (action === "delete-report") {
      if (!window.confirm(tr("adminConfirmDelete"))) return;
      await api(`/api/admin/reports/${button.dataset.reportId}`, { method: "DELETE" });
      toast(tr("adminDeleted"));
    } else if (action === "toggle-block") {
      await api(`/api/admin/users/${button.dataset.userId}/block`, {
        method: "POST",
        body: JSON.stringify({ blocked: button.dataset.blocked !== "true" }),
      });
      toast(tr("adminUpdated"));
    } else if (action === "resolve-flags") {
      await Promise.all(button.dataset.flagIds.split(",").filter(Boolean).map((id) => api(`/api/admin/flags/${id}/resolve`, { method: "POST" })));
      toast(tr("adminUpdated"));
    }
    await loadAdminModeration();
    await loadSharedState();
  } catch (error) {
    toast(error.message);
  }
}

function populateControls() {
  const districts = [...new Set(zones.map((zone) => zone.governorate))].sort((a, b) => a.localeCompare(b, "fr"));
  fillSelect($("#governorateFilter"), districts.map((name) => ({ value: name, label: name })), "Tous");
  fillSelect($("#reportGovernorate"), districts.map((name) => ({ value: name, label: name })));
  fillReportZones();
  fillLocalizationControls();
  fillSelect($("#notificationZone"), zones.slice().sort((a, b) => a.city.localeCompare(b.city, "fr")).map((zone) => ({
    value: zone.id,
    label: `${zone.city}${zone.delegation ? ` · ${zone.delegation}` : ""} · ${zone.governorate}`,
  })));
  const storedNotificationZone = localStorage.getItem("tpw-notification-zone");
  $("#notificationZone").value = zoneIndex.has(storedNotificationZone)
    ? storedNotificationZone
    : state.legacyZoneAliases.get(storedNotificationZone) || state.selectedZoneId;
  $("#lowDataToggle").checked = state.lowData;
}

function fillSelect(select, options, firstLabel = null) {
  select.textContent = "";
  if (firstLabel) {
    const first = document.createElement("option");
    first.value = firstLabel === "Tous" ? "all" : "";
    first.textContent = firstLabel;
    select.append(first);
  }
  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  });
}

function normalizedZoneSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[’'`.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function reportZoneLabel(zone) {
  return [zone.city, zone.delegation, zone.governorate].filter(Boolean).join(" · ");
}

function hideReportZoneSearchResults() {
  const input = $("#reportZoneSearch");
  const results = $("#reportZoneSearchResults");
  results.hidden = true;
  input.setAttribute("aria-expanded", "false");
}

function renderReportZoneSearchResults() {
  const input = $("#reportZoneSearch");
  const results = $("#reportZoneSearchResults");
  const status = $("#reportZoneSearchStatus");
  const query = normalizedZoneSearchText(input.value);
  results.textContent = "";

  if (query.length < 2) {
    hideReportZoneSearchResults();
    status.textContent = tr("zoneSearchHelp");
    return;
  }

  const tokens = query.split(" ").filter(Boolean);
  const matches = zones
    .map((zone) => {
      const city = normalizedZoneSearchText(zone.city);
      const delegation = normalizedZoneSearchText(zone.delegation);
      const governorate = normalizedZoneSearchText(zone.governorate);
      const searchable = `${city} ${delegation} ${governorate}`;
      if (!tokens.every((token) => searchable.includes(token))) return null;
      const score = city === query ? 0
        : city.startsWith(query) ? 1
          : city.includes(query) ? 2
            : delegation.startsWith(query) ? 3
              : governorate.startsWith(query) ? 4 : 5;
      return { zone, score };
    })
    .filter(Boolean)
    .sort((left, right) => left.score - right.score || left.zone.city.localeCompare(right.zone.city, "fr"));

  status.textContent = matches.length ? tr("zoneSearchCount", { count: matches.length }) : tr("zoneSearchNoResult");
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "zone-search-empty";
    empty.textContent = tr("zoneSearchNoResult");
    results.append(empty);
  } else {
    matches.slice(0, 12).forEach(({ zone }) => {
      const button = document.createElement("button");
      const name = document.createElement("strong");
      const details = document.createElement("small");
      button.type = "button";
      button.className = "zone-search-result";
      button.setAttribute("role", "option");
      button.dataset.zoneId = zone.id;
      name.textContent = zone.city;
      details.textContent = [zone.delegation, zone.governorate].filter(Boolean).join(" · ");
      button.append(name, details);
      results.append(button);
    });
  }
  results.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function selectReportZone(zone, { updateSearch = true } = {}) {
  if (!zone) return;
  $("#reportGovernorate").value = zone.governorate;
  fillReportZones(zone.id);
  $("#cityInput").value = zone.id;
  if (updateSearch) $("#reportZoneSearch").value = reportZoneLabel(zone);
  hideReportZoneSearchResults();
  $("#reportZoneSearchStatus").textContent = tr("zoneSearchSelected", {
    city: zone.city,
    delegation: zone.delegation || "—",
    governorate: zone.governorate,
  });
  updateTrustPreview();
}

function fillReportZones(preferredZoneId = "") {
  const district = $("#reportGovernorate").value;
  const currentZoneId = preferredZoneId || $("#cityInput").value;
  const reportZones = zones
    .filter((zone) => !district || zone.governorate === district)
    .sort((a, b) => a.city.localeCompare(b.city, "fr"));
  fillSelect($("#cityInput"), reportZones.map((zone) => ({
    value: zone.id,
    label: `${zone.city}${zone.delegation ? ` · ${zone.delegation}` : ""}`,
  })));
  if (reportZones.some((zone) => zone.id === currentZoneId)) $("#cityInput").value = currentZoneId;
}

function renderQrReportNotice() {
  const notice = $("#qrReportNotice");
  const zone = zoneIndex.get(notice.dataset.zoneId);
  const status = notice.dataset.status;
  if (!zone || !["confirmed", "resolved"].includes(status)) {
    notice.hidden = true;
    return;
  }
  notice.textContent = tr("qrPresetNotice", { city: zone.city, status: statusLabel(status) });
  notice.hidden = false;
}

function applyQrReportPreset(scrollToForm = false) {
  const url = new URL(location.href);
  const status = url.searchParams.get("reportStatus");
  const requestedZoneId = url.searchParams.get("zone");
  const zone = zoneIndex.get(requestedZoneId) || zoneIndex.get(state.legacyZoneAliases.get(requestedZoneId));
  if (url.searchParams.get("source") !== "qr" || !zone || !["confirmed", "resolved"].includes(status)) return false;

  state.selectedZoneId = zone.id;
  localStorage.setItem("tpw-zone", zone.id);
  selectReportZone(zone);
  $("#reportStatus").value = status;
  $("#reportForm").dataset.qrPreset = "true";
  syncReportStatusOptions();
  $("#qrReportNotice").dataset.zoneId = zone.id;
  $("#qrReportNotice").dataset.status = status;
  renderQrReportNotice();
  updateTrustPreview();
  if (scrollToForm) requestAnimationFrame(() => $("#reportForm").scrollIntoView({ behavior: "smooth", block: "start" }));
  return true;
}

function territoryDirections() {
  if (state.geographyReady) {
    return [...new Set(zones.map((zone) => zone.governorate))]
      .sort((left, right) => left.localeCompare(right, "fr"))
      .map((governorate) => ({
        direction: governorate,
        districts: [...new Set(zones.filter((zone) => zone.governorate === governorate).map((zone) => zone.delegation))]
          .sort((left, right) => left.localeCompare(right, "fr"))
          .map((delegation) => ({
            district: delegation,
            zones: zones.filter((zone) => zone.governorate === governorate && zone.delegation === delegation).map((zone) => zone.city),
          })),
      }));
  }
  if (window.stegTerritory?.length) {
    return window.stegTerritory;
  }
  return [{ direction: "Tunisie", districts: [...new Set(zones.map((zone) => zone.governorate))].map((district) => ({ district, zones: zones.filter((zone) => zone.governorate === district).map((zone) => zone.city) })) }];
}

function fillLocalizationControls() {
  const directions = territoryDirections();
  fillSelect($("#locateDirection"), directions.map((entry) => ({ value: entry.direction, label: entry.direction })));
  fillLocateDistricts();
}

function fillLocateDistricts() {
  const direction = territoryDirections().find((entry) => entry.direction === $("#locateDirection").value) || territoryDirections()[0];
  fillSelect($("#locateDistrict"), direction.districts.map((entry) => ({ value: entry.district, label: entry.district })));
  fillLocateZones();
}

function fillLocateZones() {
  const governorate = $("#locateDirection").value;
  const district = $("#locateDistrict").value;
  const districtZones = zones
    .filter((zone) => state.geographyReady
      ? zone.governorate === governorate && zone.delegation === district
      : zone.governorate === district)
    .sort((a, b) => a.city.localeCompare(b.city, "fr"));
  fillSelect($("#locateZone"), districtZones.map((zone) => ({ value: zone.id, label: zone.city })));
}

function setAuthView(view) {
  const registration = view === "register";
  $("#loginForm").hidden = registration;
  $("#registerForm").hidden = !registration;
  $("#authTabLogin").classList.toggle("active", !registration);
  $("#authTabRegister").classList.toggle("active", registration);
  $("#authTabLogin").setAttribute("aria-selected", String(!registration));
  $("#authTabRegister").setAttribute("aria-selected", String(registration));
  const target = registration ? $("#registerName") : $("#loginEmail");
  target.focus({ preventScroll: true });
}

async function handleLocalLogin(event) {
  event.preventDefault();
  const button = $("#loginButton");
  button.disabled = true;
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("#loginEmail").value.trim(),
        password: $("#loginPassword").value,
        termsAcknowledged: $("#loginTermsAcknowledged").checked,
      }),
    });
    event.target.reset();
    await loadSharedState();
    toast(tr("loginSuccess"));
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function handleLocalRegister(event) {
  event.preventDefault();
  const password = $("#registerPassword").value;
  const passwordConfirmation = $("#registerPasswordConfirmation").value;
  if (password !== passwordConfirmation) {
    toast(tr("passwordMismatch"));
    return;
  }
  const button = $("#registerButton");
  const captcha = $("#registerCaptcha");
  button.disabled = true;
  try {
    await customElements.whenDefined("altcha-widget");
    const verification = await captcha.verify({ minDuration: 500 });
    if (!verification?.payload) throw new Error("La vérification anti-robot ALTCHA n’a pas abouti.");
    await api("/api/register", {
      method: "POST",
      body: JSON.stringify({
        name: $("#registerName").value.trim(),
        email: $("#registerEmail").value.trim(),
        password,
        passwordConfirmation,
        captcha: verification.payload,
        privacyAcknowledged: $("#registerPrivacyAcknowledged").checked,
        termsAcknowledged: $("#registerTermsAcknowledged").checked,
      }),
    });
    event.target.reset();
    captcha.reset();
    await loadSharedState();
    toast(tr("registerSuccess"));
  } catch (error) {
    captcha?.reset();
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

function bindEvents() {
  $("#languageSelect").addEventListener("change", (event) => window.tpwI18n?.setLanguage(event.target.value));
  window.addEventListener("tpw:languagechange", () => {
    renderAll();
    renderQrReportNotice();
    configureReportCaptchaLanguage();
    hideReportZoneSearchResults();
    $("#reportZoneSearchStatus").textContent = tr("zoneSearchHelp");
    if (state.stats) renderDailyStatistics(state.stats);
    if (state.user?.isAdmin) void loadAdminModeration();
    void updateNotificationControls();
  });
  $("#governorateFilter").addEventListener("change", (event) => {
    state.filters.governorate = event.target.value;
    renderAll();
  });
  $("#statusFilter").addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    renderAll();
  });
  $("#minimumReports").addEventListener("input", (event) => {
    state.filters.minimum = Number(event.target.value);
    $("#minimumReportsValue").textContent = event.target.value;
    renderAll();
  });
  $("#resetFilters").addEventListener("click", () => {
    state.filters = { governorate: "all", status: "all", minimum: 0 };
    $("#governorateFilter").value = "all";
    $("#statusFilter").value = "all";
    $("#minimumReports").value = 0;
    $("#minimumReportsValue").textContent = "0";
    renderAll();
  });
  $("#reportForm").addEventListener("submit", handleReport);
  $("#zoneQuickReportDialog").addEventListener("click", (event) => {
    const statusButton = event.target.closest("[data-quick-report-status]");
    if (statusButton) {
      const zone = zoneIndex.get(event.currentTarget.dataset.zoneId);
      prefillReportFromMap(zone, statusButton.dataset.quickReportStatus);
    } else if (event.target === event.currentTarget) {
      closeZoneQuickReport();
    }
  });
  $("#reportGovernorate").addEventListener("change", () => {
    $("#reportZoneSearch").value = "";
    hideReportZoneSearchResults();
    $("#reportZoneSearchStatus").textContent = tr("zoneSearchHelp");
    fillReportZones();
    updateTrustPreview();
  });
  $("#reportZoneSearch").addEventListener("input", renderReportZoneSearchResults);
  $("#reportZoneSearch").addEventListener("focus", () => {
    if (normalizedZoneSearchText($("#reportZoneSearch").value).length >= 2) renderReportZoneSearchResults();
  });
  $("#reportZoneSearch").addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideReportZoneSearchResults();
      return;
    }
    if (event.key !== "ArrowDown") return;
    const buttons = [...$("#reportZoneSearchResults").querySelectorAll(".zone-search-result")];
    if (!buttons.length) return;
    event.preventDefault();
    buttons[0].focus();
  });
  $("#reportZoneSearchResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-zone-id]");
    if (button) selectReportZone(zoneIndex.get(button.dataset.zoneId));
  });
  $("#reportZoneSearchResults").addEventListener("keydown", (event) => {
    const buttons = [...event.currentTarget.querySelectorAll(".zone-search-result")];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hideReportZoneSearchResults();
      $("#reportZoneSearch").focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      buttons[(index + direction + buttons.length) % buttons.length].focus();
    }
  });
  $("#cityInput").addEventListener("change", () => {
    const zone = zoneIndex.get($("#cityInput").value);
    if (zone) selectReportZone(zone);
  });
  document.addEventListener("click", (event) => {
    if (!$("#reportZoneSearchBox").contains(event.target)) hideReportZoneSearchResults();
  });
  $("#locateDirection").addEventListener("change", fillLocateDistricts);
  $("#locateDistrict").addEventListener("change", fillLocateZones);
  $("#locateButton").addEventListener("click", () => {
    const zone = zoneIndex.get($("#locateZone").value);
    if (!zone) return;
    state.filters.governorate = zone.governorate;
    $("#governorateFilter").value = zone.governorate;
    localStorage.setItem("tpw-zone", zone.id);
    selectZone(zone.id, true);
    toast(`Zone localisée: ${zone.city} · ${zone.governorate}`);
  });
  $("#gpsLocateButton").addEventListener("click", locateNearestZone);
  $("#confirmOutageButton").addEventListener("click", () => submitCommunityVote("outage"));
  $("#confirmResolvedButton").addEventListener("click", () => submitCommunityVote("resolved"));
  $("#shareZoneButton").addEventListener("click", shareSelectedZone);
  document.querySelectorAll("[data-stats-days]").forEach((button) => {
    button.addEventListener("click", () => {
      state.statsDays = Number(button.dataset.statsDays);
      document.querySelectorAll("[data-stats-days]").forEach((item) => item.classList.toggle("active", item === button));
      void loadZoneStatistics();
    });
  });
  $("#lowDataToggle").addEventListener("change", (event) => setLowDataMode(event.target.checked));
  $("#installAppButton").addEventListener("click", requestAppInstallation);
  $("#installAppSettingsButton").addEventListener("click", requestAppInstallation);
  $("#enableNotificationsButton").addEventListener("click", enableNotifications);
  $("#disableNotificationsButton").addEventListener("click", disableNotifications);
  $("#notificationZone").addEventListener("change", async () => {
    const registration = await window.tpwPwa?.registration;
    if (await registration?.pushManager.getSubscription()) void enableNotifications();
  });
  $("#feed").addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="flag-report"]');
    const reportId = Number(button?.closest("[data-report-id]")?.dataset.reportId);
    if (button && reportId) void flagReport(reportId);
  });
  $("#refreshAdminButton").addEventListener("click", loadAdminModeration);
  $("#adminList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-action]");
    if (button) void handleAdminAction(button);
  });
  ["input", "change"].forEach((name) => {
    $("#reportNote").addEventListener(name, updateTrustPreview);
    $("#cityInput").addEventListener(name, updateTrustPreview);
  });
  $("#authTabLogin").addEventListener("click", () => setAuthView("login"));
  $("#authTabRegister").addEventListener("click", () => setAuthView("register"));
  $("#loginForm").addEventListener("submit", handleLocalLogin);
  $("#registerForm").addEventListener("submit", handleLocalRegister);
  $("#userCard").addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    try {
      if (action === "export") {
        const payload = await api("/api/account/export");
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `tunisie-power-watch-mes-donnees-${tunisiaDateKey()}.json`;
        link.click();
        URL.revokeObjectURL(url);
        toast("Votre copie de données a été téléchargée.");
      } else if (action === "delete") {
        $("#deleteAccountForm").hidden = false;
        $("#deleteAccountConfirmation").focus();
      } else if (action === "logout") {
        await api("/api/logout", { method: "POST" });
        state.user = null;
        setAuthView("login");
        renderUser();
        updateTrustPreview();
        void updateNotificationControls();
        toast("Vous êtes déconnecté.");
      }
    } catch (error) {
      toast(error.message);
    }
  });
  $("#cancelDeleteAccount").addEventListener("click", () => {
    $("#deleteAccountForm").reset();
    $("#deleteAccountForm").hidden = true;
  });
  $("#deleteAccountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/account", {
        method: "DELETE",
        body: JSON.stringify({
          confirmation: $("#deleteAccountConfirmation").value,
          password: $("#deleteAccountPassword").value,
        }),
      });
      state.user = null;
      setAuthView("login");
      event.target.reset();
      event.target.hidden = true;
      await loadSharedState();
      void updateNotificationControls();
      toast("Votre compte et vos signalements ont été supprimés.");
    } catch (error) {
      toast(error.message);
    }
  });
  document.querySelectorAll("[data-scroll]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-scroll]").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.scroll).scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function initialize() {
  await loadGeographicZones();
  resetZoneStats();
  populateControls();
  applyQrReportPreset(true);
  bindEvents();
  renderAll();
  updateTrustPreview();
  configureReportCaptchaLanguage();
  setInterval(renderReportAccess, 1000);
  await loadSharedState();
  setLowDataMode(state.lowData, false);
  connectSocket();
}

initialize();
