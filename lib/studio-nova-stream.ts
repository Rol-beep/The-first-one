import { passesStudioNovaPolicy } from './studio-nova-policy';
import { isUnsupportedStructuredOutput } from './studio-nova-capabilities';
import {
  createUIMessageStream, createUIMessageStreamResponse,
  NoObjectGeneratedError, Output, streamText,
  type LanguageModel, type ModelMessage, type UIMessage,
} from 'ai';
import {
  hasProviderRefusal, outputError, studioNovaOutputSchema,
  type OutputErrorCode,
} from './studio-nova-output';

export function createStudioNovaResponse({ model, instructions, messages, originalMessages, signal }: {
  model: LanguageModel;
  instructions: string;
  messages: ModelMessage[];
  originalMessages: UIMessage[];
  signal: AbortSignal;
}) {
  const stream = createUIMessageStream({
    originalMessages,
    onError: () => JSON.stringify(outputError('MODEL_ERROR')),
    execute: async ({ writer }) => {
      writer.write({ type: 'start' });
      const fail = (code: OutputErrorCode) => {
        writer.write({ type: 'error', errorText: JSON.stringify(outputError(code)) });
      };
      let refusal = false;
      let finishReason: string | undefined;
      let streamError: unknown;
      try {
        const result = streamText({
          model,
          instructions,
          messages,
          output: Output.object({ schema: studioNovaOutputSchema, name: 'studio_nova_reply' }),
          includeRawChunks: true,
          maxOutputTokens: 2000,
          maxRetries: 0,
          abortSignal: signal,
          // SDK defaults may log raw provider errors containing request/response data.
          onError: () => {},
        });
        // Attach rejection handling immediately; partial or invalid output is never published.
        const finalOutput = Promise.resolve(result.output).then(
          output => ({ ok: true as const, output }),
          error => ({ ok: false as const, error }),
        );
        for await (const part of result.stream) {
          if (part.type === 'raw') refusal ||= hasProviderRefusal(part.rawValue);
          if (part.type === 'finish-step' || part.type === 'finish') {
            finishReason = part.finishReason;
            refusal ||= part.finishReason === 'content-filter' || part.rawFinishReason === 'refusal';
          }
          if (part.type === 'abort') finishReason = 'interrupted';
          if (part.type === 'error') streamError = part.error;
        }
        const complete = await finalOutput;
        if (signal.aborted) return fail('REQUEST_ABORTED');
        if (refusal) return fail('MODEL_REFUSAL');
        if (!complete.ok && NoObjectGeneratedError.isInstance(complete.error)) {
          finishReason ??= complete.error.finishReason;
        }
        if (finishReason === 'content-filter') return fail('MODEL_REFUSAL');
        if (finishReason === 'length' || finishReason === 'interrupted') return fail('OUTPUT_TRUNCATED');
        if (isUnsupportedStructuredOutput(streamError)) return fail('MODEL_UNSUPPORTED');
        if (!complete.ok) {
          if (isUnsupportedStructuredOutput(complete.error)) return fail('MODEL_UNSUPPORTED');
          return fail(NoObjectGeneratedError.isInstance(complete.error) ? 'INVALID_OUTPUT' : 'MODEL_ERROR');
        }
        if (streamError || finishReason !== 'stop') return fail('MODEL_ERROR');
        // Independent validation at the application boundary, even after SDK validation.
        const validated = studioNovaOutputSchema.safeParse(complete.output);
        if (!validated.success) return fail('INVALID_OUTPUT');
        if (!passesStudioNovaPolicy(validated.data)) return fail('OUTPUT_POLICY_VIOLATION');
        writer.write({ type: 'text-start', id: 'validated-json' });
        writer.write({ type: 'text-delta', id: 'validated-json', delta: JSON.stringify(validated.data, null, 2) });
        writer.write({ type: 'text-end', id: 'validated-json' });
        writer.write({ type: 'finish', finishReason: 'stop' });
      } catch (error) {
        fail(signal.aborted ? 'REQUEST_ABORTED' : refusal ? 'MODEL_REFUSAL' : isUnsupportedStructuredOutput(error) ? 'MODEL_UNSUPPORTED' : 'MODEL_ERROR');
      }
    },
  });
  return createUIMessageStreamResponse({
    stream,
    headers: { 'Cache-Control': 'no-store' },
    keepAliveMs: 10000,
  });
}
