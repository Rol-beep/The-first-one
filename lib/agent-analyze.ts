import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import { z } from 'zod';
import { createUIMessageStream, createUIMessageStreamResponse, generateText, NoObjectGeneratedError, Output, validateUIMessages } from 'ai';
import { customerAnalysisMessage, passesStudioNovaPolicy } from '@/lib/studio-nova-policy';
import { studioNovaInstructions } from '@/lib/studio-nova-instructions';
import { AnalysisConfigurationError, requireStructuredOutputSupport, isUnsupportedStructuredOutput } from '@/lib/studio-nova-capabilities';
import { hasProviderRefusal, outputError, studioNovaOutputSchema } from '@/lib/studio-nova-output';

const headers = { 'Cache-Control': 'no-store' };
const analysisRequestSchema = z.object({ messages: z.array(z.unknown()).length(1) }).strict();

export async function analyze(request: Request, payload: unknown) {
  let messages;
  try {
    const body = analysisRequestSchema.parse(payload);
    messages = await validateUIMessages({ messages: body.messages });
    // Analysis is independent: never accept instructions or previous assistant turns as input.
    if (messages.length !== 1 || messages[0].role !== 'user' ||
      !messages[0].parts.some(part => part.type === 'text' && part.text.trim()) ||
      messages[0].parts.some(part => part.type !== 'text') ||
      messages[0].parts.reduce((size, part) => size + (part.type === 'text' ? part.text.length : 0), 0) > 16000) {
      throw new Error('Invalid analysis input');
    }
  } catch {
    return new Response('Wpisz jedną niepustą wiadomość klienta, do 16000 znaków.', { status: 400, headers });
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const modelId = process.env.OPENROUTER_MODEL?.trim();
  if (!apiKey || !modelId) return new Response('Brak konfiguracji AI. Ustaw OPENROUTER_API_KEY i OPENROUTER_MODEL na serwerze.', { status: 503, headers });

  const receivedAt = new Date().toISOString();
  try {
    await requireStructuredOutputSupport(modelId, request.signal);
    const openrouter = createOpenRouter({ apiKey });
    const result = await generateText({
      model: openrouter(modelId, { structuredOutputs: { strict: true }, provider: { require_parameters: true } }),
      instructions: studioNovaInstructions + '\nKontekst czasu: żądanie odebrano ' + receivedAt + ' (UTC). Jeśli data lub strefa czasowa spotkania jest niejednoznaczna, nie zakładaj rozpoczęcia w ciągu godziny: ustaw normal i needs_review=true.',
      messages: [customerAnalysisMessage(messages[0].parts.filter(part => part.type === 'text').map(part => part.text).join('\n'))],
      output: Output.object({ schema: studioNovaOutputSchema, name: 'studio_nova_reply' }),
      maxOutputTokens: 2000,
      maxRetries: 0,
      abortSignal: request.signal,
    });
    if (request.signal.aborted) return analysisError('REQUEST_ABORTED', 408);
    if (hasProviderRefusal(result.response.body) || result.finishReason === 'content-filter' || result.rawFinishReason === 'refusal') {
      return analysisError('MODEL_REFUSAL');
    }
    if (result.finishReason === 'length') return analysisError('OUTPUT_TRUNCATED');
    if (result.finishReason !== 'stop') return analysisError('MODEL_ERROR', 502);
    const validated = studioNovaOutputSchema.safeParse(result.output);
    if (!validated.success) return analysisError('INVALID_OUTPUT');
    if (!passesStudioNovaPolicy(validated.data)) return analysisError('OUTPUT_POLICY_VIOLATION');

    return createUIMessageStreamResponse({
      headers,
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: 'start' });
          writer.write({ type: 'text-start', id: 'validated-json' });
          writer.write({ type: 'text-delta', id: 'validated-json', delta: JSON.stringify(validated.data) });
          writer.write({ type: 'text-end', id: 'validated-json' });
          writer.write({ type: 'finish', finishReason: 'stop' });
        },
      }),
    });
  } catch (error) {
    if (request.signal.aborted) return analysisError('REQUEST_ABORTED', 408);
    if (error instanceof AnalysisConfigurationError) {
      return analysisError(error.code, error.code === 'REQUEST_ABORTED' ? 408 : 503);
    }
    if (isUnsupportedStructuredOutput(error)) return analysisError('MODEL_UNSUPPORTED', 503);
    if (NoObjectGeneratedError.isInstance(error)) {
      if (hasProviderRefusal(error.response?.body) || error.finishReason === 'content-filter') {
        return analysisError('MODEL_REFUSAL');
      }
      return analysisError(error.finishReason === 'length' ? 'OUTPUT_TRUNCATED' : 'INVALID_OUTPUT');
    }
    return analysisError('MODEL_ERROR', 502);
  }
}

function analysisError(code: Parameters<typeof outputError>[0], status = 422) {
  return Response.json(outputError(code), { status, headers });
}
