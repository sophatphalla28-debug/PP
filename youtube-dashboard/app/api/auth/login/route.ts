import { getConfigStatus } from "@/lib/env";
import { appRedirect, startOAuth } from "@/lib/oauth-flow";

export const dynamic = "force-dynamic";

/** Step 1 of dashboard sign-in: send the owner to Google (email scope only). */
export async function GET() {
  if (!getConfigStatus().ok) return appRedirect("/");
  return startOAuth("login");
}
