import { z } from 'zod';

export const studioNovaOutputSchema = z.object({
  category: z.enum(['sales', 'support', 'billing', 'unknown'])
    .describe('sales: oferta, cena lub zakup; support: problem techniczny; billing: płatność lub zwrot; unknown: brak podstaw do klasyfikacji'),
  priority: z.enum(['normal', 'high'])
    .describe('high wyłącznie przy blokadzie opłaconego spotkania zaczynającego się w ciągu godziny; w pozostałych przypadkach normal'),
  draft: z.string()
    .describe('Krótki szkic po polsku. Jeśli needs_review=true, wskaż także co musi sprawdzić pracownik.'),
  needs_review: z.boolean()
    .describe('true, gdy brakuje danych albo potrzebna jest decyzja lub działanie pracownika'),
}).strict();

export type StudioNovaOutput = z.infer<typeof studioNovaOutputSchema>;

export const outputErrorSchema = z.object({
  code: z.enum(['MODEL_REFUSAL', 'OUTPUT_TRUNCATED', 'INVALID_OUTPUT', 'MODEL_ERROR', 'REQUEST_ABORTED', 'MODEL_UNSUPPORTED', 'MODEL_CAPABILITIES_UNAVAILABLE', 'OUTPUT_POLICY_VIOLATION']),
  message: z.string(),
}).strict();
export type OutputErrorCode = z.infer<typeof outputErrorSchema>['code'];

const errorMessages: Record<OutputErrorCode, string> = {
  MODEL_REFUSAL: 'Model odmówił przygotowania odpowiedzi. Sprawę powinien sprawdzić pracownik.',
  OUTPUT_TRUNCATED: 'Odpowiedź została przerwana lub ucięta. Nie zapisano niepełnego wyniku. Spróbuj ponownie.',
  INVALID_OUTPUT: 'Analiza ma niepoprawny format JSON: brak wymaganego pola (category, priority, draft lub needs_review), zły typ, niedozwolona wartość albo dodatkowe pole. Nie zapisano wyniku. Spróbuj ponownie.',
  MODEL_ERROR: 'Nie udało się uzyskać odpowiedzi AI. Sprawdź konfigurację, dostępność modelu i środki w OpenRouter.',
  REQUEST_ABORTED: 'Przerwano żądanie. Nie zapisano wyniku.',
  OUTPUT_POLICY_VIOLATION: 'Wynik narusza zasady szkicu lub sprawdzenia przez pracownika. Analiza została odrzucona; nie wykonano żadnej operacji. Sprawę powinien sprawdzić pracownik.',
  MODEL_UNSUPPORTED: 'Ustawiony model lub jego dostawca nie obsługuje wymaganego JSON Schema. W ustawieniach serwera OPENROUTER_MODEL wskaż model obsługujący structured_outputs i response_format, a następnie wdroż aplikację ponownie. Zmianę modelu i jego koszt zatwierdź samodzielnie. Zwykły czat nadal jest dostępny.',
  MODEL_CAPABILITIES_UNAVAILABLE: 'Nie udało się potwierdzić obsługi JSON Schema w katalogu OpenRouter. Analiza nie została uruchomiona. Spróbuj ponownie później lub sprawdź połączenie serwera z openrouter.ai. Zwykły czat nadal jest dostępny.',
};

export function outputError(code: OutputErrorCode) {
  return { code, message: errorMessages[code] };
}

export function displayChatError(message: string) {
  try {
    const parsed = outputErrorSchema.safeParse(JSON.parse(message));
    if (parsed.success) return errorMessages[parsed.data.code];
  } catch { /* Other HTTP errors are plain, server-controlled messages. */ }
  return message;
}

// Inspect only the provider's explicit refusal signal, never guess from draft wording.
const providerChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({ refusal: z.string().nullish() }).optional(),
    message: z.object({ refusal: z.string().nullish() }).optional(),
  })),
});
export function hasProviderRefusal(chunk: unknown) {
  const parsed = providerChunkSchema.safeParse(chunk);
  return parsed.success && parsed.data.choices.some(choice =>
    Boolean(choice.delta?.refusal?.trim() || choice.message?.refusal?.trim()));
}
