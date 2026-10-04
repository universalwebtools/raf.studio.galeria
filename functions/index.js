const { onValueCreated } = require("firebase-functions/v2/database");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const DATABASE_INSTANCE = "rafstudiogaleria-default-rtdb";
const TOKEN_PATH = "galleries/__system__/adminPushTokens";

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
