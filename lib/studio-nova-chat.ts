import { createUIMessageStream, createUIMessageStreamResponse, streamText, type LanguageModel, type ModelMessage, type UIMessage } from 'ai';
import { hasClearlyUnrelatedTopic, studioNovaChatInstructions, studioNovaScopeReply } from './studio-nova-scope';

const connectionError = 'Nie udało się uzyskać odpowiedzi AI. Sprawdź klucz, model i środki w OpenRouter.';

export function createScopedChatResponse({ model, messages, originalMessages, signal }: {
  model: LanguageModel;
  messages: ModelMessage[];
  originalMessages: UIMessage[];
  signal: AbortSignal;
}) {
  return createUIMessageStreamResponse({
    headers: { 'Cache-Control': 'no-store' },
    keepAliveMs: 10000,
    stream: createUIMessageStream({
      originalMessages,
      onError: () => connectionError,
      execute: async ({ writer }) => {
        writer.write({ type: 'start' });
        const fail = (message: string) => writer.write({ type: 'error', errorText: message });
        try {
          const result = streamText({
            model, messages, instructions: studioNovaChatInstructions,
            abortSignal: signal, maxRetries: 0, maxOutputTokens: 2000,
            onError: () => {},
          });
          let text = '';
          let finishReason: string | undefined;
          let failed = false;
          // Buffer all deltas: an unsafe answer must not leak before the final check.
          for await (const part of result.stream) {
            if (part.type === 'text-delta') text += part.text;
            if (part.type === 'finish') finishReason = part.finishReason;
            if (part.type === 'error') failed = true;
            if (part.type === 'abort') finishReason = 'interrupted';
          }
          if (signal.aborted) return fail('Przerwano odpowiedź.');
          if (failed) return fail(connectionError);
          if (finishReason === 'length' || finishReason === 'interrupted') return fail('Odpowiedź została przerwana. Spróbuj ponownie.');
          if (finishReason === 'content-filter') return fail('Model odmówił odpowiedzi. Skontaktuj się z pracownikiem Studio Nova.');
          if (finishReason !== 'stop' || !text.trim()) return fail(connectionError);
          if (hasClearlyUnrelatedTopic(text)) return fail(studioNovaScopeReply);
          writer.write({ type: 'text-start', id: 'scoped-text' });
          writer.write({ type: 'text-delta', id: 'scoped-text', delta: text });
          writer.write({ type: 'text-end', id: 'scoped-text' });
          writer.write({ type: 'finish', finishReason: 'stop' });
        } catch { fail(signal.aborted ? 'Przerwano odpowiedź.' : connectionError); }
      },
    }),
  });
}
