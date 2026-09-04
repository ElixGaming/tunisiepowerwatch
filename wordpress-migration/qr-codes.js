let qrZones = [];
let qrVisibleLimit = 24;
let qrPrinting = false;

const qrPageSize = 24;
const qrMaximumPrintableZones = 200;
const qrStatusDefinitions = [
  { value: "confirmed", labelKey: "qrConfirmed" },
  { value: "resolved", labelKey: "qrResolved" },
];

const qrTranslate = (key, values = {}) => window.tpwI18n?.t(key, values) || key;
const qrLanguage = () => window.tpwI18n?.language === "ar" ? "ar" : "fr";
const qrLocale = () => qrLanguage() === "ar" ? "ar-TN" : "fr-TN";

function localizedZoneName(zone) {
  return qrLanguage() === "ar" && zone.cityAr ? zone.cityAr : zone.city;
}

function localizedDelegation(zone) {
  return qrLanguage() === "ar" && zone.delegationAr ? zone.delegationAr : zone.delegation;
}

function localizedGovernorate(zone) {
  return qrLanguage() === "ar" && zone.governorateAr ? zone.governorateAr : zone.governorate;
}

function normalizedSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function qrReportUrl(zoneId, status) {
  const url = new URL("/", location.origin);
  url.searchParams.set("zone", zoneId);
  url.searchParams.set("reportStatus", status);
  url.searchParams.set("source", "qr");
  url.hash = "reportForm";
  return url.href;
}

function qrImageUrl(zoneId, status) {
  const url = new URL("/api/qr-code", location.origin);
  url.searchParams.set("zoneId", zoneId);
  url.searchParams.set("status", status);
  return url.href;
}

function createQrItem(zone, definition) {
  const item = document.createElement("section");
  item.className = `qr-item qr-item-${definition.value}`;

  const title = document.createElement("h3");
  title.textContent = qrTranslate(definition.labelKey);

  const image = document.createElement("img");
  image.src = qrImageUrl(zone.id, definition.value);
  image.alt = `${qrTranslate(definition.labelKey)} · ${localizedZoneName(zone)}`;
  image.width = 280;
  image.height = 280;
  image.loading = qrPrinting ? "eager" : "lazy";

  const actions = document.createElement("div");
  actions.className = "qr-item-actions no-print";

  const testLink = document.createElement("a");
  testLink.href = qrReportUrl(zone.id, definition.value);
  testLink.textContent = qrTranslate("qrTestLink");

  const downloadLink = document.createElement("a");
  downloadLink.href = image.src;
  downloadLink.download = `tunisie-power-watch-${zone.id}-${definition.value}.svg`;
  downloadLink.textContent = qrTranslate("qrDownload");

  actions.append(testLink, downloadLink);
  item.append(title, image, actions);
  return item;
}

function filteredQrZones() {
  const governorate = document.querySelector("#qrGovernorateFilter").value;
  const delegation = document.querySelector("#qrDelegationFilter").value;
  const search = normalizedSearch(document.querySelector("#qrZoneSearch").value);
  return qrZones
    .filter((zone) => !governorate || zone.governorate === governorate)
    .filter((zone) => !delegation || zone.delegation === delegation)
    .filter((zone) => !search || normalizedSearch([
      zone.id,
      zone.city,
      zone.cityAr,
      zone.delegation,
      zone.delegationAr,
      zone.governorate,
      zone.governorateAr,
    ].join(" ")).includes(search))
    .slice()
    .sort((left, right) => localizedZoneName(left).localeCompare(localizedZoneName(right), qrLocale()));
}

function renderQrDirectory({ all = false } = {}) {
  const container = document.querySelector("#qrDirectory");
  const matchingZones = filteredQrZones();
  const visibleZones = all ? matchingZones : matchingZones.slice(0, qrVisibleLimit);
  const fragment = document.createDocumentFragment();

  for (const zone of visibleZones) {
    const card = document.querySelector("#qrZoneTemplate").content.firstElementChild.cloneNode(true);
    card.dataset.zoneId = zone.id;
    card.querySelector("h2").textContent = localizedZoneName(zone);
    card.querySelector("header p").textContent = `${localizedDelegation(zone)} · ${localizedGovernorate(zone)} · ${zone.id}`;
    const pair = card.querySelector(".qr-pair");
    qrStatusDefinitions.forEach((definition) => pair.append(createQrItem(zone, definition)));
    fragment.append(card);
  }

  container.textContent = "";
  if (visibleZones.length) {
    container.append(fragment);
  } else {
    const empty = document.createElement("p");
    empty.className = "qr-empty-state";
    empty.textContent = qrTranslate("qrNoResults");
    container.append(empty);
  }

  document.querySelector("#qrZoneCount").textContent = qrTranslate("qrZoneCount", {
    shown: visibleZones.length,
    total: matchingZones.length,
    codes: matchingZones.length * 2,
  });
  document.querySelector("#qrLoadMoreButton").hidden = all || visibleZones.length >= matchingZones.length;
  const printTooLarge = matchingZones.length > qrMaximumPrintableZones;
  document.querySelector("#printQrCodesButton").disabled = !matchingZones.length || printTooLarge;
  document.querySelector("#qrPrintHelp").hidden = !printTooLarge;
}

function appendFilterOptions(select, entries, allLabel) {
  const previous = select.value;
  select.textContent = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = allLabel;
  select.append(all);
  entries.forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
  select.value = [...select.options].some((option) => option.value === previous) ? previous : "";
}

function populateQrGovernorates() {
  const entries = [...new Map(qrZones.map((zone) => [zone.governorate, {
    value: zone.governorate,
    label: localizedGovernorate(zone),
  }])).values()].sort((left, right) => left.label.localeCompare(right.label, qrLocale()));
  appendFilterOptions(document.querySelector("#qrGovernorateFilter"), entries, qrTranslate("qrAllGovernorates"));
}

function populateQrDelegations() {
  const governorate = document.querySelector("#qrGovernorateFilter").value;
  const candidates = qrZones.filter((zone) => !governorate || zone.governorate === governorate);
  const entries = [...new Map(candidates.map((zone) => [zone.delegation, {
    value: zone.delegation,
    label: localizedDelegation(zone),
  }])).values()].sort((left, right) => left.label.localeCompare(right.label, qrLocale()));
  appendFilterOptions(document.querySelector("#qrDelegationFilter"), entries, qrTranslate("qrAllDelegations"));
}

async function printQrDirectory() {
  const matchingZones = filteredQrZones();
  if (!matchingZones.length || matchingZones.length > qrMaximumPrintableZones) return;
  const button = document.querySelector("#printQrCodesButton");
  button.disabled = true;
  button.textContent = qrTranslate("qrPreparingPrint");
  qrPrinting = true;
  renderQrDirectory({ all: true });
  const images = [...document.querySelectorAll(".qr-item img")];
  await Promise.all(images.map((image) => image.complete
    ? Promise.resolve()
    : new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    })));
  window.print();
  qrPrinting = false;
  button.textContent = qrTranslate("qrPrint");
  renderQrDirectory();
}

async function loadQrZones() {
  const count = document.querySelector("#qrZoneCount");
  count.textContent = qrTranslate("qrLoadingZones");
  try {
    const response = await fetch("data/tn-imadas.geojson?v=1", { cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geoJson = await response.json();
    const uniqueZones = new Map();
    for (const feature of Array.isArray(geoJson.features) ? geoJson.features : []) {
      const properties = feature?.properties || {};
      const id = String(properties.id || "").trim();
      if (!id || !properties.name || !properties.delegation || !properties.governorate) continue;
      uniqueZones.set(id, {
        id,
        city: String(properties.name),
        cityAr: String(properties.nameAr || ""),
        delegation: String(properties.delegation),
        delegationAr: String(properties.delegationAr || ""),
        governorate: String(properties.governorate),
        governorateAr: String(properties.governorateAr || ""),
      });
    }
    qrZones = [...uniqueZones.values()];
    populateQrGovernorates();
    populateQrDelegations();
    renderQrDirectory();
  } catch (error) {
    qrZones = [];
    count.textContent = qrTranslate("qrLoadError");
    document.querySelector("#printQrCodesButton").disabled = true;
    console.error("Répertoire QR:", error.message);
  }
}

document.querySelector("#languageSelect").addEventListener("change", (event) => window.tpwI18n?.setLanguage(event.target.value));
document.querySelector("#qrGovernorateFilter").addEventListener("change", () => {
  qrVisibleLimit = qrPageSize;
  populateQrDelegations();
  renderQrDirectory();
});
document.querySelector("#qrDelegationFilter").addEventListener("change", () => {
  qrVisibleLimit = qrPageSize;
  renderQrDirectory();
});
document.querySelector("#qrZoneSearch").addEventListener("input", () => {
  qrVisibleLimit = qrPageSize;
  renderQrDirectory();
});
document.querySelector("#qrLoadMoreButton").addEventListener("click", () => {
  qrVisibleLimit += qrPageSize;
  renderQrDirectory();
});
document.querySelector("#printQrCodesButton").addEventListener("click", () => void printQrDirectory());
window.addEventListener("tpw:languagechange", () => {
  populateQrGovernorates();
  populateQrDelegations();
  renderQrDirectory();
});

void loadQrZones();
