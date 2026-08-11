import { NextRequest, NextResponse } from "next/server";
import { appUrl, createOAuthState } from "@/lib/oauth";

export async function GET(_: NextRequest, { params }: { params: Promise<{ provider: string }> }): Promise<NextResponse> {
  const { provider } = await params;
  if (provider !== "gmail" && provider !== "microsoft") return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  const { state, nonce } = createOAuthState(provider);
  const redirectUri = `${appUrl()}/api/auth/${provider}/callback`;
  let url: URL;
  if (provider === "gmail") {
    url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", redirect_uri: redirectUri, response_type: "code", scope: "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send", access_type: "offline", prompt: "consent", state }).toString();
  } else {
    url = new URL(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID ?? "common"}/oauth2/v2.0/authorize`);
    url.search = new URLSearchParams({ client_id: process.env.AZURE_CLIENT_ID ?? "", redirect_uri: redirectUri, response_type: "code", response_mode: "query", scope: "openid email offline_access User.Read Mail.Read Mail.Send", state }).toString();
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(`oauth_${provider}`, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return response;
}
