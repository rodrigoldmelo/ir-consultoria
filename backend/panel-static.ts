import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Express, NextFunction, Request, Response } from "express";
import express from "express";

function panelDistDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), "dist/panel"),
    resolve(here, "../dist/panel"),
  ];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, "index.html"))) return dir;
  }
  return null;
}

/** Serve o painel no mesmo host da API (`https://ir.meuanalistacrm.app`). */
export function mountPanelStatic(app: Express): string | null {
  const dir = panelDistDir();
  if (!dir) {
    console.info("[panel-ui] dist/panel ausente — rode npm run panel:build");
    return null;
  }

  app.use(express.static(dir, { index: "index.html" }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(resolve(dir, "index.html"));
  });

  console.info("[panel-ui] servido a partir de", dir);
  return dir;
}
