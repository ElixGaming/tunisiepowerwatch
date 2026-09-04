(() => {
  "use strict";

  const STORAGE_KEY = "tpw_cookie_consent";
  const GA_ID = "G-R72RXZR2YL"; // ← REMPLACE PAR TON ID GA4

  function ensureDataLayer() {
    window.dataLayer = window.dataLayer || [];

    window.gtag = window.gtag || function () {
      window.dataLayer.push(arguments);
    };
  }

  function setDefaultConsent() {
    ensureDataLayer();

    window.gtag("consent", "default", {
      ad_storage: "denied",
      analytics_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      wait_for_update: 500
    });
  }

  function updateConsent(accepted) {
    ensureDataLayer();

    const value = accepted ? "granted" : "denied";

    window.gtag("consent", "update", {
      ad_storage: value,
      analytics_storage: value,
      ad_user_data: value,
      ad_personalization: value
    });
  }

  function loadGoogleAnalytics() {
    if (document.querySelector("script[data-tpw-ga]")) {
      return;
    }

    ensureDataLayer();

    window.gtag("js", new Date());

    window.gtag("config", GA_ID);

    const script = document.createElement("script");

    script.async = true;
    script.src =
      "https://www.googletagmanager.com/gtag/js?id=" +
      encodeURIComponent(GA_ID);

    script.dataset.tpwGa = "true";

    document.head.appendChild(script);
  }

  function applyConsent(accepted) {
    updateConsent(accepted);

    if (accepted) {
      loadGoogleAnalytics();
    }
  }

  function createBanner() {
    const oldBanner = document.getElementById("cookieConsentBanner");

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
            au fonctionnement du service. La mesure d’audience
            Google Analytics est utilisée uniquement après votre
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

    document
      .getElementById("cookieAccept")
      .addEventListener("click", () => {
        localStorage.setItem(STORAGE_KEY, "accepted");

        applyConsent(true);

        banner.remove();
      });

    document
      .getElementById("cookieReject")
      .addEventListener("click", () => {
        localStorage.setItem(STORAGE_KEY, "rejected");

        applyConsent(false);

        banner.remove();
      });
  }

  window.openCookiePreferences = function () {
    localStorage.removeItem(STORAGE_KEY);
    createBanner();
  };

  function initializeCookieConsent() {
    setDefaultConsent();

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