const statusServiceTranslations = {
  website: ["statusServiceWebsite", "statusServiceWebsiteHelp"],
  database: ["statusServiceDatabase", "statusServiceDatabaseHelp"],
  realtime: ["statusServiceRealtime", "statusServiceRealtimeHelp"],
  localAuth: ["statusServiceLocalAuth", "statusServiceLocalAuthHelp"],
  webPush: ["statusServiceWebPush", "statusServiceWebPushHelp"],
  whatsapp: ["statusServiceWhatsapp", "statusServiceWhatsappHelp"],
};

const statusLabels = {
  operational: "statusOperational",
  degraded: "statusDegraded",
  outage: "statusOutage",
  not_configured: "statusNotConfigured",
};

const statusTranslate = (key, values = {}) => window.tpwI18n?.t(key, values) || key;
let latestStatusPayload = null;

function statusLocale() {
  return window.tpwI18n?.language === "ar" ? "ar-TN" : "fr-TN";
}

function formatStatusTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(statusLocale(), {
    timeZone: "Africa/Tunis",
    dateStyle: "short",
    timeStyle: "medium",
    hourCycle: "h23",
  });
}

function formatStatusUptime(seconds) {
  const totalMinutes = Math.max(0, Math.floor(Number(seconds || 0) / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days} j`);
  if (hours) parts.push(`${hours} h`);
  if (minutes || !parts.length) parts.push(`${minutes} min`);
  return parts.join(" ");
}

function serviceCard(service) {
  const translationKeys = statusServiceTranslations[service.id] || [service.id, ""];
  const article = document.createElement("article");
  article.className = `status-service status-${service.status}`;

  const marker = document.createElement("span");
  marker.className = "status-indicator";
  marker.setAttribute("aria-hidden", "true");

  const content = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = statusTranslate(translationKeys[0]);
  const description = document.createElement("p");
  description.textContent = statusTranslate(translationKeys[1]);
  content.append(title, description);

  const label = document.createElement("strong");
  label.className = "status-service-label";
  label.textContent = statusTranslate(statusLabels[service.status] || "statusUnavailable");

  article.append(marker, content, label);
  return article;
}

function renderStatus(payload) {
  latestStatusPayload = payload;
  const overall = document.querySelector("#overallStatus");
  overall.className = `overall-status status-${payload.overall}`;
  document.querySelector("#overallStatusLabel").textContent = statusTranslate(statusLabels[payload.overall] || "statusUnavailable");
  document.querySelector("#statusLastChecked").textContent = statusTranslate("statusLastChecked", { time: formatStatusTime(payload.checkedAt) });
  document.querySelector("#statusUptime").textContent = statusTranslate("statusUptime", { duration: formatStatusUptime(payload.uptimeSeconds) });

  const services = document.querySelector("#statusServices");
  services.textContent = "";
  (payload.services || []).forEach((service) => services.append(serviceCard(service)));
}

function renderStatusError() {
  latestStatusPayload = null;
  const overall = document.querySelector("#overallStatus");
  overall.className = "overall-status status-outage";
  document.querySelector("#overallStatusLabel").textContent = statusTranslate("statusUnavailable");
  document.querySelector("#statusLastChecked").textContent = "";
  document.querySelector("#statusUptime").textContent = "";
  document.querySelector("#statusServices").textContent = "";
}

async function loadStatus() {
  const button = document.querySelector("#refreshStatusButton");
  button.disabled = true;
  button.textContent = statusTranslate("statusRefreshing");
  try {
    const response = await fetch("/api/health", { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json();
    if (!Array.isArray(payload.services)) throw new Error("INVALID_STATUS");
    renderStatus(payload);
  } catch {
    renderStatusError();
  } finally {
    button.disabled = false;
    button.textContent = statusTranslate("statusRefresh");
  }
}

document.querySelector("#languageSelect").addEventListener("change", (event) => window.tpwI18n?.setLanguage(event.target.value));
document.querySelector("#refreshStatusButton").addEventListener("click", () => void loadStatus());
window.addEventListener("tpw:languagechange", () => {
  if (latestStatusPayload) renderStatus(latestStatusPayload);
  else renderStatusError();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void loadStatus();
});

void loadStatus();
setInterval(() => void loadStatus(), 30000);
