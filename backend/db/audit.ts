import { getSupabaseAdmin } from "../services/supabase.js";

export async function recordAuditEvent(input: {
  entityType: string;
  entityId: string;
  eventType: string;
  actorType?: "system" | "agent" | "human" | "webhook";
  summary?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) {
    console.info("[audit] stub", input.eventType, input.entityId);
    return;
  }

  const { error } = await db.from("ir_audit_events").insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    event_type: input.eventType,
    actor_type: input.actorType ?? "system",
    summary: input.summary ?? null,
    metadata: input.metadata ?? null,
  });

  if (error) {
    console.error("[audit] recordAuditEvent", error.message);
  }
}
