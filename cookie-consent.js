(() => {
  "use strict";

  const STORAGE_KEY = "tpw_cookie_consent";
  const GTM_ID = "GTM-56HZ6KWC";

  function gtag() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }

  function setGoogleConsent(accepted) {
    const value = accepted ? "granted" : "denied";

    gtag("consent", "update", {
      ad_storage: value,
      analytics_storage: value,
      ad_user_data: value,
      ad_personalization: value
    });
  }

  function loadGTM() {
    if (document.querySelector("script[data-tpw-gtm]")) {
      return;
    }

    window.dataLayer = window.dataLayer || [];

    window.dataLayer.push({
      "gtm.start": new Date().getTime(),
      event: "gtm.js"
    });

    const script = document.createElement("script");

    script.async = true;
    script.src =
      "https://www.googletagmanager.com/gtm.js?id=" +
      encodeURIComponent(GTM_ID);

    script.dataset.tpwGtm = "true";

    document.head.appendChild(script);
  }

  function applyConsent(accepted) {
    setGoogleConsent(accepted);

    /*
     * GTM et les balises Google ne sont chargés
     * qu'après acceptation.
     */
    if (accepted) {
      loadGTM();
    }
  }

  function createBanner() {
    const oldBanner = document.getElementById(
      "cookieConsentBanner"
    );

    if (oldBanner) {
      oldBanner.remove();
    }

    const banner = document.createElement("div");

    banner.id = "cookieConsentBanner";

    banner.innerHTML = `
      <div class="cookie-consent-box">

        <div class="cookie-consent-text">

          <strong>🍪 Cookies et confidentialité</strong>

          <p>
            Tunisie Power Watch utilise des cookies nécessaires
            au fonctionnement du service. Des technologies
            optionnelles de mesure d’audience et de publicité
            peuvent être utilisées uniquement après votre
            consentement.
          </p>

          <a href="cookies.html">
            En savoir plus
          </a>

        </div>

        <div class="cookie-consent-buttons">

          <button
            id="cookieReject"
            type="button"
            class="ghost-button"
          >
            Refuser
          </button>

          <button
            id="cookieAccept"
            type="button"
            class="primary-button"
          >
            Accepter
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(banner);

    const acceptButton =
      document.getElementById("cookieAccept");

    const rejectButton =
      document.getElementById("cookieReject");

    acceptButton.addEventListener("click", () => {
      localStorage.setItem(
        STORAGE_KEY,
        "accepted"
      );

      applyConsent(true);

      banner.remove();
    });

    rejectButton.addEventListener("click", () => {
      localStorage.setItem(
        STORAGE_KEY,
        "rejected"
      );

      applyConsent(false);

      banner.remove();
    });
  }

  /*
   * Permet de rouvrir le bandeau depuis un bouton
   * présent sur cookies.html ou une autre page.
   */
  window.openCookiePreferences = function () {
    localStorage.removeItem(STORAGE_KEY);
    createBanner();
  };

  function initializeCookieConsent() {
    window.dataLayer = window.dataLayer || [];

    /*
     * Consent Mode par défaut :
     * aucune mesure d'audience ni publicité
     * avant le choix de l'utilisateur.
     */
    gtag("consent", "default", {
      ad_storage: "denied",
      analytics_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      wait_for_update: 500
    });

    const savedConsent =
      localStorage.getItem(STORAGE_KEY);

    if (savedConsent === "accepted") {
      applyConsent(true);
      return;
    }

    if (savedConsent === "rejected") {
      applyConsent(false);
      return;
    }

    /*
     * Aucun choix enregistré :
     * afficher le bandeau.
     */
    createBanner();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeCookieConsent
    );
  } else {
    initializeCookieConsent();
  }
})();