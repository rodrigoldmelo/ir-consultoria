import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BarChart3,
  Bot,
  BotMessageSquare,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  FileUp,
  FileText,
  History,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  Mic,
  Phone,
  Plus,
  RefreshCw,
  Reply,
  Save,
  Search,
  Send,
  Settings,
  Stethoscope,
  Trash2,
  Upload,
  UserRoundCheck,
  Users,
  Video,
  X,
} from "lucide-react";
import {
  AuthRequiredError,
  deletePanelMessage,
  decideReheat,
  fetchConversationDocuments,
  fetchConversationMessages,
  fetchConversations,
  fetchHealth,
  fetchImports,
  fetchLeads,
  fetchMe,
  fetchPanelStatus,
  fetchReheat,
  logout,
  openDocument,
  resumeConversation,
  runReheat,
  sendConversationInitialOutreach,
  sendConversationFollowUp,
  sendHumanMedia,
  sendHumanReply,
  sendLeadInitialOutreach,
  sendMessageReaction,
  sendOutreachBatch,
  sendTestDrip,
  sendTestOutreach,
  takeoverConversation,
  uploadImportCsv,
} from "./api";
import { Login } from "./Login";
import type {
  ConversationRow,
  DocumentRow,
  ImportRow,
  LeadRow,
  MessageRow,
  PanelPage,
  ReheatRow,
} from "./types";

type NavItem = {
  id: PanelPage;
  label: string;
  icon: LucideIcon;
};

type StatusTone = "default" | "success" | "warning" | "danger" | "muted" | "info" | "soft";

type PendingAttachment = {
  file: File;
  url: string;
  kind: "image" | "audio" | "video" | "file";
};

type OutreachCsvRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  isDoctor: boolean | null;
  status: "eligible" | "invalid" | "duplicate";
  reason: string;
};

type OutreachBatchSummary = {
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

type ConversationFollowUpType =
  | "cnis_reminder"
  | "continue_analysis"
  | "resume_analysis";

const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "conversas", label: "Conversas", icon: MessageSquare },
  { id: "leads", label: "Leads", icon: Users },
  { id: "disparos", label: "Disparos", icon: Send },
  { id: "reaquecer", label: "Reaquecer", icon: History },
  { id: "importar", label: "Importar histórico", icon: Upload },
  { id: "config", label: "Configuração", icon: Settings },
];

const IR_STATUSES = [
  "all",
  "waiting_human",
  "awaiting_first_reply",
  "qualifying",
  "waiting_documents",
  "documents_complete",
  "template_queued",
  "template_sent",
  "opt_out",
] as const;

const STATUS_LABELS: Record<string, string> = {
  all: "Todos",
  awaiting_first_reply: "Aguardando aceite",
  qualifying: "Qualificação",
  waiting_documents: "Aguardando docs",
  documents_partial: "Docs parciais",
  documents_complete: "Docs completos",
  waiting_human: "Requer atenção",
  template_queued: "Template na fila",
  template_sending: "Enviando template",
  template_sent: "Template enviado",
  opt_out: "Opt-out",
  closed: "Fechado",
};

const STATUS_TONES: Record<string, StatusTone> = {
  awaiting_first_reply: "warning",
  qualifying: "soft",
  waiting_documents: "warning",
  documents_partial: "warning",
  documents_complete: "success",
  waiting_human: "info",
  template_queued: "muted",
  template_sending: "muted",
  template_sent: "success",
  opt_out: "danger",
  closed: "danger",
  client: "success",
  converted_to_case: "success",
};

const IR_AGENT_PROMPT_PREVIEW = `Você é o agente da IR Consultoria para leads médicos com possível indício de Restituição do INSS.

Missão: atender com educação, objetividade e sensibilidade; explicar que não é Imposto de Renda; identificar se houve trabalho simultâneo em duas ou mais instituições; orientar envio do CNIS.

Regras:
- Tratar sempre como Dr(a). quando houver nome.
- Não prometer direito, valor, prazo ou resultado.
- Fazer uma pergunta por vez.
- Ser direto: médicos têm pouco tempo.
- Se houver dúvida sobre golpe/fraude, responder com firmeza institucional e oferecer validação humana.
- Quando chegar ao CNIS, orientar Meu INSS > Vínculos, contribuições e remunerações.`;

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    void fetchMe().then((me) => setAuthed(Boolean(me.authenticated)));
    const onAuth = () => setAuthed(false);
    window.addEventListener("ir-auth-required", onAuth);
    return () => window.removeEventListener("ir-auth-required", onAuth);
  }, []);

  if (authed === null) {
    return <p className="login-boot">Carregando...</p>;
  }
  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }
  return <Panel onLogout={() => setAuthed(false)} />;
}

function Panel({ onLogout }: { onLogout: () => void }) {
  const [page, setPage] = useState<PanelPage>("dashboard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [reheat, setReheat] = useState<ReheatRow[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [missingDocs, setMissingDocs] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [reheatBusy, setReheatBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [replyToMessage, setReplyToMessage] = useState<MessageRow | null>(null);
  const [replyBusy, setReplyBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [decideBusyId, setDecideBusyId] = useState<string | null>(null);
  const [leadOutreachBusyId, setLeadOutreachBusyId] = useState<string | null>(null);
  const [conversationOutreachBusyId, setConversationOutreachBusyId] = useState<string | null>(
    null,
  );
  const [outreachRows, setOutreachRows] = useState<OutreachCsvRow[]>([]);
  const [outreachFilename, setOutreachFilename] = useState("");
  const [outreachCost, setOutreachCost] = useState("0,35");
  const [outreachBusy, setOutreachBusy] = useState(false);
  const [outreachSummary, setOutreachSummary] =
    useState<OutreachBatchSummary | null>(null);
  const [followUpBusy, setFollowUpBusy] = useState<ConversationFollowUpType | null>(
    null,
  );
  const [reactionBusyId, setReactionBusyId] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("41984837507");
  const [testName, setTestName] = useState("Rodrigo");
  const [testBusy, setTestBusy] = useState<"outreach" | "trust" | "explain" | null>(
    null,
  );
  const [conversationFilter, setConversationFilter] =
    useState<(typeof IR_STATUSES)[number]>("all");
  const [conversationSearch, setConversationSearch] = useState("");

  const integrations = (health?.integrations ?? {}) as Record<string, boolean>;
  const selectedConversation = conversations.find((c) => c.id === selectedConvId);
  const waitingHumanCount = conversations.filter(
    (c) => c.status === "waiting_human",
  ).length;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: conversations.length };
    for (const conversation of conversations) {
      counts[conversation.status] = (counts[conversation.status] ?? 0) + 1;
    }
    return counts;
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const q = conversationSearch.trim().toLowerCase();
    return conversations
      .filter((conversation) => {
        if (conversationFilter === "all") return true;
        return conversation.status === conversationFilter;
      })
      .filter((conversation) => {
        if (!q) return true;
        return (
          (conversation.lead_name ?? "").toLowerCase().includes(q) ||
          conversation.phone.includes(q) ||
          (conversation.source ?? "").toLowerCase().includes(q) ||
          sourceLabel(conversation.source, conversation.lead_source)
            .toLowerCase()
            .includes(q) ||
          conversation.status.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aTime = new Date(
          a.updated_at ?? a.last_inbound_at ?? a.last_outbound_at ?? 0,
        ).getTime();
        const bTime = new Date(
          b.updated_at ?? b.last_inbound_at ?? b.last_outbound_at ?? 0,
        ).getTime();
        return bTime - aTime;
      });
  }, [conversationFilter, conversationSearch, conversations]);

  const dashboardStats = useMemo(
    () => {
      const last24h = conversations.filter((conversation) => {
        const raw =
          conversation.last_message_at ??
          conversation.updated_at ??
          conversation.last_inbound_at ??
          conversation.last_outbound_at;
        return raw ? Date.now() - new Date(raw).getTime() <= 24 * 60 * 60 * 1000 : false;
      }).length;
      const advanced = conversations.filter((conversation) =>
        ["qualifying", "waiting_documents", "waiting_human"].includes(conversation.status),
      ).length;
      const rate = conversations.length
        ? `${Math.round((advanced / conversations.length) * 100)}%`
        : "0%";
      return [
        {
          label: "Total de conversas",
          value: conversations.length,
          hint: "WhatsApp IR",
          icon: MessageSquare,
        },
        {
          label: "Últimas 24h",
          value: last24h,
          hint: "Atividade recente",
          icon: Clock3,
        },
        {
          label: "Leads",
          value: leads.length,
          hint: "Formulário Meta",
          icon: Users,
        },
        {
          label: "Templates",
          value: leads.filter((lead) => lead.status.includes("template")).length,
          hint: "Contato inicial",
          icon: Send,
        },
        {
          label: "Aguardando CNIS",
          value: conversations.filter((c) => c.status === "waiting_documents").length,
          hint: "Docs pendentes",
          icon: FileText,
        },
        {
          label: "Atenção humana",
          value: waitingHumanCount,
          hint: "Takeover",
          icon: UserRoundCheck,
          tone: waitingHumanCount > 0 ? "danger" : "default",
        },
        {
          label: "Taxa de avanço",
          value: rate,
          hint: "Qualificação",
          icon: CheckCircle2,
        },
      ];
    },
    [conversations, leads, waitingHumanCount],
  );

  async function onLogoutClick() {
    await logout();
    onLogout();
  }

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [h, s, l, r, i, c] = await Promise.all([
        fetchHealth(),
        fetchPanelStatus(),
        fetchLeads(),
        fetchReheat(),
        fetchImports(),
        fetchConversations(),
      ]);
      setHealth(h);
      setStatus(s);
      setLeads((l.leads ?? []) as LeadRow[]);
      setReheat((r.items ?? []) as ReheatRow[]);
      setImports((i.imports ?? []) as ImportRow[]);
      setConversations((c.conversations ?? []) as ConversationRow[]);
      setNote([r.note, i.note].filter(Boolean).join(" · "));
    } catch (err) {
      if (err instanceof AuthRequiredError) return;
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function refreshConversationDetail(conversationId: string) {
    const [messageResult, documentResult] = await Promise.all([
      fetchConversationMessages(conversationId),
      fetchConversationDocuments(conversationId),
    ]);
    setMessages((messageResult.messages ?? []) as MessageRow[]);
    setDocuments((documentResult.documents ?? []) as DocumentRow[]);
    setMissingDocs(documentResult.missing ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!selectedConvId) {
      setMessages([]);
      setDocuments([]);
      setMissingDocs([]);
      setReplyToMessage(null);
      return;
    }
    void refreshConversationDetail(selectedConvId)
      .catch((err) => {
        if (!(err instanceof AuthRequiredError)) setError(toErrorMessage(err));
      });
  }, [selectedConvId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchConversations()
        .then((result) => setConversations((result.conversations ?? []) as ConversationRow[]))
        .catch((err) => {
          if (!(err instanceof AuthRequiredError)) setError(toErrorMessage(err));
        });
      if (selectedConvId) {
        void refreshConversationDetail(selectedConvId).catch((err) => {
          if (!(err instanceof AuthRequiredError)) setError(toErrorMessage(err));
        });
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [selectedConvId]);

  async function onCsvFile(file: File | null) {
    if (!file) return;
    setImportBusy(true);
    setActionMsg("");
    try {
      const text = await file.text();
      const result = await uploadImportCsv(file.name, text);
      setActionMsg(
        `Import OK: ${result.conversations} conversas, ${result.messages} mensagens, ${result.skipped} ignoradas.`,
      );
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setImportBusy(false);
    }
  }

  async function onRunReheat() {
    setReheatBusy(true);
    setActionMsg("");
    try {
      const result = await runReheat(50);
      setActionMsg(`Reaquecer: ${result.scored} conversas pontuadas.`);
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setReheatBusy(false);
    }
  }

  async function onTakeover() {
    if (!selectedConvId) return;
    try {
      await takeoverConversation(selectedConvId);
      setActionMsg("IA pausada: conversa em waiting_human.");
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function onResume() {
    if (!selectedConvId) return;
    try {
      await resumeConversation(selectedConvId);
      setActionMsg("Conversa devolvida ao agente.");
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function onSendConversationFollowUp(type: ConversationFollowUpType) {
    if (!selectedConvId) return;
    setFollowUpBusy(type);
    setActionMsg("");
    setError("");
    try {
      const result = await sendConversationFollowUp(selectedConvId, type);
      setActionMsg(`Follow-up ${result.templateName} enviado.`);
      await refresh();
      await refreshConversationDetail(selectedConvId);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setFollowUpBusy(null);
    }
  }

  async function onSendReply() {
    if (!selectedConvId || !replyDraft.trim()) return;
    setReplyBusy(true);
    setActionMsg("");
    try {
      await sendHumanReply(selectedConvId, replyDraft.trim(), replyToMessage?.id);
      setReplyDraft("");
      setReplyToMessage(null);
      setActionMsg("Mensagem humana enviada.");
      const r = await fetchConversationMessages(selectedConvId);
      setMessages((r.messages ?? []) as MessageRow[]);
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setReplyBusy(false);
    }
  }

  async function onSendMedia(file: File | null, caption?: string) {
    if (!selectedConvId || !file) return;
    if (file.size > 3_800_000) {
      setError("Arquivo maior que o limite atual de 3,8 MB.");
      return;
    }
    setMediaBusy(true);
    setActionMsg("");
    try {
      const base64 = await fileToBase64(file);
      await sendHumanMedia(selectedConvId, {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        base64,
        caption: caption?.trim() || replyDraft.trim() || undefined,
        replyToMessageId: replyToMessage?.id,
      });
      setReplyDraft("");
      setReplyToMessage(null);
      setActionMsg("Anexo humano enviado.");
      const r = await fetchConversationMessages(selectedConvId);
      setMessages((r.messages ?? []) as MessageRow[]);
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setMediaBusy(false);
    }
  }

  async function onDeleteMessage(messageId: string) {
    if (!selectedConvId) return;
    const ok = window.confirm(
      "Apagar esta mensagem do painel IR? Isso não apaga a mensagem já entregue no WhatsApp do lead.",
    );
    if (!ok) return;
    setActionMsg("");
    try {
      await deletePanelMessage(selectedConvId, messageId);
      setActionMsg("Mensagem apagada do painel.");
      const r = await fetchConversationMessages(selectedConvId);
      setMessages((r.messages ?? []) as MessageRow[]);
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function onSendReaction(messageId: string, emoji: string) {
    if (!selectedConvId) return;
    setReactionBusyId(messageId);
    setActionMsg("");
    setError("");
    try {
      await sendMessageReaction(selectedConvId, messageId, emoji);
      setActionMsg(`Reação ${emoji} enviada.`);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setReactionBusyId(null);
    }
  }

  async function onOpenDocument(id: string) {
    try {
      const { url } = await openDocument(id);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function onDownloadDocument(id: string) {
    try {
      const { url } = await openDocument(id);
      const link = document.createElement("a");
      link.href = url;
      link.download = "";
      link.target = "_blank";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function onDecide(id: string, decision: "approved" | "rejected") {
    setDecideBusyId(id);
    setActionMsg("");
    try {
      const result = await decideReheat(id, decision);
      setActionMsg(
        decision === "rejected"
          ? "Reaquecimento rejeitado."
          : result.sent
            ? "Aprovado e template enviado."
            : result.note,
      );
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setDecideBusyId(null);
    }
  }

  async function onTestOutreach() {
    setTestBusy("outreach");
    setActionMsg("");
    setError("");
    try {
      const result = await sendTestOutreach(testPhone, testName);
      setActionMsg(
        `Template contato_inicial enfileirado para ${result.phone}. Clique em Sim no WhatsApp para testar a abertura.`,
      );
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setTestBusy(null);
    }
  }

  async function onLeadInitialOutreach(lead: LeadRow) {
    if (!lead.id) return;
    setLeadOutreachBusyId(lead.id);
    setActionMsg("");
    setError("");
    try {
      const result = await sendLeadInitialOutreach(lead.id);
      setActionMsg(
        `Contato inicial enfileirado para ${formatPhoneDisplay(result.phone)}.`,
      );
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLeadOutreachBusyId(null);
    }
  }

  async function onOutreachCsvFile(file: File | null) {
    if (!file) return;
    setError("");
    setActionMsg("");
    setOutreachSummary(null);
    try {
      const text = await file.text();
      const rows = parseOutreachCsv(text);
      setOutreachRows(rows);
      setOutreachFilename(file.name);
      setActionMsg(`Lista analisada: ${rows.length} linhas encontradas.`);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function onOutreachBatchSend(rows: OutreachCsvRow[]) {
    const eligible = rows.filter((row) => row.status === "eligible");
    if (!eligible.length) return;
    const ok = window.confirm(
      `Enfileirar contato_inicial para ${eligible.length} contatos elegíveis?`,
    );
    if (!ok) return;
    setOutreachBusy(true);
    setActionMsg("");
    setError("");
    try {
      const result = await sendOutreachBatch(
        eligible.map((row) => ({
          name: row.name,
          phone: row.phone,
          email: row.email,
          isDoctor: row.isDoctor,
        })),
      );
      setOutreachSummary(result);
      setActionMsg(
        `Disparo criado: ${result.queued} contatos enfileirados no template ${result.templateName}.`,
      );
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setOutreachBusy(false);
    }
  }

  async function onConversationInitialOutreach(conversation: ConversationRow) {
    setConversationOutreachBusyId(conversation.id);
    setActionMsg("");
    setError("");
    try {
      const result = await sendConversationInitialOutreach(conversation.id);
      setActionMsg(
        `Contato inicial enfileirado para ${formatPhoneDisplay(result.phone)}.`,
      );
      await refresh();
      if (selectedConvId) {
        await refreshConversationDetail(selectedConvId);
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setConversationOutreachBusyId(null);
    }
  }

  async function onTestDrip(which: "trust" | "explain") {
    setTestBusy(which);
    setActionMsg("");
    setError("");
    try {
      const result = await sendTestDrip(testPhone, testName, which);
      setActionMsg(`Template ${result.templateName} enviado para ${result.phone}.`);
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setTestBusy(null);
    }
  }

  const currentPage = NAV.find((item) => item.id === page) ?? NAV[0];

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        waitingHumanCount={waitingHumanCount}
        onNavigate={setPage}
        onLogout={() => void onLogoutClick()}
      />

      <main className="main">
        {page !== "conversas" ? (
        <header className="topbar">
          <div className="topbar-copy">
            <h1>{page === "dashboard" ? "Dashboard operacional" : currentPage.label}</h1>
            <p>{pageDescription(page)}</p>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw className={loading ? "icon spin" : "icon"} />
            Atualizar
          </button>
        </header>
        ) : null}

        <div className={page === "conversas" ? "alerts alerts-floating" : "alerts"}>
          {error ? (
            <p className="alert alert-danger">{error} — confira se a API está no ar.</p>
          ) : null}
          {actionMsg ? <p className="alert alert-info">{actionMsg}</p> : null}
        </div>

        {page === "dashboard" ? (
          <Dashboard
            stats={dashboardStats}
            integrations={integrations}
            conversations={conversations}
            leads={leads}
            note={note}
          />
        ) : null}

        {page === "conversas" ? (
          <ConversationsPage
            conversations={filteredConversations}
            allConversations={conversations}
            statusCounts={statusCounts}
            selectedConversation={selectedConversation}
            selectedConvId={selectedConvId}
            messages={messages}
            documents={documents}
            missingDocs={missingDocs}
            filter={conversationFilter}
            search={conversationSearch}
            replyDraft={replyDraft}
            replyToMessage={replyToMessage}
            replyBusy={replyBusy}
            mediaBusy={mediaBusy}
            conversationOutreachBusyId={conversationOutreachBusyId}
            followUpBusy={followUpBusy}
            reactionBusyId={reactionBusyId}
            onFilter={setConversationFilter}
            onSearch={setConversationSearch}
            onSelect={setSelectedConvId}
            onConversationInitialOutreach={(conversation) =>
              void onConversationInitialOutreach(conversation)
            }
            onSendFollowUp={(type) => void onSendConversationFollowUp(type)}
            onTakeover={() => void onTakeover()}
            onResume={() => void onResume()}
            onOpenDocument={(id) => void onOpenDocument(id)}
            onDownloadDocument={(id) => void onDownloadDocument(id)}
            onReplyDraft={setReplyDraft}
            onReplyTo={setReplyToMessage}
            onClearReplyTo={() => setReplyToMessage(null)}
            onSendReply={() => void onSendReply()}
            onSendMedia={(file) => void onSendMedia(file)}
            onDeleteMessage={(id) => void onDeleteMessage(id)}
            onReact={(id, emoji) => void onSendReaction(id, emoji)}
          />
        ) : null}

        {page === "leads" ? (
          <LeadsPage
            leads={leads}
            busyLeadId={leadOutreachBusyId}
            onSendInitial={(lead) => void onLeadInitialOutreach(lead)}
          />
        ) : null}

        {page === "disparos" ? (
          <OutreachPage
            rows={outreachRows}
            filename={outreachFilename}
            costPerTemplate={outreachCost}
            busy={outreachBusy}
            summary={outreachSummary}
            onCostChange={setOutreachCost}
            onFile={(file) => void onOutreachCsvFile(file)}
            onSend={() => void onOutreachBatchSend(outreachRows)}
          />
        ) : null}

        {page === "reaquecer" ? (
          <ReheatPage
            reheat={reheat}
            busy={reheatBusy}
            decideBusyId={decideBusyId}
            onRun={() => void onRunReheat()}
            onDecide={(id, decision) => void onDecide(id, decision)}
          />
        ) : null}

        {page === "importar" ? (
          <ImportsPage
            imports={imports}
            busy={importBusy}
            onFile={(file) => void onCsvFile(file)}
          />
        ) : null}

        {page === "config" ? (
          <ConfigPage
            status={status}
            testName={testName}
            testPhone={testPhone}
            testBusy={testBusy}
            onTestName={setTestName}
            onTestPhone={setTestPhone}
            onTestOutreach={() => void onTestOutreach()}
            onTestDrip={(which) => void onTestDrip(which)}
          />
        ) : null}
      </main>

      <MobileTabBar page={page} waitingHumanCount={waitingHumanCount} onNavigate={setPage} />
    </div>
  );
}

function Sidebar({
  page,
  waitingHumanCount,
  onNavigate,
  onLogout,
}: {
  page: PanelPage;
  waitingHumanCount: number;
  onNavigate: (page: PanelPage) => void;
  onLogout: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">IR</div>
        <div className="brand-text">
          <p>IR Consultoria</p>
          <span>Restituição INSS</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Navegação principal">
        {NAV.map((item) => {
          const active = page === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={active ? "nav-item active" : "nav-item"}
              onClick={() => onNavigate(item.id)}
            >
              <Icon className="icon" />
              <span>{item.label}</span>
              {item.id === "conversas" && waitingHumanCount > 0 ? (
                <strong className="nav-badge">{waitingHumanCount}</strong>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-user">
        <div className="avatar">IR</div>
        <div className="user-copy">
          <p>Inglyd Reis</p>
          <span>Comercial/Admin</span>
        </div>
        <button type="button" className="logout-icon" aria-label="Sair" onClick={onLogout}>
          <LogOut className="icon" />
        </button>
      </div>
    </aside>
  );
}

function MobileTabBar({
  page,
  waitingHumanCount,
  onNavigate,
}: {
  page: PanelPage;
  waitingHumanCount: number;
  onNavigate: (page: PanelPage) => void;
}) {
  const items = NAV.filter((item) =>
    ["dashboard", "conversas", "leads", "config"].includes(item.id),
  );
  return (
    <nav className="mobile-tabbar" aria-label="Navegação móvel">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className={page === item.id ? "mobile-tab active" : "mobile-tab"}
            onClick={() => onNavigate(item.id)}
          >
            <Icon className="icon" />
            <span>{item.label}</span>
            {item.id === "conversas" && waitingHumanCount > 0 ? (
              <strong>{waitingHumanCount}</strong>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

function Dashboard({
  stats,
  integrations,
  conversations,
  leads,
  note,
}: {
  stats: Array<{
    label: string;
    value: number | string;
    hint: string;
    icon: LucideIcon;
    tone?: string;
  }>;
  integrations: Record<string, boolean>;
  conversations: ConversationRow[];
  leads: LeadRow[];
  note: string;
}) {
  const last24h = conversations.filter((conversation) => {
    const raw =
      conversation.last_message_at ??
      conversation.updated_at ??
      conversation.last_inbound_at ??
      conversation.last_outbound_at;
    return raw ? Date.now() - new Date(raw).getTime() <= 24 * 60 * 60 * 1000 : false;
  });
  const qualifiedRecent = conversations
    .filter((conversation) =>
      ["qualifying", "waiting_documents", "waiting_human"].includes(conversation.status),
    )
    .slice(0, 5);
  const statusEntries = Object.entries(
    conversations.reduce<Record<string, number>>((acc, conversation) => {
      acc[conversation.status] = (acc[conversation.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const maxStatus = Math.max(1, ...statusEntries.map((entry) => entry[1]));
  const dailyCounts = buildDailyConversationCounts(conversations);
  const maxDaily = Math.max(1, ...dailyCounts.map((day) => day.count));
  const templateCount = leads.filter((lead) => lead.status.includes("template")).length;

  return (
    <div className="page-stack">
      <section className="section-toolbar">
        <p>Métricas do período selecionado. Últimas 24h continua rolando, independente do calendário.</p>
        <button type="button" className="btn btn-outline btn-sm">
          Este mês
        </button>
      </section>

      <section className="stats-grid">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article
              key={stat.label}
              className={stat.tone === "danger" ? "metric-card attention" : "metric-card"}
            >
              <div className="metric-icon">
                <Icon className="icon" />
              </div>
              <div>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
                <span>{stat.hint}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="dashboard-operational-grid">
        <section className="dashboard-card chart-card wide">
          <header>
            <h2>Conversas por dia</h2>
            <p>Últimos 30 dias (dados reais)</p>
          </header>
          <div className="daily-chart">
            {dailyCounts.map((day) => (
              <div key={day.label} className="daily-bar">
                <span style={{ height: `${Math.max(4, (day.count / maxDaily) * 100)}%` }} />
                <em>{day.label}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-card recent-card">
          <header>
            <h2>Qualificados recentes</h2>
            <p>Últimas conversas com avanço no funil</p>
          </header>
          <div className="dashboard-list">
            {qualifiedRecent.map((conversation) => (
              <div key={conversation.id} className="dashboard-list-row">
                <div>
                  <strong>{leadDisplayName(conversation)}</strong>
                  <span>
                    {formatPhoneDisplay(conversation.phone)} ·{" "}
                    {relativeTime(conversation.last_message_at ?? conversation.updated_at)}
                  </span>
                </div>
                <Badge tone={statusTone(conversation.status)}>
                  {statusLabel(conversation.status)}
                </Badge>
              </div>
            ))}
            {!qualifiedRecent.length ? <EmptyState text="Nenhuma conversa qualificada ainda." compact /> : null}
          </div>
        </section>
      </section>

      <section className="dashboard-card status-card">
        <header>
          <h2>Status das conversas</h2>
          <p>Distribuição atual</p>
        </header>
        <div className="status-chart">
          {statusEntries.map(([status, count]) => (
            <div key={status} className="status-bar">
              <span style={{ height: `${Math.max(8, (count / maxStatus) * 100)}%` }} />
              <strong>{count}</strong>
              <em>{statusLabel(status)}</em>
            </div>
          ))}
          {!statusEntries.length ? <EmptyState text="Sem conversas para distribuir." compact /> : null}
        </div>
      </section>

      <section className="dashboard-operational-grid bottom">
        <section className="dashboard-card">
          <header>
            <h2>Funil Restituição INSS</h2>
            <p>Etapas operacionais do produto</p>
          </header>
          <div className="funnel">
            {["Formulário", "Template", "Conversa", "CNIS", "Humano + Advbox"].map((step, index) => (
              <div key={step} className="funnel-step">
                <span>{index + 1}</span>
                <p>{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-card">
          <header>
            <h2>Operação</h2>
            <p>Sinais que pedem acompanhamento</p>
          </header>
          <div className="dashboard-list">
            <div className="dashboard-list-row">
              <div>
                <strong>Últimas 24h</strong>
                <span>Conversas com atividade recente</span>
              </div>
              <Badge>{last24h.length}</Badge>
            </div>
            <div className="dashboard-list-row">
              <div>
                <strong>Templates</strong>
                <span>Fila/envio do contato inicial</span>
              </div>
              <Badge tone={templateCount > 0 ? "warning" : "muted"}>{templateCount}</Badge>
            </div>
            {Object.entries(integrations).map(([key, value]) => (
              <div key={key} className="dashboard-list-row">
                <div>
                  <strong>{formatIntegrationName(key)}</strong>
                  <span>Status da integração</span>
                </div>
                <Badge tone={value ? "success" : "warning"}>
                  {value ? "OK" : "Pendente"}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      </section>

      {note ? <p className="note">{note}</p> : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <article className={tone === "danger" ? "metric-card attention" : "metric-card"}>
      <div className="metric-icon">
        <Icon className="icon" />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{hint}</span>
      </div>
    </article>
  );
}

function ConversationsPage({
  conversations,
  allConversations,
  statusCounts,
  selectedConversation,
  selectedConvId,
  messages,
  documents,
  missingDocs,
  filter,
  search,
  replyDraft,
  replyToMessage,
  replyBusy,
  mediaBusy,
  conversationOutreachBusyId,
  followUpBusy,
  reactionBusyId,
  onFilter,
  onSearch,
  onSelect,
  onConversationInitialOutreach,
  onSendFollowUp,
  onTakeover,
  onResume,
  onOpenDocument,
  onDownloadDocument,
  onReplyDraft,
  onReplyTo,
  onClearReplyTo,
  onSendReply,
  onSendMedia,
  onDeleteMessage,
  onReact,
}: {
  conversations: ConversationRow[];
  allConversations: ConversationRow[];
  statusCounts: Record<string, number>;
  selectedConversation?: ConversationRow;
  selectedConvId: string | null;
  messages: MessageRow[];
  documents: DocumentRow[];
  missingDocs: string[];
  filter: (typeof IR_STATUSES)[number];
  search: string;
  replyDraft: string;
  replyToMessage: MessageRow | null;
  replyBusy: boolean;
  mediaBusy: boolean;
  conversationOutreachBusyId: string | null;
  followUpBusy: ConversationFollowUpType | null;
  reactionBusyId: string | null;
  onFilter: (filter: (typeof IR_STATUSES)[number]) => void;
  onSearch: (search: string) => void;
  onSelect: (id: string) => void;
  onConversationInitialOutreach: (conversation: ConversationRow) => void;
  onSendFollowUp: (type: ConversationFollowUpType) => void;
  onTakeover: () => void;
  onResume: () => void;
  onOpenDocument: (id: string) => void;
  onDownloadDocument: (id: string) => void;
  onReplyDraft: (text: string) => void;
  onReplyTo: (message: MessageRow) => void;
  onClearReplyTo: () => void;
  onSendReply: () => void;
  onSendMedia: (file: File | null, caption?: string) => void;
  onDeleteMessage: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
}) {
  const aiPaused = selectedConversation?.status === "waiting_human";
  const metaWindowClosed = selectedConversation
    ? isMetaWindowClosed(selectedConversation)
    : false;
  const threadRef = useRef<HTMLDivElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const messagesWithMedia = useMemo(
    () => attachDocumentFallbacksToMessages(messages, documents),
    [messages, documents],
  );

  useEffect(() => {
    if (!selectedConversation) return;
    window.requestAnimationFrame(() => {
      if (threadRef.current) {
        threadRef.current.scrollTop = threadRef.current.scrollHeight;
      } else {
        threadEndRef.current?.scrollIntoView({ block: "end" });
      }
    });
  }, [selectedConversation?.id, messages.length]);

  useEffect(() => {
    if (!recording) return undefined;
    const timer = window.setInterval(() => {
      setRecordingSeconds((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    setPendingAttachment((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, [selectedConversation?.id]);

  useEffect(() => {
    return () => {
      if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.url);
    };
  }, [pendingAttachment]);

  useEffect(() => {
    if (!attachOpen) return undefined;
    function closeOnOutsideClick(event: MouseEvent) {
      if (
        attachMenuRef.current &&
        event.target instanceof Node &&
        !attachMenuRef.current.contains(event.target)
      ) {
        setAttachOpen(false);
      }
    }
    window.addEventListener("mousedown", closeOnOutsideClick);
    return () => window.removeEventListener("mousedown", closeOnOutsideClick);
  }, [attachOpen]);

  async function startAudioRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      window.alert("Este navegador não liberou gravação de áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderStreamRef.current = stream;
      recorderChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recorderChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recorderChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
        recorderRef.current = null;
        recorderChunksRef.current = [];
        setRecording(false);
        setRecordingSeconds(0);
        if (!blob.size) return;
        const file = new File([blob], `audio-ir-${Date.now()}.webm`, {
          type: blob.type || "audio/webm",
        });
        stageAttachment(file);
      };
      recorder.start();
      setRecording(true);
      setRecordingSeconds(0);
    } catch {
      window.alert("Não consegui acessar o microfone.");
    }
  }

  function stopAudioRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  function attachmentKind(file: File): PendingAttachment["kind"] {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("audio/")) return "audio";
    if (file.type.startsWith("video/")) return "video";
    return "file";
  }

  function stageAttachment(file: File | null) {
    if (!file) return;
    if (file.size > 3_800_000) {
      window.alert("Arquivo maior que o limite atual de 3,8 MB.");
      return;
    }
    setPendingAttachment((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return {
        file,
        url: URL.createObjectURL(file),
        kind: attachmentKind(file),
      };
    });
    setAttachOpen(false);
  }

  function clearPendingAttachment() {
    setPendingAttachment((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  function submitComposer() {
    if (pendingAttachment) {
      onSendMedia(pendingAttachment.file, replyDraft.trim() || undefined);
      clearPendingAttachment();
      return;
    }
    onSendReply();
  }

  if (selectedConversation) {
    return (
      <section className="conversation-detail-page">
        <header className="detail-header">
          <button
            type="button"
            className="back-button"
            aria-label="Voltar"
            onClick={() => onSelect("")}
          >
            <ArrowLeft className="icon" />
          </button>
          <div className="detail-avatar">
            {getInitials(leadDisplayName(selectedConversation))}
          </div>
          <div className="detail-title">
            <div>
              <h1>{leadDisplayName(selectedConversation)}</h1>
              {aiPaused ? <span className="paused-pill">IA pausada</span> : <Badge>IA ativa</Badge>}
            </div>
            <p className="mono">
              {formatPhoneDisplay(selectedConversation.phone)}
              <span> · </span>
              {sourceLabel(
                selectedConversation.source,
                selectedConversation.lead_source,
              )}
            </p>
          </div>
          <Badge tone={statusTone(selectedConversation.status)}>
            {statusLabel(selectedConversation.status)}
          </Badge>
        </header>

        <div className="detail-actions">
          <button
            type="button"
            className="btn btn-outline"
            disabled={aiPaused}
            onClick={onTakeover}
          >
            <UserRoundCheck className="icon" />
            Pausar IA
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={!aiPaused}
            onClick={onResume}
          >
            <BotMessageSquare className="icon" />
            Devolver para IA
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={aiPaused}
            onClick={onTakeover}
          >
            <UserRoundCheck className="icon" />
            Encaminhar humano
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={Boolean(followUpBusy)}
            onClick={() => onSendFollowUp("cnis_reminder")}
          >
            <FileText className="icon" />
            {followUpBusy === "cnis_reminder" ? "Enviando..." : "Lembrete CNIS"}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={Boolean(followUpBusy)}
            onClick={() => onSendFollowUp("continue_analysis")}
          >
            <CheckCircle2 className="icon" />
            {followUpBusy === "continue_analysis"
              ? "Enviando..."
              : "Continuar análise"}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={Boolean(followUpBusy)}
            onClick={() => onSendFollowUp("resume_analysis")}
          >
            <MessageSquare className="icon" />
            {followUpBusy === "resume_analysis"
              ? "Enviando..."
              : "Retomar análise"}
          </button>
        </div>

        {metaWindowClosed ? (
          <div className="meta-window-alert">
            Janela livre de 24h da Meta fechada — texto livre pode falhar. Use{" "}
            <strong>Lembrete CNIS</strong>, <strong>Continuar análise</strong> ou{" "}
            <strong>Retomar análise</strong> (templates aprovados), ou peça um “oi” ao lead.
            A Meta não permite burlar essa regra.
          </div>
        ) : null}

        <div className="detail-layout">
          <div className="conversation-timeline">
            <div className="message-thread lis-thread" ref={threadRef}>
              {messagesWithMedia.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  leadName={leadMessageName(selectedConversation)}
                  onReply={onReplyTo}
                  onDelete={onDeleteMessage}
                  onOpenDocument={onOpenDocument}
                  onReact={onReact}
                  reactionBusy={reactionBusyId === message.id}
                />
              ))}
              {!messages.length ? <EmptyState text="Sem mensagens nesta conversa." compact /> : null}
              <div ref={threadEndRef} />
            </div>

            <div className="composer-shell">
              {aiPaused ? (
                <form
                  className="composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitComposer();
                  }}
                >
                  {replyToMessage ? (
                    <div className="reply-preview">
                      <Reply className="icon" />
                      <div>
                        <strong>
                          Respondendo {replyToMessage.role === "user" ? "lead" : "mensagem enviada"}
                        </strong>
                        <span>{messagePreview(replyToMessage)}</span>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Cancelar resposta"
                        onClick={onClearReplyTo}
                      >
                        <X className="icon" />
                      </button>
                    </div>
                  ) : null}
                  {pendingAttachment ? (
                    <div className="attachment-preview">
                      <AttachmentPreview attachment={pendingAttachment} />
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Remover anexo"
                        onClick={clearPendingAttachment}
                      >
                        <X className="icon" />
                      </button>
                    </div>
                  ) : null}
                  <textarea
                    value={replyDraft}
                    onChange={(event) => onReplyDraft(event.target.value)}
                    placeholder="Escreva como humano. Enter envia. Shift+Enter quebra linha."
                    rows={3}
                    disabled={replyBusy || mediaBusy}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey) return;
                      if (event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      submitComposer();
                    }}
                  />
                  <div className="composer-toolbox" ref={attachMenuRef}>
                    <button
                      type="button"
                      className={attachOpen ? "icon-button attach-trigger active" : "icon-button attach-trigger"}
                      aria-label="Anexar"
                      disabled={replyBusy || mediaBusy}
                      onClick={() => setAttachOpen((current) => !current)}
                    >
                      <Plus className="icon" />
                    </button>
                    {attachOpen ? (
                      <div className="attach-menu">
                        <button
                          type="button"
                          className={recording ? "attach-option recording" : "attach-option"}
                          disabled={replyBusy || mediaBusy}
                          onClick={recording ? stopAudioRecording : startAudioRecording}
                        >
                          <Mic className="icon" />
                          {recording ? `Parar ${formatDuration(recordingSeconds)}` : "Gravar áudio"}
                        </button>
                        <FilePickerButton
                          label="Áudio"
                          icon={Mic}
                          accept="audio/*"
                          disabled={replyBusy || mediaBusy}
                          onFile={stageAttachment}
                        />
                        <FilePickerButton
                          label="Imagem"
                          icon={ImageIcon}
                          accept="image/*"
                          disabled={replyBusy || mediaBusy}
                          onFile={stageAttachment}
                        />
                        <FilePickerButton
                          label="Vídeo"
                          icon={Video}
                          accept="video/*"
                          disabled={replyBusy || mediaBusy}
                          onFile={stageAttachment}
                        />
                        <FilePickerButton
                          label="Arquivo"
                          icon={FileUp}
                          accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,application/pdf"
                          disabled={replyBusy || mediaBusy}
                          onFile={stageAttachment}
                        />
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={replyBusy || mediaBusy || (!replyDraft.trim() && !pendingAttachment)}
                  >
                    <Send className="icon" />
                    {replyBusy || mediaBusy ? "Enviando..." : "Enviar"}
                  </button>
                </form>
              ) : (
                <div className="bot-status-panel">
                  <div>
                    <Bot className="icon" />
                    <span>Agente IA está respondendo automaticamente</span>
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={onTakeover}>
                    <UserRoundCheck className="icon" />
                    Assumir
                  </button>
                </div>
              )}

              <div className="ai-instruction-box">
                <p>Instrução para a IA</p>
                <div>
                  <input
                    placeholder="Ex.: priorize pedir o CNIS; não falar de valor garantido"
                    disabled
                  />
                  <button type="button" className="btn btn-outline btn-sm" disabled>
                    Aplicar
                  </button>
                </div>
                <span>Placeholder visual — ainda não grava no backend da IR.</span>
              </div>
            </div>
          </div>

          <CaseSidePanel
            conversation={selectedConversation}
            messages={messages}
            documents={documents}
            missingDocs={missingDocs}
            outreachBusy={conversationOutreachBusyId === selectedConversation.id}
            onOpenDocument={onOpenDocument}
            onDownloadDocument={onDownloadDocument}
            onSendInitialOutreach={() => onConversationInitialOutreach(selectedConversation)}
            onTakeover={onTakeover}
            onResume={onResume}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="conversation-list-page">
      <header className="list-header">
        <div>
          <h1>Inbox de conversas</h1>
          <p>{allConversations.length} conversas · atualizado em tempo quase real</p>
        </div>
        <div className="searchbox">
          <Search className="icon" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar nome, telefone ou status..."
          />
        </div>
      </header>

      <div className="filter-row list-filters">
        {IR_STATUSES.map((item) => {
          const active = filter === item;
          const count = statusCounts[item] ?? 0;
          return (
            <button
              key={item}
              type="button"
              className={active ? "filter-chip active" : "filter-chip"}
              onClick={() => onFilter(item)}
            >
              {statusLabel(item)}
              <span>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="lis-table-wrap">
        <table className="lis-table">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Contato</th>
              <th>Estado</th>
              <th>Última mensagem</th>
              <th>Origem</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((conversation) => {
              const paused = conversation.status === "waiting_human";
              return (
                <tr key={conversation.id}>
                  <td>
                    <div className="lead-cell">
                      <span className={isRecent(conversation) ? "activity-dot on" : "activity-dot"} />
                      <div>
                        <p>
                          {leadDisplayName(conversation)}
                          {paused ? <span className="paused-pill">IA pausada</span> : null}
                        </p>
                        <span>{formatPhoneDisplay(conversation.phone)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{formatPhoneDisplay(conversation.phone)}</td>
                  <td>
                    <Badge tone={statusTone(conversation.status)}>
                      {statusLabel(conversation.status)}
                    </Badge>
                  </td>
                  <td>
                    <p className="last-message">
                      {conversation.last_message_text ?? "Sem mensagens ainda"}
                    </p>
                    <span className="table-sub">
                      {relativeTime(
                        conversation.last_message_at ??
                          conversation.updated_at ??
                          conversation.last_inbound_at ??
                          conversation.last_outbound_at,
                      )}
                    </span>
                  </td>
                  <td>
                    {(() => {
                      const label = sourceLabel(
                        conversation.source,
                        conversation.lead_source,
                      );
                      return (
                        <span className={`source-pill tone-${sourceTone(label)}`}>
                          {label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="table-action">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => onSelect(conversation.id)}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              );
            })}
            {!conversations.length ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState text="Nenhuma conversa encontrada para este filtro." compact />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LeadsPage({
  leads,
  busyLeadId,
  onSendInitial,
}: {
  leads: LeadRow[];
  busyLeadId: string | null;
  onSendInitial: (lead: LeadRow) => void;
}) {
  return (
    <div className="page-stack">
      <PanelCard title="Leads Meta / formulário" badge={String(leads.length)} icon={Users}>
        <DataTable
          columns={["Nome", "Telefone", "Origem", "Status", "Criado", "Ação"]}
          empty="Nenhum lead ainda. Use o webhook Meta Lead Ads ou o teste de primeiro contato."
        >
          {leads.map((lead) => {
            const origin = sourceLabel(lead.source, lead.source);
            const busy = busyLeadId === lead.id;
            const queued =
              lead.status === "template_queued" || lead.status === "template_sending";
            return (
              <tr key={lead.id}>
                <td>{lead.name?.trim() || "Sem nome"}</td>
                <td className="mono">{formatPhoneDisplay(lead.phone)}</td>
                <td>
                  <span className={`source-pill tone-${sourceTone(origin)}`}>
                    {origin}
                  </span>
                </td>
                <td>
                  <Badge tone={statusTone(lead.status)}>{statusLabel(lead.status)}</Badge>
                </td>
                <td className="mono">{formatDate(lead.created_at)}</td>
                <td className="actions-cell">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busy || queued || !lead.phone}
                    onClick={() => onSendInitial(lead)}
                  >
                    <Send className="icon" />
                    {busy ? "Enfileirando..." : "Enviar contato"}
                  </button>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </PanelCard>
    </div>
  );
}

function OutreachPage({
  rows,
  filename,
  costPerTemplate,
  busy,
  summary,
  onCostChange,
  onFile,
  onSend,
}: {
  rows: OutreachCsvRow[];
  filename: string;
  costPerTemplate: string;
  busy: boolean;
  summary: OutreachBatchSummary | null;
  onCostChange: (value: string) => void;
  onFile: (file: File | null) => void;
  onSend: () => void;
}) {
  const eligible = rows.filter((row) => row.status === "eligible");
  const invalid = rows.filter((row) => row.status === "invalid");
  const duplicated = rows.filter((row) => row.status === "duplicate");
  const unitCost = parseCurrencyNumber(costPerTemplate);
  const estimatedCost = eligible.length * unitCost;

  return (
    <div className="page-stack">
      <section className="outreach-hero">
        <div>
          <h2>Disparo de contato inicial</h2>
          <p>
            Use esta área para listas novas de médicos. O envio usa o template
            aprovado `contato_inicial` e registra o disparo no inbox para auditoria.
          </p>
        </div>
        <label className="btn btn-primary">
          <Upload className="icon" />
          Selecionar CSV
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            disabled={busy}
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
        </label>
      </section>

      <section className="stats-grid outreach-stats">
        <MetricCard label="Arquivo" value={filename || "--"} hint="Lista analisada" icon={FileText} />
        <MetricCard label="Linhas válidas" value={eligible.length} hint="Prontas para envio" icon={CheckCircle2} />
        <MetricCard label="Duplicadas" value={duplicated.length} hint="No próprio CSV" icon={ClipboardList} />
        <MetricCard label="Inválidas" value={invalid.length} hint="Telefone ausente/inválido" icon={X} />
        <MetricCard label="Estimativa" value={formatMoney(estimatedCost)} hint="Custo editável" icon={BarChart3} />
      </section>

      <PanelCard
        title="Configuração do lote"
        icon={Send}
        action={
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !eligible.length}
            onClick={onSend}
          >
            <Send className="icon" />
            {busy ? "Enfileirando..." : "Disparar elegíveis"}
          </button>
        }
      >
        <div className="outreach-controls">
          <label>
            Template
            <input value="contato_inicial" readOnly />
          </label>
          <label>
            Custo por template
            <input
              value={costPerTemplate}
              onChange={(event) => onCostChange(event.target.value)}
              inputMode="decimal"
              placeholder="0,00"
            />
          </label>
          <div>
            <span>Previsão do lote</span>
            <strong>{eligible.length} contatos · {formatMoney(estimatedCost)}</strong>
          </div>
        </div>
        {summary ? (
          <p className="panel-note">
            Último envio: {summary.queued} enfileirados, {summary.created} novos,
            {" "}
            {summary.reused} reaproveitados e {summary.skipped.length} pulados pelo backend.
          </p>
        ) : (
          <p className="panel-note">
            O backend valida novamente opt-out, duplicados e templates já enviados antes de
            enfileirar.
          </p>
        )}
      </PanelCard>

      <PanelCard title="Prévia da lista" badge={String(rows.length)} icon={ClipboardList}>
        <DataTable
          columns={["Nome", "Telefone", "Email", "Médico(a)", "Status"]}
          empty="Nenhum CSV carregado."
        >
          {rows.slice(0, 200).map((row) => (
            <tr key={row.id}>
              <td>{row.name || "Sem nome"}</td>
              <td className="mono">{formatPhoneDisplay(row.phone)}</td>
              <td>{row.email || "Não informado"}</td>
              <td>{row.isDoctor == null ? "Não informado" : row.isDoctor ? "Sim" : "Não"}</td>
              <td>
                <Badge tone={row.status === "eligible" ? "success" : "warning"}>
                  {row.status === "eligible" ? "Elegível" : row.reason}
                </Badge>
              </td>
            </tr>
          ))}
        </DataTable>
        {rows.length > 200 ? (
          <p className="panel-note">Mostrando os primeiros 200 contatos.</p>
        ) : null}
      </PanelCard>
    </div>
  );
}

function ReheatPage({
  reheat,
  busy,
  decideBusyId,
  onRun,
  onDecide,
}: {
  reheat: ReheatRow[];
  busy: boolean;
  decideBusyId: string | null;
  onRun: () => void;
  onDecide: (id: string, decision: "approved" | "rejected") => void;
}) {
  return (
    <div className="page-stack">
      <PanelCard
        title="Fila de reaquecimento"
        badge={String(reheat.length)}
        icon={History}
        action={
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onRun}>
            <BarChart3 className="icon" />
            {busy ? "Pontuando..." : "Rodar score"}
          </button>
        }
      >
        <p className="panel-note">
          Aprovação humana antes de qualquer template. Skip/rejeitar nunca dispara.
        </p>
        <DataTable
          columns={["Telefone", "Score", "Ação", "Decisão", ""]}
          empty="Fila vazia. Importe CSV e rode o score."
        >
          {reheat.map((row) => {
            const pending = !row.human_decision || row.human_decision === "pending";
            return (
              <tr key={row.id}>
                <td className="mono">{row.phone ?? "--"}</td>
                <td>{row.score}</td>
                <td>
                  <Badge>{row.action}</Badge>
                </td>
                <td>{row.human_decision ?? "pending"}</td>
                <td className="actions-cell">
                  {pending ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={decideBusyId === row.id}
                        onClick={() => onDecide(row.id, "approved")}
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={decideBusyId === row.id}
                        onClick={() => onDecide(row.id, "rejected")}
                      >
                        Rejeitar
                      </button>
                    </>
                  ) : (
                    "--"
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </PanelCard>
    </div>
  );
}

function ImportsPage({
  imports,
  busy,
  onFile,
}: {
  imports: ImportRow[];
  busy: boolean;
  onFile: (file: File | null) => void;
}) {
  return (
    <div className="page-stack">
      <section className="upload-panel">
        <Upload className="upload-icon" />
        <h2>Upload CSV de histórico WhatsApp</h2>
        <p>
          Colunas esperadas: <span className="mono">phone,name,last_message,last_message_at,notes</span>.
        </p>
        <label className="btn btn-primary">
          {busy ? "Importando..." : "Selecionar CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            disabled={busy}
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
        </label>
      </section>

      <PanelCard title="Imports recentes" badge={String(imports.length)} icon={Upload}>
        <DataTable
          columns={["Arquivo", "Status", "Conversas", "Mensagens", "Criado"]}
          empty="Nenhum import realizado ainda."
        >
          {imports.map((row) => (
            <tr key={row.id}>
              <td>{row.filename ?? "--"}</td>
              <td>
                <Badge tone={statusTone(row.status)}>{row.status}</Badge>
              </td>
              <td>{row.conversations_count ?? 0}</td>
              <td>{row.messages_count ?? 0}</td>
              <td className="mono">{formatDate(row.created_at)}</td>
            </tr>
          ))}
        </DataTable>
      </PanelCard>
    </div>
  );
}

function ConfigPage({
  status,
}: {
  status: Record<string, unknown> | null;
  testName: string;
  testPhone: string;
  testBusy: "outreach" | "trust" | "explain" | null;
  onTestName: (name: string) => void;
  onTestPhone: (phone: string) => void;
  onTestOutreach: () => void;
  onTestDrip: (which: "trust" | "explain") => void;
}) {
  const [agentName, setAgentName] = useState("IR Consultoria");
  const [active, setActive] = useState(Boolean(status?.openai ?? true));
  const [prompt, setPrompt] = useState(IR_AGENT_PROMPT_PREVIEW);
  const [instructions, setInstructions] = useState(
    "Priorizar saudação humana, explicar Restituição do INSS de forma objetiva e pedir CNIS quando houver indício. Não prometer direito, valor ou resultado.",
  );
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(400);
  const [delay, setDelay] = useState(true);
  const [delaySeconds, setDelaySeconds] = useState("2");
  const [followUpEnabled, setFollowUpEnabled] = useState(
    Boolean(status?.followUpWorker ?? false),
  );
  const [followUpAfter, setFollowUpAfter] = useState("1440");
  const [followUpInterval, setFollowUpInterval] = useState("7200");
  const [followUpLimit, setFollowUpLimit] = useState("2");
  const [followUpMessage1, setFollowUpMessage1] = useState(
    "Olá, Dr(a). Tudo bem? Passando só para saber se o senhor conseguiu verificar o CNIS para seguirmos com a análise.",
  );
  const [followUpMessage2, setFollowUpMessage2] = useState(
    "Dr(a)., fico à disposição. Com o CNIS conseguimos confirmar se houve contribuição acima do teto em vínculos simultâneos.",
  );
  const activeDocs = 1;

  return (
    <div className="agent-config-page">
      <section className="config-hero">
        <h1>Configuração do Agente</h1>
        <p>Ajuste a personalidade, parâmetros e base de conhecimento</p>
      </section>

      <div className="agent-config-content">
        <section className="config-card">
          <header>
            <h2>Informações básicas</h2>
            <p>Identidade do agente</p>
          </header>
          <div className="config-grid two">
            <label className="config-field">
              <span>Nome do agente</span>
              <input value={agentName} onChange={(event) => setAgentName(event.target.value)} />
            </label>
            <label className="config-field">
              <span>Nicho</span>
              <select defaultValue="inss-medicos">
                <option value="inss-medicos">Restituição INSS / Médicos</option>
                <option value="contabil">Consultoria contábil</option>
                <option value="outro">Outro</option>
              </select>
            </label>
          </div>
          <div className="config-toggle-row">
            <div>
              <strong>Status do agente</strong>
              <span>
                {active ? "Respondendo automaticamente novos leads" : "Pausado"}
              </span>
            </div>
            <Toggle checked={active} onChange={setActive} />
          </div>
        </section>

        <section className="config-card">
          <header>
            <h2>System prompt</h2>
            <p>Como o agente deve se comportar e responder</p>
          </header>
          <textarea
            className="config-textarea mono prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <p className="config-help">{prompt.length} caracteres</p>
        </section>

        <section className="config-card">
          <header>
            <h2>Instruções para a IR</h2>
            <p>Avisos e restrições lidos antes de qualquer atendimento</p>
          </header>
          <textarea
            className="config-textarea"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Ex.: não falar de garantia; pedir CNIS quando houver vínculo simultâneo"
          />
        </section>

        <section className="config-card">
          <header>
            <h2>Parâmetros da IA</h2>
            <p>Controle a criatividade e o tempo de resposta</p>
          </header>
          <label className="config-field">
            <span>Temperature: {temperature.toFixed(1)}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
            />
            <em>Equilibrado</em>
          </label>
          <label className="config-field">
            <span>Max tokens</span>
            <input
              type="number"
              min="80"
              max="2000"
              value={maxTokens}
              onChange={(event) => setMaxTokens(Number(event.target.value))}
            />
            <em>Tamanho máximo de cada resposta</em>
          </label>
          <div className="config-toggle-row">
            <div>
              <strong>Delay humanizado</strong>
              <span>Simula tempo de digitação humano</span>
            </div>
            <select value={delaySeconds} onChange={(event) => setDelaySeconds(event.target.value)}>
              {[2, 3, 4, 5, 6, 7, 8].map((seconds) => (
                <option key={seconds} value={String(seconds)}>
                  {seconds}s
                </option>
              ))}
            </select>
            <Toggle checked={delay} onChange={setDelay} />
          </div>
        </section>

        <section className="config-card">
          <header>
            <h2>Recuperação automática</h2>
            <p>Mensagens enviadas quando o lead para de responder</p>
          </header>
          <div className="config-toggle-row">
            <div>
              <strong>Follow-up automático</strong>
              <span>Dispara somente quando a última mensagem foi da IA e o lead ficou em silêncio</span>
            </div>
            <Toggle checked={followUpEnabled} onChange={setFollowUpEnabled} />
          </div>
          <div className="config-grid three">
            <label className="config-field">
              <span>Primeiro envio após</span>
              <input value={followUpAfter} onChange={(event) => setFollowUpAfter(event.target.value)} />
              <em>Em minutos</em>
            </label>
            <label className="config-field">
              <span>Intervalo entre envios</span>
              <input value={followUpInterval} onChange={(event) => setFollowUpInterval(event.target.value)} />
              <em>Em minutos</em>
            </label>
            <label className="config-field">
              <span>Limite de tentativas</span>
              <input value={followUpLimit} onChange={(event) => setFollowUpLimit(event.target.value)} />
            </label>
          </div>
          <label className="config-field">
            <span>Mensagem 1</span>
            <textarea
              className="config-textarea small"
              value={followUpMessage1}
              onChange={(event) => setFollowUpMessage1(event.target.value)}
            />
          </label>
          <label className="config-field">
            <span>Mensagem 2</span>
            <textarea
              className="config-textarea small"
              value={followUpMessage2}
              onChange={(event) => setFollowUpMessage2(event.target.value)}
            />
          </label>
        </section>

        <section className="config-card">
          <header>
            <h2>Base de conhecimento (RAG)</h2>
            <p>{activeDocs} de {activeDocs} documentos ativos</p>
          </header>
          <div className="rag-dropzone">
            <Upload className="icon" />
            <strong>Arraste um arquivo ou clique para fazer upload</strong>
            <span>PDF, TXT, MD ou DOCX até 5MB</span>
          </div>
        </section>
      </div>

      <div className="config-savebar">
        <button type="button" className="btn btn-outline">
          Descartar
        </button>
        <button type="button" className="btn btn-primary">
          <Save className="icon" />
          Salvar alterações
        </button>
      </div>
    </div>
  );
}

function PanelCard({
  title,
  badge,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  badge?: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel-card">
      <header className="panel-card-head">
        <div>
          <Icon className="icon" />
          <h2>{title}</h2>
        </div>
        {action ?? (badge ? <Badge tone="muted">{badge}</Badge> : null)}
      </header>
      <div className="panel-card-body">{children}</div>
    </section>
  );
}

function DataTable({
  columns,
  empty,
  children,
}: {
  columns: string[];
  empty: string;
  children: ReactNode;
}) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children;
  const hasRows = Array.isArray(rows) ? rows.length > 0 : Boolean(rows);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hasRows ? (
            rows
          ) : (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState text={empty} compact />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CaseSidePanel({
  conversation,
  messages,
  documents,
  missingDocs,
  outreachBusy,
  onOpenDocument,
  onDownloadDocument,
  onSendInitialOutreach,
  onTakeover,
  onResume,
}: {
  conversation: ConversationRow;
  messages: MessageRow[];
  documents: DocumentRow[];
  missingDocs: string[];
  outreachBusy: boolean;
  onOpenDocument: (id: string) => void;
  onDownloadDocument: (id: string) => void;
  onSendInitialOutreach: () => void;
  onTakeover: () => void;
  onResume: () => void;
}) {
  const aiPaused = conversation.status === "waiting_human";
  const inboundCount = messages.filter((message) => message.role === "user").length;
  const outboundCount = messages.length - inboundCount;
  const templateStatus = conversation.template_status ?? "";
  const templateAlreadyQueued = ["queued_manual", "queued_test", "sending"].includes(
    templateStatus,
  );
  const templateAlreadySent = templateStatus === "sent";
  const canSendInitialTemplate =
    !messages.length &&
    !templateAlreadyQueued &&
    !templateAlreadySent &&
    Boolean(conversation.phone || conversation.lead_phone);

  return (
    <aside className="case-panel lis-side-panel">
      <section>
        <h3>Dados do lead</h3>
        <div className="side-row">
          <UserRoundCheck className="icon" />
          <div>
            <span>Nome</span>
            <p>{leadDisplayName(conversation)}</p>
          </div>
        </div>
        <div className="side-row">
          <Stethoscope className="icon" />
          <div>
            <span>Médico(a)</span>
            <p>{doctorAnswerLabel(conversation)}</p>
          </div>
        </div>
        <div className="side-row">
          <Phone className="icon" />
          <div>
            <span>Telefone</span>
            <p>{formatPhoneDisplay(conversation.lead_phone ?? conversation.phone)}</p>
          </div>
        </div>
        <div className="side-row">
          <Mail className="icon" />
          <div>
            <span>Email</span>
            <p>{conversation.lead_email?.trim() || "Não informado"}</p>
          </div>
        </div>
        <div className="side-row">
          <MessageSquare className="icon" />
          <div>
            <span>Origem</span>
            <p>
              {sourceLabel(conversation.source, conversation.lead_source)}
            </p>
          </div>
        </div>
        <div className="side-row">
          <Calendar className="icon" />
          <div>
            <span>Entrou</span>
            <p>{formatDate(conversation.created_at ?? conversation.updated_at)}</p>
          </div>
        </div>
        <div className="side-row">
          <Clock3 className="icon" />
          <div>
            <span>Última atividade</span>
            <p>
              {relativeTime(
                conversation.last_message_at ??
                  conversation.updated_at ??
                  conversation.last_inbound_at ??
                  conversation.last_outbound_at,
              )}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h3>Análise da conversa</h3>
        <div className="side-stats">
          <div>
            <strong>{messages.length}</strong>
            <span>Mensagens</span>
          </div>
          <div>
            <strong>{inboundCount}</strong>
            <span>Lead</span>
          </div>
          <div>
            <strong>{outboundCount}</strong>
            <span>IA/Humano</span>
          </div>
        </div>
      </section>

      <section>
        <h3>Documentos do caso</h3>
        <p>CNIS e anexos recebidos pelo WhatsApp.</p>
        <div className="document-list">
          {documents.map((document) => (
            <button
              key={document.id}
              type="button"
              className="document-row"
              onClick={() => onOpenDocument(document.id)}
            >
              <FileText className="icon" />
              <span>
                <strong>{documentTypeLabel(document.document_type)}</strong>
                <em>
                  {document.mime_type ?? "arquivo"}
                  {document.size_bytes
                    ? ` · ${Math.round(document.size_bytes / 1024)} KB`
                    : ""}
                </em>
              </span>
              <span className="document-actions">
                <span>Abrir</span>
                <button
                  type="button"
                  className="document-download"
                  aria-label="Baixar documento"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDownloadDocument(document.id);
                  }}
                >
                  <Download className="tiny-icon" />
                  Baixar
                </button>
              </span>
            </button>
          ))}
          {!documents.length ? <EmptyState text="Nenhum documento recebido." compact /> : null}
        </div>
        {missingDocs.length > 0 ? (
          <p className="missing-docs">
            Faltam: {missingDocs.map(documentTypeLabel).join(", ")}
          </p>
        ) : null}
      </section>

      <section>
        <h3>Templates WhatsApp</h3>
        <p>Fora da janela de 24h só template aprovado pela Meta chega.</p>
        <button
          type="button"
          className="btn btn-outline side-full"
          disabled={outreachBusy || !canSendInitialTemplate}
          onClick={onSendInitialOutreach}
        >
          <Send className="icon" />
          {outreachBusy
            ? "Enfileirando..."
            : templateAlreadyQueued
              ? "Contato enfileirado"
              : templateAlreadySent
                ? "Contato já enviado"
                : "Enviar primeiro contato"}
        </button>
      </section>

      <section>
        <h3>Ações</h3>
        <div className="side-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={aiPaused}
            onClick={onTakeover}
          >
            Takeover
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={!aiPaused}
            onClick={onResume}
          >
            Devolver IA
          </button>
        </div>
      </section>
    </aside>
  );
}

function FilePickerButton({
  label,
  icon: Icon,
  accept,
  disabled,
  onFile,
}: {
  label: string;
  icon: LucideIcon;
  accept: string;
  disabled: boolean;
  onFile: (file: File | null) => void;
}) {
  return (
    <label className="attach-option composer-attach">
      <Icon className="icon" />
      {label}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          onFile(file);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function formatBytes(size: number): string {
  if (size >= 1_048_576) return `${(size / 1_048_576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function AttachmentPreview({ attachment }: { attachment: PendingAttachment }) {
  const { file, url, kind } = attachment;
  const size = formatBytes(file.size);

  if (kind === "image") {
    return (
      <div className="attachment-preview-content">
        <img src={url} alt={file.name} />
        <div>
          <strong>{file.name}</strong>
          <span>Imagem · {size}</span>
        </div>
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className="attachment-preview-content">
        <video src={url} controls />
        <div>
          <strong>{file.name}</strong>
          <span>Vídeo · {size}</span>
        </div>
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div className="attachment-preview-content">
        <Mic className="icon" />
        <div>
          <strong>{file.name}</strong>
          <span>Áudio · {size}</span>
          <audio src={url} controls />
        </div>
      </div>
    );
  }

  return (
    <div className="attachment-preview-content">
      <FileText className="icon" />
      <div>
        <strong>{file.name}</strong>
        <span>Arquivo · {size}</span>
      </div>
    </div>
  );
}

function isTimelineMedia(message: MessageRow): boolean {
  return ["image", "audio", "video", "document"].includes(
    String(message.message_type ?? ""),
  );
}

function documentMatchesMessage(document: DocumentRow, message: MessageRow): boolean {
  const type = String(message.message_type ?? "");
  const mime = document.mime_type ?? "";
  if (type === "image") return mime.startsWith("image/");
  if (type === "audio") return mime.startsWith("audio/");
  if (type === "video") return mime.startsWith("video/");
  if (type === "document") return !mime.startsWith("image/") && !mime.startsWith("audio/") && !mime.startsWith("video/");
  return false;
}

function attachDocumentFallbacksToMessages(
  messages: MessageRow[],
  documents: DocumentRow[],
): MessageRow[] {
  const usedDocumentIds = new Set(
    messages
      .map((message) => message.media_document_id)
      .filter((id): id is string => Boolean(id)),
  );

  return messages.map((message) => {
    if (message.media_document_id || message.role !== "user" || !isTimelineMedia(message)) {
      return message;
    }

    const messageTime = new Date(message.created_at).getTime();
    const candidates = documents
      .filter(
        (document) =>
          !usedDocumentIds.has(document.id) &&
          documentMatchesMessage(document, message),
      )
      .sort((a, b) => {
        const aDiff = Math.abs(new Date(a.created_at).getTime() - messageTime);
        const bDiff = Math.abs(new Date(b.created_at).getTime() - messageTime);
        return aDiff - bDiff;
      });

    const document = candidates[0];
    if (!document) return message;
    usedDocumentIds.add(document.id);
    return {
      ...message,
      media_document_id: document.id,
      media_filename: document.original_filename,
      media_mime_type: document.mime_type,
      media_size_bytes: document.size_bytes,
    };
  });
}

function messagePreview(message: MessageRow): string {
  const text = message.text?.trim();
  if (text) return text.length > 90 ? `${text.slice(0, 87)}...` : text;
  return `[${message.message_type ?? "mídia"}]`;
}

function mediaInfo(message: MessageRow): {
  isMedia: boolean;
  label: string;
  detail: string;
  icon: LucideIcon;
} {
  const type = message.message_type ?? "";
  if (type === "image") {
    return {
      isMedia: true,
      label: message.media_filename ?? "Imagem",
      detail: message.text?.trim() && message.text !== "[image]" ? message.text : message.media_mime_type ?? "Imagem recebida pelo WhatsApp",
      icon: ImageIcon,
    };
  }
  if (type === "audio") {
    return {
      isMedia: true,
      label: message.media_filename ?? "Áudio",
      detail: message.text?.trim() && message.text !== "[audio]" ? message.text : message.media_mime_type ?? "Áudio recebido pelo WhatsApp",
      icon: Mic,
    };
  }
  if (type === "video") {
    return {
      isMedia: true,
      label: message.media_filename ?? "Vídeo",
      detail: message.text?.trim() && message.text !== "[video]" ? message.text : message.media_mime_type ?? "Vídeo recebido pelo WhatsApp",
      icon: Video,
    };
  }
  if (type === "document") {
    const text = message.media_filename ?? message.text?.trim();
    const filename =
      text?.startsWith("[arquivo:")
        ? text.replace(/^\[arquivo:\s*|\]$/g, "")
        : text && /\.[a-z0-9]{2,5}$/i.test(text)
          ? text
          : null;
    return {
      isMedia: true,
      label: filename ?? "Documento",
      detail: text && text !== "[document]" && !filename
        ? text
        : message.media_mime_type ?? "Documento recebido pelo WhatsApp",
      icon: FileText,
    };
  }
  return {
    isMedia: false,
    label: "",
    detail: "",
    icon: FileText,
  };
}

function MessageBubble({
  message,
  leadName,
  onReply,
  onDelete,
  onOpenDocument,
  onReact,
  reactionBusy,
}: {
  message: MessageRow;
  leadName: string;
  onReply: (message: MessageRow) => void;
  onDelete: (id: string) => void;
  onOpenDocument: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  reactionBusy: boolean;
}) {
  const incoming = message.role === "user";
  const isCnisGuide = message.message_type === "cnis_guide";
  const media = mediaInfo(message);
  const MediaIcon = media.icon;
  const canDelete = !incoming;
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMediaUrl(null);
    if (!message.media_document_id || !media.isMedia) return undefined;
    openDocument(message.media_document_id)
      .then(({ url }) => {
        if (!cancelled) setMediaUrl(url);
      })
      .catch(() => {
        if (!cancelled) setMediaUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [media.isMedia, message.media_document_id]);

  return (
    <article className={incoming ? "message-row inbound" : "message-row outbound"}>
      <div className="message-author">
        <span>{incoming ? leadName : message.role === "assistant" ? "Agente IA" : "Humano"}</span>
        <time>{formatDate(message.created_at)}</time>
      </div>
      <div className="message-bubble">
        {isCnisGuide ? (
          <div className="pdf-message-card">
            <div className="pdf-file">
              <FileText className="icon" />
              <div>
                <strong>Passo-a-passo-CNIS-IR-Consultoria.pdf</strong>
                <span>PDF enviado pelo agente</span>
              </div>
            </div>
            <p>{message.text}</p>
          </div>
        ) : media.isMedia ? (
          <div className="media-message-card">
            {mediaUrl && message.message_type === "image" ? (
              <button
                type="button"
                className="media-preview-button"
                onClick={() => onOpenDocument(message.media_document_id!)}
              >
                <img src={mediaUrl} alt={media.label} />
              </button>
            ) : mediaUrl && message.message_type === "video" ? (
              <video className="media-preview-video" src={mediaUrl} controls />
            ) : (
              <div className={`media-icon type-${message.message_type ?? "file"}`}>
                <MediaIcon className="icon" />
              </div>
            )}
            <div>
              <strong>{media.label}</strong>
              <span>{media.detail}</span>
              {mediaUrl && message.message_type === "audio" ? (
                <audio className="media-preview-audio" src={mediaUrl} controls />
              ) : null}
              {message.media_document_id ? (
                <button
                  type="button"
                  className="inline-media-action"
                  onClick={() => onOpenDocument(message.media_document_id!)}
                >
                  Abrir arquivo
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p>{message.text ?? `[${message.message_type ?? "mídia"}]`}</p>
        )}
      </div>
      <div className="message-actions">
        <button type="button" className="reply-link" onClick={() => onReply(message)}>
          <Reply className="tiny-icon" />
          Responder
        </button>
        {incoming && message.external_message_id ? (
          <span className="reaction-actions" aria-label="Reações rápidas">
            {["👍", "✅", "🙏"].map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="reaction-button"
                disabled={reactionBusy}
                onClick={() => onReact(message.id, emoji)}
                title={`Reagir com ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </span>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            className="reply-link danger"
            onClick={() => onDelete(message.id)}
          >
            <Trash2 className="tiny-icon" />
            Apagar
          </button>
        ) : null}
      </div>
    </article>
  );
}

function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={checked ? "toggle on" : "toggle"}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={compact ? "empty compact" : "empty"}>
      <Inbox className="icon" />
      <p>{text}</p>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="readonly-field">
      {label}
      <input value={value} readOnly />
    </label>
  );
}

function pageDescription(page: PanelPage) {
  const descriptions: Record<PanelPage, string> = {
    dashboard: "Funil ativo: formulário, WhatsApp, CNIS, Advbox e humano.",
    conversas: "Inbox operacional com takeover, resposta humana e documentos.",
    leads: "Leads da Meta, formulário e testes de primeiro contato.",
    disparos: "Listas novas, custo estimado e template inicial em lote.",
    reaquecer: "Fila revisada por humano antes de qualquer template.",
    importar: "Histórico WhatsApp para score e reativação controlada.",
    config: "Webhooks, sessão segura e testes de template da IR.",
  };
  return descriptions[page];
}

function leadDisplayName(conversation: ConversationRow): string {
  const name = conversation.lead_name?.trim();
  if (name) return name;
  return formatPhoneDisplay(conversation.phone);
}

function leadMessageName(conversation: ConversationRow): string {
  return conversation.lead_name?.trim() || "Lead";
}

function isMetaWindowClosed(conversation: ConversationRow): boolean {
  if (!conversation.last_inbound_at) return true;
  const lastInbound = new Date(conversation.last_inbound_at).getTime();
  if (!Number.isFinite(lastInbound)) return true;
  return Date.now() - lastInbound > 24 * 60 * 60 * 1000;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function doctorAnswerLabel(conversation: ConversationRow): string {
  const answer = conversation.lead_doctor_answer?.trim();
  if (answer) return answer;
  if (conversation.lead_is_doctor === true) return "Sim";
  if (conversation.lead_is_doctor === false) return "Não";
  return "Não informado";
}

function documentTypeLabel(type?: string | null): string {
  const labels: Record<string, string> = {
    cnis: "CNIS",
    dirf_income: "DIRF / rendimentos",
    inss_statement: "Extrato INSS",
    identity: "Identidade",
    address_proof: "Comprovante de residência",
    income_tax: "Imposto de renda",
    payslip: "Holerite",
    contract: "Contrato",
    other: "Documento",
  };
  return type ? labels[type] ?? type : "Documento";
}

function formatPhoneDisplay(phone?: string | null): string {
  if (!phone) return "Sem telefone";
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) {
      return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }
  return phone;
}

/** META = Lead Ads / anúncio. Orgânico = inbound, teste, live. */
function sourceLabel(
  source?: string | null,
  leadSource?: string | null,
): string {
  const raw = `${leadSource ?? ""} ${source ?? ""}`.toLowerCase();
  if (
    raw.includes("meta_lead") ||
    raw.includes("lead_ads") ||
    raw.includes("leadgen") ||
    /(^|[\s_])meta([\s_]|$)/.test(raw)
  ) {
    return "META";
  }
  if (raw.includes("import")) return "Importação";
  return "Orgânico";
}

function sourceTone(label: string): StatusTone {
  if (label === "META") return "success";
  if (label === "Importação") return "warning";
  return "muted";
}

function parseOutreachCsv(raw: string): OutreachCsvRow[] {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("CSV vazio ou sem linhas de contato.");

  const delimiter = detectCsvDelimiter(lines[0]);
  const header = splitDelimitedLine(lines[0], delimiter).map((col) =>
    normalizeHeader(col),
  );
  const idx = {
    name: findHeader(header, ["nome", "name", "full_name", "nome_completo"]),
    phone: findHeader(header, ["telefone", "phone", "whatsapp", "celular", "mobile"]),
    email: findHeader(header, ["email", "e_mail", "mail"]),
    doctor: findHeader(header, ["medico", "médico", "is_doctor", "doctor"]),
  };
  if (idx.phone < 0) throw new Error("CSV precisa ter uma coluna telefone.");

  const seen = new Set<string>();
  return lines.slice(1).map((line, index) => {
    const cols = splitDelimitedLine(line, delimiter);
    const phone = normalizePhoneForOutreach(cols[idx.phone]);
    const phoneKey = phone.replace(/\D/g, "");
    const duplicate = phoneKey ? seen.has(phoneKey) : false;
    if (phoneKey) seen.add(phoneKey);
    const valid = Boolean(phone);
    const status: OutreachCsvRow["status"] = !valid
      ? "invalid"
      : duplicate
        ? "duplicate"
        : "eligible";
    return {
      id: `${index}-${phoneKey || "invalid"}`,
      name: idx.name >= 0 ? cols[idx.name]?.trim() || "" : "",
      phone,
      email: idx.email >= 0 ? cols[idx.email]?.trim() || "" : "",
      isDoctor: idx.doctor >= 0 ? parseDoctorAnswer(cols[idx.doctor]) : null,
      status,
      reason:
        status === "invalid"
          ? "Telefone inválido"
          : status === "duplicate"
            ? "Duplicado"
            : "Elegível",
    };
  });
}

function detectCsvDelimiter(header: string): "," | ";" {
  return header.split(";").length > header.split(",").length ? ";" : ",";
}

function splitDelimitedLine(line: string, delimiter: "," | ";"): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function findHeader(header: string[], aliases: string[]): number {
  const normalized = aliases.map(normalizeHeader);
  return header.findIndex((col) => normalized.includes(col));
}

function parseDoctorAnswer(value?: string): boolean | null {
  const raw = normalizeHeader(value ?? "");
  if (["sim", "s", "yes", "medico", "medica"].includes(raw)) return true;
  if (["nao", "n", "no"].includes(raw)) return false;
  return null;
}

function normalizePhoneForOutreach(value?: string): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

function parseCurrencyNumber(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

function statusTone(status: string): StatusTone {
  return STATUS_TONES[status] ?? "default";
}

function formatIntegrationName(key: string) {
  const names: Record<string, string> = {
    supabase: "Supabase",
    metaWhatsApp: "Meta WhatsApp",
    metaGraph: "Meta Graph",
    openai: "OpenAI",
    advbox: "Advbox",
  };
  return names[key] ?? key;
}

function formatDate(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildDailyConversationCounts(conversations: ConversationRow[]) {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (29 - index));
    return {
      key: date.toISOString().slice(0, 10),
      label: formatter.format(date),
      count: 0,
    };
  });
  const byKey = new Map(days.map((day) => [day.key, day]));
  for (const conversation of conversations) {
    const raw =
      conversation.last_message_at ??
      conversation.updated_at ??
      conversation.last_inbound_at ??
      conversation.last_outbound_at;
    if (!raw) continue;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    const day = byKey.get(key);
    if (day) day.count += 1;
  }
  return days;
}

function relativeTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} d`;
}

function getInitials(value?: string | null) {
  const text = (value ?? "").trim();
  if (!text) return "IR";
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && /[A-Za-zÀ-ÿ]/.test(words[0])) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  if (/[A-Za-zÀ-ÿ]/.test(text)) {
    return text.slice(0, 2).toUpperCase();
  }
  const digits = text.replace(/\D/g, "");
  if (!digits) return "IR";
  return digits.slice(-2).toUpperCase();
}

function isRecent(conversation: ConversationRow) {
  const raw =
    conversation.last_inbound_at ?? conversation.last_outbound_at ?? conversation.updated_at;
  if (!raw) return false;
  return Date.now() - new Date(raw).getTime() < 15 * 60 * 1000;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",").pop() ?? "" : result);
    };
    reader.readAsDataURL(file);
  });
}

function toErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
