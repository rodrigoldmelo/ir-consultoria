import { Router } from "express";
import { config } from "../config.js";
import {
  isMetaGraphConfigured,
  isMetaWhatsAppConfigured,
} from "../services/meta-graph.js";
import { isOpenAiConfigured } from "../services/openai-agent.js";
import { isSupabaseConfigured } from "../services/supabase.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "ir-consultoria",
    agent: config.agentName,
    env: config.env,
    integrations: {
      supabase: isSupabaseConfigured(),
      metaWhatsApp: isMetaWhatsAppConfigured(),
      metaGraph: isMetaGraphConfigured(),
      openai: isOpenAiConfigured(),
    },
    ts: new Date().toISOString(),
  });
});

export default router;
