/**
 * Exercita a fila persistida do template inicial com um lead sintético.
 *
 * Nunca chama a Meta: usa só as funções de banco (reserva, reserva travada,
 * devolução para a fila) e apaga o lead de teste no fim.
 *
 * Precisa que o worker esteja parado, senão ele reservaria o lead sintético e
 * tentaria disparar template de verdade — o script aborta se a API estiver no ar.
 *
 *   npm run check:queue
 */
import "../backend/env.js";
import { config } from "../backend/config.js";
import {
  claimLeadForTemplate,
  listStaleTemplateClaims,
  updateLeadStatusById,
} from "../backend/db/leads.js";
import { getSupabaseAdmin } from "../backend/services/supabase.js";

const TEST_PHONE = "550000000000";
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "ok  " : "FALHA"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function apiIsRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${config.port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) {
    console.error("Supabase não configurado.");
    process.exit(1);
  }

  if (await apiIsRunning()) {
    console.error(
      `API respondendo na porta ${config.port}. Pare o worker antes (o teste usa a mesma fila).`,
    );
    process.exit(1);
  }

  const { data: queued, error: queuedError } = await db
    .from("ir_leads")
    .select("id, meta_leadgen_id")
    .in("status", ["template_queued", "template_sending"]);

  if (queuedError) {
    console.error("Não foi possível inspecionar a fila:", queuedError.message);
    process.exit(1);
  }
  if (queued?.length) {
    console.error(
      `Existem ${queued.length} lead(s) reais na fila; abortando para não reservá-los.`,
    );
    process.exit(1);
  }

  const metaLeadgenId = `test-queue-${Date.now()}`;
  const { data: inserted, error: insertError } = await db
    .from("ir_leads")
    .insert({
      meta_leadgen_id: metaLeadgenId,
      name: "TESTE FILA",
      phone: TEST_PHONE,
      status: "template_queued",
      source: "test_script",
      opt_in_whatsapp: false,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("Falha ao criar lead de teste:", insertError?.message);
    process.exit(1);
  }

  const leadId = (inserted as { id: string }).id;
  console.log(`Lead sintético: ${metaLeadgenId}\n`);

  try {
    const claimed = await claimLeadForTemplate();
    check(
      "reserva encontra o lead da fila",
      claimed?.id === leadId,
      claimed ? `status ${claimed.status}` : "nada reservado",
    );
    check("reserva grava template_sending", claimed?.status === "template_sending");

    const second = await claimLeadForTemplate();
    check(
      "lead reservado não é reservado de novo",
      second === null,
      second ? `veio ${second.meta_leadgen_id}` : undefined,
    );

    const staleFresh = await listStaleTemplateClaims(15);
    check(
      "reserva recente não conta como travada",
      !staleFresh.some((l) => l.id === leadId),
    );

    await db
      .from("ir_leads")
      .update({ updated_at: new Date(Date.now() - 20 * 60_000).toISOString() })
      .eq("id", leadId);

    const staleOld = await listStaleTemplateClaims(15);
    check(
      "reserva antiga é detectada como travada",
      staleOld.some((l) => l.id === leadId),
    );

    await updateLeadStatusById(leadId, "template_queued");
    const requeued = await claimLeadForTemplate();
    check(
      "lead devolvido volta a ser reservável",
      requeued?.id === leadId,
      requeued ? undefined : "não voltou para a fila",
    );
  } finally {
    const { error: deleteError } = await db.from("ir_leads").delete().eq("id", leadId);
    console.log(
      `\nlimpeza: ${deleteError ? `FALHOU (${deleteError.message}) — apagar ${metaLeadgenId} à mão` : "lead de teste apagado"}`,
    );
  }

  if (failures.length) {
    console.error(`\nFalhou: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("\nFila persistida OK.");
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : err);
  process.exit(1);
});
