import "dotenv/config";
import express from "express";
import { createWhatsAppClient, getSocket } from "./whatsapp.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET;

// ── Auth middleware — supports both Bearer token AND x-api-key ───────────────
function requireAuth(req, res, next) {
  if (!API_SECRET) return res.status(500).json({ error: "API_SECRET not set" });

  const bearer = req.headers["authorization"]?.replace("Bearer ", "").trim();
  const apiKey = req.headers["x-api-key"];

  if (bearer !== API_SECRET && apiKey !== API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  const sock = getSocket();
  res.json({ status: "ok", whatsapp: sock ? "connected" : "disconnected" });
});

// ── ROOT POST — Lovable calls POST / with { jid, text } ──────────────────────
app.post("/", requireAuth, async (req, res) => {
  const sock = getSocket();
  if (!sock) return res.status(503).json({ error: "WhatsApp not connected" });

  const { jid, text } = req.body;
  if (!jid || !text) return res.status(400).json({ error: "jid and text are required" });

  try {
    await sock.sendMessage(jid, { text });
    console.log(`[dispatch] ✅ Message sent to ${jid}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[dispatch] Failed:", err.message);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ── /send-message (same thing, kept for manual use) ──────────────────────────
app.post("/send-message", requireAuth, async (req, res) => {
  const sock = getSocket();
  if (!sock) return res.status(503).json({ error: "WhatsApp not connected" });

  const { jid, text } = req.body;
  if (!jid || !text) return res.status(400).json({ error: "jid and text are required" });

  try {
    await sock.sendMessage(jid, { text });
    console.log(`[dispatch] ✅ Message sent to ${jid}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[dispatch] Failed:", err.message);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ── /send-ride-alert (manual formatted alert) ────────────────────────────────
app.post("/send-ride-alert", requireAuth, async (req, res) => {
  const sock = getSocket();
  if (!sock) return res.status(503).json({ error: "WhatsApp not connected" });

  const { groupId, pickup, dropoff, fare, riderName, rideId } = req.body;
  if (!groupId || !pickup || !dropoff || !fare || !rideId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const shortId = rideId.slice(0, 8).toUpperCase();
    const message = [
      `🚖 *NEW RIDE REQUEST* — #${shortId}`,
      ``,
      `👤 Rider: ${riderName || "Anonymous"}`,
      `📍 Pickup:  ${pickup}`,
      `🏁 Dropoff: ${dropoff}`,
      `💰 Fare:    ₦${fare}`,
      ``,
      `Reply *ACCEPT ${shortId}* to claim this ride.`,
    ].join("\n");

    await sock.sendMessage(groupId, { text: message });
    console.log(`[dispatch] Ride alert sent | rideId=${rideId}`);
    res.json({ success: true, rideId });
  } catch (err) {
    console.error("[dispatch] Failed:", err.message);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Hamduk Drive WhatsApp dispatch running on port ${PORT}`);
});

createWhatsAppClient();
