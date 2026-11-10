import { hasClearlyUnrelatedTopic } from './studio-nova-scope';
import type { StudioNovaOutput } from './studio-nova-output';

export function customerAnalysisMessage(text: string) {
  // JSON encoding keeps fake closing delimiters/roles inside a data string.
  // This is a trust-boundary marker, not a standalone injection defense.
  return {
    role: 'user' as const,
    content: JSON.stringify({ kind: 'untrusted_customer_message', text }),
  };
}

const completionClaims = [
  /\bzwrot\b[^.!?\n]{0,60}\bzostal\s+(?:wykonany|zrealizowany|wyslany|przetworzony|zaksiegowany)\b/g,
  /\b(?:wykonalem|wykonalismy|zrealizowalem|zrealizowalismy|zlecilem|zlecilismy)\s+(?:juz\s+)?zwrot\b/g,
  /\bpotwierdzam(?:y)?\s+(?:otrzymanie\s+)?platnosc(?:i)?\b/g,
  /\b(?:zarezerwowalem|zarezerwowalismy)\b/g,
  /\b(?:wyslalem|wyslalismy)\s+(?:wiadomosc|e-?mail)\b/g,
];

export function passesStudioNovaPolicy(output: StudioNovaOutput) {
  if (!output.draft.trim() || hasClearlyUnrelatedTopic(output.draft)) return false;
  // There is no payment access, refund policy or context for unidentified cases.
  // Never silently rewrite a model result into an apparently successful one.
  if (['billing', 'unknown'].includes(output.category) && !output.needs_review) return false;

  const normalized = output.draft.normalize('NFKD').replace(/\p{M}/gu, '').replace(/ł/gi, 'l').toLowerCase();
  for (const pattern of completionClaims) {
    for (const match of normalized.matchAll(pattern)) {
      const prefix = normalized.slice(Math.max(0, match.index - 60), match.index);
      // Do not block straightforward negative capability statements.
      if (/\bnie\s+(?:[\p{L}]+\s+){0,5}$/u.test(prefix)) continue;
      return false;
    }
  }
  return true;
}
