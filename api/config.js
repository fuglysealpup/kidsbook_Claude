import { authMode, readSession } from "./_lib.js";
import { cloudOn } from "./_blob.js";

// What the app needs to know before it shows anything: how people sign in, whether this
// browser is already signed in, and whether books are saved in the cloud.
export default async function handler(req, res) {
  const mode = authMode();
  const session = mode === "login" ? readSession(req) : null;
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    auth: mode,
    signedIn: mode === "login" ? !!session : null,
    email: session?.email || null,
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    appleServiceId: process.env.APPLE_SERVICE_ID || null,
    cloud: cloudOn(),
    inboundAddress: process.env.INBOUND_ADDRESS || null
  });
}
