import { NextRequest, NextResponse } from "next/server";
import { appUrl, verifyOAuthState } from "@/lib/oauth";
import { exchangeOAuthCode, getMailboxIdentity } from "@/lib/apis/email";
import { getAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }): Promise<NextResponse> {
  const { provider } = await params;
  if (provider !== "gmail" && provider !== "microsoft") return NextResponse.redirect(`${appUrl()}/outreach?connection=invalid`);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const nonce = request.cookies.get(`oauth_${provider}`)?.value;
  if (!code || !state || !nonce || !verifyOAuthState(state, nonce, provider)) return NextResponse.redirect(`${appUrl()}/outreach?connection=invalid`);
  try {
    const token = await exchangeOAuthCode(provider, code, `${appUrl()}/api/auth/${provider}/callback`);
    const email = await getMailboxIdentity(provider, token.access_token);
    const db = getAdminClient();
    if (!db) return NextResponse.redirect(`${appUrl()}/outreach?connection=database-required`);
    const { error } = await db.from("email_accounts").upsert({ provider, email_address: email, access_token: token.access_token, refresh_token: token.refresh_token ?? null, token_expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null }, { onConflict: "email_address" });
    if (error) throw error;
    const response = NextResponse.redirect(`${appUrl()}/outreach?connection=success`);
    response.cookies.delete(`oauth_${provider}`);
    return response;
  } catch (error) {
    console.error("oauth callback", error);
    return NextResponse.redirect(`${appUrl()}/outreach?connection=failed`);
  }
}
