async function loadPrivacyInformation() {
  try {
    const response = await fetch("/api/privacy", { credentials: "include" });
    if (!response.ok) throw new Error("Configuration indisponible");
    const information = await response.json();
    document.querySelectorAll("[data-controller]").forEach((node) => { node.textContent = information.controllerName; });
    document.querySelectorAll("[data-privacy-email]").forEach((node) => {
      node.textContent = information.privacyEmail;
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(information.privacyEmail)) node.href = `mailto:${information.privacyEmail}`;
    });
    document.querySelectorAll("[data-hosting-provider]").forEach((node) => { node.textContent = information.hostingProvider; });
    document.querySelectorAll("[data-hosting-country]").forEach((node) => { node.textContent = information.hostingCountry; });
    document.querySelectorAll("[data-report-retention]").forEach((node) => { node.textContent = `${information.reportRetentionDays} jours`; });
    document.querySelectorAll("[data-account-retention]").forEach((node) => { node.textContent = `${information.accountRetentionDays} jours`; });
    document.querySelectorAll("[data-session-retention]").forEach((node) => { node.textContent = `${information.sessionRetentionDays} jours`; });
    document.querySelectorAll("[data-notice-version]").forEach((node) => { node.textContent = information.noticeVersion; });
    const configurationIncomplete = [
      information.controllerName,
      information.privacyEmail,
      information.hostingProvider,
      information.hostingCountry,
    ].some((value) => {
      const text = String(value || "").trim().toLowerCase();
      return !text
        || text.includes("à compléter")
        || text.includes("example.com")
        || text.startsWith("nom de ")
        || text.startsWith("pays d’")
        || text.startsWith("pays d'");
    });
    document.querySelector("#privacyConfigWarning").hidden = !configurationIncomplete;
  } catch {
    document.querySelector("#privacyConfigWarning").hidden = false;
  }
}

loadPrivacyInformation();
