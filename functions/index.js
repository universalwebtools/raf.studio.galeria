const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { promisify } = require("node:util");
const { onValueCreated } = require("firebase-functions/v2/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage } = require("firebase-admin/storage");

const scrypt = promisify(crypto.scrypt);
const ADMIN_UID = "NLYAfU5UNcfldH4k2x2r9m1g4Vx1";

initializeApp();

const DATABASE_INSTANCE = "rafstudiogaleria-default-rtdb";
const TOKEN_PATH = "galleries/__system__/adminPushTokens";

// ---------------------------------------------------------------------------
// Dostęp klienta do galerii.
//
// Hasło jest sprawdzane wyłącznie tutaj, po stronie serwera. Po poprawnym
// haśle funkcja:
//   - zapisuje access/{uid}/{slug} (z tego korzystają reguły Realtime Database),
//   - dopisuje slug do custom claim "g" (z tego korzystają reguły Storage).
// Bez tego klient nie odczyta ani manifestu zdjęć, ani plików.
// ---------------------------------------------------------------------------

const ACCESS_PATH = "access";
const ATTEMPTS_PATH = "unlockAttempts";
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_DEVICE = 10;   // na jedno anonimowe konto / galerię / 15 min
const MAX_ATTEMPTS_PER_GALLERY = 60;  // łącznie na galerię / 15 min (chroni przed zmianą konta)
const CLAIM_MAX_BYTES = 800;          // limit Firebase to 1000 B na wszystkie claims

function cleanSlug(value) {
  const slug = String(value ?? "").trim();
  if (!slug || slug.length > 150) return "";
  if (/[.#$[\]/]/.test(slug)) return "";
  if (slug.startsWith("__system__")) return "";
  return slug;
}

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  // Data w formacie YYYY-MM-DD — dostęp do końca tego dnia czasu polskiego.
  const end = new Date(`${expiresAt}T23:59:59+01:00`);
  return Number.isFinite(end.getTime()) && end.getTime() < Date.now();
}

async function readGalleryFields(db, slug, fields) {
  const base = `galleries/${slug}/public`;
  const values = await Promise.all(fields.map((field) => db.ref(`${base}/${field}`).get()));
  const out = {};
  fields.forEach((field, index) => { out[field] = values[index].val(); });
  return out;
}

// Hasła galerii: scrypt z losową solą, przechowywany w galleries/{slug}/secret
// (czytelny tylko dla administratora). Format: scrypt$N$r$p$sól$skrót (base64).
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

async function scryptHash(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function scryptMatches(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Zapisuje nowe hasło i usuwa stare skróty SHA-256 z części publicznej.
async function storePassword(db, slug, password) {
  const hash = await scryptHash(password);
  await db.ref(`galleries/${slug}/secret/passwordScrypt`).set(hash);
  await db.ref(`galleries/${slug}/public`).update({
    passwordHash: null,
    passwordHashTrimmed: null,
    password: null,
    passwordSet: true,
    passwordVersion: 3
  });
}

function passwordMatches(entered, stored) {
  const raw = String(entered ?? "");
  const trimmed = raw.trim();
  const trimmedHash = sha256Hex(trimmed);

  if (stored.passwordHashTrimmed && safeEqual(trimmedHash, stored.passwordHashTrimmed)) return true;
  if (stored.passwordHash) {
    if (safeEqual(trimmedHash, stored.passwordHash)) return true;
    if (raw !== trimmed && safeEqual(sha256Hex(raw), stored.passwordHash)) return true;
  }
  if (typeof stored.password === "string") {
    return safeEqual(raw, stored.password) || safeEqual(trimmed, stored.password.trim());
  }
  return false;
}

async function consumeAttempt(ref, limit) {
  const now = Date.now();
  let allowed = true;
  await ref.transaction((current) => {
    const row = current && now - Number(current.windowStart || 0) < ATTEMPT_WINDOW_MS
      ? current
      : { windowStart: now, count: 0 };
    if (row.count >= limit) {
      allowed = false;
      return row;
    }
    allowed = true;
    return { windowStart: row.windowStart, count: row.count + 1 };
  });
  return allowed;
}

async function grantStorageClaim(uid, slug) {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims || {}) };
  let list = Array.isArray(claims.g) ? claims.g.filter((item) => item !== slug) : [];
  list.push(slug);
  // Najstarsze galerie wypadają pierwsze, żeby zmieścić się w limicie claims.
  while (list.length > 1 && JSON.stringify({ ...claims, g: list }).length > CLAIM_MAX_BYTES) {
    list.shift();
  }
  claims.g = list;
  await auth.setCustomUserClaims(uid, claims);
}

exports.galleryAccess = onCall(
  {
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 10
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Brak sesji. Odśwież stronę.");

    const action = String(request.data?.action || "");
    const slug = cleanSlug(request.data?.slug);
    if (!slug) throw new HttpsError("invalid-argument", "Nieprawidłowy identyfikator galerii.");

    const db = getDatabase();
    const meta = await readGalleryFields(db, slug, ["title", "active", "expiresAt", "trashedAt"]);
    const exists = meta.title !== null || meta.active !== null || meta.expiresAt !== null;

    if (!exists || meta.trashedAt) return { status: "not-found" };
    if (meta.active === false) return { status: "inactive" };
    if (isExpired(meta.expiresAt)) return { status: "expired" };

    // Informacje do ekranu logowania — bez zdjęć i bez hasła.
    if (action === "info") {
      return { status: "ok", title: String(meta.title || "") };
    }

    if (action !== "unlock") throw new HttpsError("invalid-argument", "Nieznana akcja.");

    const password = request.data?.password;
    if (typeof password !== "string" || !password.trim() || password.length > 200) {
      return { status: "wrong-password" };
    }

    const deviceOk = await consumeAttempt(db.ref(`${ATTEMPTS_PATH}/${slug}/devices/${uid}`), MAX_ATTEMPTS_PER_DEVICE);
    const galleryOk = deviceOk && await consumeAttempt(db.ref(`${ATTEMPTS_PATH}/${slug}/total`), MAX_ATTEMPTS_PER_GALLERY);
    if (!deviceOk || !galleryOk) return { status: "rate-limited" };

    const secret = (await db.ref(`galleries/${slug}/secret/passwordScrypt`).get()).val();
    if (secret) {
      if (!(await scryptMatches(password.trim(), secret))) return { status: "wrong-password" };
    } else {
      // Starsze galerie: skrót SHA-256. Po poprawnym haśle przenosimy je na scrypt.
      const stored = await readGalleryFields(db, slug, ["passwordHash", "passwordHashTrimmed", "password"]);
      if (!passwordMatches(password, stored)) return { status: "wrong-password" };
      await storePassword(db, slug, password.trim()).catch(error => console.warn("PASSWORD MIGRATION", slug, error));
    }

    await Promise.all([
      db.ref(`${ACCESS_PATH}/${uid}/${slug}`).set(Date.now()),
      db.ref(`${ATTEMPTS_PATH}/${slug}/devices/${uid}`).remove(),
      grantStorageClaim(uid, slug)
    ]);

    return { status: "ok", title: String(meta.title || "") };
  }
);

// Panel administratora ustawia hasło galerii przez serwer — przeglądarka nie
// liczy ani nie zapisuje żadnego skrótu hasła.
exports.setGalleryPassword = onCall(
  { region: "europe-west1", timeoutSeconds: 30, memory: "256MiB", maxInstances: 5 },
  async (request) => {
    if (request.auth?.uid !== ADMIN_UID) throw new HttpsError("permission-denied", "Tylko administrator.");
    const slug = cleanSlug(request.data?.slug);
    const password = String(request.data?.password ?? "").trim();
    if (!slug) throw new HttpsError("invalid-argument", "Nieprawidłowy identyfikator galerii.");
    if (password.length < 4 || password.length > 200) throw new HttpsError("invalid-argument", "Hasło musi mieć od 4 do 200 znaków.");
    const db = getDatabase();
    const exists = (await db.ref(`galleries/${slug}/public/title`).get()).exists();
    if (!exists) throw new HttpsError("not-found", "Nie ma takiej galerii.");
    await storePassword(db, slug, password);
    return { status: "ok" };
  }
);

// ---------------------------------------------------------------------------
// Codzienna kopia zapasowa całej bazy do Storage: backups/db-RRRR-MM-DD.json.gz
// Trzymamy 30 ostatnich kopii. Status ostatniej kopii widać w „Zdrowiu systemu”.
// ---------------------------------------------------------------------------
const BACKUP_PREFIX = "backups/db-";
const BACKUP_KEEP = 30;

exports.dailyBackup = onSchedule(
  { schedule: "every day 03:30", timeZone: "Europe/Warsaw", region: "europe-west1", memory: "512MiB", timeoutSeconds: 300 },
  async () => {
    const db = getDatabase();
    const data = (await db.ref("/").get()).val() || {};
    delete data.unlockAttempts; // dane tymczasowe
    const gz = await promisify(zlib.gzip)(Buffer.from(JSON.stringify(data)));
    const date = new Date().toISOString().slice(0, 10);
    const name = `${BACKUP_PREFIX}${date}.json.gz`;
    const bucket = getStorage().bucket();
    await bucket.file(name).save(gz, { contentType: "application/gzip", resumable: false, metadata: { cacheControl: "private, max-age=0" } });

    const [files] = await bucket.getFiles({ prefix: BACKUP_PREFIX });
    const sorted = files.map(file => file.name).sort();
    const toDelete = sorted.slice(0, Math.max(0, sorted.length - BACKUP_KEEP));
    await Promise.allSettled(toDelete.map(fileName => bucket.file(fileName).delete()));

    await db.ref("galleries/__system__/backupStatus").set({
      lastAt: Date.now(),
      file: name,
      bytes: gz.length,
      kept: sorted.length - toDelete.length
    });
    console.log(`BACKUP ${name}: ${gz.length} B, kopii: ${sorted.length - toDelete.length}`);
  }
);

exports.notifyAdminOnApproval = onValueCreated(
  {
    ref: "/approvals/{galleryId}/{approvalId}",
    instance: DATABASE_INSTANCE,
    region: "europe-west1",
    timeoutSeconds: 60,
    memory: "256MiB"
  },
  async (event) => {
    const approval = event.data?.val() || {};

    // Powiadamiamy tylko o zatwierdzeniu zdjęć do obróbki,
    // nie o osobnym zatwierdzeniu zdjęć do odrzucenia.
    if (approval.mode === "rejected") return;

    const selectedCount = Number(approval.selectedCount || 0);
    if (!selectedCount) return;

    const galleryId = String(event.params.galleryId || "");
    const approvalId = String(event.params.approvalId || "");
    const db = getDatabase();

    const [tokensSnap, titleSnap] = await Promise.all([
      db.ref(TOKEN_PATH).get(),
      db.ref(`galleries/${galleryId}/public/title`).get()
    ]);

    const rows = tokensSnap.val() || {};
    const devices = Object.entries(rows)
      .map(([key, value]) => ({ key, token: value?.token }))
      .filter((item) => typeof item.token === "string" && item.token.length > 20)
      .slice(0, 500);

    if (!devices.length) {
      console.log("Brak zarejestrowanych urządzeń administratora dla PUSH.");
      return;
    }

    const galleryTitle = String(titleSnap.val() || galleryId || "Galeria klienta");
    const title = "Nowy wybór klienta ✅";
    const body = `${galleryTitle}: klient zatwierdził ${selectedCount} zdjęć do obróbki.`;

    const result = await getMessaging().sendEachForMulticast({
      tokens: devices.map((item) => item.token),
      data: {
        title,
        body,
        galleryId,
        approvalId,
        selectedCount: String(selectedCount),
        tag: `raf-approval-${galleryId}`,
        url: `/admin.html?source=push&g=${encodeURIComponent(galleryId)}`
      },
      webpush: {
        headers: {
          Urgency: "high"
        }
      }
    });

    const invalidCodes = new Set([
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token"
    ]);

    const cleanup = [];
    result.responses.forEach((response, index) => {
      if (response.success) return;
      const code = response.error?.code || "";
      console.warn("PUSH error", devices[index]?.key, code, response.error?.message || "");
      if (invalidCodes.has(code) && devices[index]?.key) {
        cleanup.push(db.ref(`${TOKEN_PATH}/${devices[index].key}`).remove());
      }
    });

    if (cleanup.length) await Promise.allSettled(cleanup);

    console.log(`PUSH ${galleryTitle}: success=${result.successCount}, failed=${result.failureCount}`);
  }
);
