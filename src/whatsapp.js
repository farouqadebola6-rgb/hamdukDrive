import Baileys from "@whiskeysockets/baileys";
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = Baileys;

import { Boom } from "@hapi/boom";
import pino from "pino";
import qrTerminal from "qrcode-terminal";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = join(__dirname, "../auth/session");

const logger = pino({ level: "silent" });

let sock = null;
let isReady = false; // true only after connection is fully stable

export function getSocket() {
  return sock;
}

export function isSocketReady() {
  return isReady;
}

// Wait up to 10s for socket to be ready, checking every 500ms
export async function waitForReady(timeoutMs = 10000) {
  const start = Date.now();
  while (!isReady) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("WhatsApp socket not ready after timeout");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function createWhatsAppClient() {
  isReady = false;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`[whatsapp] Baileys version: ${version.join(".")}`);

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: ["Hamduk Drive", "Chrome", "1.0.0"],
    connectTimeoutMs: 60_000,
    retryRequestDelayMs: 2000,
  });

  // ── QR + connection ────────────────────────────────────────────────────────
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n[whatsapp] Scan this QR code with your WhatsApp:\n");
      qrTerminal.generate(qr, { small: true });
      console.log("\n[whatsapp] Waiting for scan...\n");
    }

    if (connection === "close") {
      isReady = false;
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `[whatsapp] Connection closed — reason: ${statusCode} | reconnecting: ${shouldReconnect}`
      );

      if (shouldReconnect) {
        console.log("[whatsapp] Reconnecting in 5s...");
        setTimeout(createWhatsAppClient, 5000);
      } else {
        console.log("[whatsapp] Logged out. Delete auth/session and restart to re-scan.");
        sock = null;
      }
    }

    if (connection === "open") {
      // Small delay to let the session fully settle before marking ready
      setTimeout(() => {
        isReady = true;
        console.log("[whatsapp] ✅ Connected and ready to dispatch!");
        console.log("─────────────────────────────────────────────────");
        console.log("[whatsapp] Send any message in your driver WhatsApp");
        console.log("[whatsapp] group and the Group ID will print below:");
        console.log("─────────────────────────────────────────────────");
      }, 3000);
    }
  });

  // ── Group ID finder ────────────────────────────────────────────────────────
  sock.ev.on("messages.upsert", ({ messages }) => {
    messages.forEach((m) => {
      const jid = m.key.remoteJid;
      if (jid?.endsWith("@g.us")) {
        console.log("\n✅ FOUND YOUR GROUP ID — copy this into Render env vars:");
        console.log(`   WHATSAPP_GROUP_ID=${jid}\n`);
      }
    });
  });

  // ── Save credentials ───────────────────────────────────────────────────────
  sock.ev.on("creds.update", saveCreds);

  return sock;
}
