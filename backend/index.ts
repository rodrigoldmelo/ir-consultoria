import "./env.js";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { assertProductionSecrets, config } from "./config.js";
import { captureRawBody } from "./middleware/meta-signature.js";
import authRouter from "./routes/auth.js";
import healthRouter from "./routes/health.js";
import panelRouter from "./routes/panel.js";
import metaLeadsRouter from "./routes/webhooks/meta-leads.js";
import whatsappRouter from "./routes/webhooks/whatsapp.js";
import { mountPanelStatic } from "./panel-static.js";
import { startFollowUpWorker } from "./workers/follow-up-worker.js";
import { startInWindowNudgeWorker } from "./workers/in-window-nudge-worker.js";
import { startTemplateWorker } from "./workers/template-worker.js";

assertProductionSecrets();

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb", verify: captureRawBody }));

app.use("/api/health", healthRouter);
// Alias para o caso de a IR ser servida por prefixo (`/api/ir/`) no host da Lis.
app.use("/api/ir/health", healthRouter);
app.use("/api/ir/auth", authRouter);
app.use("/api/ir/webhooks/meta-leads", metaLeadsRouter);
app.use("/api/ir/webhooks/whatsapp", whatsappRouter);
app.use("/api/ir/panel", panelRouter);

mountPanelStatic(app);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_server_error" });
});

app.listen(config.port, config.bindAddress, () => {
  console.log(`IR Consultoria API http://${config.bindAddress}:${config.port}`);
  console.log(`Agent: ${config.agentName} | env: ${config.env}`);
  console.log(
    `Panel login: ${config.panelLogin.password ? "configurado" : "AUSENTE (IR_PANEL_LOGIN_PASSWORD ou IR_PANEL_TOKEN)"}`,
  );
  console.log("Webhooks: /api/ir/webhooks/meta-leads | /api/ir/webhooks/whatsapp");
  startTemplateWorker();
  startFollowUpWorker();
  startInWindowNudgeWorker();
});
