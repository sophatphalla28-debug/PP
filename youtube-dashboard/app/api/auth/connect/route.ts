import { getOwner } from "@/lib/auth";
import { appRedirect, startOAuth } from "@/lib/oauth-flow";

export const dynamic = "force-dynamic";

/** Starts the read-only YouTube consent flow for one more channel (any Google account / Brand Account). */
export async function GET() {
  if (!(await getOwner())) return appRedirect("/login");
  return startOAuth("connect");
}
