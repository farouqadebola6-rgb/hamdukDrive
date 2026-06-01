import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrTerminal from "qrcode-terminal";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = join(__dirname, "../auth/session");

const logger = pino({ level: "silent" });

let sock = null;

export function getSocket() {
  return sock;
}

export async function createWhatsAppClient() {
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

  // ── QR code + connection events ────────────────────────────────────────────
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n[whatsapp] Scan this QR code with your WhatsApp:\n");
      qrTerminal.generate(qr, { small: true });
      console.log("\n[whatsapp] Waiting for scan...\n");
    }

    if (connection === "close") {
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
      console.log("[whatsapp] ✅ Connected! Ready to dispatch ride alerts.");
      console.log("─────────────────────────────────────────────────");
      console.log("[whatsapp] Send any message in your driver WhatsApp");
      console.log("[whatsapp] group and the Group ID will print below:");
      console.log("─────────────────────────────────────────────────");
    }
  });

  // ── GROUP ID FINDER ────────────────────────────────────────────────────────
  // After connecting, send any message in your driver group.
  // The Group ID will be printed here. Copy it into your .env as WHATSAPP_GROUP_ID
  sock.ev.on("messages.upsert", ({ messages }) => {
    messages.forEach((m) => {
      const jid = m.key.remoteJid;
      if (jid?.endsWith("@g.us")) {
        console.log("\n✅ FOUND YOUR GROUP ID — copy this into .env:");
        console.log(`   WHATSAPP_GROUP_ID=${jid}`);
        console.log("   (you can also set this in Render env vars)\n");
      }
    });
  });

  // ── Save credentials ───────────────────────────────────────────────────────
  sock.ev.on("creds.update", saveCreds);

  return sock;
}
