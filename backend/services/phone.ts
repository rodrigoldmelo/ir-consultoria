/** Normaliza telefone BR para E.164 aproximado (+55...). Stub — evoluir com lib. */
export function normalizePhoneE164(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

export function normalizePhoneDigits(raw: string | undefined | null): string {
  return (raw ?? "").replace(/\D/g, "");
}

function addPhoneCandidate(set: Set<string>, digits: string): void {
  if (!digits) return;
  set.add(digits);
  set.add(`+${digits}`);
}

/**
 * WhatsApp Cloud pode entregar celulares BR sem o nono dígito, enquanto Lead Ads
 * costuma vir com ele. Para vínculo de lead/conversa, buscamos as duas formas.
 */
export function phoneLookupCandidates(raw: string | undefined | null): string[] {
  const digits = normalizePhoneDigits(raw);
  const candidates = new Set<string>();
  addPhoneCandidate(candidates, digits);

  const e164 = normalizePhoneE164(raw);
  const canonical = normalizePhoneDigits(e164);
  addPhoneCandidate(candidates, canonical);

  if (canonical.startsWith("55") && canonical.length >= 12) {
    const ddd = canonical.slice(2, 4);
    const subscriber = canonical.slice(4);
    if (subscriber.length === 9 && subscriber.startsWith("9")) {
      addPhoneCandidate(candidates, `55${ddd}${subscriber.slice(1)}`);
    }
    if (subscriber.length === 8) {
      addPhoneCandidate(candidates, `55${ddd}9${subscriber}`);
    }
  }

  return [...candidates];
}
