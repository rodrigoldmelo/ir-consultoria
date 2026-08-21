/**
 * Reseta o estado operacional de uma conversa de teste por telefone.
 *
 * Uso:
 *   npm run reset:test-conversation -- --phone +5541987277528
 *   npm run reset:test-conversation -- --phone +5541987277528 --delete-leads
 */
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

import { normalizePhoneDigits, phoneLookupCandidates } from "../backend/services/phone.js";

loadDotenv({ path: ".env.local" });
loadDotenv();

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1]?.trim() ?? null;
  return null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function maskPhone(phone: string): string {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 8) return "(curto)";
  return `${digits.slice(0, 4)}...${digits.slice(-4)}`;
}

async function deleteIn<T extends Record<string, unknown>>(
  table: string,
  column: string,
  values: string[],
): Promise<number> {
  if (!values.length) return 0;
  const { data, error } = await db
    .from(table)
    .delete()
    .in(column, values)
    .select("id");
  if (error) throw new Error(`${table}: ${error.message}`);
  return ((data ?? []) as T[]).length;
}

const phone = arg("phone");
if (!phone) {
  console.error("Uso: npm run reset:test-conversation -- --phone +5541987277528");
  process.exit(1);
}

const url = process.env.IR_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key =
  process.env.IR_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("IR_SUPABASE_URL e IR_SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws as never },
});

const candidates = phoneLookupCandidates(phone);
const { data: conversations, error: convError } = await db
  .from("ir_conversations")
  .select("id, lead_id, phone")
  .in("phone", candidates);

if (convError) throw new Error(convError.message);

const conversationIds = [...new Set((conversations ?? []).map((row) => String(row.id)))];
const leadIdsFromConversations = [
  ...new Set(
    (conversations ?? [])
      .map((row) => (row.lead_id ? String(row.lead_id) : null))
      .filter((id): id is string => Boolean(id)),
  ),
];

const { data: cases, error: caseError } = conversationIds.length
  ? await db
      .from("ir_cases")
      .select("id")
      .in("conversation_id", conversationIds)
  : { data: [], error: null };
if (caseError) throw new Error(caseError.message);
const caseIds = [...new Set((cases ?? []).map((row) => String(row.id)))];

const { data: docs, error: docListError } = caseIds.length
  ? await db
      .from("ir_documents")
      .select("id, storage_bucket, storage_path")
      .in("case_id", caseIds)
  : { data: [], error: null };
if (docListError) throw new Error(docListError.message);

const storageByBucket = new Map<string, string[]>();
for (const doc of docs ?? []) {
  const bucket = String(doc.storage_bucket ?? "");
  const path = String(doc.storage_path ?? "");
  if (!bucket || !path) continue;
  storageByBucket.set(bucket, [...(storageByBucket.get(bucket) ?? []), path]);
}

const counts: Record<string, number> = {};
counts.ir_qualification_answers = await deleteIn(
  "ir_qualification_answers",
  "case_id",
  caseIds,
);
counts.ir_advbox_sync_events = await deleteIn("ir_advbox_sync_events", "case_id", caseIds);
counts.ir_documents = await deleteIn("ir_documents", "case_id", caseIds);
counts.ir_cases = await deleteIn("ir_cases", "id", caseIds);
counts.ir_messages = await deleteIn("ir_messages", "conversation_id", conversationIds);
counts.ir_template_drip_jobs = await deleteIn(
  "ir_template_drip_jobs",
  "conversation_id",
  conversationIds,
);
counts.ir_reheat_scores = await deleteIn(
  "ir_reheat_scores",
  "conversation_id",
  conversationIds,
);
counts.ir_conversations = await deleteIn("ir_conversations", "id", conversationIds);

let removedStorage = 0;
for (const [bucket, paths] of storageByBucket) {
  const { error } = await db.storage.from(bucket).remove(paths);
  if (error) {
    console.warn(`[storage] ${bucket}: ${error.message}`);
    continue;
  }
  removedStorage += paths.length;
}

if (hasFlag("delete-leads")) {
  const leadCandidates = [
    ...new Set([
      ...leadIdsFromConversations,
      ...(
        (
          await db
            .from("ir_leads")
            .select("id")
            .in("phone", candidates)
        ).data ?? []
      ).map((row) => String(row.id)),
    ]),
  ];
  counts.ir_leads = await deleteIn("ir_leads", "id", leadCandidates);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      phone: maskPhone(phone),
      conversations: conversationIds.length,
      cases: caseIds.length,
      storage_objects_removed: removedStorage,
      leads_kept: !hasFlag("delete-leads"),
      counts,
    },
    null,
    2,
  ),
);
