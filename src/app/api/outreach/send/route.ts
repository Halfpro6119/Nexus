import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/apis/email";
import { isRateLimited } from "@/lib/rate-limit";
import type { DecisionMaker } from "@/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (
      isRateLimited(
        `send:${request.headers.get("x-forwarded-for") ?? "local"}`,
        30,
        60_000,
      )
    )
      return NextResponse.json(
        { error: "Send limit reached" },
        { status: 429 },
      );
    const { leadId, accountId, to, subject, body } = (await request.json()) as {
      leadId?: string;
      accountId?: string;
      to?: string;
      subject?: string;
      body?: string;
    };
    if (!leadId || !to || !subject || !body)
      return NextResponse.json(
        { error: "Incomplete email payload" },
        { status: 400 },
      );
    const db = getAdminClient();
    if (!db)
      return NextResponse.json(
        { error: "Supabase is required for verified email dispatch" },
        { status: 503 },
      );
    const { data: enrichment, error: enrichmentError } = await db
      .from("lead_enrichments")
      .select("decision_makers")
      .eq("lead_id", leadId)
      .maybeSingle();
    if (enrichmentError) throw enrichmentError;
    const contacts = (enrichment?.decision_makers ?? []) as DecisionMaker[];
    const normalizedTo = to.trim().toLowerCase();
    const verified = contacts.some(
      (person) =>
        person.email.trim().toLowerCase() === normalizedTo &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email) &&
        person.source.trim().length > 3,
    );
    if (!verified)
      return NextResponse.json(
        {
          error:
            "This address is not a verified public email for the selected lead. The lead remains call-only.",
        },
        { status: 422 },
      );
    if (!accountId)
      return NextResponse.json(
        { error: "Connect and select an email account" },
        { status: 400 },
      );
    const { data: account, error } = await db
      .from("email_accounts")
      .select("provider,access_token")
      .eq("id", accountId)
      .single();
    if (error || !account?.access_token || account.provider === "smtp")
      return NextResponse.json(
        { error: "Email account is unavailable" },
        { status: 400 },
      );
    const result = await sendEmail(
      account.provider,
      account.access_token,
      to,
      subject,
      body,
    );
    await db.from("leads").update({ status: "Contacted" }).eq("id", leadId);
    return NextResponse.json({ data: { sent: true, messageId: result.id } });
  } catch (error) {
    console.error("send outreach", error);
    return NextResponse.json(
      { error: "Message could not be sent" },
      { status: 500 },
    );
  }
}
