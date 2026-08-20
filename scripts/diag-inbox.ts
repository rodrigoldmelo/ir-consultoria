/**
 * Diagnóstico rápido: últimas conversas IR (sem dump de telefone completo).
 * Uso: npx tsx scripts/diag-inbox.ts
 */
import "../backend/env.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "../backend/services/supabase.js";

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length < 8) return "(curto)";
  return `${d.slice(0, 4)}…${d.slice(-4)}`;
}

async function main(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error("Supabase não configurado");
    process.exit(1);
  }
  const db = getSupabaseAdmin();
  if (!db) process.exit(1);

  const { data: convs, error: cErr } = await db
    .from("ir_conversations")
    .select(
      "id, phone, status, last_inbound_at, last_outbound_at, updated_at, template_name, template_status",
    )
    .order("updated_at", { ascending: false })
    .limit(8);
  if (cErr) {
    console.error(cErr.message);
    process.exit(1);
  }

  for (const c of convs ?? []) {
    console.log("\nCONV", {
      status: c.status,
      phone: maskPhone(String(c.phone ?? "")),
      last_in: c.last_inbound_at,
      last_out: c.last_outbound_at,
      updated: c.updated_at,
      template: c.template_name,
      tstatus: c.template_status,
    });
    const { data: msgs } = await db
      .from("ir_messages")
      .select("role, message_type, created_at, text, delivery_status")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: false })
      .limit(8);
    for (const m of (msgs ?? []).reverse()) {
      const t = String(m.text ?? "")
        .slice(0, 90)
        .replace(/\n/g, " ");
      console.log(
        " ",
        m.created_at,
        m.role,
        m.message_type,
        m.delivery_status,
        t,
      );
    }
  }

  const { data: audits } = await db
    .from("ir_audit_events")
    .select("event_type, summary, created_at")
    .order("created_at", { ascending: false })
    .limit(15);
  console.log("\nAUDIT");
  for (const a of audits ?? []) {
    console.log(a.created_at, a.event_type, a.summary);
  }
}

void main();
