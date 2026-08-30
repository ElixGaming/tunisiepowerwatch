"use strict";

const state = {
  reports: [],
  flags: [],
  loading: false,
};

const $ = (selector) => document.querySelector(selector);

function showMessage(message) {
  const node = $("#message");

  if (!node) return;

  node.textContent = message;
  node.hidden = false;

  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => {
    node.hidden = true;
  }, 4000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(
      payload?.error ||
      `Erreur HTTP ${response.status}`,
    );

    error.status = response.status;
    error.payload = payload;

    throw error;
  }

  return payload;
}

function escapeStatus(status) {
  const labels = {
    probable: "Probable",
    confirmed: "Confirmée",
    resolved: "Résolue",
  };

  return labels[status] || status || "Inconnu";
}

function formatDate(value) {
  if (!value) return "—";

  const raw = String(value);

  const date = new Date(
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
      ? raw
      : `${raw.replace(" ", "T")}Z`,
  );

  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  }).format(date);
}

function createButton(label, className = "", action = "") {
  const button = document.createElement("button");

  button.type = "button";
  button.className = `action-button ${className}`.trim();
  button.textContent = label;

  if (action) {
    button.dataset.action = action;
  }

  return button;
}

function renderReports() {
  const list = $("#adminList");

  if (!list) return;

  list.textContent = "";

  const flagsByReport = new Map();

  for (const flag of state.flags) {
    const reportId = Number(flag.report_id);

    if (!flagsByReport.has(reportId)) {
      flagsByReport.set(reportId, []);
    }

    flagsByReport.get(reportId).push(flag);
  }

  $("#reportCount").textContent = String(state.reports.length);
  $("#flagCount").textContent = String(state.flags.length);

  const flaggedReports = state.reports.filter(
    (report) => Number(report.open_flags || 0) > 0,
  );

  $("#flaggedReportCount").textContent = String(flaggedReports.length);

  if (!state.reports.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucun signalement à modérer.";
    list.append(empty);
    return;
  }

  for (const report of state.reports) {
    const flags = flagsByReport.get(Number(report.id)) || [];

    const article = document.createElement("article");
    article.className = `admin-item${flags.length ? " flagged" : ""}`;

    const main = document.createElement("div");
    main.className = "report-main";

    const title = document.createElement("div");
    title.className = "report-title";

    const strong = document.createElement("strong");
    strong.textContent =
      `${report.city || "Zone inconnue"} · ${escapeStatus(report.status)}`;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent =
      report.is_authoritative ? "Décision admin" : "Communautaire";

    title.append(strong, badge);

    const meta = document.createElement("span");
    meta.className = "report-meta";
    meta.textContent =
      `#${report.id} · ${report.user_name || "Utilisateur"} · ` +
      `${Number(report.trust || 0)} % confiance · ` +
      `${formatDate(report.created_at)}`;

    const note = document.createElement("span");
    note.className = "report-note";
    note.textContent = report.note || "Aucune note.";

    main.append(title, meta, note);

    if (flags.length) {
      const flagText = document.createElement("span");
      flagText.className = "report-flags";
      flagText.textContent =
        `⚠ ${flags.length} alerte(s) : ` +
        flags.map((flag) => flag.reason).join(" · ");

      main.append(flagText);
    }

    const actions = document.createElement("div");
    actions.className = "admin-actions";

    const deleteButton = createButton(
      "Supprimer",
      "danger",
      "delete-report",
    );

    deleteButton.dataset.reportId = String(report.id);
    actions.append(deleteButton);

    if (
      report.auth_provider !== "anonymous" &&
      Number(report.user_id) !== 0
    ) {
      const blocked = Boolean(report.is_blocked);

      const blockButton = createButton(
        blocked ? "Débloquer" : "Bloquer",
        "",
        "toggle-block",
      );

      blockButton.dataset.userId = String(report.user_id);
      blockButton.dataset.blocked = String(blocked);

      actions.append(blockButton);
    }

    for (const flag of flags) {
      const resolveButton = createButton(
        "Résoudre l'alerte",
        "",
        "resolve-flag",
      );

      resolveButton.dataset.flagId = String(flag.id);

      actions.append(resolveButton);
    }

    article.append(main, actions);
    list.append(article);
  }
}

async function loadAdmin() {
  if (state.loading) return;

  state.loading = true;

  $("#refreshButton").disabled = true;

  try {
    const payload = await api("/api/admin/moderation");

    if (
      !payload ||
      !Array.isArray(payload.reports) ||
      !Array.isArray(payload.flags)
    ) {
      throw new Error("Réponse serveur invalide.");
    }

    state.reports = payload.reports;
    state.flags = payload.flags;

    renderReports();

    $("#lastRefresh").textContent =
      `Dernière actualisation : ${new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "Africa/Tunis",
      }).format(new Date())}`;

  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      showDenied();
      return;
    }

    showMessage(error.message);
  } finally {
    state.loading = false;
    $("#refreshButton").disabled = false;
  }
}

async function verifyAdmin() {
  try {
    const bootstrap = await api("/api/bootstrap");

    if (!bootstrap?.user?.isAdmin) {
      showDenied();
      return false;
    }

    $("#loadingCard").hidden = true;
    $("#adminContent").hidden = false;

    $("#adminIdentity").textContent =
      `${bootstrap.user.name} · session administrateur active`;

    await loadAdmin();

    return true;
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      showDenied();
      return false;
    }

    showDenied();
    return false;
  }
}

function showDenied() {
  $("#loadingCard").hidden = true;
  $("#adminContent").hidden = true;
  $("#deniedCard").hidden = false;
}

async function deleteReport(reportId) {
  const confirmed = window.confirm(
    `Supprimer définitivement le signalement #${reportId} ?`,
  );

  if (!confirmed) return;

  try {
    await api(`/api/admin/reports/${encodeURIComponent(reportId)}`, {
      method: "DELETE",
    });

    showMessage("Signalement supprimé.");

    await loadAdmin();
  } catch (error) {
    showMessage(error.message);
  }
}

async function toggleBlock(userId, currentlyBlocked) {
  const action = currentlyBlocked ? "débloquer" : "bloquer";

  const confirmed = window.confirm(
    `Voulez-vous vraiment ${action} cet utilisateur ?`,
  );

  if (!confirmed) return;

  try {
    await api(
      `/api/admin/users/${encodeURIComponent(userId)}/block`,
      {
        method: "POST",
        body: JSON.stringify({
          blocked: !currentlyBlocked,
        }),
      },
    );

    showMessage(
      currentlyBlocked
        ? "Utilisateur débloqué."
        : "Utilisateur bloqué.",
    );

    await loadAdmin();
  } catch (error) {
    showMessage(error.message);
  }
}

async function resolveFlag(flagId) {
  try {
    await api(
      `/api/admin/flags/${encodeURIComponent(flagId)}/resolve`,
      {
        method: "POST",
      },
    );

    showMessage("Alerte résolue.");

    await loadAdmin();
  } catch (error) {
    showMessage(error.message);
  }
}

async function logout() {
  try {
    await api("/api/logout", {
      method: "POST",
    });
  } finally {
    location.href = "/";
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");

  if (!button) return;

  const action = button.dataset.action;

  if (action === "delete-report") {
    void deleteReport(Number(button.dataset.reportId));
  }

  if (action === "toggle-block") {
    void toggleBlock(
      Number(button.dataset.userId),
      button.dataset.blocked === "true",
    );
  }

  if (action === "resolve-flag") {
    void resolveFlag(Number(button.dataset.flagId));
  }
});

$("#refreshButton").addEventListener("click", () => {
  void loadAdmin();
});

$("#logoutButton").addEventListener("click", () => {
  void logout();
});

verifyAdmin();