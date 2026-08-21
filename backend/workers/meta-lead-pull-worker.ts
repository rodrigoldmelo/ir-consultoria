import { config } from "../config.js";
import { pullMetaLeads } from "../services/meta-lead-pull.js";
import { wakeTemplateWorker } from "./template-worker.js";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let warnedMissingConfig = false;

function intervalMs(): number {
  return Math.max(15, Number(process.env.IR_META_LEAD_PULL_INTERVAL_SECONDS ?? "60") || 60) * 1000;
}

async function tick(): Promise<void> {
  if (running) return;
  if (!config.workers.metaLeadPull) return;
  if (!config.meta.pageToken || !config.meta.formIds.length) {
    if (!warnedMissingConfig) {
      console.warn("[meta-lead-pull-worker] missing IR_META_PAGE_TOKEN or IR_META_FORM_IDS");
      warnedMissingConfig = true;
    }
    return;
  }

  running = true;
  try {
    for (const formId of config.meta.formIds) {
      const pulled = await pullMetaLeads({
        token: config.meta.pageToken,
        formId,
        limit: Number(process.env.IR_META_LEAD_PULL_LIMIT ?? "10") || 10,
        source: "meta_poll",
      });
      const queued = pulled.results.filter((row) => row.result.status === "queued");
      for (const row of queued) {
        if (row.result.status === "queued") {
          wakeTemplateWorker(row.result.metaLeadgenId);
        }
      }
      if (queued.length || pulled.fetched) {
        console.info("[meta-lead-pull-worker] form", formId, {
          fetched: pulled.fetched,
          queued: queued.length,
          duplicates: pulled.results.filter((row) => row.result.status === "duplicate").length,
        });
      }
    }
  } catch (err) {
    console.error("[meta-lead-pull-worker]", err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}

export function startMetaLeadPullWorker(): void {
  if (!config.workers.metaLeadPull) {
    console.info("[meta-lead-pull-worker] disabled");
    return;
  }
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, intervalMs());
  console.info("[meta-lead-pull-worker] started");
  void tick();
}

export function stopMetaLeadPullWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
