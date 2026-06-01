import "dotenv/config";
import express from "express";
import { createWhatsAppClient, getSocket } from "./whatsapp.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET;

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers["x-api-key"];
  if (!API_SECRET || token !== API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── Health check (no auth — Render uses this) ────────────────────────────────
app.get("/health", (req, res) => {
  const sock = getSocket();
  res.json({
    status: "ok",
    whatsapp: sock ? "connected" : "disconnected",
  });
});

// ── Send ride alert to driver group ─────────────────────────────────────────
// Called by Hamduk Drive backend when a new ride is created
//
// POST /send-ride-alert
// Headers: x-api-key: <API_SECRET>
// Body: {
//   groupId: "120363XXXXXXX@g.us",   // WhatsApp group JID
//   pickup: "LASU Gate 1",
//   dropoff: "Ojo Bus Stop",
//   fare: "1500",
//   riderName: "Amisu",
//   rideId: "uuid-here"
// }
app.post("/send-ride-alert", requireAuth, async (req, res) => {
  const sock = getSocket();

  if (!sock) {
    return res.status(503).json({ error: "WhatsApp not connected yet" });
  }

  const { groupId, pickup, dropoff, fare, riderName, rideId } = req.body;

  if (!groupId || !pickup || !dropoff || !fare || !rideId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const message = buildRideAlertMessage({ pickup, dropoff, fare, riderName, rideId });

    await sock.sendMessage(groupId, { text: message });

    console.log(`[dispatch] Ride alert sent | rideId=${rideId}`);
    res.json({ success: true, rideId });
  } catch (err) {
    console.error("[dispatch] Failed to send:", err.message);
    res.status(500).json({ error: "Failed to send WhatsApp message" });
  }
});

// ── Generic group message (useful for testing) ───────────────────────────────
app.post("/send-message", requireAuth, async (req, res) => {
  const sock = getSocket();

  if (!sock) {
    return res.status(503).json({ error: "WhatsApp not connected yet" });
  }

  const { groupId, text } = req.body;

  if (!groupId || !text) {
    return res.status(400).json({ error: "groupId and text are required" });
  }

  try {
    await sock.sendMessage(groupId, { text });
    res.json({ success: true });
  } catch (err) {
    console.error("[send] Failed:", err.message);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ── Message builder ──────────────────────────────────────────────────────────
function buildRideAlertMessage({ pickup, dropoff, fare, riderName, rideId }) {
  const shortId = rideId.slice(0, 8).toUpperCase();
  return [
    `🚖 *NEW RIDE REQUEST* — #${shortId}`,
    ``,
    `👤 Rider: ${riderName || "Anonymous"}`,
    `📍 Pickup:  ${pickup}`,
    `🏁 Dropoff: ${dropoff}`,
    `💰 Fare:    ₦${fare}`,
    ``,
    `Reply *ACCEPT ${shortId}* to claim this ride.`,
  ].join("\n");
}

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Hamduk Drive WhatsApp dispatch running on port ${PORT}`);
});

// Init WhatsApp connection
createWhatsAppClient();
