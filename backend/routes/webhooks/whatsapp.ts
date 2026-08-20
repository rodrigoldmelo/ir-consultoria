import { Router } from "express";
import type { Request, Response } from "express";
import { config } from "../../config.js";
import { verifyMetaSignature } from "../../middleware/meta-signature.js";
import { handleInboundWhatsApp } from "../../services/conversation-orchestrator.js";

const router = Router();

/** Verificação do webhook WhatsApp Cloud API */
router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && token === config.meta.verifyToken) {
    res.status(200).send(String(challenge ?? ""));
    return;
  }

  res.sendStatus(403);
});

router.post("/", verifyMetaSignature, (req: Request, res: Response) => {
  // ACK imediato: médicos respondem pouco; a Meta cobra resposta rápida.
  // Processar antes do 200 atrasava o envio e gerava reenvio duplicado.
  res.sendStatus(200);
  void handleWhatsAppPayload(req.body).catch((err) => {
    console.error("[whatsapp-webhook] error", err);
  });
});

async function handleWhatsAppPayload(body: unknown): Promise<void> {
  type MediaPayload = {
    id?: string;
    caption?: string;
    filename?: string;
    mime_type?: string;
  };

  const payload = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            id?: string;
            type?: string;
            text?: { body?: string };
            button?: { text?: string; payload?: string };
            interactive?: {
              button_reply?: { title?: string; id?: string };
              list_reply?: { title?: string; id?: string };
            };
            image?: MediaPayload;
            document?: MediaPayload;
            audio?: MediaPayload;
            video?: MediaPayload;
          }>;
          contacts?: Array<{ wa_id?: string }>;
        };
      }>;
    }>;
  };

  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message?.from) return;

  const media: MediaPayload | undefined =
    message.image ?? message.document ?? message.audio ?? message.video;

  const buttonText =
    message.button?.text ??
    message.button?.payload ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title;

  await handleInboundWhatsApp({
    phone: message.from,
    waId: value?.contacts?.[0]?.wa_id,
    text: message.text?.body ?? buttonText ?? media?.caption,
    messageType: message.type,
    externalMessageId: message.id,
    mediaId: media?.id,
    mediaFilename: media?.filename,
  });
}

export default router;
