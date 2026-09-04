function fillLegalText(selector, value) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value || "Non renseigné";
  });
}

function isPlaceholder(value) {
  const text = String(value || "").trim().toLowerCase();
  return !text
    || text.includes("à compléter")
    || text.includes("chargement")
    || text.includes("example.com")
    || text.startsWith("nom de ")
    || text.startsWith("pays d’")
    || text.startsWith("pays d'");
}

async function loadLegalInformation() {
  const warning = document.querySelector("#legalConfigWarning");
  try {
    const response = await fetch("/api/legal", { credentials: "include" });
    if (!response.ok) throw new Error("Configuration indisponible");
    const information = await response.json();

    fillLegalText("[data-site-name]", information.siteName);
    fillLegalText("[data-editor-name]", information.editorName);
    fillLegalText("[data-editor-address]", information.editorAddress);
    fillLegalText("[data-editor-phone]", information.editorPhone);
    fillLegalText("[data-editor-registration]", information.editorRegistration);
    fillLegalText("[data-editor-legal-form]", information.editorLegalForm);
    fillLegalText("[data-editor-capital]", information.editorCapital);
    fillLegalText("[data-publication-director]", information.publicationDirector);
    fillLegalText("[data-hosting-provider]", information.hostingProvider);
    fillLegalText("[data-hosting-address]", information.hostingAddress);
    fillLegalText("[data-hosting-phone]", information.hostingPhone);
    fillLegalText("[data-hosting-country]", information.hostingCountry);
    fillLegalText("[data-storage-provider]", information.contentStorageProvider);
    fillLegalText("[data-storage-address]", information.contentStorageAddress);
    fillLegalText("[data-notice-version]", information.noticeVersion);

    document.querySelectorAll("[data-contact-email]").forEach((node) => {
      node.textContent = information.contactEmail || "Non renseigné";
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(information.contactEmail || "")) {
        node.href = `mailto:${information.contactEmail}`;
      }
    });

    const isNonProfessional = information.editorStatus === "non-professional";
    const isProfessional = information.editorStatus === "professional";
    document.querySelector("#nonProfessionalEditor").hidden = !isNonProfessional;
    document.querySelector("#professionalEditor").hidden = !isProfessional;
    document.querySelector("#unconfiguredEditor").hidden = isNonProfessional || isProfessional;

    const hasSeparateStorage = Boolean(String(information.contentStorageProvider || "").trim() || String(information.contentStorageAddress || "").trim());
    document.querySelector("#contentStorage").hidden = !hasSeparateStorage;

    const requiredValues = [information.hostingProvider, information.hostingAddress, information.hostingCountry, information.contactEmail];
    if (isProfessional) {
      requiredValues.push(
        information.editorName,
        information.editorAddress,
        information.editorPhone,
        information.publicationDirector,
        information.hostingPhone,
      );
    }
    warning.hidden = (isNonProfessional || isProfessional) && !requiredValues.some(isPlaceholder);
  } catch {
    warning.hidden = false;
    document.querySelector("#unconfiguredEditor").hidden = false;
  }
}

loadLegalInformation();
