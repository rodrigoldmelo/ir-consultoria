/**
 * Verifica se as tabelas ir_* das migrations existem no Supabase.
 * Uso: npm run check:db
 */
import "../backend/env.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "../backend/services/supabase.js";

const TABLES: Array<{ name: string; migration: string }> = [
  { name: "ir_leads", migration: "0001" },
  { name: "ir_conversations", migration: "0001" },
  { name: "ir_messages", migration: "0001" },
  { name: "ir_cases", migration: "0001" },
  { name: "ir_qualification_answers", migration: "0001" },
  { name: "ir_documents", migration: "0001" },
  { name: "ir_advbox_sync_events", migration: "0001" },
  { name: "ir_audit_events", migration: "0001" },
  { name: "ir_whatsapp_imports", migration: "0002" },
  { name: "ir_reheat_scores", migration: "0002" },
  { name: "ir_template_drip_jobs", migration: "0003" },
];

async function main(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error("IR_SUPABASE_URL / SERVICE_ROLE_KEY ausentes no .env.local");
    process.exit(1);
  }
  const db = getSupabaseAdmin();
  if (!db) process.exit(1);

  console.log("== IR Consultoria — check db ==\n");
  let missing = 0;

  for (const table of TABLES) {
    const { error, count } = await db
      .from(table.name)
      .select("*", { count: "exact", head: true });

    if (error) {
      missing++;
      console.log(`❌ ${table.name} (migration ${table.migration}) — ${error.message}`);
    } else {
      console.log(`✅ ${table.name} — ${count ?? 0} linhas`);
    }
  }

  console.log(
    missing === 0
      ? "\nTodas as migrations aplicadas."
      : `\n${missing} tabela(s) faltando — rode as migrations em supabase/migrations/.`,
  );
  process.exit(missing === 0 ? 0 : 1);
}

void main();
