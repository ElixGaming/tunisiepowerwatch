```js
(() => {
  "use strict";

  const STORAGE_KEY = "tpw_cookie_consent";

  function getConsent() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function saveConsent(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Le site continue de fonctionner même si le stockage local est indisponible.
    }
  }

  function createBanner() {
    if (document.getElementById("cookieConsentBanner")) return;

    const banner = document.createElement("section");
    banner.id = "cookieConsentBanner";
    banner.className = "cookie-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-labelledby", "cookieConsentTitle");
    banner.setAttribute("aria-describedby", "cookieConsentText");

    banner.innerHTML = `
      <div class="cookie-consent-content">
        <div>
          <strong id="cookieConsentTitle">🍪 Cookies et confidentialité</strong>
          <p id="cookieConsentText">
            Tunisie Power Watch utilise des cookies et un stockage local nécessaires
            au fonctionnement du service, notamment pour les sessions et la
            protection anti-abus. Aucun cookie publicitaire ou de mesure d’audience
            n’est actuellement utilisé.
          </p>
        </div>

        <div class="cookie-consent-actions">
          <button type="button" id="cookieReject" class="ghost-button">
            Refuser
          </button>

          <a href="cookies.html" class="ghost-button">
            Gérer mes choix
          </a>

          <button type="button" id="cookieAccept" class="primary-button">
            Accepter
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    document
      .getElementById("cookieAccept")
      .addEventListener("click", () => {
        saveConsent("accepted");
        banner.remove();
      });

    document
      .getElementById("cookieReject")
      .addEventListener("click", () => {
        saveConsent("rejected");
        banner.remove();
      });
  }

  function init() {
    if (getConsent()) return;
    createBanner();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
```
