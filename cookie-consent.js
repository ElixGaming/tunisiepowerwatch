(() => {
  "use strict";

  const STORAGE_KEY = "tpw_cookie_consent";

  // Ne rien afficher si un choix a déjà été enregistré.
  if (localStorage.getItem(STORAGE_KEY)) {
    return;
  }

  function showCookieBanner() {
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
            nécessaires au fonctionnement du service, notamment pour les
            sessions et la protection anti-abus.
            Aucun cookie publicitaire ou outil de mesure d’audience
            n’est actuellement utilisé.
          </p>

          <a href="cookies.html">En savoir plus sur les cookies</a>
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

    document
      .getElementById("cookieAccept")
      .addEventListener("click", () => {
        localStorage.setItem(STORAGE_KEY, "accepted");
        banner.remove();
      });

    document
      .getElementById("cookieReject")
      .addEventListener("click", () => {
        localStorage.setItem(STORAGE_KEY, "rejected");
        banner.remove();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showCookieBanner);
  } else {
    showCookieBanner();
  }
})();