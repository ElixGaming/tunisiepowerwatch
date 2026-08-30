import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createChallenge, pbkdf2, verifySolution } from "altcha/lib";
import QRCode from "qrcode";
import { WebSocket, WebSocketServer } from "ws";
import webpush from "web-push";

const scrypt = promisify(scryptCallback);
const root = fileURLToPath(new URL(".", import.meta.url));
const dataDirectory = process.env.TPW_DATA_DIR ? resolve(process.env.TPW_DATA_DIR) : join(root, "data");
const emailKeyFile = process.env.EMAIL_ENCRYPTION_KEY_FILE
  ? resolve(process.env.EMAIL_ENCRYPTION_KEY_FILE)
  : process.env.TPW_DATA_DIR
    ? join(dataDirectory, "email-encryption.key")
    : join(root, "secrets", "email-encryption.key");
const port = Number(process.env.PORT || 8088);
const listenHost = String(process.env.HOST || "127.0.0.1").trim() || "127.0.0.1";
const trustProxy = process.env.TRUST_PROXY === "1";
const productionMode = process.env.NODE_ENV === "production";
const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;
const adminSessionDurationMs = 8 * 60 * 60 * 1000;
const privacyNoticeVersion = "2026-08-02-v6";
const legalNoticeVersion = "2026-07-21";
const termsVersion = "2026-08-02-v6";
const reportRetentionDays = Math.max(30, Number(process.env.REPORT_RETENTION_DAYS || 730));
const accountRetentionDays = Math.max(90, Number(process.env.ACCOUNT_RETENTION_DAYS || 730));
const anonymousReportCooldownMs = 20 * 60 * 1000;
const accountReportCooldownMs = 10 * 60 * 1000;
const altchaChallengeDurationMs = 5 * 60 * 1000;
const configuredAltchaHmacSecret = String(process.env.ALTCHA_HMAC_SECRET || "").trim();
const allowedStatuses = new Set(["probable", "confirmed", "resolved"]);
const allowedQrStatuses = new Set(["confirmed", "resolved"]);
const allowedVoteChoices = new Set(["outage", "resolved"]);
const zoneConfirmationFreshnessMs = 60 * 60 * 1000;
const verificationEvidenceWindowMs = 45 * 60 * 1000;
const verificationDurationMs = 30 * 60 * 1000;
const verificationMinimumOutageReports = 5;
const verificationConfidenceThreshold = 70;
const configuredAdminLocalEmails = String(process.env.ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
const vapidPublicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
const vapidPrivateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
const vapidSubject = String(process.env.VAPID_SUBJECT || "mailto:contact@example.com").trim();
const pushConfigured = Boolean(vapidPublicKey && vapidPrivateKey && /^(mailto:|https:\/\/)/.test(vapidSubject));
const requestedWhatsAppGraphVersion = String(process.env.WHATSAPP_GRAPH_VERSION || "v25.0").trim();
const whatsappGraphVersion = /^v\d+\.\d+$/.test(requestedWhatsAppGraphVersion) ? requestedWhatsAppGraphVersion : "v25.0";
const whatsappVerifyToken = String(process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
const whatsappAccessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
const whatsappPhoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
const whatsappAppSecret = String(process.env.WHATSAPP_APP_SECRET || "").trim();
const whatsappIdentitySecret = String(process.env.WHATSAPP_ID_HASH_SECRET || whatsappAppSecret).trim();
const whatsappPublicNumber = String(process.env.WHATSAPP_PUBLIC_NUMBER || "").replace(/\D/g, "");
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
const securePublicDeployment = productionMode || /^https:\/\//i.test(publicBaseUrl);
const maxWebSocketClients = Math.max(10, Math.min(5000, Number(process.env.MAX_WEBSOCKET_CLIENTS || 500)));
const whatsappConfigured = Boolean(whatsappVerifyToken && whatsappAccessToken && whatsappPhoneNumberId && whatsappAppSecret && whatsappIdentitySecret);
const whatsappPublicUrl = whatsappConfigured && whatsappPublicNumber
  ? `https://wa.me/${whatsappPublicNumber}?text=${encodeURIComponent("SIGNALER")}`
  : null;
const whatsappConversationDurationMs = 30 * 60 * 1000;

if (pushConfigured) webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

mkdirSync(dataDirectory, { recursive: true });

function loadPrivacyConfig() {
  const fallback = {
    controllerName: "À compléter avant publication",
    privacyEmail: "À compléter avant publication",
    editorStatus: "non-professional",
    editorName: "À compléter avant publication",
    editorAddress: "À compléter avant publication",
    editorPhone: "À compléter avant publication",
    editorRegistration: "Non applicable",
    editorLegalForm: "Non applicable",
    editorCapital: "Non applicable",
    publicationDirector: "À compléter avant publication",
    hostingProvider: "À compléter avant publication",
    hostingAddress: "À compléter avant publication",
    hostingPhone: "À compléter avant publication",
    hostingCountry: "À compléter avant publication",
    contentStorageProvider: "",
    contentStorageAddress: "",
  };
  try {
    return { ...fallback, ...JSON.parse(readFileSync(join(root, "privacy-config.json"), "utf8")) };
  } catch {
    return fallback;
  }
}

const privacyConfig = loadPrivacyConfig();

function loadZones() {
  const source = readFileSync(join(root, "steg-zones.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: "steg-zones.js" });
  const directory = new Map(context.window.stegZones.map((zone) => [zone.id, zone]));
  try {
    const geoJson = JSON.parse(readFileSync(join(root, "data", "tn-imadas.geojson"), "utf8"));
    for (const feature of geoJson.features || []) {
      const properties = feature.properties || {};
      if (!properties.id) continue;
      directory.set(properties.id, {
        id: properties.id,
        city: properties.name,
        cityAr: properties.nameAr,
        delegation: properties.delegation,
        governorate: properties.governorate,
        direction: "Découpage administratif des imadas",
        agencies: [],
        lat: Number(properties.lat),
        lng: Number(properties.lng),
        source: "hdx-cod-ab",
      });
    }
  } catch (caught) {
    console.warn("Limites des imadas indisponibles:", caught.message);
  }
  return directory;
}

const zoneDirectory = loadZones();
const db = new DatabaseSync(join(dataDirectory, "power-watch.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA secure_delete = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    reputation INTEGER NOT NULL DEFAULT 70,
    privacy_notice_version TEXT NOT NULL DEFAULT 'legacy',
    privacy_accepted_at TEXT,
    terms_version TEXT NOT NULL DEFAULT 'legacy',
    terms_accepted_at TEXT,
    is_blocked INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    zone_id TEXT NOT NULL,
    city TEXT NOT NULL,
    district TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('probable', 'confirmed', 'resolved')),
    note TEXT NOT NULL DEFAULT '',
    trust INTEGER NOT NULL,
    moderation_status TEXT NOT NULL DEFAULT 'visible',
    is_authoritative INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS zone_votes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    zone_id TEXT NOT NULL,
    choice TEXT NOT NULL CHECK(choice IN ('outage', 'resolved')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, zone_id)
  );

  CREATE TABLE IF NOT EXISTS zone_verifications (
    zone_id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    finalized_at INTEGER,
    decision_status TEXT NOT NULL DEFAULT 'probable' CHECK(decision_status IN ('probable', 'confirmed', 'resolved')),
    trigger_score INTEGER NOT NULL DEFAULT 0,
    trigger_reports INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS content_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    UNIQUE (report_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS moderation_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    participant_hash TEXT PRIMARY KEY,
    stage TEXT NOT NULL,
    zone_id TEXT,
    status TEXT,
    expires_at INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS whatsapp_receipts (
    message_id TEXT PRIMARY KEY,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS abuse_limits (
    scope TEXT NOT NULL,
    identity_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    reset_at INTEGER NOT NULL,
    PRIMARY KEY (scope, identity_hash)
  );

  CREATE INDEX IF NOT EXISTS reports_zone_created_idx ON reports(zone_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS reports_user_created_idx ON reports(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS votes_zone_idx ON zone_votes(zone_id, choice);
  CREATE INDEX IF NOT EXISTS verification_end_idx ON zone_verifications(finalized_at, ends_at);
  CREATE INDEX IF NOT EXISTS flags_status_idx ON content_flags(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS push_zone_idx ON push_subscriptions(zone_id);
  CREATE INDEX IF NOT EXISTS whatsapp_conversation_expiry_idx ON whatsapp_conversations(expires_at);
  CREATE INDEX IF NOT EXISTS whatsapp_receipt_date_idx ON whatsapp_receipts(received_at);
  CREATE INDEX IF NOT EXISTS abuse_limits_reset_idx ON abuse_limits(reset_at);
`);

function ensureColumn(table, name, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((column) => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

ensureColumn("users", "privacy_notice_version", "TEXT NOT NULL DEFAULT 'legacy'");
ensureColumn("users", "privacy_accepted_at", "TEXT");
ensureColumn("users", "terms_version", "TEXT NOT NULL DEFAULT 'legacy'");
ensureColumn("users", "terms_accepted_at", "TEXT");
ensureColumn("users", "last_login_at", "TEXT");
ensureColumn("users", "auth_provider", "TEXT NOT NULL DEFAULT 'password'");
ensureColumn("users", "provider_user_id", "TEXT");
ensureColumn("users", "is_blocked", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "email_lookup_hash", "TEXT");
ensureColumn("reports", "moderation_status", "TEXT NOT NULL DEFAULT 'visible'");
ensureColumn("reports", "is_authoritative", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("sessions", "created_at", "INTEGER");
db.prepare("UPDATE sessions SET created_at = ? WHERE created_at IS NULL").run(Date.now());
db.exec("CREATE INDEX IF NOT EXISTS reports_authoritative_zone_idx ON reports(zone_id, is_authoritative, id DESC) WHERE moderation_status = 'visible'");
db.prepare("UPDATE users SET phone = '' WHERE phone <> ''").run();
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_provider_idx ON users(auth_provider, provider_user_id) WHERE provider_user_id IS NOT NULL");

const emailCipherPrefix = "email$aes256gcm$v1$";
const emailCipherAad = Buffer.from("tunisie-power-watch:email:v1", "utf8");

function decodeEmailMasterKey(value, source) {
  const text = String(value || "").trim();
  const key = Buffer.from(text, "base64url");
  if (key.length !== 32) throw new Error(`La clé de chiffrement email ${source} doit contenir exactement 32 octets encodés en base64url.`);
  return key;
}

function encryptedEmailRowsExist() {
  return Number(db.prepare("SELECT COUNT(*) AS count FROM users WHERE email LIKE 'email$aes256gcm$v1$%'").get().count) > 0;
}

function loadOrCreateEmailMasterKey() {
  const configured = String(process.env.EMAIL_ENCRYPTION_KEY || "").trim();
  if (configured) return { key: decodeEmailMasterKey(configured, "EMAIL_ENCRYPTION_KEY"), source: "variable EMAIL_ENCRYPTION_KEY" };
  if (existsSync(emailKeyFile)) {
    return { key: decodeEmailMasterKey(readFileSync(emailKeyFile, "utf8"), emailKeyFile), source: emailKeyFile };
  }
  if (encryptedEmailRowsExist()) {
    throw new Error(`La base contient des emails chiffrés, mais la clé est absente. Restaurez ${emailKeyFile} ou configurez EMAIL_ENCRYPTION_KEY.`);
  }

  mkdirSync(dirname(emailKeyFile), { recursive: true });
  const generated = randomBytes(32);
  try {
    writeFileSync(emailKeyFile, `${generated.toString("base64url")}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (caught) {
    if (caught.code === "EEXIST") {
      return { key: decodeEmailMasterKey(readFileSync(emailKeyFile, "utf8"), emailKeyFile), source: emailKeyFile };
    }
    throw caught;
  }
  try { chmodSync(emailKeyFile, 0o600); } catch {}
  return { key: generated, source: emailKeyFile };
}

const emailKeyMaterial = loadOrCreateEmailMasterKey();
const emailEncryptionKey = createHmac("sha256", emailKeyMaterial.key).update("tunisie-power-watch:email-encryption-key:v1").digest();
const emailLookupKey = createHmac("sha256", emailKeyMaterial.key).update("tunisie-power-watch:email-lookup-key:v1").digest();
const altchaHmacSecret = configuredAltchaHmacSecret
  || createHmac("sha256", emailKeyMaterial.key).update("tunisie-power-watch:altcha:hmac-secret:v1").digest("base64url");
const altchaKeySignatureSecret = createHmac("sha256", altchaHmacSecret).update("tunisie-power-watch:altcha:key-signature:v1").digest("base64url");
const reportCooldownSecret = createHmac("sha256", altchaHmacSecret).update("tunisie-power-watch:report-cooldown:v1").digest();

function isEncryptedEmail(value) {
  return String(value || "").startsWith(emailCipherPrefix);
}

function encryptEmail(value) {
  const plaintext = Buffer.from(normalizedEmail(value), "utf8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", emailEncryptionKey, iv, { authTagLength: 16 });
  cipher.setAAD(emailCipherAad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${emailCipherPrefix}${iv.toString("base64url")}$${ciphertext.toString("base64url")}$${tag.toString("base64url")}`;
}

function decryptEmail(value) {
  const stored = String(value || "");
  if (!isEncryptedEmail(stored)) return normalizedEmail(stored);
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "email" || parts[1] !== "aes256gcm" || parts[2] !== "v1") {
    throw new Error("Format d'email chiffré invalide.");
  }
  const iv = Buffer.from(parts[3], "base64url");
  const ciphertext = Buffer.from(parts[4], "base64url");
  const tag = Buffer.from(parts[5], "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Paramètres d'email chiffré invalides.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", emailEncryptionKey, iv, { authTagLength: 16 });
    decipher.setAAD(emailCipherAad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Impossible de déchiffrer les emails. La clé est incorrecte ou les données ont été altérées.");
  }
}

function emailLookupHash(value) {
  return createHmac("sha256", emailLookupKey).update(normalizedEmail(value), "utf8").digest("hex");
}

function protectedEmailFields(value) {
  const normalized = normalizedEmail(value);
  return { encrypted: encryptEmail(normalized), lookupHash: emailLookupHash(normalized) };
}

function migrateEmailsAtRest() {
  const rows = db.prepare("SELECT id, email, email_lookup_hash FROM users ORDER BY id").all();
  const update = db.prepare("UPDATE users SET email = ?, email_lookup_hash = ? WHERE id = ?");
  const seenLookupHashes = new Set();
  let migrated = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of rows) {
      const plaintext = normalizedEmail(decryptEmail(row.email));
      const lookupHash = emailLookupHash(plaintext);
      if (seenLookupHashes.has(lookupHash)) throw new Error("Deux comptes utilisent la même adresse email normalisée.");
      seenLookupHashes.add(lookupHash);
      const encrypted = isEncryptedEmail(row.email) ? row.email : encryptEmail(plaintext);
      if (encrypted !== row.email || lookupHash !== row.email_lookup_hash) {
        update.run(encrypted, lookupHash, row.id);
        migrated += 1;
      }
    }
    db.exec("COMMIT");
  } catch (caught) {
    db.exec("ROLLBACK");
    throw caught;
  }
  if (migrated) db.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
  return migrated;
}

const migratedEmailCount = migrateEmailsAtRest();
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_email_lookup_idx ON users(email_lookup_hash) WHERE email_lookup_hash IS NOT NULL");
const adminLocalEmailHashes = new Set(configuredAdminLocalEmails.map(emailLookupHash));
const abuseProtectionSecret = createHmac("sha256", emailKeyMaterial.key).update("tunisie-power-watch:abuse-protection:v1").digest();

const queries = {
  userByEmail: db.prepare("SELECT * FROM users WHERE email_lookup_hash = ?"),
  userById: db.prepare("SELECT * FROM users WHERE id = ?"),
  whatsappUserByProvider: db.prepare("SELECT * FROM users WHERE auth_provider = 'whatsapp' AND provider_user_id = ?"),
  anonymousReporter: db.prepare("SELECT * FROM users WHERE auth_provider = 'anonymous' AND provider_user_id = 'public-web'"),
  userBySession: db.prepare(`
    SELECT users.id, users.name, users.email_lookup_hash, users.reputation, users.auth_provider, users.provider_user_id, users.privacy_notice_version,
           users.privacy_accepted_at, users.terms_version, users.terms_accepted_at, users.is_blocked, users.created_at,
           sessions.created_at AS session_created_at
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `),
  insertPasswordUser: db.prepare("INSERT INTO users (name, email, email_lookup_hash, password_hash, reputation, auth_provider, provider_user_id, privacy_notice_version, privacy_accepted_at, terms_version, terms_accepted_at, last_login_at) VALUES (?, ?, ?, ?, 70, 'password', NULL, ?, datetime('now'), ?, datetime('now'), datetime('now'))"),
  updatePasswordLogin: db.prepare("UPDATE users SET terms_version = ?, terms_accepted_at = datetime('now'), last_login_at = datetime('now') WHERE id = ?"),
  updatePasswordHash: db.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND auth_provider = 'password'"),
  insertWhatsAppUser: db.prepare("INSERT INTO users (name, email, email_lookup_hash, password_hash, reputation, auth_provider, provider_user_id, privacy_notice_version, privacy_accepted_at, terms_version, terms_accepted_at, last_login_at) VALUES (?, ?, ?, 'whatsapp-only', 70, 'whatsapp', ?, ?, datetime('now'), ?, datetime('now'), datetime('now'))"),
  insertAnonymousReporter: db.prepare("INSERT INTO users (name, email, email_lookup_hash, password_hash, reputation, auth_provider, provider_user_id, privacy_notice_version, privacy_accepted_at, terms_version, terms_accepted_at, last_login_at) VALUES ('Anonyme', ?, ?, 'anonymous-only', 64, 'anonymous', 'public-web', ?, datetime('now'), ?, datetime('now'), datetime('now'))"),
  updateWhatsAppUser: db.prepare("UPDATE users SET privacy_notice_version = ?, privacy_accepted_at = datetime('now'), terms_version = ?, terms_accepted_at = datetime('now'), last_login_at = datetime('now') WHERE id = ?"),
  insertSession: db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
  deleteExpiredSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),
  deleteExpiredReports: db.prepare("DELETE FROM reports WHERE created_at < datetime('now', ?)"),
  deleteInactiveUsers: db.prepare("DELETE FROM users WHERE auth_provider <> 'anonymous' AND datetime(COALESCE(last_login_at, created_at)) < datetime('now', ?)"),
  exportUser: db.prepare("SELECT id, name, email AS encrypted_email, reputation, auth_provider, provider_user_id, privacy_notice_version, privacy_accepted_at, terms_version, terms_accepted_at, created_at, last_login_at FROM users WHERE id = ?"),
  exportReports: db.prepare("SELECT id, zone_id, city, district, status, note, trust, is_authoritative, created_at FROM reports WHERE user_id = ? ORDER BY id DESC"),
  exportVotes: db.prepare("SELECT zone_id, choice, created_at, updated_at FROM zone_votes WHERE user_id = ? ORDER BY updated_at DESC"),
  exportFlags: db.prepare("SELECT report_id, reason, status, created_at, resolved_at FROM content_flags WHERE user_id = ? ORDER BY id DESC"),
  exportPushSubscriptions: db.prepare("SELECT zone_id, endpoint, created_at, updated_at FROM push_subscriptions WHERE user_id = ? ORDER BY id DESC"),
  deleteUser: db.prepare("DELETE FROM users WHERE id = ?"),
  deleteSessionsByUser: db.prepare("DELETE FROM sessions WHERE user_id = ?"),
  recentUserReports: db.prepare("SELECT COUNT(*) AS count FROM reports WHERE user_id = ? AND created_at >= datetime('now', '-1 hour')"),
  recentDuplicate: db.prepare("SELECT id FROM reports WHERE user_id = ? AND zone_id = ? AND status = ? AND moderation_status = 'visible' AND created_at >= datetime('now', '-10 minutes') LIMIT 1"),
  insertReport: db.prepare("INSERT INTO reports (user_id, zone_id, city, district, status, note, trust, is_authoritative) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
  zoneSummary: db.prepare(`
    SELECT
      grouped.zone_id,
      grouped.reports,
      grouped.trust,
      grouped.last_report_at,
      (SELECT status FROM reports latest WHERE latest.zone_id = grouped.zone_id AND latest.moderation_status = 'visible' ORDER BY latest.id DESC LIMIT 1) AS status
    FROM (
      SELECT zone_id, COUNT(*) AS reports, ROUND(AVG(trust)) AS trust, MAX(created_at) AS last_report_at
      FROM reports
      WHERE moderation_status = 'visible'
      GROUP BY zone_id
    ) grouped
    ORDER BY grouped.zone_id
  `),
  oneZoneSummary: db.prepare(`
    SELECT
      ? AS zone_id,
      COUNT(*) AS reports,
      COALESCE(ROUND(AVG(trust)), 0) AS trust,
      MAX(created_at) AS last_report_at,
      COALESCE((SELECT status FROM reports latest WHERE latest.zone_id = ? AND latest.moderation_status = 'visible' ORDER BY latest.id DESC LIMIT 1), 'resolved') AS status
    FROM reports WHERE zone_id = ? AND moderation_status = 'visible'
  `),
  voteTallies: db.prepare("SELECT zone_id, SUM(choice = 'outage') AS confirmations, SUM(choice = 'resolved') AS resolutions FROM zone_votes GROUP BY zone_id"),
  userVotes: db.prepare("SELECT zone_id, choice FROM zone_votes WHERE user_id = ?"),
  upsertVote: db.prepare(`
    INSERT INTO zone_votes (user_id, zone_id, choice) VALUES (?, ?, ?)
    ON CONFLICT(user_id, zone_id) DO UPDATE SET choice = excluded.choice, updated_at = datetime('now')
  `),
  verificationCandidates: db.prepare(`
    SELECT DISTINCT zone_id
    FROM reports
    WHERE moderation_status = 'visible'
      AND is_authoritative = 0
      AND status IN ('probable', 'confirmed')
      AND created_at >= datetime('now', '-45 minutes')
      AND NOT EXISTS (
        SELECT 1 FROM reports authoritative
        WHERE authoritative.zone_id = reports.zone_id
          AND authoritative.moderation_status = 'visible'
          AND authoritative.is_authoritative = 1
      )
  `),
  verificationOutageEvidence: db.prepare(`
    SELECT
      COUNT(*) AS outage_reports,
      COALESCE(ROUND(AVG(trust)), 0) AS average_trust,
      COUNT(DISTINCT strftime('%Y-%m-%d %H:', created_at) || printf('%d', CAST(strftime('%M', created_at) AS INTEGER) / 10)) AS time_buckets
    FROM reports
    WHERE zone_id = ?
      AND moderation_status = 'visible'
      AND status IN ('probable', 'confirmed')
      AND created_at > ?
  `),
  verificationRecentVotes: db.prepare(`
    SELECT
      SUM(CASE WHEN choice = 'outage' THEN 1 ELSE 0 END) AS outage_votes,
      SUM(CASE WHEN choice = 'resolved' THEN 1 ELSE 0 END) AS resolution_votes
    FROM zone_votes
    WHERE zone_id = ? AND updated_at > ?
  `),
  latestVisibleReport: db.prepare("SELECT status, created_at FROM reports WHERE zone_id = ? AND moderation_status = 'visible' ORDER BY id DESC LIMIT 1"),
  latestAuthoritativeReports: db.prepare(`
    SELECT reports.zone_id, reports.status, reports.created_at
    FROM reports
    WHERE reports.moderation_status = 'visible'
      AND reports.is_authoritative = 1
      AND reports.id = (
        SELECT MAX(latest.id)
        FROM reports latest
        WHERE latest.zone_id = reports.zone_id
          AND latest.moderation_status = 'visible'
          AND latest.is_authoritative = 1
      )
  `),
  latestResolvedReport: db.prepare("SELECT created_at FROM reports WHERE zone_id = ? AND moderation_status = 'visible' AND status = 'resolved' ORDER BY id DESC LIMIT 1"),
  zoneVerification: db.prepare("SELECT * FROM zone_verifications WHERE zone_id = ?"),
  zoneVerifications: db.prepare("SELECT * FROM zone_verifications"),
  upsertZoneVerification: db.prepare(`
    INSERT INTO zone_verifications (zone_id, started_at, ends_at, finalized_at, decision_status, trigger_score, trigger_reports)
    VALUES (?, ?, ?, NULL, 'probable', ?, ?)
    ON CONFLICT(zone_id) DO UPDATE SET
      started_at = excluded.started_at,
      ends_at = excluded.ends_at,
      finalized_at = NULL,
      decision_status = 'probable',
      trigger_score = excluded.trigger_score,
      trigger_reports = excluded.trigger_reports,
      updated_at = datetime('now')
  `),
  finalizeZoneVerification: db.prepare("UPDATE zone_verifications SET finalized_at = ?, decision_status = ?, updated_at = datetime('now') WHERE zone_id = ? AND finalized_at IS NULL"),
  deleteZoneVerification: db.prepare("DELETE FROM zone_verifications WHERE zone_id = ?"),
  verificationReportSignals: db.prepare(`
    SELECT
      SUM(CASE WHEN status IN ('probable', 'confirmed') THEN 1 ELSE 0 END) AS outage_signals,
      SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolution_signals
    FROM reports
    WHERE zone_id = ? AND moderation_status = 'visible' AND created_at > ? AND created_at <= ?
  `),
  verificationVoteSignals: db.prepare(`
    SELECT
      SUM(CASE WHEN choice = 'outage' THEN 1 ELSE 0 END) AS outage_signals,
      SUM(CASE WHEN choice = 'resolved' THEN 1 ELSE 0 END) AS resolution_signals
    FROM zone_votes
    WHERE zone_id = ? AND updated_at > ? AND updated_at <= ?
  `),
  recentFeed: db.prepare(`
    SELECT reports.id, reports.city, reports.district, reports.status, reports.trust, reports.is_authoritative,
           reports.created_at, users.name AS user_name
    FROM reports JOIN users ON users.id = reports.user_id
    WHERE reports.moderation_status = 'visible'
    ORDER BY reports.id DESC LIMIT ?
  `),
  reportById: db.prepare(`
    SELECT reports.id, reports.city, reports.district, reports.status, reports.trust, reports.is_authoritative,
           reports.created_at, users.name AS user_name
    FROM reports JOIN users ON users.id = reports.user_id
    WHERE reports.id = ? AND reports.moderation_status = 'visible'
  `),
  reportForFlag: db.prepare("SELECT id FROM reports WHERE id = ? AND moderation_status = 'visible'"),
  insertFlag: db.prepare(`
    INSERT INTO content_flags (report_id, user_id, reason) VALUES (?, ?, ?)
    ON CONFLICT(report_id, user_id) DO UPDATE SET reason = excluded.reason, status = 'open', created_at = datetime('now'), resolved_at = NULL
  `),
  statsRows: db.prepare("SELECT status, created_at FROM reports WHERE zone_id = ? AND moderation_status = 'visible' AND created_at >= ? AND created_at < ? ORDER BY created_at ASC"),
  publicOverview: db.prepare(`
    SELECT
      SUM(CASE WHEN created_at >= datetime('now', '-1 hour') THEN 1 ELSE 0 END) AS reports_last_hour,
      SUM(CASE WHEN created_at >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS reports_last_24_hours,
      COUNT(DISTINCT CASE WHEN created_at >= datetime('now', '-24 hours') THEN zone_id END) AS affected_last_24_hours
    FROM reports
    WHERE moderation_status = 'visible'
  `),
  adminReports: db.prepare(`
    SELECT reports.id, reports.zone_id, reports.city, reports.district, reports.status, reports.note, reports.trust, reports.is_authoritative,
           reports.created_at, users.id AS user_id, users.name AS user_name, users.provider_user_id, users.auth_provider,
           users.is_blocked, SUM(CASE WHEN content_flags.status = 'open' THEN 1 ELSE 0 END) AS open_flags,
           GROUP_CONCAT(CASE WHEN content_flags.status = 'open' THEN content_flags.reason END, ' · ') AS flag_reasons
    FROM reports
    JOIN users ON users.id = reports.user_id
    LEFT JOIN content_flags ON content_flags.report_id = reports.id
    GROUP BY reports.id
    ORDER BY open_flags DESC, reports.id DESC
    LIMIT 100
  `),
  adminFlags: db.prepare(`
    SELECT content_flags.id, content_flags.report_id, content_flags.reason, content_flags.created_at,
           users.name AS reporter_name
    FROM content_flags JOIN users ON users.id = content_flags.user_id
    WHERE content_flags.status = 'open'
    ORDER BY content_flags.id DESC LIMIT 100
  `),
  deleteReport: db.prepare("DELETE FROM reports WHERE id = ?"),
  resolveFlag: db.prepare("UPDATE content_flags SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?"),
  setUserBlocked: db.prepare("UPDATE users SET is_blocked = ? WHERE id = ?"),
  pushByZone: db.prepare("SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE zone_id = ? AND user_id <> ?"),
  pushCountByUser: db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = ?"),
  pushSubscriptionOwner: db.prepare("SELECT user_id FROM push_subscriptions WHERE endpoint = ?"),
  upsertPushSubscription: db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, zone_id) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
      zone_id = excluded.zone_id, updated_at = datetime('now')
  `),
  deletePushSubscription: db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?"),
  deletePushById: db.prepare("DELETE FROM push_subscriptions WHERE id = ?"),
  insertModerationAction: db.prepare("INSERT INTO moderation_actions (admin_user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)"),
  whatsappConversation: db.prepare("SELECT participant_hash, stage, zone_id, status, expires_at FROM whatsapp_conversations WHERE participant_hash = ? AND expires_at > ?"),
  upsertWhatsAppConversation: db.prepare(`
    INSERT INTO whatsapp_conversations (participant_hash, stage, zone_id, status, expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(participant_hash) DO UPDATE SET stage = excluded.stage, zone_id = excluded.zone_id,
      status = excluded.status, expires_at = excluded.expires_at, updated_at = datetime('now')
  `),
  deleteWhatsAppConversation: db.prepare("DELETE FROM whatsapp_conversations WHERE participant_hash = ?"),
  deleteExpiredWhatsAppConversations: db.prepare("DELETE FROM whatsapp_conversations WHERE expires_at <= ?"),
  insertWhatsAppReceipt: db.prepare("INSERT OR IGNORE INTO whatsapp_receipts (message_id) VALUES (?)"),
  deleteOldWhatsAppReceipts: db.prepare("DELETE FROM whatsapp_receipts WHERE received_at < datetime('now', '-7 days')"),
  whatsappRecentReports: db.prepare("SELECT city, district, status, created_at FROM reports WHERE user_id = ? ORDER BY id DESC LIMIT 8"),
  whatsappReportCount: db.prepare("SELECT COUNT(*) AS count FROM reports WHERE user_id = ?"),
  abuseLimit: db.prepare("SELECT attempts, reset_at FROM abuse_limits WHERE scope = ? AND identity_hash = ?"),
  upsertAbuseLimit: db.prepare(`
    INSERT INTO abuse_limits (scope, identity_hash, attempts, reset_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(scope, identity_hash) DO UPDATE SET attempts = excluded.attempts, reset_at = excluded.reset_at
  `),
  deleteExpiredAbuseLimits: db.prepare("DELETE FROM abuse_limits WHERE reset_at <= ?"),
};

function getOrCreateAnonymousReporter() {
  const existing = queries.anonymousReporter.get();
  if (existing) return existing;
  const email = protectedEmailFields("anonymous-public-web@invalid.local");
  const result = queries.insertAnonymousReporter.run(email.encrypted, email.lookupHash, privacyNoticeVersion, termsVersion);
  return queries.userById.get(Number(result.lastInsertRowid));
}

const anonymousReporter = getOrCreateAnonymousReporter();
const missingConfiguredAdminAccounts = configuredAdminLocalEmails.filter((email) => !queries.userByEmail.get(emailLookupHash(email))).length;
if (missingConfiguredAdminAccounts) {
  console.warn(`${missingConfiguredAdminAccounts} adresse(s) ADMIN_EMAILS ne correspondent à aucun compte existant. L’inscription publique de ces adresses est bloquée par sécurité.`);
}
if (securePublicDeployment && !publicBaseUrl) {
  console.warn("PUBLIC_BASE_URL est absent. Configurez l’adresse HTTPS publique pour fiabiliser les contrôles d’origine et les QR codes.");
}

const qrSvgCache = new Map();
const usedAltchaChallenges = new Map();

function normalizedNetworkAddress(value) {
  const address = String(value || "").trim().replace(/^::ffff:/, "");
  return isIP(address) ? address : "unknown";
}

function clientNetworkAddress(request) {
  const directAddress = normalizedNetworkAddress(request.socket.remoteAddress);
  if (!trustProxy) return directAddress;
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return normalizedNetworkAddress(forwarded) === "unknown" ? directAddress : normalizedNetworkAddress(forwarded);
}

function abuseIdentity(value) {
  return createHmac("sha256", abuseProtectionSecret).update(String(value || "unknown")).digest("hex");
}

function isPersistentlyRateLimited(scope, identity, maximum, windowMs) {
  const now = Date.now();
  const identityHash = abuseIdentity(identity);
  const existing = queries.abuseLimit.get(scope, identityHash);
  const active = existing && Number(existing.reset_at) > now;
  const attempts = active ? Number(existing.attempts) + 1 : 1;
  const resetAt = active ? Number(existing.reset_at) : now + windowMs;
  queries.upsertAbuseLimit.run(scope, identityHash, attempts, resetAt);
  return attempts > maximum;
}

function persistentRateLimitUntil(scope, identity) {
  const existing = queries.abuseLimit.get(scope, abuseIdentity(identity));
  const resetAt = Number(existing?.reset_at || 0);
  return Number(existing?.attempts || 0) > 0 && resetAt > Date.now() ? resetAt : 0;
}

function securityHeaders() {
  const headers = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self' ws: wss:; font-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (securePublicDeployment) headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return headers;
}

function json(response, status, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...headers,
  });
  response.end(body);
}

function error(response, status, message) {
  json(response, status, { error: message });
}

function plainText(response, status, message) {
  const body = Buffer.from(String(message));
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    ...securityHeaders(),
  });
  response.end(body);
}

function svg(response, status, content, headers = {}) {
  const body = Buffer.from(String(content));
  response.writeHead(status, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "public, max-age=3600",
    ...securityHeaders(),
    ...headers,
  });
  response.end(body);
}

function publicOrigin(request) {
  if (publicBaseUrl) {
    try {
      const configured = new URL(publicBaseUrl);
      if (["http:", "https:"].includes(configured.protocol)) return configured.origin;
    } catch {
      // Une valeur invalide est ignorée au profit de l'origine de la requête.
    }
  }
  const host = String(request.headers.host || `localhost:${port}`).trim();
  const safeHost = /^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(host) ? host : `localhost:${port}`;
  const forwardedProtocol = trustProxy ? String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase() : "";
  const protocol = ["http", "https"].includes(forwardedProtocol) ? forwardedProtocol : "http";
  return `${protocol}://${safeHost}`;
}

async function readBodyBuffer(request, maximumBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const body = await readBodyBuffer(request);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf("=");
    return index === -1 ? [item, ""] : [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
  }));
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionCookie(token, maxAgeSeconds) {
  const secure = securePublicDeployment ? "; Secure" : "";
  return `tpw_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function reportCooldownCookie(expiresAt) {
  const secure = securePublicDeployment ? "; Secure" : "";
  const timestamp = String(expiresAt);
  const signature = createHmac("sha256", reportCooldownSecret).update(timestamp).digest("base64url");
  const maxAgeSeconds = Math.max(0, Math.ceil((Number(expiresAt) - Date.now()) / 1000));
  return `tpw_report_after=${timestamp}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function reportCooldownUntil(request) {
  const value = String(parseCookies(request.headers.cookie).tpw_report_after || "");
  const separator = value.indexOf(".");
  if (separator <= 0) return 0;
  const timestamp = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = createHmac("sha256", reportCooldownSecret).update(timestamp).digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return 0;
  const expiresAt = Number(timestamp);
  return Number.isSafeInteger(expiresAt) && expiresAt > Date.now() ? expiresAt : 0;
}

function reportCooldownDuration(user) {
  if (isAdminUser(user)) return 0;
  return user ? accountReportCooldownMs : anonymousReportCooldownMs;
}

function activeReportCooldownUntil(request, user, clientAddress) {
  if (isAdminUser(user)) return 0;
  if (user) return persistentRateLimitUntil("report-account", user.id);
  return Math.max(
    reportCooldownUntil(request),
    persistentRateLimitUntil("report-network", clientAddress),
  );
}

function cleanUsedAltchaChallenges(now = Date.now()) {
  for (const [signature, expiresAt] of usedAltchaChallenges) {
    if (expiresAt <= now) usedAltchaChallenges.delete(signature);
  }
}

async function newAltchaChallenge() {
  cleanUsedAltchaChallenges();
  return createChallenge({
    algorithm: "PBKDF2/SHA-256",
    cost: 1000,
    counter: randomInt(500, 1001),
    deriveKey: pbkdf2.deriveKey,
    expiresAt: new Date(Date.now() + altchaChallengeDurationMs),
    hmacSignatureSecret: altchaHmacSecret,
    hmacKeySignatureSecret: altchaKeySignatureSecret,
  });
}

async function verifyAltchaPayload(encodedPayload) {
  if (typeof encodedPayload !== "string" || encodedPayload.length < 20 || encodedPayload.length > 16_384) return false;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64").toString("utf8"));
  } catch {
    return false;
  }
  const challenge = payload?.challenge;
  const solution = payload?.solution;
  const signature = String(challenge?.signature || "");
  if (!signature || !challenge?.parameters || !solution || usedAltchaChallenges.has(signature)) return false;
  const result = await verifySolution({
    challenge,
    solution,
    deriveKey: pbkdf2.deriveKey,
    hmacSignatureSecret: altchaHmacSecret,
    hmacKeySignatureSecret: altchaKeySignatureSecret,
  });
  if (!result.verified) return false;
  cleanUsedAltchaChallenges();
  const challengeExpiry = Number(challenge.parameters.expiresAt) * 1000;
  usedAltchaChallenges.set(signature, Number.isFinite(challengeExpiry) ? challengeExpiry : Date.now() + altchaChallengeDurationMs);
  return true;
}

function currentSession(request) {
  const token = parseCookies(request.headers.cookie).tpw_session;
  if (!token) return { token: null, tokenHash: null, user: null };
  const tokenHash = hashToken(token);
  let user = queries.userBySession.get(tokenHash, Date.now()) || null;
  if (user?.is_blocked) {
    queries.deleteSession.run(tokenHash);
    user = null;
  }
  if (user && user.auth_provider !== "password") {
    queries.deleteSession.run(tokenHash);
    user = null;
  }
  if (user && isAdminUser(user)) {
    const sessionAge = Date.now() - Number(user.session_created_at || 0);
    if (sessionAge < 0 || sessionAge > adminSessionDurationMs) {
      queries.deleteSession.run(tokenHash);
      user = null;
    }
  }
  return { token, tokenHash, user };
}

function isAdminUser(user) {
  if (!user) return false;
  if (user.auth_provider === "password" && user.email_lookup_hash) return adminLocalEmailHashes.has(String(user.email_lookup_hash));
  return false;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    reputation: user.reputation,
    authProvider: user.auth_provider,
    privacyNoticeVersion: user.privacy_notice_version,
    privacyAcceptedAt: user.privacy_accepted_at,
    termsVersion: user.terms_version,
    termsAcceptedAt: user.terms_accepted_at,
    isAdmin: isAdminUser(user),
  };
}

function acceptedCurrentTerms(user) {
  return Boolean(user?.terms_accepted_at && user.terms_version === termsVersion);
}

function exportedAccount(userId) {
  const account = queries.exportUser.get(userId);
  if (!account) return null;
  const email = account.auth_provider === "password" ? decryptEmail(account.encrypted_email) : null;
  delete account.encrypted_email;
  return { ...account, email };
}

const passwordScryptParameters = Object.freeze({ N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
let dummyPasswordHashPromise = null;

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(email) {
  return email.length >= 5 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

function normalizedPublicName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validPassword(password) {
  return typeof password === "string"
    && [...password].length >= 12
    && [...password].length <= 128
    && Buffer.byteLength(password, "utf8") <= 512;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = Buffer.from(await scrypt(password, salt, 64, passwordScryptParameters));
  return `scrypt$${passwordScryptParameters.N}$${passwordScryptParameters.r}$${passwordScryptParameters.p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function dummyPasswordHash() {
  if (!dummyPasswordHashPromise) dummyPasswordHashPromise = hashPassword(randomBytes(32).toString("base64url"));
  return dummyPasswordHashPromise;
}

function modernPasswordHash(stored) {
  return String(stored).split("$").length === 6;
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split("$");
  if (parts[0] !== "scrypt") return false;
  let saltText;
  let hashText;
  let options;
  if (parts.length === 3) {
    [, saltText, hashText] = parts;
    options = undefined;
  } else if (parts.length === 6) {
    const [, nText, rText, pText, parsedSalt, parsedHash] = parts;
    const N = Number(nText);
    const r = Number(rText);
    const p = Number(pText);
    const estimatedMemory = 128 * N * r + 128 * r * p;
    if (!Number.isInteger(N) || N < 8192 || N > 262144 || (N & (N - 1)) !== 0
      || !Number.isInteger(r) || r < 1 || r > 16 || !Number.isInteger(p) || p < 1 || p > 10
      || estimatedMemory > 256 * 1024 * 1024) return false;
    saltText = parsedSalt;
    hashText = parsedHash;
    options = { N, r, p, maxmem: Math.max(64 * 1024 * 1024, estimatedMemory + 2 * 1024 * 1024) };
  } else {
    return false;
  }
  if (!saltText || !hashText) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  if (salt.length < 16 || expected.length !== 64) return false;
  try {
    const actual = Buffer.from(options
      ? await scrypt(password, salt, expected.length, options)
      : await scrypt(password, salt, expected.length));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function createSession(userId, { admin = false } = {}) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const duration = admin ? adminSessionDurationMs : sessionDurationMs;
  queries.insertSession.run(hashToken(token), userId, now + duration, now);
  return token;
}

function feedItem(row) {
  const label = row.status === "confirmed" ? "une coupure confirmée" : row.status === "resolved" ? "un retour à la normale" : "une coupure probable";
  const author = row.is_authoritative ? "Administration" : row.user_name;
  return {
    id: Number(row.id),
    city: row.city,
    governorate: row.district,
    status: row.status,
    trust: Number(row.trust),
    authoritative: Boolean(row.is_authoritative),
    userName: author,
    message: `${author} a signalé ${label} (${row.trust}% confiance)`,
    time: `${row.created_at}Z`,
  };
}

function normalizeWhatsAppInput(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function whatsappIdentityHash(senderId) {
  return createHmac("sha256", whatsappIdentitySecret).update(`tunisie-power-watch:${senderId}`).digest("hex");
}

function verifyWhatsAppSignature(rawBody, signatureHeader) {
  if (!whatsappAppSecret || !signatureHeader) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", whatsappAppSecret).update(rawBody).digest("hex")}`);
  const received = Buffer.from(String(signatureHeader));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function whatsappConversation(participantHash) {
  const conversation = queries.whatsappConversation.get(participantHash, Date.now()) || null;
  if (!conversation) queries.deleteWhatsAppConversation.run(participantHash);
  return conversation;
}

function saveWhatsAppConversation(participantHash, stage, zoneId = null, status = null) {
  queries.upsertWhatsAppConversation.run(
    participantHash,
    stage,
    zoneId,
    status,
    Date.now() + whatsappConversationDurationMs,
  );
}

function matchingWhatsAppZones(input) {
  const sought = normalizeWhatsAppInput(input);
  if (!sought) return [];
  const entries = [...zoneDirectory.values()].map((zone) => ({
    zone,
    city: normalizeWhatsAppInput(zone.city),
    governorate: normalizeWhatsAppInput(zone.governorate),
    combined: normalizeWhatsAppInput(`${zone.city} ${zone.governorate}`),
  }));
  const exact = entries.filter((entry) => entry.city === sought || entry.combined === sought || normalizeWhatsAppInput(entry.zone.id) === sought);
  if (exact.length) return exact.map((entry) => entry.zone).slice(0, 6);
  return entries
    .filter((entry) => entry.city.includes(sought) || sought.includes(entry.city) || entry.combined.includes(sought))
    .sort((a, b) => a.city.length - b.city.length || a.zone.city.localeCompare(b.zone.city, "fr"))
    .map((entry) => entry.zone)
    .slice(0, 6);
}

function nearestWhatsAppZone(latitude, longitude) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  let nearest = null;
  for (const zone of zoneDirectory.values()) {
    const deltaLatitude = toRadians(Number(zone.lat) - latitude);
    const deltaLongitude = toRadians(Number(zone.lng) - longitude);
    const firstLatitude = toRadians(latitude);
    const secondLatitude = toRadians(Number(zone.lat));
    const haversine = Math.sin(deltaLatitude / 2) ** 2
      + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(deltaLongitude / 2) ** 2;
    const distance = 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    if (!nearest || distance < nearest.distance) nearest = { zone, distance };
  }
  return nearest;
}

function whatsappStatusFromInput(input) {
  const value = normalizeWhatsAppInput(input);
  if (["1", "probable", "coupure probable", "peut etre", "محتمل"].includes(value)) return "probable";
  if (["2", "confirme", "confirmee", "coupure", "panne", "انقطاع", "مقطوع"].includes(value)) return "confirmed";
  if (["3", "resolu", "resolue", "revenu", "retabli", "retablie", "retour", "رجع الضوء", "عادت الكهرباء"].includes(value)) return "resolved";
  return null;
}

function whatsappStatusLabel(status) {
  if (status === "confirmed") return "coupure confirmée";
  if (status === "resolved") return "courant revenu";
  return "coupure probable";
}

async function sendWhatsAppText(recipient, body) {
  if (!whatsappConfigured) return;
  const endpoint = `https://graph.facebook.com/${whatsappGraphVersion}/${encodeURIComponent(whatsappPhoneNumberId)}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${whatsappAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: { preview_url: false, body: String(body).slice(0, 4000) },
    }),
  });
  if (!response.ok) throw new Error(`WHATSAPP_SEND_FAILED_${response.status}`);
}

function getOrCreateWhatsAppUser(participantHash) {
  let user = queries.whatsappUserByProvider.get(participantHash);
  if (user) {
    if (user.is_blocked) return null;
    queries.updateWhatsAppUser.run(privacyNoticeVersion, termsVersion, user.id);
    return queries.whatsappUserByProvider.get(participantHash);
  }
  const publicName = `Membre WhatsApp ${participantHash.slice(0, 6).toUpperCase()}`;
  const email = protectedEmailFields(`whatsapp-${participantHash}@invalid.local`);
  const result = queries.insertWhatsAppUser.run(
    publicName,
    email.encrypted,
    email.lookupHash,
    participantHash,
    privacyNoticeVersion,
    termsVersion,
  );
  return queries.userById.get(Number(result.lastInsertRowid));
}

function publishWhatsAppReport(user, zone, status) {
  if (Number(queries.recentUserReports.get(user.id).count) >= 10) {
    return { error: "La limite de 10 signalements par heure est atteinte. Réessayez plus tard." };
  }
  if (queries.recentDuplicate.get(user.id, zone.id, status)) {
    return { error: "Ce même signalement a déjà été enregistré récemment." };
  }
  const trust = 64;
  const result = queries.insertReport.run(user.id, zone.id, zone.city, zone.governorate, status, "", trust, 0);
  const report = queries.reportById.get(Number(result.lastInsertRowid));
  const summary = zoneSummaries(null).find((entry) => entry.id === zone.id)
    || { id: zone.id, reports: 0, trust: 0, status: "resolved", confirmations: 0, resolutions: 0 };
  delete summary.myVote;
  const event = {
    type: "report",
    reportId: Number(report.id),
    zone: summary,
    feedItem: feedItem(report),
  };
  broadcast(event);
  void notifyZoneSubscribers(zone, report, user.id);
  return { event };
}

async function replyWithWhatsAppData(senderId, participantHash) {
  const user = queries.whatsappUserByProvider.get(participantHash);
  if (!user) {
    await sendWhatsAppText(senderId, "Aucune donnée Tunisie Power Watch n’est associée à ce compte WhatsApp.");
    return;
  }
  const count = Number(queries.whatsappReportCount.get(user.id).count || 0);
  const rows = queries.whatsappRecentReports.all(user.id);
  const details = rows.length
    ? `\n\nDerniers signalements :\n${rows.map((row) => `• ${row.city} — ${whatsappStatusLabel(row.status)} — ${formatTunisiaDateTime(row.created_at)} (Tunisie)`).join("\n")}`
    : "";
  await sendWhatsAppText(senderId, `Votre compte pseudonyme contient ${count} signalement(s).${details}\n\nPour tout effacer : SUPPRIMER MES DONNÉES`);
}

async function processWhatsAppMessage(message) {
  const messageId = String(message?.id || "").slice(0, 220);
  const senderId = String(message?.from || "").trim();
  if (!messageId || !senderId || Number(queries.insertWhatsAppReceipt.run(messageId).changes) === 0) return;

  const participantHash = whatsappIdentityHash(senderId);
  const textInput = message.type === "text"
    ? String(message.text?.body || "")
    : message.type === "interactive"
      ? String(message.interactive?.button_reply?.id || message.interactive?.button_reply?.title || message.interactive?.list_reply?.id || message.interactive?.list_reply?.title || "")
      : "";
  const input = normalizeWhatsAppInput(textInput);
  let conversation = whatsappConversation(participantHash);

  if (["aide", "help", "مساعدة"].includes(input)) {
    await sendWhatsAppText(senderId, "Commandes :\n• SIGNALER : commencer un signalement\n• MES DONNÉES : consulter vos données\n• SUPPRIMER MES DONNÉES : tout supprimer\n• ANNULER : interrompre la conversation");
    return;
  }
  if (["annuler", "stop", "الغاء", "إلغاء"].includes(input)) {
    queries.deleteWhatsAppConversation.run(participantHash);
    await sendWhatsAppText(senderId, "Conversation annulée. Envoyez SIGNALER pour recommencer.");
    return;
  }
  if (["mes donnees", "donnees"].includes(input)) {
    await replyWithWhatsAppData(senderId, participantHash);
    return;
  }
  if (["supprimer mes donnees", "حذف بياناتي"].includes(input)) {
    saveWhatsAppConversation(participantHash, "confirm_delete");
    await sendWhatsAppText(senderId, "Cette action supprimera votre compte pseudonyme et tous ses signalements. Répondez exactement : SUPPRIMER DÉFINITIVEMENT");
    return;
  }
  if (["signaler", "signalement", "panne", "ابلاغ", "إبلاغ"].includes(input) && conversation) {
    queries.deleteWhatsAppConversation.run(participantHash);
    conversation = null;
  }
  if (conversation?.stage === "confirm_delete") {
    if (input === "supprimer definitivement") {
      const user = queries.whatsappUserByProvider.get(participantHash);
      if (user) queries.deleteUser.run(user.id);
      queries.deleteWhatsAppConversation.run(participantHash);
      broadcast({ type: "refresh" });
      await sendWhatsAppText(senderId, "Vos données Tunisie Power Watch ont été supprimées.");
    } else {
      await sendWhatsAppText(senderId, "Suppression non confirmée. Envoyez ANNULER pour quitter.");
    }
    return;
  }

  if (!conversation) {
    saveWhatsAppConversation(participantHash, "consent");
    await sendWhatsAppText(senderId, "Bonjour, ici Tunisie Power Watch. Le bot utilisera votre identifiant WhatsApp sous forme pseudonymisée pour publier votre signalement. Le numéro et le texte de vos messages ne sont pas conservés. "
      + `${publicBaseUrl ? `Politique : ${publicBaseUrl}/privacy.html\nCGU : ${publicBaseUrl}/terms.html` : "Consultez les pages Confidentialité et CGU du site."}\n\nEn répondant OUI, vous certifiez avoir au moins 18 ans, avoir lu la politique de confidentialité et accepter les CGU. Répondez ANNULER pour quitter.\nمرحبا — أجب بنعم للمتابعة.`);
    return;
  }

  if (conversation.stage === "consent") {
    if (!["oui", "j accepte", "jaccepte", "accepte", "نعم", "اوافق", "أوافق"].includes(input)) {
      await sendWhatsAppText(senderId, "Votre accord est nécessaire pour publier. Répondez OUI ou ANNULER.");
      return;
    }
    saveWhatsAppConversation(participantHash, "zone");
    await sendWhatsAppText(senderId, "Écrivez le nom de votre ville/zone tel qu’il apparaît sur la carte, ou envoyez votre position avec le bouton WhatsApp 📍. Les coordonnées servent seulement à choisir la zone et ne sont pas conservées.");
    return;
  }

  if (conversation.stage === "zone") {
    let selectedZone = null;
    if (message.type === "location") {
      const latitude = Number(message.location?.latitude);
      const longitude = Number(message.location?.longitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) selectedZone = nearestWhatsAppZone(latitude, longitude)?.zone || null;
    } else {
      const matches = matchingWhatsAppZones(textInput);
      if (matches.length === 1) selectedZone = matches[0];
      else if (matches.length > 1) {
        await sendWhatsAppText(senderId, `Plusieurs zones correspondent :\n${matches.map((zone) => `• ${zone.city}, ${zone.governorate}`).join("\n")}\n\nPrécisez « ville gouvernorat » ou envoyez votre position.`);
        return;
      }
    }
    if (!selectedZone) {
      await sendWhatsAppText(senderId, "Zone non reconnue. Essayez le nom exact de la ville avec son gouvernorat, ou envoyez votre position WhatsApp.");
      return;
    }
    saveWhatsAppConversation(participantHash, "status", selectedZone.id);
    await sendWhatsAppText(senderId, `Zone choisie : ${selectedZone.city}, ${selectedZone.governorate}.\n\nRépondez :\n1 — Coupure probable\n2 — Coupure confirmée\n3 — Le courant est revenu`);
    return;
  }

  if (conversation.stage === "status") {
    const status = whatsappStatusFromInput(textInput);
    const zone = zoneDirectory.get(conversation.zone_id);
    if (!status || !zone) {
      await sendWhatsAppText(senderId, "Réponse non reconnue. Envoyez 1, 2 ou 3. Vous pouvez aussi envoyer ANNULER.");
      return;
    }
    saveWhatsAppConversation(participantHash, "confirm", zone.id, status);
    await sendWhatsAppText(senderId, `Récapitulatif :\n• Zone : ${zone.city}, ${zone.governorate}\n• État : ${whatsappStatusLabel(status)}\n\nRépondez PUBLIER pour confirmer, ou ANNULER.`);
    return;
  }

  if (conversation.stage === "confirm") {
    if (!["publier", "confirmer", "oui", "نشر"].includes(input)) {
      await sendWhatsAppText(senderId, "Signalement non publié. Répondez PUBLIER ou ANNULER.");
      return;
    }
    const zone = zoneDirectory.get(conversation.zone_id);
    const status = conversation.status;
    if (!zone || !allowedStatuses.has(status)) {
      queries.deleteWhatsAppConversation.run(participantHash);
      await sendWhatsAppText(senderId, "La conversation a expiré. Envoyez SIGNALER pour recommencer.");
      return;
    }
    const user = getOrCreateWhatsAppUser(participantHash);
    if (!user) {
      queries.deleteWhatsAppConversation.run(participantHash);
      await sendWhatsAppText(senderId, "Ce compte ne peut pas publier de signalement. Contactez l’administrateur.");
      return;
    }
    const publication = publishWhatsAppReport(user, zone, status);
    queries.deleteWhatsAppConversation.run(participantHash);
    if (publication.error) {
      await sendWhatsAppText(senderId, publication.error);
      return;
    }
    const link = publicBaseUrl ? `\n${publicBaseUrl}/?zone=${encodeURIComponent(zone.id)}` : "";
    await sendWhatsAppText(senderId, `Merci ! Votre signalement pour ${zone.city} est publié.${link}\n\nEnvoyez SIGNALER pour en créer un autre.`);
  }
}

async function processWhatsAppWebhook(payload) {
  if (payload?.object !== "whatsapp_business_account") return;
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change?.value || {};
      if (change?.field !== "messages" || String(value.metadata?.phone_number_id || "") !== whatsappPhoneNumberId) continue;
      for (const message of value.messages || []) await processWhatsAppMessage(message);
    }
  }
}

let whatsappProcessingQueue = Promise.resolve();

function enqueueWhatsAppWebhook(payload) {
  whatsappProcessingQueue = whatsappProcessingQueue
    .then(() => processWhatsAppWebhook(payload))
    .catch((caught) => console.error("Bot WhatsApp:", caught.message));
}

function sqliteUtcToIso(value) {
  if (!value) return null;
  return `${String(value).replace(" ", "T")}Z`;
}

function epochToSqliteUtc(value) {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

function verificationSignals(record, now = Date.now()) {
  const effectiveEnd = Math.min(Number(record.ends_at), now);
  const start = epochToSqliteUtc(Number(record.started_at));
  const end = epochToSqliteUtc(effectiveEnd);
  const reportSignals = queries.verificationReportSignals.get(record.zone_id, start, end) || {};
  const voteSignals = queries.verificationVoteSignals.get(record.zone_id, start, end) || {};
  return {
    outage: Number(reportSignals.outage_signals || 0) + Number(voteSignals.outage_signals || 0),
    resolved: Number(reportSignals.resolution_signals || 0) + Number(voteSignals.resolution_signals || 0),
    outageReports: Number(reportSignals.outage_signals || 0),
    resolutionReports: Number(reportSignals.resolution_signals || 0),
    outageVotes: Number(voteSignals.outage_signals || 0),
    resolutionVotes: Number(voteSignals.resolution_signals || 0),
  };
}

function triggerEvidence(zoneId, previousRecord = null, now = Date.now()) {
  const latest = queries.latestVisibleReport.get(zoneId);
  let cutoff = now - verificationEvidenceWindowMs;
  if (previousRecord?.ends_at) cutoff = Math.max(cutoff, Number(previousRecord.ends_at));
  const latestResolvedAt = sqliteUtcToIso(queries.latestResolvedReport.get(zoneId)?.created_at);
  const latestResolvedTime = latestResolvedAt ? Date.parse(latestResolvedAt) : NaN;
  if (Number.isFinite(latestResolvedTime)) cutoff = Math.max(cutoff, latestResolvedTime);
  const evidence = queries.verificationOutageEvidence.get(zoneId, epochToSqliteUtc(cutoff)) || {};
  const votes = queries.verificationRecentVotes.get(zoneId, epochToSqliteUtc(cutoff)) || {};
  const outageReports = Number(evidence.outage_reports || 0);
  const averageTrust = Number(evidence.average_trust || 0);
  const timeBuckets = Number(evidence.time_buckets || 0);
  const outageVotes = Number(votes.outage_votes || 0);
  const resolutionVotes = Number(votes.resolution_votes || 0);
  const reportScore = Math.min(55, outageReports * 9);
  const timeDiversityScore = Math.min(25, timeBuckets * 10);
  const accountVoteScore = Math.min(20, outageVotes * 10);
  const trustAdjustment = averageTrust >= 70 ? 5 : averageTrust < 60 ? -10 : 0;
  const resolutionPenalty = Math.min(25, resolutionVotes * 8);
  const score = Math.max(0, Math.min(100, reportScore + timeDiversityScore + accountVoteScore + trustAdjustment - resolutionPenalty));
  return {
    score,
    outageReports,
    averageTrust,
    timeBuckets,
    outageVotes,
    resolutionVotes,
    credible: latest?.status !== "resolved"
      && outageReports >= verificationMinimumOutageReports
      && score >= verificationConfidenceThreshold,
  };
}

function finalizeExpiredVerifications(now = Date.now()) {
  queries.zoneVerifications.all().forEach((record) => {
    if (record.finalized_at || Number(record.ends_at) > now) return;
    const signals = verificationSignals(record, Number(record.ends_at));
    const decision = signals.resolved > signals.outage
      ? "resolved"
      : signals.outage > signals.resolved
        ? "confirmed"
        : "probable";
    queries.finalizeZoneVerification.run(now, decision, record.zone_id);
  });
}

function startCredibleVerifications(now = Date.now()) {
  queries.verificationCandidates.all().forEach(({ zone_id: zoneId }) => {
    const previous = queries.zoneVerification.get(zoneId) || null;
    if (previous && !previous.finalized_at && Number(previous.ends_at) > now) return;
    const evidence = triggerEvidence(zoneId, previous, now);
    if (!evidence.credible) return;
    queries.upsertZoneVerification.run(
      zoneId,
      now,
      now + verificationDurationMs,
      evidence.score,
      evidence.outageReports,
    );
  });
}

function refreshZoneVerifications(now = Date.now()) {
  finalizeExpiredVerifications(now);
  startCredibleVerifications(now);
}

function publicVerification(record, lastReportTime, now = Date.now()) {
  if (!record) return null;
  const active = !record.finalized_at && Number(record.ends_at) > now;
  const applicable = active || !Number.isFinite(lastReportTime) || lastReportTime <= Number(record.ends_at);
  if (!applicable) return null;
  const signals = verificationSignals(record, now);
  return {
    active,
    startedAt: new Date(Number(record.started_at)).toISOString(),
    endsAt: new Date(Number(record.ends_at)).toISOString(),
    finalizedAt: record.finalized_at ? new Date(Number(record.finalized_at)).toISOString() : null,
    decisionStatus: record.decision_status,
    triggerScore: Number(record.trigger_score || 0),
    triggerReports: Number(record.trigger_reports || 0),
    remainingMs: active ? Math.max(0, Number(record.ends_at) - now) : 0,
    signals,
  };
}

function zoneSummaries(user = null) {
  const now = Date.now();
  refreshZoneVerifications(now);

  const tallies = new Map(
    queries.voteTallies.all().map((row) => [row.zone_id, row]),
  );

  const myVotes = new Map(
    user
      ? queries.userVotes.all(user.id).map((row) => [row.zone_id, row.choice])
      : [],
  );

  const verifications = new Map(
    queries.zoneVerifications.all().map((row) => [row.zone_id, row]),
  );

  const authoritativeReports = new Map(
    queries.latestAuthoritativeReports.all().map((row) => [row.zone_id, row]),
  );

  return [...zoneDirectory.values()].map((zone) => {
    const row = queries.oneZoneSummary.get(
      zone.id,
      zone.id,
      zone.id,
    );

    const votes = tallies.get(zone.id) || {};
    const confirmations = Number(votes.confirmations || 0);
    const resolutions = Number(votes.resolutions || 0);

    const lastReportAt = sqliteUtcToIso(row.last_report_at);
    const lastReportTime = lastReportAt
      ? Date.parse(lastReportAt)
      : NaN;

    const communityResolved =
      confirmations + resolutions >= 2
      && resolutions > confirmations;

    const authoritativeReport =
      authoritativeReports.get(zone.id) || null;

    const authoritativeAt =
      sqliteUtcToIso(authoritativeReport?.created_at);

    let verification = authoritativeReport
      ? null
      : publicVerification(
          verifications.get(zone.id),
          lastReportTime,
          now,
        );

    let communityStatus =
      row.status === "resolved" || communityResolved
        ? "resolved"
        : "probable";

    if (verification?.active) {
      communityStatus = "probable";
    } else if (verification?.finalizedAt) {
      communityStatus = verification.decisionStatus;
    }

    const lastDecisionTime =
      verification?.finalizedAt
        ? Date.parse(verification.finalizedAt)
        : NaN;

    const lastActivityTime = Math.max(
      Number.isFinite(lastReportTime)
        ? lastReportTime
        : 0,
      Number.isFinite(lastDecisionTime)
        ? lastDecisionTime
        : 0,
    );

    let stale =
      communityStatus === "confirmed"
      && Number.isFinite(lastReportTime)
      && now - lastActivityTime >= zoneConfirmationFreshnessMs;

    if (stale) {
      communityStatus = "probable";
    }

    if (authoritativeReport) {
      communityStatus =
        authoritativeReport.status === "resolved"
          ? "resolved"
          : "confirmed";

      verification = null;
      stale = false;
    }

    const statistics = computeZoneStats(zone.id, 7);

    return {
      id: zone.id,

      reports: Number(row.reports || 0),

      trust: authoritativeReport
        ? 100
        : Number(row.trust || 0),

      status: communityStatus,

      authoritative: Boolean(authoritativeReport),
      authoritativeAt,

      confirmations,
      resolutions,

      lastReportAt,

      confirmationExpiresAt:
        !authoritativeReport
        && row.status !== "resolved"
        && Number.isFinite(lastReportTime)
          ? new Date(
              lastReportTime + zoneConfirmationFreshnessMs,
            ).toISOString()
          : null,

      stale,

      verification,

      myVote: myVotes.get(zone.id) || null,

      periodDays: statistics.days,
      periodReports: statistics.totalReports,

      history: statistics.daily.map(
        (entry) => entry.reports,
      ),

      hourly: statistics.hourly,

      peakHour: statistics.peakHour,
    };
  });
}

function publicDashboard() {
  const overview = queries.publicOverview.get() || {};
  const summaries = zoneSummaries(null).map((summary) => {
    const zone = zoneDirectory.get(summary.id) || {};
    return {
      id: summary.id,
      city: zone.city || summary.id,
      delegation: zone.delegation || "",
      governorate: zone.governorate || "",
      reports: summary.reports,
      reports7d: summary.periodReports,
      trust: summary.trust,
      status: summary.status,
      lastReportAt: summary.lastReportAt,
      confirmationExpiresAt: summary.confirmationExpiresAt,
      stale: summary.stale,
      authoritative: summary.authoritative,
      authoritativeAt: summary.authoritativeAt,
      verification: summary.verification,
      confirmations: summary.confirmations,
      resolutions: summary.resolutions,
    };
  });
  const active = summaries.filter((zone) => zone.status !== "resolved");
  return {
    generatedAt: new Date().toISOString(),
    timezone: "Africa/Tunis",
    freshnessMinutes: zoneConfirmationFreshnessMs / 60000,
    metrics: {
      reportsLastHour: Number(overview.reports_last_hour || 0),
      reportsLast24Hours: Number(overview.reports_last_24_hours || 0),
      affectedLast24Hours: Number(overview.affected_last_24_hours || 0),
      confirmedZones: active.filter((zone) => zone.status === "confirmed").length,
      toConfirmZones: active.filter((zone) => zone.status === "probable").length,
    },
    zones: summaries.sort((a, b) => {
      const statusPriority = { confirmed: 2, probable: 1, resolved: 0 };
      return statusPriority[b.status] - statusPriority[a.status]
        || b.reports7d - a.reports7d
        || String(b.lastReportAt || "").localeCompare(String(a.lastReportAt || ""));
    }),
  };
}

const tunisiaDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Tunis",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const tunisiaHourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Tunis",
  hour: "2-digit",
  hourCycle: "h23",
});

const tunisiaDateTimeFormatter = new Intl.DateTimeFormat("fr-TN", {
  timeZone: "Africa/Tunis",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function tunisiaDateKey(date) {
  const parts = Object.fromEntries(tunisiaDateFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function tunisiaHour(date) {
  return Number(tunisiaHourFormatter.formatToParts(date).find((part) => part.type === "hour")?.value || 0);
}

function formatTunisiaDateTime(value) {
  const raw = String(value || "").trim();
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? raw : tunisiaDateTimeFormatter.format(date);
}

function tunisiaMidnightUtc(dateKey) {
  return new Date(`${dateKey}T00:00:00+01:00`).toISOString().slice(0, 19).replace("T", " ");
}

function computeZoneStats(zoneId, days) {
  const daily = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    daily.push({ date: tunisiaDateKey(new Date(Date.now() - offset * 86400000)), reports: 0 });
  }
  const tomorrow = tunisiaDateKey(new Date(Date.now() + 86400000));
  const rows = queries.statsRows.all(zoneId, tunisiaMidnightUtc(daily[0].date), tunisiaMidnightUtc(tomorrow));
  const dailyCounts = new Map(daily.map((entry) => [entry.date, 0]));
  const hourly = Array(24).fill(0);
  const durations = [];
  let outageStartedAt = null;
  for (const row of rows) {
    const timestamp = new Date(`${row.created_at}Z`);
    if (Number.isNaN(timestamp.getTime())) continue;
    const day = tunisiaDateKey(timestamp);
    if (dailyCounts.has(day)) dailyCounts.set(day, dailyCounts.get(day) + 1);
    hourly[tunisiaHour(timestamp)] += 1;
    if (row.status === "resolved") {
      if (outageStartedAt) {
        durations.push(Math.max(0, timestamp.getTime() - outageStartedAt.getTime()));
        outageStartedAt = null;
      }
    } else if (!outageStartedAt) {
      outageStartedAt = timestamp;
    }
  }
  daily.forEach((entry) => { entry.reports = dailyCounts.get(entry.date) || 0; });
  const peakHour = rows.length ? hourly.indexOf(Math.max(...hourly)) : null;
  const averageDurationMinutes = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length / 60000)
    : null;
  return { zoneId, days, timezone: "Africa/Tunis", totalReports: rows.length, daily, hourly, peakHour, averageDurationMinutes, completedOutages: durations.length };
}

async function notifyZoneSubscribers(zone, report, excludedUserId) {
  if (!pushConfigured) return;
  const subscriptions = queries.pushByZone.all(zone.id, excludedUserId);
  const payload = JSON.stringify({
    title: `${zone.city} · Tunisie Power Watch`,
    body: report.status === "resolved" ? "Le retour du courant vient d’être signalé." : "Une coupure vient d’être signalée dans cette zone.",
    url: `/?zone=${encodeURIComponent(zone.id)}`,
    zoneId: zone.id,
  });
  await Promise.allSettled(subscriptions.map(async (record) => {
    try {
      await webpush.sendNotification({ endpoint: record.endpoint, keys: { p256dh: record.p256dh, auth: record.auth } }, payload, { TTL: 3600 });
    } catch (caught) {
      if ([404, 410].includes(caught.statusCode)) queries.deletePushById.run(record.id);
      else console.error("Notification push:", caught.message);
    }
  }));
}

function validPushEndpoint(value) {
  try {
    const endpoint = new URL(String(value || ""));
    const hostname = endpoint.hostname.toLowerCase();
    return endpoint.protocol === "https:"
      && !endpoint.username
      && !endpoint.password
      && (!endpoint.port || endpoint.port === "443")
      && !endpoint.hash
      && hostname.includes(".")
      && hostname !== "localhost"
      && !hostname.endsWith(".local")
      && isIP(hostname) === 0;
  } catch {
    return false;
  }
}

function sharedState(user = null, cooldownUntil = 0) {
  const cooldownMs = reportCooldownDuration(user);
  return {
    user: publicUser(user),
    push: { configured: pushConfigured, publicKey: pushConfigured ? vapidPublicKey : null },
    whatsapp: { configured: whatsappConfigured, url: whatsappPublicUrl },
    reporting: {
      anonymous: true,
      captcha: "altcha",
      cooldownMs,
      anonymousCooldownMs: anonymousReportCooldownMs,
      accountCooldownMs: accountReportCooldownMs,
      cooldownUntil,
      cooldownExempt: isAdminUser(user),
    },
    zones: zoneSummaries(user),
    feed: queries.recentFeed.all(30).map(feedItem),
  };
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".md", "text/markdown; charset=utf-8"],
]);

const publicFiles = new Set([
  "index.html",
  "privacy.html",
  "cookies.html",
  "legal.html",
  "terms.html",
  "status.html",
  "qr-codes.html",
  "public.html",

  "styles.css",
  "app.js",
  "i18n.js",
  "pwa.js",
  "privacy.js",
  "legal.js",
  "status.js",
  "qr-codes.js",
  "public-dashboard.js",
  "steg-zones.js",

  "cookie-consent.js",

  "data/tn-imadas.geojson",
  "manifest.webmanifest",
  "sw.js",

  "vendor/altcha/altcha.js"
]);

function isPublicFile(relative) {
  const portable = relative.replaceAll("\\", "/");
  return publicFiles.has(portable) || portable.startsWith("assets/") || portable.startsWith("vendor/leaflet/");
}

function serveStatic(request, response, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const sourceRelative = relative === "vendor/altcha/altcha.js" ? "node_modules/altcha/dist/main/altcha.i18n.min.js" : relative;
  const fullPath = resolve(root, normalize(sourceRelative));
  if (!isPublicFile(relative) || !fullPath.startsWith(resolve(root) + sep) || !existsSync(fullPath) || !statSync(fullPath).isFile()) {
    error(response, 404, "Fichier introuvable.");
    return;
  }
  const body = readFileSync(fullPath);
  const extension = extname(fullPath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes.get(extension) || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": [".html", ".js", ".css"].includes(extension) ? "no-cache" : "public, max-age=300",
    ...securityHeaders(),
  });
  response.end(body);
}

let webSocketServer;

function broadcast(payload) {
  const text = JSON.stringify(payload);
  for (const client of webSocketServer.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(text);
  }
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/health") {
    let databaseOperational = false;
    try {
      databaseOperational = db.prepare("SELECT 1 AS ok").get()?.ok === 1;
    } catch {
      databaseOperational = false;
    }
    const realtimeOperational = Boolean(webSocketServer);
    const coreOperational = databaseOperational && realtimeOperational;
    const serviceStatus = (configured) => configured ? "operational" : "not_configured";
    return json(response, coreOperational ? 200 : 503, {
      overall: coreOperational ? "operational" : "degraded",
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      timezone: "Africa/Tunis",
      services: [
        { id: "website", status: "operational", essential: true },
        { id: "database", status: databaseOperational ? "operational" : "outage", essential: true },
        { id: "realtime", status: realtimeOperational ? "operational" : "outage", essential: true },
        { id: "localAuth", status: databaseOperational ? "operational" : "outage", essential: true },
        { id: "webPush", status: serviceStatus(pushConfigured), essential: false },
        { id: "whatsapp", status: serviceStatus(whatsappConfigured), essential: false },
      ],
    });
  }

  const session = currentSession(request);
  const clientAddress = clientNetworkAddress(request);

  if (request.method === "GET" && pathname === "/api/captcha/challenge") {
    if (isPersistentlyRateLimited("captcha", clientAddress, 120, 60 * 60 * 1000)) return error(response, 429, "Trop de défis demandés. Réessayez plus tard.");
    return json(response, 200, await newAltchaChallenge());
  }

  if (request.method === "GET" && pathname === "/api/qr-code") {
    const requestUrl = new URL(request.url, publicOrigin(request));
    const zoneId = String(requestUrl.searchParams.get("zoneId") || "");
    const status = String(requestUrl.searchParams.get("status") || "");
    if (!zoneDirectory.has(zoneId)) return error(response, 400, "Zone inconnue.");
    if (!allowedQrStatuses.has(status)) return error(response, 400, "Le QR code accepte uniquement les statuts confirmed ou resolved.");
    const reportUrl = new URL("/", publicOrigin(request));
    reportUrl.searchParams.set("zone", zoneId);
    reportUrl.searchParams.set("reportStatus", status);
    reportUrl.searchParams.set("source", "qr");
    reportUrl.hash = "reportForm";
    let content = qrSvgCache.get(reportUrl.href);
    if (!content) {
      content = await QRCode.toString(reportUrl.href, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 2,
        width: 280,
        color: { dark: "#102235", light: "#ffffff" },
      });
      if (qrSvgCache.size >= 1000) qrSvgCache.clear();
      qrSvgCache.set(reportUrl.href, content);
    }
    return svg(response, 200, content, { "Vary": "Host, X-Forwarded-Proto" });
  }

  if (request.method === "GET" && pathname === "/api/whatsapp/webhook") {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const valid = requestUrl.searchParams.get("hub.mode") === "subscribe"
      && whatsappVerifyToken
      && requestUrl.searchParams.get("hub.verify_token") === whatsappVerifyToken;
    if (!valid) return plainText(response, 403, "Vérification refusée.");
    return plainText(response, 200, requestUrl.searchParams.get("hub.challenge") || "");
  }

  if (request.method === "POST" && pathname === "/api/whatsapp/webhook") {
    if (!whatsappConfigured) return error(response, 503, "Le bot WhatsApp n’est pas configuré.");
    const rawBody = await readBodyBuffer(request, 256 * 1024);
    if (!verifyWhatsAppSignature(rawBody, request.headers["x-hub-signature-256"])) {
      return error(response, 401, "Signature WhatsApp invalide.");
    }
    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new Error("INVALID_JSON");
    }
    json(response, 200, { received: true });
    enqueueWhatsAppWebhook(payload);
    return;
  }

  if (request.method === "GET" && pathname === "/api/privacy") {
    json(response, 200, {
      controllerName: privacyConfig.controllerName,
      privacyEmail: privacyConfig.privacyEmail,
      hostingProvider: privacyConfig.hostingProvider,
      hostingCountry: privacyConfig.hostingCountry,
      noticeVersion: privacyNoticeVersion,
      reportRetentionDays,
      accountRetentionDays,
      sessionRetentionDays: Math.round(sessionDurationMs / 86400000),
      adminSessionHours: Math.round(adminSessionDurationMs / 3600000),
      abuseProtectionRetentionHours: 24,
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/legal") {
    const supportedStatuses = new Set(["non-professional", "professional"]);
    json(response, 200, {
      siteName: "Tunisie Power Watch",
      editorStatus: supportedStatuses.has(privacyConfig.editorStatus) ? privacyConfig.editorStatus : "unconfigured",
      editorName: privacyConfig.editorName,
      editorAddress: privacyConfig.editorAddress,
      editorPhone: privacyConfig.editorPhone,
      editorRegistration: privacyConfig.editorRegistration,
      editorLegalForm: privacyConfig.editorLegalForm,
      editorCapital: privacyConfig.editorCapital,
      publicationDirector: privacyConfig.publicationDirector,
      contactEmail: privacyConfig.privacyEmail,
      hostingProvider: privacyConfig.hostingProvider,
      hostingAddress: privacyConfig.hostingAddress,
      hostingPhone: privacyConfig.hostingPhone,
      hostingCountry: privacyConfig.hostingCountry,
      contentStorageProvider: privacyConfig.contentStorageProvider,
      contentStorageAddress: privacyConfig.contentStorageAddress,
      noticeVersion: legalNoticeVersion,
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/bootstrap") {
    const cooldownUntil = activeReportCooldownUntil(request, session.user, clientAddress);
    json(response, 200, sharedState(session.user, cooldownUntil));
    return;
  }

  if (request.method === "GET" && pathname === "/api/public/dashboard") {
    json(response, 200, publicDashboard());
    return;
  }

  if (request.method === "GET" && pathname === "/api/stats") {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const zoneId = String(requestUrl.searchParams.get("zoneId") || "");
    const requestedDays = Number(requestUrl.searchParams.get("days") || 7);
    const days = requestedDays === 30 ? 30 : 7;
    if (!zoneDirectory.has(zoneId)) return error(response, 400, "Zone inconnue.");
    json(response, 200, computeZoneStats(zoneId, days));
    return;
  }

  const voteMatch = pathname.match(/^\/api\/zones\/([^/]+)\/vote$/);
  if (request.method === "POST" && voteMatch) {
    if (!session.user) return error(response, 401, "Connectez-vous pour confirmer l’état d’une zone.");
    if (!acceptedCurrentTerms(session.user)) return error(response, 428, "Reconnectez-vous et acceptez les CGU à jour avant de contribuer.");
    const adminVeto = isAdminUser(session.user);
    if (!adminVeto && isPersistentlyRateLimited("vote-account", session.user.id, 30, 60 * 60 * 1000)) return error(response, 429, "Trop de confirmations rapprochées.");
    const zoneId = decodeURIComponent(voteMatch[1]);
    const zoneDetails = zoneDirectory.get(zoneId);
    if (!zoneDetails) return error(response, 400, "Zone inconnue.");
    const body = await readJson(request);
    const choice = String(body.choice || "");
    if (!allowedVoteChoices.has(choice)) return error(response, 400, "Confirmation invalide.");
    queries.upsertVote.run(session.user.id, zoneId, choice);

    if (adminVeto) {
      const authoritativeStatus = choice === "resolved" ? "resolved" : "confirmed";
      const result = queries.insertReport.run(
        session.user.id,
        zoneId,
        zoneDetails.city,
        zoneDetails.governorate,
        authoritativeStatus,
        "",
        100,
        1,
      );
      queries.deleteZoneVerification.run(zoneId);
      const report = queries.reportById.get(Number(result.lastInsertRowid));
      const publicZone = zoneSummaries(null).find((entry) => entry.id === zoneId)
        || { id: zoneId, reports: 0, trust: 100, status: authoritativeStatus, confirmations: 0, resolutions: 0 };
      delete publicZone.myVote;
      const event = {
        type: "report",
        reportId: Number(report.id),
        zone: publicZone,
        feedItem: feedItem(report),
      };
      broadcast(event);
      void notifyZoneSubscribers(zoneDetails, report, session.user.id);
      const zone = zoneSummaries(session.user).find((entry) => entry.id === zoneId) || publicZone;
      json(response, 201, { zone, event, authoritative: true });
      return;
    }

    const zone = zoneSummaries(session.user).find((entry) => entry.id === zoneId);
    broadcast({ type: "refresh" });
    json(response, 200, { zone });
    return;
  }

  if (request.method === "POST" && pathname === "/api/content-flags") {
    if (!session.user) return error(response, 401, "Connectez-vous pour signaler un contenu.");
    if (!acceptedCurrentTerms(session.user)) return error(response, 428, "Reconnectez-vous et acceptez les CGU à jour avant de contribuer.");
    if (isPersistentlyRateLimited("flag-account", session.user.id, 15, 24 * 60 * 60 * 1000)) return error(response, 429, "Limite quotidienne de signalements atteinte.");
    const body = await readJson(request);
    const reportId = Number(body.reportId);
    const reason = String(body.reason || "").trim().slice(0, 160);
    if (!Number.isInteger(reportId) || !queries.reportForFlag.get(reportId)) return error(response, 404, "Signalement introuvable.");
    if (reason.length < 3) return error(response, 400, "Indiquez brièvement la raison.");
    queries.insertFlag.run(reportId, session.user.id, reason);
    json(response, 201, { ok: true });
    return;
  }

  if (request.method === "POST" && pathname === "/api/push/subscriptions") {
    if (!session.user) return error(response, 401, "Connectez-vous pour activer les notifications.");
    if (!acceptedCurrentTerms(session.user)) return error(response, 428, "Reconnectez-vous et acceptez les CGU à jour avant d’activer ce service.");
    if (!pushConfigured) return error(response, 503, "Les notifications Web Push ne sont pas encore configurées par l’administrateur.");
    if (isPersistentlyRateLimited("push-account", session.user.id, 20, 60 * 60 * 1000)) return error(response, 429, "Trop de modifications de notifications rapprochées.");
    const body = await readJson(request);
    const subscription = body.subscription || {};
    const endpoint = String(subscription.endpoint || "").trim();
    const p256dh = String(subscription.keys?.p256dh || "").trim();
    const auth = String(subscription.keys?.auth || "").trim();
    const zoneId = String(body.zoneId || "");
    if (!zoneDirectory.has(zoneId)) return error(response, 400, "Zone inconnue.");
    if (!validPushEndpoint(endpoint) || endpoint.length > 2048 || !p256dh || p256dh.length > 512 || !auth || auth.length > 512) {
      return error(response, 400, "Abonnement de notification invalide.");
    }
    const existingSubscription = queries.pushSubscriptionOwner.get(endpoint);
    if (existingSubscription && Number(existingSubscription.user_id) !== Number(session.user.id)) {
      return error(response, 409, "Cet abonnement Push appartient déjà à un autre compte.");
    }
    if (Number(queries.pushCountByUser.get(session.user.id).count) >= 10 && !existingSubscription) {
      return error(response, 429, "Un compte ne peut pas enregistrer plus de dix appareils de notification.");
    }
    queries.upsertPushSubscription.run(session.user.id, endpoint, p256dh, auth, zoneId);
    json(response, 201, { ok: true, zoneId });
    return;
  }

  if (request.method === "DELETE" && pathname === "/api/push/subscriptions") {
    if (!session.user) return error(response, 401, "Connectez-vous pour modifier les notifications.");
    const body = await readJson(request);
    queries.deletePushSubscription.run(String(body.endpoint || ""), session.user.id);
    json(response, 200, { ok: true });
    return;
  }

  if (pathname.startsWith("/api/admin/")) {
    if (!session.user) return error(response, 401, "Connexion requise.");
    if (!isAdminUser(session.user)) return error(response, 403, "Accès réservé à l’administrateur.");

    if (request.method === "GET" && pathname === "/api/admin/moderation") {
      json(response, 200, { reports: queries.adminReports.all(), flags: queries.adminFlags.all() });
      return;
    }

    const adminReportMatch = pathname.match(/^\/api\/admin\/reports\/(\d+)$/);
    if (request.method === "DELETE" && adminReportMatch) {
      const reportId = Number(adminReportMatch[1]);
      queries.deleteReport.run(reportId);
      queries.insertModerationAction.run(session.user.id, "delete", "report", String(reportId), "");
      broadcast({ type: "refresh" });
      json(response, 200, { ok: true });
      return;
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/block$/);
    if (request.method === "POST" && adminUserMatch) {
      const userId = Number(adminUserMatch[1]);
      if (userId === Number(session.user.id)) return error(response, 400, "Vous ne pouvez pas bloquer votre propre compte administrateur.");
      const body = await readJson(request);
      const blocked = body.blocked === true;
      queries.setUserBlocked.run(blocked ? 1 : 0, userId);
      if (blocked) queries.deleteSessionsByUser.run(userId);
      queries.insertModerationAction.run(session.user.id, blocked ? "block" : "unblock", "user", String(userId), "");
      json(response, 200, { ok: true, blocked });
      return;
    }

    const adminFlagMatch = pathname.match(/^\/api\/admin\/flags\/(\d+)\/resolve$/);
    if (request.method === "POST" && adminFlagMatch) {
      const flagId = Number(adminFlagMatch[1]);
      queries.resolveFlag.run(flagId);
      queries.insertModerationAction.run(session.user.id, "resolve", "flag", String(flagId), "");
      json(response, 200, { ok: true });
      return;
    }

    return error(response, 404, "Route d’administration introuvable.");
  }

  if (request.method === "POST" && pathname === "/api/register") {
    if (session.user) return error(response, 409, "Vous êtes déjà connecté.");
    if (isPersistentlyRateLimited("register-network", clientAddress, 8, 60 * 60 * 1000)) return error(response, 429, "Trop de créations de compte. Réessayez plus tard.");
    const body = await readJson(request);
    const name = normalizedPublicName(body.name);
    const email = normalizedEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const confirmation = typeof body.passwordConfirmation === "string" ? body.passwordConfirmation : "";
    if (body.privacyAcknowledged !== true) return error(response, 400, "Vous devez confirmer avoir lu la politique de confidentialité.");
    if (body.termsAcknowledged !== true) return error(response, 400, "Vous devez accepter les conditions générales d'utilisation.");
    if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) return error(response, 400, "Le nom public doit contenir entre 2 et 80 caractères.");
    if (!validEmail(email)) return error(response, 400, "Adresse email invalide.");
    if (!validPassword(password)) return error(response, 400, "Le mot de passe doit contenir entre 12 et 128 caractères.");
    if (password !== confirmation) return error(response, 400, "Les deux mots de passe ne correspondent pas.");
    if (isPersistentlyRateLimited("register-email", email, 3, 60 * 60 * 1000)) return error(response, 429, "Trop de tentatives pour ce compte. Réessayez plus tard.");

    const protectedEmail = protectedEmailFields(email);
    if (!await verifyAltchaPayload(body.captcha)) return error(response, 400, "La vérification anti-robot ALTCHA est absente, expirée ou déjà utilisée.");
    if (adminLocalEmailHashes.has(protectedEmail.lookupHash)) {
      return error(response, 409, "Ce compte ne peut pas être créé. Connectez-vous ou utilisez une autre adresse.");
    }
    const passwordHash = await hashPassword(password);
    if (queries.userByEmail.get(protectedEmail.lookupHash)) return error(response, 409, "Ce compte ne peut pas être créé. Connectez-vous ou utilisez une autre adresse.");
    let user;
    try {
      const result = queries.insertPasswordUser.run(name, protectedEmail.encrypted, protectedEmail.lookupHash, passwordHash, privacyNoticeVersion, termsVersion);
      user = queries.userById.get(Number(result.lastInsertRowid));
    } catch (caught) {
      if (String(caught.message).includes("UNIQUE")) return error(response, 409, "Ce compte ne peut pas être créé. Connectez-vous ou utilisez une autre adresse.");
      throw caught;
    }
    const token = createSession(Number(user.id));
    json(response, 201, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(token, sessionDurationMs / 1000) });
    return;
  }

  if (request.method === "POST" && pathname === "/api/login") {
    if (session.user) return error(response, 409, "Vous êtes déjà connecté.");
    const body = await readJson(request);
    const email = normalizedEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (body.termsAcknowledged !== true) return error(response, 400, "Vous devez accepter les conditions générales d'utilisation.");
    const accountKey = hashToken(email || "invalid-email");
    const ipLimited = isPersistentlyRateLimited("login-network", clientAddress, 25, 15 * 60 * 1000);
    const accountLimited = isPersistentlyRateLimited("login-account", accountKey, 10, 15 * 60 * 1000);
    if (ipLimited || accountLimited) return error(response, 429, "Trop de tentatives de connexion. Réessayez plus tard.");

    const user = validEmail(email) ? queries.userByEmail.get(emailLookupHash(email)) : null;
    const passwordAccount = user?.auth_provider === "password";
    const storedHash = passwordAccount ? user.password_hash : await dummyPasswordHash();
    const candidatePassword = validPassword(password) ? password : "mot-de-passe-invalide";
    const passwordMatches = await verifyPassword(candidatePassword, storedHash);
    if (!passwordAccount || !passwordMatches || !validPassword(password) || user.is_blocked) {
      return error(response, 401, "Email ou mot de passe incorrect.");
    }

    const adminLogin = isAdminUser(user);
    if (!modernPasswordHash(user.password_hash)) queries.updatePasswordHash.run(await hashPassword(password), user.id);
    queries.updatePasswordLogin.run(termsVersion, user.id);
    const refreshedUser = queries.userById.get(user.id);
    const token = createSession(Number(user.id), { admin: adminLogin });
    const duration = adminLogin ? adminSessionDurationMs : sessionDurationMs;
    json(response, 200, { user: publicUser(refreshedUser) }, { "Set-Cookie": sessionCookie(token, duration / 1000) });
    return;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    if (session.tokenHash) queries.deleteSession.run(session.tokenHash);
    json(response, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
    return;
  }

  if (request.method === "GET" && pathname === "/api/account/export") {
    if (!session.user) return error(response, 401, "Connectez-vous pour exporter vos données.");
    json(response, 200, {
      exportedAt: new Date().toISOString(),
      privacyNoticeVersion,
      termsVersion,
      account: exportedAccount(session.user.id),
      reports: queries.exportReports.all(session.user.id),
      confirmations: queries.exportVotes.all(session.user.id),
      contentReports: queries.exportFlags.all(session.user.id),
      notificationSubscriptions: queries.exportPushSubscriptions.all(session.user.id),
    }, { "Content-Disposition": `attachment; filename="tunisie-power-watch-donnees-${session.user.id}.json"` });
    return;
  }

  if (request.method === "DELETE" && pathname === "/api/account") {
    if (!session.user) return error(response, 401, "Connectez-vous pour supprimer votre compte.");
    if (isPersistentlyRateLimited("delete-account", session.user.id, 5, 15 * 60 * 1000)) return error(response, 429, "Trop de tentatives. Réessayez plus tard.");
    const body = await readJson(request);
    if (String(body.confirmation || "").trim().toUpperCase() !== "SUPPRIMER") return error(response, 400, "Saisissez SUPPRIMER pour confirmer.");
    const account = queries.userById.get(session.user.id);
    const password = typeof body.password === "string" ? body.password : "";
    if (!account || account.auth_provider !== "password" || !validPassword(password) || !await verifyPassword(password, account.password_hash)) {
      return error(response, 401, "Mot de passe incorrect.");
    }
    queries.deleteUser.run(session.user.id);
    broadcast({ type: "refresh" });
    json(response, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
    return;
  }

  if (request.method === "POST" && pathname === "/api/reports") {
    const adminVeto = isAdminUser(session.user);
    const cooldownExempt = adminVeto;
    const cooldownMs = reportCooldownDuration(session.user);
    const existingCooldown = activeReportCooldownUntil(request, session.user, clientAddress);
    if (existingCooldown) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existingCooldown - Date.now()) / 1000));
      return json(response, 429, { error: `Réessayez dans ${Math.ceil(retryAfterSeconds / 60)} minute(s).`, retryAfterSeconds }, { "Retry-After": retryAfterSeconds });
    }
    const body = await readJson(request);
    const zoneId = String(body.zoneId || "");
    const requestedStatus = String(body.status || "");
    const status = adminVeto && requestedStatus !== "resolved" ? "confirmed" : requestedStatus;
    const note = String(body.note || "").trim().slice(0, 500);
    const zone = zoneDirectory.get(zoneId);
    if (!zone) return error(response, 400, "Zone inconnue.");
    if (!allowedStatuses.has(requestedStatus)) return error(response, 400, "Statut invalide.");
    if (body.termsAccepted !== true) return error(response, 400, "Confirmez les règles de contribution avant d’envoyer le signalement.");
    if (/@/.test(note) || /\+?\d[\d\s.()-]{7,}/.test(note)) return error(response, 400, "Ne saisissez pas d'email, de téléphone ou d'autre donnée personnelle dans la note.");
    if (!await verifyAltchaPayload(body.captcha)) return error(response, 400, "La vérification anti-robot ALTCHA est absente, expirée ou déjà utilisée.");
    const cooldownScope = session.user ? "report-account" : "report-network";
    const cooldownIdentity = session.user ? session.user.id : clientAddress;
    if (!cooldownExempt && isPersistentlyRateLimited(cooldownScope, cooldownIdentity, 1, cooldownMs)) {
      const retryAfterSeconds = Math.max(1, Math.ceil((persistentRateLimitUntil(cooldownScope, cooldownIdentity) - Date.now()) / 1000));
      return json(response, 429, { error: `Réessayez dans ${Math.ceil(retryAfterSeconds / 60)} minute(s).`, retryAfterSeconds }, { "Retry-After": retryAfterSeconds });
    }

    const noteBonus = Math.min(12, Math.floor(note.length / 8));
    const reporter = adminVeto ? session.user : anonymousReporter;
    const trust = adminVeto ? 100 : Math.min(76, Number(anonymousReporter.reputation) + noteBonus);
    const result = queries.insertReport.run(reporter.id, zoneId, zone.city, zone.governorate, status, note, trust, adminVeto ? 1 : 0);
    if (adminVeto) queries.deleteZoneVerification.run(zoneId);
    const report = queries.reportById.get(Number(result.lastInsertRowid));
    const summary = zoneSummaries(null).find((entry) => entry.id === zoneId) || { id: zoneId, reports: 0, trust: 0, status: "resolved", confirmations: 0, resolutions: 0 };
    delete summary.myVote;
    const event = {
      type: "report",
      reportId: Number(report.id),
      zone: summary,
      feedItem: feedItem(report),
    };
    broadcast(event);
    const cooldownUntil = cooldownExempt ? 0 : persistentRateLimitUntil(cooldownScope, cooldownIdentity);
    const cooldownHeaders = !session.user && !cooldownExempt ? { "Set-Cookie": reportCooldownCookie(cooldownUntil) } : {};
    json(response, 201, { ...event, cooldownMs, cooldownUntil, cooldownExempt }, cooldownHeaders);
    void notifyZoneSubscribers(zone, report, reporter.id);
    return;
  }

  error(response, 404, "Route API introuvable.");
}

function cleanExpiredData() {
  const now = Date.now();
  queries.deleteExpiredSessions.run(now);
  queries.deleteExpiredReports.run(`-${reportRetentionDays} days`);
  queries.deleteInactiveUsers.run(`-${accountRetentionDays} days`);
  queries.deleteExpiredWhatsAppConversations.run(now);
  queries.deleteOldWhatsAppReceipts.run();
  queries.deleteExpiredAbuseLimits.run(now);
  cleanUsedAltchaChallenges(now);
}

function isCrossSiteMutation(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return true;
  const suppliedOrigin = String(request.headers.origin || "").trim();
  if (!suppliedOrigin || suppliedOrigin === "null") return false;
  let normalizedOrigin;
  try {
    normalizedOrigin = new URL(suppliedOrigin).origin;
  } catch {
    return true;
  }
  const allowedOrigins = new Set();
  if (publicBaseUrl) {
    try { allowedOrigins.add(new URL(publicBaseUrl).origin); } catch {}
  }
  const host = String(request.headers.host || "").trim();
  if (/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(host)) {
    allowedOrigins.add(`http://${host}`);
    allowedOrigins.add(`https://${host}`);
  }
  return !allowedOrigins.has(normalizedOrigin);
}

cleanExpiredData();
setInterval(cleanExpiredData, 24 * 60 * 60 * 1000).unref();

const server = createServer(async (request, response) => {
  try {
    if (!request.url || request.url.length > 8192) return error(response, 414, "Adresse de requête trop longue.");
    const url = new URL(request.url, "http://localhost");
    if (isCrossSiteMutation(request) && url.pathname !== "/api/whatsapp/webhook") return error(response, 403, "Requête externe refusée.");
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
    } else {
      serveStatic(request, response, url.pathname);
    }
  } catch (caught) {
    console.error(caught);
    if (caught.message === "PAYLOAD_TOO_LARGE") return error(response, 413, "Requête trop volumineuse.");
    if (caught.message === "INVALID_JSON") return error(response, 400, "Corps JSON invalide.");
    if (!response.headersSent) error(response, 500, "Erreur interne du serveur.");
  }
});

server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 100;

webSocketServer = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 1024,
  perMessageDeflate: false,
  verifyClient: ({ req, origin }, done) => {
    const originAllowed = origin
      ? !isCrossSiteMutation({ ...req, method: "POST", headers: { ...req.headers, origin, "sec-fetch-site": req.headers["sec-fetch-site"] } })
      : !securePublicDeployment;
    if (!originAllowed || webSocketServer?.clients.size >= maxWebSocketClients) return done(false, 403, "Connexion temps réel refusée");
    done(true);
  },
});
webSocketServer.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "ready" }));
  socket.on("message", () => socket.close(1008, "Canal en lecture seule"));
});
setInterval(() => broadcast({ type: "refresh", reason: "zone-freshness" }), 60 * 1000).unref();
webSocketServer.on("error", (caught) => {
  if (caught.code === "EADDRINUSE") {
    console.error(`Le port ${port} est déjà utilisé. Une autre instance du serveur est probablement ouverte.`);
    console.error("Fermez l'ancien terminal avec Ctrl+C, puis relancez npm start.");
  } else {
    console.error("Le serveur WebSocket n'a pas pu démarrer:", caught);
  }
  process.exitCode = 1;
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Tunisie Power Watch: http://${listenHost}:${port}/`);
  console.log(`Base de données: ${join(dataDirectory, "power-watch.db")}`);
  console.log(`Emails: AES-256-GCM actif · clé: ${emailKeyMaterial.source}${migratedEmailCount ? ` · ${migratedEmailCount} compte(s) migré(s)` : ""}`);
  console.log(`Bot WhatsApp: ${whatsappConfigured ? "configuré" : "désactivé (variables WHATSAPP_* manquantes)"}`);
});

function shutdown() {
  webSocketServer.close();
  server.close(() => {
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();
    } finally {
      process.exit(0);
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
