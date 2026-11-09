import { isSameOrigin } from "@/lib/auth";
import { appRedirect } from "@/lib/oauth-flow";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isSameOrigin())) return new Response("Forbidden", { status: 403 });
  const res = appRedirect("/login", { signedOut: "1" });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
