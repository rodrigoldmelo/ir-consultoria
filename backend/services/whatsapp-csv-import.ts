import { getSupabaseAdmin } from "../services/supabase.js";
import { normalizePhoneE164 } from "./phone.js";

export type CsvChatRow = {
  phone: string;
  name?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  notes?: string;
};

/** Parse CSV simples: phone,name,last_message,last_message_at,notes (header obrigatório). */
export function parseWhatsAppCsv(raw: string): CsvChatRow[] {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const idx = {
    phone: findCol(header, ["phone", "telefone", "whatsapp", "mobile"]),
    name: findCol(header, ["name", "nome", "full_name"]),
    lastMessage: findCol(header, [
      "last_message",
      "ultima_mensagem",
      "last_msg",
      "message",
    ]),
    lastMessageAt: findCol(header, [
      "last_message_at",
      "data",
      "date",
      "updated_at",
      "ultima_data",
    ]),
    notes: findCol(header, ["notes", "obs", "observacao", "status"]),
  };

  if (idx.phone < 0) {
    throw new Error("csv_missing_phone_column");
  }

  const rows: CsvChatRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const phoneRaw = cols[idx.phone]?.trim();
    const phone = normalizePhoneE164(phoneRaw);
    if (!phone) continue;
    rows.push({
      phone,
      name: idx.name >= 0 ? cols[idx.name]?.trim() || undefined : undefined,
      lastMessage:
        idx.lastMessage >= 0
          ? cols[idx.lastMessage]?.trim() || undefined
          : undefined,
      lastMessageAt:
        idx.lastMessageAt >= 0
          ? cols[idx.lastMessageAt]?.trim() || undefined
          : undefined,
      notes: idx.notes >= 0 ? cols[idx.notes]?.trim() || undefined : undefined,
    });
  }
  return rows;
}

function findCol(header: string[], aliases: string[]): number {
  return header.findIndex((h) => aliases.includes(h));
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export async function importWhatsAppCsv(input: {
  filename: string;
  csvText: string;
  uploadedBy?: string;
}): Promise<{
  importId: string | null;
  conversations: number;
  messages: number;
  skipped: number;
}> {
  const db = getSupabaseAdmin();
  const rows = parseWhatsAppCsv(input.csvText);
  if (!db) {
    return {
      importId: null,
      conversations: rows.length,
      messages: rows.filter((r) => r.lastMessage).length,
      skipped: 0,
    };
  }

  const { data: imp, error: impErr } = await db
    .from("ir_whatsapp_imports")
    .insert({
      filename: input.filename,
      source_format: "csv",
      status: "processing",
      uploaded_by: input.uploadedBy ?? "panel",
    })
    .select("id")
    .single();

  if (impErr || !imp) {
    throw new Error(impErr?.message ?? "import_insert_failed");
  }

  let conversations = 0;
  let messages = 0;
  let skipped = 0;

  try {
    for (const row of rows) {
      const digits = row.phone.replace(/\D/g, "");
      const { data: existing } = await db
        .from("ir_conversations")
        .select("id")
        .eq("phone", digits)
        .maybeSingle();

      let conversationId = existing?.id as string | undefined;

      if (!conversationId) {
        const { data: created, error } = await db
          .from("ir_conversations")
          .insert({
            phone: digits,
            whatsapp_wa_id: digits,
            status: "closed",
            source: "import",
            last_inbound_at: row.lastMessageAt
              ? new Date(row.lastMessageAt).toISOString()
              : null,
          })
          .select("id")
          .single();
        if (error || !created) {
          skipped++;
          continue;
        }
        conversationId = created.id;
        conversations++;
      } else {
        await db
          .from("ir_conversations")
          .update({ source: "import", updated_at: new Date().toISOString() })
          .eq("id", conversationId);
        conversations++;
      }

      if (row.lastMessage && conversationId) {
        await db.from("ir_messages").insert({
          conversation_id: conversationId,
          role: "user",
          text: row.lastMessage,
          message_type: "text",
          import_id: imp.id,
        });
        messages++;
      }

      if (row.name) {
        // lead leve para reheat (sem meta_leadgen_id único real)
        const metaId = `import_${digits}`;
        const { data: lead } = await db
          .from("ir_leads")
          .select("id")
          .eq("meta_leadgen_id", metaId)
          .maybeSingle();
        if (!lead) {
          await db.from("ir_leads").insert({
            meta_leadgen_id: metaId,
            name: row.name,
            phone: row.phone,
            status: "conversation_started",
            source: "whatsapp_import",
            opt_in_whatsapp: true,
            raw_payload: { import_id: imp.id, notes: row.notes },
          });
        }
      }
    }

    await db
      .from("ir_whatsapp_imports")
      .update({
        status: "done",
        conversations_count: conversations,
        messages_count: messages,
        finished_at: new Date().toISOString(),
      })
      .eq("id", imp.id);

    return { importId: imp.id, conversations, messages, skipped };
  } catch (err) {
    await db
      .from("ir_whatsapp_imports")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : "import_failed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", imp.id);
    throw err;
  }
}
