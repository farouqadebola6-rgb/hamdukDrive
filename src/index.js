import "dotenv/config";
import express from "express";
import { createWhatsAppClient, getSocket, waitForReady } from "./whatsapp.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET;

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!API_SECRET) return res.status(500).json({ error: "API_SECRET not set" });
  const bearer = req.headers["authorization"]?.replace("Bearer ", "").trim();
  const apiKey = req.headers["x-api-key"];
  if (bearer !== API_SECRET && apiKey !== API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── Shared send logic ─────────────────────────────────────────────────────────
async function sendToGroup(jid, text) {
  await waitForReady(10000); // wait up to 10s for session to be stable
  const sock = getSocket();
  if (!sock) throw new Error("No socket");
  await sock.sendMessage(jid, { text });
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  const sock = getSocket();
  res.json({ status: "ok", whatsapp: sock ? "connected" : "disconnected" });
});

// ── ROOT POST — Lovable calls POST / with { jid, text } ───────────────────────
app.post("/", requireAuth, async (req, res) => {
  const { jid, text } = req.body;
  if (!jid || !text) return res.status(400).json({ error: "jid and text are required" });

  try {
    await sendToGroup(jid, text);
    console.log(`[dispatch] ✅ Sent to ${jid}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[dispatch] Failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /send-message ─────────────────────────────────────────────────────────────
app.post("/send-message", requireAuth, async (req, res) => {
  const { jid, text } = req.body;
  if (!jid || !text) return res.status(400).json({ error: "jid and text are required" });

  try {
    await sendToGroup(jid, text);
    console.log(`[dispatch] ✅ Sent to ${jid}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[dispatch] Failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Hamduk Drive WhatsApp dispatch running on port ${PORT}`);
});

createWhatsAppClient();
