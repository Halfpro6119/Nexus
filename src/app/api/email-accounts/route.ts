import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";
import type { EmailAccount } from "@/types";

interface StoredEmailAccount { id: string; provider: EmailAccount["provider"]; email_address: string; is_active?: boolean; created_at: string }

export async function GET(): Promise<NextResponse> {
  try {
    const db = getAdminClient();
    if (!db) return NextResponse.json({ data: [], demo: true });
    const preferred = await db.from("email_accounts").select("id,provider,email_address,is_active,created_at").order("created_at", { ascending: false });
    let rows: StoredEmailAccount[];
    if (preferred.error?.code === "42703") {
      const compatible = await db.from("email_accounts").select("id,provider,email_address,created_at").order("created_at", { ascending: false });
      if (compatible.error) throw compatible.error;
      rows = (compatible.data ?? []) as StoredEmailAccount[];
    } else {
      if (preferred.error) throw preferred.error;
      rows = (preferred.data ?? []) as StoredEmailAccount[];
    }
    const data: EmailAccount[] = rows.map(account => ({ ...account, is_active: account.is_active ?? true }));
    return NextResponse.json({ data });
  } catch (error) {
    console.error("email accounts", error);
    return NextResponse.json({ error: "Accounts could not be loaded" }, { status: 500 });
  }
}
