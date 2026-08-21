/**
 * Junta conversas duplicadas do mesmo telefone, incluindo variação BR com/sem
 * nono dígito. Uso:
 *   npm run merge:conversations -- --phone +5581982578186
 */
import "../backend/env.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "../backend/services/supabase.js";
import { normalizePhoneDigits, phoneLookupCandidates } from "../backend/services/phone.js";

type Conversation = {
  id: string;
  lead_id: string | null;
  phone: string;
  status: string;
  source: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  template_status: string | null;
  updated_at: string;
};

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function score(row: Conversation): number {
  let value = 0;
  if (row.lead_id) value += 8;
  if (row.source === "meta" || row.source === "meta_lead_ads") value += 4;
  if (row.template_status === "sent") value += 2;
  if (row.status === "awaiting_first_reply") value += 1;
  return value;
}

function latest(...values: Array<string | null>): string | null {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

function maskPhone(phone: string): string {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 8) return "(curto)";
  return `${digits.slice(0, 4)}...${digits.slice(-4)}`;
}

async function main(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error("Supabase não configurado");
    process.exit(1);
  }
  const phone = argValue("--phone") ?? process.argv[2];
  if (!phone) {
    console.error("Informe --phone. Ex.: npm run merge:conversations -- --phone +5581982578186");
    process.exit(1);
  }

  const db = getSupabaseAdmin();
  if (!db) process.exit(1);

  const candidates = phoneLookupCandidates(phone);
  const { data, error } = await db
    .from("ir_conversations")
    .select("id, lead_id, phone, status, source, last_inbound_at, last_outbound_at, template_status, updated_at")
    .in("phone", candidates);

  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Conversation[]).sort((a, b) => {
    const byScore = score(b) - score(a);
    if (byScore !== 0) return byScore;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  if (rows.length <= 1) {
    console.log(`Nada para juntar (${maskPhone(phone)}): ${rows.length} conversa.`);
    return;
  }

  const [primary, ...dupes] = rows;
  const dupeIds = dupes.map((row) => row.id);
  console.log(`Primary ${primary.id} (${maskPhone(primary.phone)})`);
  console.log(`Duplicadas: ${dupeIds.join(", ")}`);

  for (const table of [
    "ir_messages",
    "ir_documents",
    "ir_template_drip_jobs",
    "ir_reheat_scores",
    "ir_cases",
  ]) {
    const { error: updateError } = await db
      .from(table)
      .update({ conversation_id: primary.id })
      .in("conversation_id", dupeIds);
    if (updateError) {
      console.warn(`[merge] ${table}: ${updateError.message}`);
    }
  }

  const latestRow = rows
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];

  const { error: primaryError } = await db
    .from("ir_conversations")
    .update({
      status:
        primary.status === "awaiting_first_reply" && latestRow.status !== "awaiting_first_reply"
          ? latestRow.status
          : primary.status,
      last_inbound_at: latest(...rows.map((row) => row.last_inbound_at)),
      last_outbound_at: latest(...rows.map((row) => row.last_outbound_at)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", primary.id);
  if (primaryError) throw new Error(primaryError.message);

  const { error: deleteError } = await db
    .from("ir_conversations")
    .delete()
    .in("id", dupeIds);
  if (deleteError) throw new Error(deleteError.message);

  console.log(`Merge concluído para ${maskPhone(phone)}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
