import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";
import type {
  DecisionMaker,
  EmailRecipient,
  Lead,
  LeadEnrichment,
} from "@/types";

function isVerifiedContact(person: DecisionMaker): boolean {
  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim()) &&
    person.source.trim().length > 3
  );
}

export async function GET(): Promise<NextResponse> {
  try {
    const db = getAdminClient();
    if (!db) return NextResponse.json({ data: [], demo: true });
    const { data: enrichmentRows, error } = await db
      .from("lead_enrichments")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const enrichments = (enrichmentRows ?? []) as LeadEnrichment[];
    const eligible = enrichments.filter((enrichment) =>
      enrichment.decision_makers.some(isVerifiedContact),
    );
    const leadIds = eligible.map((enrichment) => enrichment.lead_id);
    if (!leadIds.length) return NextResponse.json({ data: [] });
    const { data: leadRows, error: leadError } = await db
      .from("leads")
      .select("*")
      .in("id", leadIds);
    if (leadError) throw leadError;
    const leads = new Map(
      ((leadRows ?? []) as Lead[]).map((lead) => [lead.id, lead]),
    );
    const recipients: EmailRecipient[] = eligible.flatMap((enrichment) => {
      const lead = leads.get(enrichment.lead_id);
      if (!lead) return [];
      return enrichment.decision_makers
        .filter(isVerifiedContact)
        .map((decisionMaker) => ({ lead, decisionMaker, enrichment }));
    });
    return NextResponse.json({ data: recipients });
  } catch (error) {
    console.error("email-ready recipients", error);
    return NextResponse.json(
      { error: "Email-ready recipients could not be loaded" },
      { status: 500 },
    );
  }
}
