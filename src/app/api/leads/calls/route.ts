import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";
import type { CallQueueStatus } from "@/types";

const statuses: CallQueueStatus[] = [
  "Not Called",
  "Attempted",
  "Connected",
  "Follow Up",
  "Do Not Call",
];

function hasVerifiedEmail(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some(
    (person) =>
      person &&
      typeof person === "object" &&
      typeof (person as { email?: unknown }).email === "string" &&
      typeof (person as { source?: unknown }).source === "string" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        (person as { email: string }).email.trim(),
      ) &&
      (person as { source: string }).source.trim().length > 3,
  );
}

async function reconcileCallQueue(
  db: NonNullable<ReturnType<typeof getAdminClient>>,
): Promise<void> {
  const [
    { data: leads, error: leadError },
    { data: enrichments, error: enrichmentError },
  ] = await Promise.all([
    db
      .from("leads")
      .select("id,business_name,address,location,phone,website_url")
      .not("phone", "is", null),
    db.from("lead_enrichments").select("lead_id,decision_makers"),
  ]);
  if (leadError) throw leadError;
  if (enrichmentError) throw enrichmentError;
  const emailReadyIds = new Set(
    (enrichments ?? [])
      .filter((row) => hasVerifiedEmail(row.decision_makers))
      .map((row) => row.lead_id),
  );
  const callRows = (leads ?? [])
    .filter((lead) => lead.phone?.trim() && !emailReadyIds.has(lead.id))
    .map((lead) => ({
      lead_id: lead.id,
      website_url: lead.website_url ?? null,
      maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([lead.business_name, lead.address ?? lead.location].filter(Boolean).join(" "))}`,
    }));
  for (let offset = 0; offset < callRows.length; offset += 250) {
    const { error } = await db
      .from("call_queue")
      .upsert(callRows.slice(offset, offset + 250), {
        onConflict: "lead_id",
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
  if (emailReadyIds.size) {
    const ids = [...emailReadyIds];
    for (let offset = 0; offset < ids.length; offset += 250) {
      const { error } = await db
        .from("call_queue")
        .delete()
        .in("lead_id", ids.slice(offset, offset + 250));
      if (error) throw error;
    }
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const db = getAdminClient();
    if (!db)
      return NextResponse.json(
        { error: "Supabase is not configured" },
        { status: 503 },
      );
    const { data, error } = await db
      .from("call_queue")
      .select("*,lead:leads(id,business_name,website_url,phone,address,location,google_place_id,niche,status,created_at)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error("call queue load", error);
    return NextResponse.json(
      {
        error:
          "The Supabase call queue could not be loaded. Apply the call_queue migration first.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      id?: string;
      status?: CallQueueStatus;
      notes?: string;
    };
    if (!body.id)
      return NextResponse.json(
        { error: "Call queue ID is required" },
        { status: 400 },
      );
    if (body.status && !statuses.includes(body.status))
      return NextResponse.json(
        { error: "Invalid call status" },
        { status: 400 },
      );
    const db = getAdminClient();
    if (!db)
      return NextResponse.json(
        { error: "Supabase is not configured" },
        { status: 503 },
      );
    const update: {
      status?: CallQueueStatus;
      notes?: string;
      last_called_at?: string;
    } = {};
    if (body.status) {
      update.status = body.status;
      if (body.status !== "Not Called")
        update.last_called_at = new Date().toISOString();
    }
    if (typeof body.notes === "string")
      update.notes = body.notes.slice(0, 5000);
    const { data, error } = await db
      .from("call_queue")
      .update(update)
      .eq("id", body.id)
      .select("*,lead:leads(*)")
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error("call queue update", error);
    return NextResponse.json(
      { error: "The call queue entry could not be updated" },
      { status: 500 },
    );
  }
}
