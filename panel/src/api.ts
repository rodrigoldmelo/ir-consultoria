const API = import.meta.env.VITE_IR_API_URL ?? "";

export class AuthRequiredError extends Error {
  constructor() {
    super("auth_required");
    this.name = "AuthRequiredError";
  }
}

function panelHeaders(extra?: HeadersInit): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...extra,
  };
}

async function panelFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: panelHeaders(init.headers),
  });
  if (res.status === 401) {
    window.dispatchEvent(new Event("ir-auth-required"));
    throw new AuthRequiredError();
  }
  return res;
}

export async function fetchMe() {
  const res = await fetch(`${API}/api/ir/auth/me`, {
    credentials: "include",
  });
  if (!res.ok) return { authenticated: false as const };
  return res.json() as Promise<{ authenticated: boolean; expiresAt?: string }>;
}

export async function login(username: string, password: string) {
  const res = await fetch(`${API}/api/ir/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : "Não foi possível entrar.",
    );
  }
  return body as { ok: true };
}

export async function logout() {
  await fetch(`${API}/api/ir/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function fetchHealth() {
  const res = await fetch(`${API}/api/health`);
  if (!res.ok) throw new Error(`health_${res.status}`);
  return res.json();
}

export async function fetchPanelStatus() {
  const res = await panelFetch("/api/ir/panel/status");
  if (!res.ok) throw new Error(`status_${res.status}`);
  return res.json();
}

export async function fetchLeads() {
  const res = await panelFetch("/api/ir/panel/leads");
  if (!res.ok) throw new Error(`leads_${res.status}`);
  return res.json() as Promise<{ leads: unknown[]; configured?: boolean }>;
}

export async function fetchReheat() {
  const res = await panelFetch("/api/ir/panel/reheat");
  if (!res.ok) throw new Error(`reheat_${res.status}`);
  return res.json() as Promise<{
    items: unknown[];
    note?: string;
    configured?: boolean;
  }>;
}

export async function runReheat(limit = 50) {
  const res = await panelFetch("/api/ir/panel/reheat/run", {
    method: "POST",
    body: JSON.stringify({ limit }),
  });
  if (!res.ok) throw new Error(`reheat_run_${res.status}`);
  return res.json() as Promise<{ ok: boolean; scored: number }>;
}

export async function fetchImports() {
  const res = await panelFetch("/api/ir/panel/imports");
  if (!res.ok) throw new Error(`imports_${res.status}`);
  return res.json() as Promise<{
    imports: unknown[];
    note?: string;
    configured?: boolean;
  }>;
}

export async function uploadImportCsv(filename: string, csvText: string) {
  const res = await panelFetch("/api/ir/panel/imports", {
    method: "POST",
    body: JSON.stringify({ filename, csvText }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `import_${res.status}`);
  return body as {
    ok: boolean;
    importId: string | null;
    conversations: number;
    messages: number;
    skipped: number;
  };
}

export async function fetchConversations() {
  const res = await panelFetch("/api/ir/panel/conversations");
  if (!res.ok) throw new Error(`conversations_${res.status}`);
  return res.json() as Promise<{
    conversations: unknown[];
    configured?: boolean;
  }>;
}

export async function fetchConversationMessages(id: string) {
  const res = await panelFetch(`/api/ir/panel/conversations/${id}/messages`);
  if (!res.ok) throw new Error(`messages_${res.status}`);
  return res.json() as Promise<{ messages: unknown[] }>;
}

export async function fetchConversationDocuments(id: string) {
  const res = await panelFetch(`/api/ir/panel/conversations/${id}/documents`);
  if (!res.ok) throw new Error(`documents_${res.status}`);
  return res.json() as Promise<{
    documents: unknown[];
    missing: string[];
    caseStatus?: string | null;
  }>;
}

export async function openDocument(id: string) {
  const res = await panelFetch(`/api/ir/panel/documents/${id}/url`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `document_url_${res.status}`);
  return body as { url: string };
}

export async function takeoverConversation(id: string) {
  const res = await panelFetch(`/api/ir/panel/conversations/${id}/takeover`, {
    method: "POST",
    body: "{}",
  });
  if (!res.ok) throw new Error(`takeover_${res.status}`);
  return res.json();
}

export async function resumeConversation(id: string) {
  const res = await panelFetch(`/api/ir/panel/conversations/${id}/resume`, {
    method: "POST",
    body: "{}",
  });
  if (!res.ok) throw new Error(`resume_${res.status}`);
  return res.json();
}

export async function sendConversationFollowUp(
  id: string,
  type: "cnis_reminder" | "continue_analysis" | "resume_analysis",
) {
  const res = await panelFetch(`/api/ir/panel/conversations/${id}/follow-up`, {
    method: "POST",
    body: JSON.stringify({ type }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `follow_up_${res.status}`);
  return body as {
    ok: true;
    phone: string;
    templateName: string;
    externalMessageId: string;
  };
}

export async function sendHumanReply(
  id: string,
  text: string,
  replyToMessageId?: string | null,
) {
  const res = await panelFetch(`/api/ir/panel/conversations/${id}/reply`, {
    method: "POST",
    body: JSON.stringify({ text, replyToMessageId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `reply_${res.status}`);
  return body as { ok: boolean; externalMessageId?: string };
}

export async function sendHumanMedia(
  id: string,
  input: {
    filename: string;
    mimeType: string;
    base64: string;
    caption?: string;
    replyToMessageId?: string | null;
  },
) {
  const res = await panelFetch(`/api/ir/panel/conversations/${id}/media`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `media_${res.status}`);
  return body as {
    ok: boolean;
    externalMessageId?: string;
    messageType?: string;
  };
}

export async function deletePanelMessage(
  conversationId: string,
  messageId: string,
) {
  const res = await panelFetch(
    `/api/ir/panel/conversations/${conversationId}/messages/${messageId}`,
    { method: "DELETE" },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `delete_message_${res.status}`);
  return body as { ok: boolean; scope: "panel_only" };
}

export async function sendMessageReaction(
  conversationId: string,
  messageId: string,
  emoji: string,
) {
  const res = await panelFetch(
    `/api/ir/panel/conversations/${conversationId}/messages/${messageId}/reaction`,
    {
      method: "POST",
      body: JSON.stringify({ emoji }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `reaction_${res.status}`);
  return body as { ok: boolean; externalMessageId?: string };
}

export async function decideReheat(
  id: string,
  decision: "approved" | "rejected",
) {
  const res = await panelFetch(`/api/ir/panel/reheat/${id}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `decide_${res.status}`);
  return body as { ok: boolean; sent: boolean; note: string };
}

export async function sendTestOutreach(phone: string, name: string) {
  const res = await panelFetch("/api/ir/panel/test-outreach", {
    method: "POST",
    body: JSON.stringify({ phone, name }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `test_outreach_${res.status}`);
  return body as { ok: true; phone: string; metaLeadgenId: string };
}

export async function sendLeadInitialOutreach(leadId: string) {
  const res = await panelFetch(`/api/ir/panel/leads/${leadId}/outreach`, {
    method: "POST",
    body: "{}",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `lead_outreach_${res.status}`);
  return body as {
    ok: true;
    phone: string;
    metaLeadgenId: string;
    leadId: string;
  };
}

export async function sendConversationInitialOutreach(conversationId: string) {
  const res = await panelFetch(`/api/ir/panel/conversations/${conversationId}/outreach`, {
    method: "POST",
    body: "{}",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `conversation_outreach_${res.status}`);
  }
  return body as {
    ok: true;
    phone: string;
    metaLeadgenId: string;
    leadId: string;
  };
}

export async function sendOutreachBatch(
  recipients: Array<{
    name?: string;
    phone?: string;
    email?: string;
    isDoctor?: boolean | null;
  }>,
) {
  const res = await panelFetch("/api/ir/panel/outreach/batch", {
    method: "POST",
    body: JSON.stringify({ recipients }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `outreach_batch_${res.status}`);
  return body as {
    ok: true;
    templateName: string;
    received: number;
    queued: number;
    created: number;
    reused: number;
    skipped: Array<{
      phone?: string | null;
      name?: string | null;
      reason: string;
    }>;
  };
}

export async function sendTestDrip(
  phone: string,
  name: string,
  which: "trust" | "explain",
) {
  const res = await panelFetch("/api/ir/panel/test-drip", {
    method: "POST",
    body: JSON.stringify({ phone, name, which }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `test_drip_${res.status}`);
  return body as { ok: true; phone: string; templateName: string };
}

export { API };
