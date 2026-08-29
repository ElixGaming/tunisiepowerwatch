(function initializePwa() {
  let deferredInstallPrompt = null;
  let registrationPromise = Promise.resolve(null);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    registrationPromise = navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    document.querySelector("#installAppButton")?.removeAttribute("hidden");
    document.querySelector("#installStatus").textContent = window.tpwI18n?.t("installReady") || "Installation disponible.";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    document.querySelector("#installAppButton")?.setAttribute("hidden", "");
    document.querySelector("#installStatus").textContent = "Application installée.";
  });

  async function install() {
    if (!deferredInstallPrompt) return false;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return choice.outcome === "accepted";
  }

  window.tpwPwa = {
    registration: registrationPromise,
    install,
    get canInstall() { return Boolean(deferredInstallPrompt); },
  };
})();
