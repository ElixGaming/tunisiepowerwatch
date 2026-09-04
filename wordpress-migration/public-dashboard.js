const publicTranslate = (key, values = {}) => window.tpwI18n?.t(key, values) || key;
const publicState = {
  payload: null,
  geography: null,
  zoneIndex: new Map(),
  map: null,
  zoneLayer: null,
  audience: "public",
  socket: null,
};

function publicLocale() {
  return window.tpwI18n?.language === "ar" ? "ar-TN" : "fr-TN";
}

function formatPublicDate(value, includeDate = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(publicLocale(), {
    timeZone: "Africa/Tunis",
    ...(includeDate ? { dateStyle: "short" } : {}),
    timeStyle: "short",
    hourCycle: "h23",
  });
}

function publicZoneLabel(zone) {
  return [zone.city, zone.delegation, zone.governorate].filter(Boolean).join(" · ");
}

function publicStatusLabel(status) {
  return publicTranslate(status || "resolved");
}

function setPublicConnection(connected) {
  const node = document.querySelector("#publicConnectionState");
  node.classList.toggle("online", connected);
  node.textContent = window.tpwI18n?.language === "ar"
    ? connected ? "متصل" : "غير متصل"
    : connected ? "Synchronisé" : "Hors ligne";
}

function publicZoneStyle(feature) {
  const zone = publicState.zoneIndex.get(feature.properties?.id);
  if (!zone || !zone.reports) {
    return { color: "#718096", weight: 0.55, opacity: 0.5, fillColor: "#cbd5e1", fillOpacity: 0.05 };
  }
  if (zone.status === "confirmed") {
    return { color: "#991b1f", weight: 1, opacity: 0.95, fillColor: "#d71920", fillOpacity: 0.58 };
  }
  if (zone.status === "probable") {
    return { color: "#a96300", weight: 1, opacity: 0.95, fillColor: "#f4a62a", fillOpacity: 0.55 };
  }
  return { color: "#24755f", weight: 0.75, opacity: 0.75, fillColor: "#58aa91", fillOpacity: 0.18 };
}

function publicMapPopup(feature) {
  const properties = feature.properties || {};
  const zone = publicState.zoneIndex.get(properties.id) || {
    id: properties.id,
    city: properties.name,
    delegation: properties.delegation,
    governorate: properties.governorate,
    reports: 0,
    status: "resolved",
    lastReportAt: null,
  };
  const container = document.createElement("div");
  container.className = "public-map-popup";
  const title = document.createElement("strong");
  title.textContent = publicZoneLabel(zone);
  const status = document.createElement("span");
  status.className = `public-status public-status-${zone.status}`;
  status.textContent = zone.reports ? publicStatusLabel(zone.status) : publicTranslate("publicNoData");
  const reports = document.createElement("span");
  reports.textContent = `${publicTranslate("reports")}: ${zone.reports || 0}`;
  const updated = document.createElement("span");
  updated.textContent = `${publicTranslate("lastReport")}: ${formatPublicDate(zone.lastReportAt)}`;
  const link = document.createElement("a");
  link.href = `index.html?zone=${encodeURIComponent(zone.id)}#map`;
  link.textContent = publicTranslate("openInteractiveMap");
  container.append(title, status, reports, updated, link);
  return container;
}

function initializePublicMap() {
  if (publicState.map || !window.L || !publicState.geography) return;
  publicState.map = L.map("publicMap", { preferCanvas: true, zoomControl: true, scrollWheelZoom: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap",
  }).addTo(publicState.map);
  publicState.zoneLayer = L.geoJSON(publicState.geography, {
    style: publicZoneStyle,
    onEachFeature(feature, layer) {
      layer.on("click", () => layer.bindPopup(publicMapPopup(feature)).openPopup());
    },
  }).addTo(publicState.map);
  publicState.map.fitBounds([[30.2, 7.1], [37.6, 11.8]], { padding: [18, 18] });
}

function metricValue(selector, value) {
  document.querySelector(selector).textContent = Number(value || 0).toLocaleString(publicLocale());
}

function createPublicZoneItem(zone) {
  const item = document.createElement("a");
  item.className = `public-confirmation-item public-status-border-${zone.status}`;
  item.href = `index.html?zone=${encodeURIComponent(zone.id)}#map`;
  const content = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = publicZoneLabel(zone);
  const detail = document.createElement("small");
  detail.textContent = zone.verification?.active
    ? publicTranslate("verificationActive", {
      minutes: Math.max(1, Math.ceil(Number(zone.verification.remainingMs || 0) / 60000)),
      outage: Number(zone.verification.signals?.outage || 0),
      resolved: Number(zone.verification.signals?.resolved || 0),
      score: Number(zone.verification.triggerScore || 0),
    })
    : `${publicTranslate("lastReport")}: ${formatPublicDate(zone.lastReportAt)}`;
  content.append(title, detail);
  const badge = document.createElement("em");
  badge.textContent = publicStatusLabel(zone.status);
  item.append(content, badge);
  return item;
}

function appendEmptyState(container, key) {
  const empty = document.createElement("p");
  empty.className = "public-empty-state";
  empty.textContent = publicTranslate(key);
  container.append(empty);
}

function renderPublicLists() {
  const zones = publicState.payload?.zones || [];
  const queue = document.querySelector("#publicConfirmationQueue");
  queue.textContent = "";
  const toConfirm = zones.filter((zone) => zone.status === "probable").slice(0, 10);
  if (!toConfirm.length) appendEmptyState(queue, "publicNoActive");
  else toConfirm.forEach((zone) => queue.append(createPublicZoneItem(zone)));

  const table = document.querySelector("#publicZoneTable");
  table.textContent = "";
  const active = zones.filter((zone) => zone.status !== "resolved").slice(0, 20);
  if (!active.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = publicTranslate("publicNoData");
    row.append(cell);
    table.append(row);
    return;
  }
  active.forEach((zone) => {
    const row = document.createElement("tr");
    const zoneCell = document.createElement("td");
    const link = document.createElement("a");
    link.href = `index.html?zone=${encodeURIComponent(zone.id)}#map`;
    link.textContent = publicZoneLabel(zone);
    zoneCell.append(link);
    const reports = document.createElement("td");
    reports.textContent = Number(zone.reports7d || 0).toLocaleString(publicLocale());
    const status = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `public-status public-status-${zone.status}`;
    badge.textContent = publicStatusLabel(zone.status);
    status.append(badge);
    const updated = document.createElement("td");
    updated.textContent = formatPublicDate(zone.lastReportAt);
    row.append(zoneCell, reports, status, updated);
    table.append(row);
  });
}

function renderPublicDashboard() {
  if (!publicState.payload) return;
  const metrics = publicState.payload.metrics || {};
  metricValue("#publicReports1h", metrics.reportsLastHour);
  metricValue("#publicReports24h", metrics.reportsLast24Hours);
  metricValue("#publicAffected24h", metrics.affectedLast24Hours);
  metricValue("#publicConfirmedZones", metrics.confirmedZones);
  metricValue("#publicToConfirmZones", metrics.toConfirmZones);
  document.querySelector("#publicUpdatedAt").textContent = publicTranslate("publicUpdated", {
    time: formatPublicDate(publicState.payload.generatedAt, false),
  });
  publicState.zoneIndex = new Map((publicState.payload.zones || []).map((zone) => [zone.id, zone]));
  initializePublicMap();
  publicState.zoneLayer?.setStyle(publicZoneStyle);
  renderPublicLists();
  renderAudience();
}

function renderAudience() {
  document.body.dataset.audience = publicState.audience;
  document.querySelectorAll("[data-audience-choice]").forEach((button) => {
    const active = button.dataset.audienceChoice === publicState.audience;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const descriptionKeys = {
    public: "audiencePublicText",
    journalists: "audienceJournalistsText",
    partners: "audiencePartnersText",
    watch: "audienceWatchText",
  };
  document.querySelector("#audienceDescription").textContent = publicTranslate(descriptionKeys[publicState.audience]);
  setTimeout(() => publicState.map?.invalidateSize(), 0);
}

async function loadPublicDashboard() {
  const button = document.querySelector("#publicRefreshButton");
  button.disabled = true;
  try {
    const response = await fetch("/api/public/dashboard", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("DASHBOARD_UNAVAILABLE");
    publicState.payload = await response.json();
    renderPublicDashboard();
    setPublicConnection(true);
  } catch {
    setPublicConnection(false);
  } finally {
    button.disabled = false;
  }
}

async function loadPublicGeography() {
  const response = await fetch("/data/tn-imadas.geojson?v=1", { cache: "force-cache" });
  if (!response.ok) throw new Error("GEOGRAPHY_UNAVAILABLE");
  publicState.geography = await response.json();
  initializePublicMap();
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadPublicCsv() {
  if (!publicState.payload) return;
  const headers = ["zone_id", "zone", "delegation", "gouvernorat", "statut", "signalements_7j", "confiance", "dernier_signalement", "a_confirmer_depuis_1h", "verification_active", "score_declenchement", "signaux_coupure", "signaux_retour"];
  const rows = publicState.payload.zones.map((zone) => [
    zone.id, zone.city, zone.delegation, zone.governorate, zone.status, zone.reports7d,
    zone.trust, zone.lastReportAt, zone.stale ? "oui" : "non", zone.verification?.active ? "oui" : "non",
    zone.verification?.triggerScore || "", zone.verification?.signals?.outage || 0, zone.verification?.signals?.resolved || 0,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `tunisie-power-watch-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyPublicSummary() {
  if (!publicState.payload) return;
  const metrics = publicState.payload.metrics;
  const leading = publicState.payload.zones.filter((zone) => zone.status !== "resolved").slice(0, 5);
  const text = [
    `Tunisie Power Watch — ${formatPublicDate(publicState.payload.generatedAt)}`,
    `${publicTranslate("reportsLastHour")}: ${metrics.reportsLastHour}`,
    `${publicTranslate("reportsLast24Hours")}: ${metrics.reportsLast24Hours}`,
    `${publicTranslate("confirmedZones")}: ${metrics.confirmedZones}`,
    `${publicTranslate("toConfirmZones")}: ${metrics.toConfirmZones}`,
    ...leading.map((zone) => `- ${publicZoneLabel(zone)} — ${publicStatusLabel(zone.status)}`),
    publicTranslate("publicMethodologyText"),
  ].join("\n");
  await navigator.clipboard.writeText(text);
  const button = document.querySelector("#copyPublicSummary");
  const original = button.textContent;
  button.textContent = publicTranslate("publicSummaryCopied");
  setTimeout(() => { button.textContent = original; }, 1600);
}

function connectPublicSocket() {
  if (location.protocol === "file:") return;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  try {
    publicState.socket = new WebSocket(`${protocol}://${location.host}/ws`);
    publicState.socket.addEventListener("open", () => setPublicConnection(true));
    publicState.socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (["report", "refresh"].includes(payload.type)) void loadPublicDashboard();
    });
    publicState.socket.addEventListener("close", () => setPublicConnection(false));
    publicState.socket.addEventListener("error", () => setPublicConnection(false));
  } catch {
    setPublicConnection(false);
  }
}

document.querySelector("#languageSelect").addEventListener("change", (event) => window.tpwI18n?.setLanguage(event.target.value));
document.querySelector("#publicRefreshButton").addEventListener("click", () => void loadPublicDashboard());
document.querySelector("#copyPublicSummary").addEventListener("click", () => void copyPublicSummary());
document.querySelector("#downloadPublicCsv").addEventListener("click", downloadPublicCsv);
document.querySelector("#publicFullscreenButton").addEventListener("click", () => document.documentElement.requestFullscreen?.());
document.querySelectorAll("[data-audience-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    publicState.audience = button.dataset.audienceChoice;
    renderAudience();
  });
});
window.addEventListener("tpw:languagechange", () => {
  renderPublicDashboard();
  setPublicConnection(publicState.socket?.readyState === WebSocket.OPEN);
});
window.addEventListener("resize", () => publicState.map?.invalidateSize());

void Promise.allSettled([loadPublicGeography(), loadPublicDashboard()]);
connectPublicSocket();
setInterval(() => void loadPublicDashboard(), 30000);
