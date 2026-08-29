(() => {
  "use strict";

  const STORAGE_KEY = "tpw_cookie_consent";

  function updateGoogleConsent(granted) {
    if (typeof window.gtag !== "function") {
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

  function showCookieBanner() {
    // Supprime un ancien bandeau s'il existe
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

    const acceptButton =
      document.getElementById("cookieAccept");

    const rejectButton =
      document.getElementById("cookieReject");

    acceptButton.addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEY, "accepted");

      updateGoogleConsent(true);

      banner.remove();
    });

    rejectButton.addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEY, "rejected");

      updateGoogleConsent(false);

      banner.remove();
    });
  }

  /*
   * Fonction disponible depuis cookies.html
   */
  window.openCookiePreferences = function () {
    localStorage.removeItem(STORAGE_KEY);

    showCookieBanner();
  };

  /*
   * Affichage automatique du bandeau
   *
   * Sur cookies.html, on ne l'affiche pas automatiquement :
   * l'utilisateur peut utiliser le bouton
   * "Modifier mes préférences".
   */
  function initializeCookieConsent() {
    const currentPage =
      window.location.pathname.split("/").pop() || "index.html";

    if (currentPage === "cookies.html") {
      return;
    }

    const savedConsent =
      localStorage.getItem(STORAGE_KEY);

    if (savedConsent === "accepted") {
      updateGoogleConsent(true);
      return;
    }

    if (savedConsent === "rejected") {
      updateGoogleConsent(false);
      return;
    }

    showCookieBanner();
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
```
