(() => {
  "use strict";

  const STORAGE_KEY = "tpw_cookie_consent";

  // Met à jour le consentement Google
  function updateGoogleConsent(granted) {
    if (typeof window.gtag !== "function") {
      console.warn("Google Consent Mode : gtag() n'est pas disponible.");
      return;
    }

    const value = granted ? "granted" : "denied";

    window.gtag("consent", "update", {
      ad_storage: value,
      analytics_storage: value,
      ad_user_data: value,
      ad_personalization: value
    });
  }

  // Vérifie si l'utilisateur a déjà fait un choix
  const savedConsent = localStorage.getItem(STORAGE_KEY);

  if (savedConsent === "accepted") {
    updateGoogleConsent(true);
    return;
  }

  if (savedConsent === "rejected") {
    updateGoogleConsent(false);
    return;
  }

  // Création du bandeau
  function showCookieBanner() {
    // Évite de créer plusieurs bandeaux
    if (document.getElementById("cookieConsentBanner")) {
      return;
    }

    const banner = document.createElement("div");
    banner.id = "cookieConsentBanner";

    banner.innerHTML = `
      <div class="cookie-consent-box">

        <div class="cookie-consent-text">
          <strong>🍪 Cookies et confidentialité</strong>

          <p>
            Tunisie Power Watch utilise des cookies et le stockage local
            nécessaires au fonctionnement du service.
            Les technologies optionnelles d'analyse et de publicité
            ne sont activées qu'après votre consentement.
          </p>

          <a href="cookies.html">
            En savoir plus
          </a>
        </div>

        <div class="cookie-consent-buttons">
          <button id="cookieReject" type="button">
            Refuser
          </button>

          <button id="cookieAccept" type="button">
            Accepter
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(banner);

    // Bouton "Accepter"
    const acceptButton = document.getElementById("cookieAccept");

    acceptButton.addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEY, "accepted");

      updateGoogleConsent(true);

      banner.remove();
    });

    // Bouton "Refuser"
    const rejectButton = document.getElementById("cookieReject");

    rejectButton.addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEY, "rejected");

      updateGoogleConsent(false);

      banner.remove();
    });
  }

  // Affiche le bandeau lorsque le DOM est disponible
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showCookieBanner);
  } else {
    showCookieBanner();
  }
})();
```
