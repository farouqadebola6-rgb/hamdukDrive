# Hamduk Drive — WhatsApp Dispatch Microservice

Baileys-based WhatsApp microservice that dispatches ride alerts to your driver group.

---

## Local Setup

```bash
git clone <your-repo>
cd hamduk-drive-whatsapp
npm install
cp .env.example .env   # fill in API_SECRET
npm start
```

On first run, a QR code will appear in the terminal. Scan it with the WhatsApp number
you want to use as the dispatch bot (use a dedicated SIM, not your personal number).

The session is saved to `auth/session/` — you won't need to scan again unless you log out.

---

## API Endpoints

All endpoints (except `/health`) require the header:
```
x-api-key: <your API_SECRET>
```

### `GET /health`
Check connection status.
```json
{ "status": "ok", "whatsapp": "connected" }
```

### `POST /send-ride-alert`
Dispatch a new ride to the driver group.

**Body:**
```json
{
  "groupId": "120363XXXXXXX@g.us",
  "pickup": "LASU Gate 1",
  "dropoff": "Ojo Bus Stop",
  "fare": "1500",
  "riderName": "Amisu",
  "rideId": "uuid-from-supabase"
}
```

**Response:**
```json
{ "success": true, "rideId": "uuid-from-supabase" }
```

**Message sent to group:**
```
🚖 *NEW RIDE REQUEST* — #A1B2C3D4

👤 Rider: Amisu
📍 Pickup:  LASU Gate 1
🏁 Dropoff: Ojo Bus Stop
💰 Fare:    ₦1500

Reply *ACCEPT A1B2C3D4* to claim this ride.
```

### `POST /send-message`
Send any text to a group (for testing).
```json
{ "groupId": "120363XXXXXXX@g.us", "text": "Hello drivers!" }
```

---

## How to get your Group JID

1. Start the service and scan the QR
2. Send a message to the group from the bot number
3. Add this temporary log to `whatsapp.js` to print incoming messages:

```js
sock.ev.on("messages.upsert", ({ messages }) => {
  messages.forEach(m => console.log(m.key.remoteJid, m.message));
});
```

The `remoteJid` for a group looks like `120363XXXXXXX@g.us` — that's your `groupId`.

---

## Calling from Hamduk Drive (Next.js/Supabase)

```typescript
// lib/dispatch.ts
const DISPATCH_URL = process.env.WHATSAPP_DISPATCH_URL; // your Render URL
const DISPATCH_KEY = process.env.WHATSAPP_API_SECRET;

export async function dispatchRideAlert(ride: {
  id: string;
  pickup: string;
  dropoff: string;
  fare: number;
  riderName: string;
}) {
  const res = await fetch(`${DISPATCH_URL}/send-ride-alert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": DISPATCH_KEY!,
    },
    body: JSON.stringify({
      groupId: process.env.WHATSAPP_GROUP_ID,
      pickup: ride.pickup,
      dropoff: ride.dropoff,
      fare: String(ride.fare),
      riderName: ride.riderName,
      rideId: ride.id,
    }),
  });

  if (!res.ok) {
    console.error("[dispatch] Failed:", await res.text());
  }
}
```

Then call `dispatchRideAlert(ride)` right after inserting the ride into Supabase.

---

## Deploy to Render

1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → New → Web Service → connect repo
3. Render auto-detects `render.yaml` — just add your `API_SECRET` env var
4. On first deploy, check the logs for the QR code and scan it
5. Copy your Render URL into Hamduk Drive's env as `WHATSAPP_DISPATCH_URL`

> ⚠️ **Important:** The `render.yaml` adds a 1GB persistent disk for the session.
> Free tier includes this. Without it, you'd need to re-scan QR on every deploy.

---

## Env vars to add to Hamduk Drive

```env
WHATSAPP_DISPATCH_URL=https://hamduk-drive-whatsapp.onrender.com
WHATSAPP_API_SECRET=<same value as API_SECRET in this service>
WHATSAPP_GROUP_ID=120363XXXXXXX@g.us
```
