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

const logger = pino({ level: "silent" }); // suppress Baileys noise

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
    printQRInTerminal: false, // we handle QR ourselves below
    browser: ["Hamduk Drive", "Chrome", "1.0.0"],
    connectTimeoutMs: 60_000,
    retryRequestDelayMs: 2000,
  });

  // ── QR code ────────────────────────────────────────────────────────────────
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
    }
  });

  // ── Save credentials on update ─────────────────────────────────────────────
  sock.ev.on("creds.update", saveCreds);

  return sock;
}
