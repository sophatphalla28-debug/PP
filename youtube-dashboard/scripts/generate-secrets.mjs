// Prints fresh random values for the three secrets. Paste them into Vercel / .env.local.
import { randomBytes } from "node:crypto";
console.log(`SESSION_SECRET=${randomBytes(48).toString("base64url")}`);
console.log(`TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
console.log(`CRON_SECRET=${randomBytes(32).toString("base64url")}`);
