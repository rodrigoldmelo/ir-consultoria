import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

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

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function phoneMatches(stored: string | null, wanted: string): boolean {
  const a = digits(stored ?? "");
  const b = digits(wanted);
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

const phone = arg("phone");
if (!phone) {
  console.error("Uso: npm run fix:cnis-doc -- --phone +5581984548984");
  process.exit(1);
}

const url = process.env.IR_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key =
  process.env.IR_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "IR_SUPABASE_URL e IR_SUPABASE_SERVICE_ROLE_KEY são obrigatórios.",
  );
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws as never },
});

const { data: conversations, error: convError } = await db
  .from("ir_conversations")
  .select("id, phone, status, updated_at")
  .order("updated_at", { ascending: false })
  .limit(500);

if (convError) throw new Error(convError.message);

const conversation = (conversations ?? []).find((item) =>
  phoneMatches(item.phone, phone),
);

if (!conversation) {
  console.error(`Conversa não encontrada para ${phone}.`);
  process.exit(1);
}

const { data: irCase, error: caseError } = await db
  .from("ir_cases")
  .select("id, status")
  .eq("conversation_id", conversation.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (caseError) throw new Error(caseError.message);
if (!irCase) {
  console.error(`Caso não encontrado para conversa ${conversation.id}.`);
  process.exit(1);
}

const { data: document, error: docError } = await db
  .from("ir_documents")
  .select("id, document_type, mime_type, created_at")
  .eq("case_id", irCase.id)
  .in("document_type", ["other", "inss_statement"])
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (docError) throw new Error(docError.message);
if (!document) {
  console.error(`Nenhum documento other/inss_statement encontrado no caso ${irCase.id}.`);
  process.exit(1);
}

const now = new Date().toISOString();
const { error: updateDocError } = await db
  .from("ir_documents")
  .update({ document_type: "cnis" })
  .eq("id", document.id);
if (updateDocError) throw new Error(updateDocError.message);

const { error: updateCaseError } = await db
  .from("ir_cases")
  .update({
    status: "documents_partial",
    missing_information: { missing_documents: ["dirf_income"] },
    updated_at: now,
  })
  .eq("id", irCase.id);
if (updateCaseError) throw new Error(updateCaseError.message);

const { error: updateConvError } = await db
  .from("ir_conversations")
  .update({ status: "waiting_documents", updated_at: now })
  .eq("id", conversation.id);
if (updateConvError) throw new Error(updateConvError.message);

console.log(
  JSON.stringify(
    {
      ok: true,
      conversation_id: conversation.id,
      case_id: irCase.id,
      document_id: document.id,
      previous_document_type: document.document_type,
      new_document_type: "cnis",
      missing_documents: ["dirf_income"],
      conversation_status: "waiting_documents",
    },
    null,
    2,
  ),
);
