import { isWithinStudioNovaScope, studioNovaScopeReply } from '@/lib/studio-nova-scope';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { validateUIMessages } from 'ai';
import { z } from 'zod';
import { customerAnalysisMessage } from '@/lib/studio-nova-policy';
import { authenticated, sameOrigin } from '@/lib/workshop';
import { createStudioNovaResponse } from '@/lib/studio-nova-stream';
import { studioNovaInstructions } from '@/lib/studio-nova-instructions';
import { AnalysisConfigurationError, requireStructuredOutputSupport } from '@/lib/studio-nova-capabilities';
import { outputError } from '@/lib/studio-nova-output';

export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };
const analysisRequestSchema = z.object({ messages: z.array(z.unknown()).length(1) }).strict();

export async function POST(request: Request) {
  if (!await authenticated()) return new Response('Zaloguj się ponownie.', { status: 401, headers });
  if (!sameOrigin(request)) return new Response('Niedozwolone żądanie.', { status: 403, headers });

  let messages;
  try {
    const body = analysisRequestSchema.parse(await request.json());
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

  const customerText = messages[0].parts.filter(part => part.type === 'text').map(part => part.text).join('\n');
  if (!isWithinStudioNovaScope(customerText)) {
    return new Response(studioNovaScopeReply, { status: 422, headers });
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const modelId = process.env.OPENROUTER_MODEL?.trim();
  if (!apiKey || !modelId) return new Response('Brak konfiguracji AI. Ustaw OPENROUTER_API_KEY i OPENROUTER_MODEL na serwerze.', { status: 503, headers });

  const receivedAt = new Date().toISOString();
  try {
    await requireStructuredOutputSupport(modelId, request.signal);
    const openrouter = createOpenRouter({ apiKey });
    return createStudioNovaResponse({
      model: openrouter(modelId, { structuredOutputs: { strict: true }, provider: { require_parameters: true } }),
      instructions: studioNovaInstructions + '\nKontekst czasu: żądanie odebrano ' + receivedAt + ' (UTC). Jeśli data lub strefa czasowa spotkania jest niejednoznaczna, nie zakładaj rozpoczęcia w ciągu godziny: ustaw normal i needs_review=true.',
      messages: [customerAnalysisMessage(customerText)],
      originalMessages: messages,
      signal: request.signal,
    });
  } catch (error) {
    const code = error instanceof AnalysisConfigurationError ? error.code : 'MODEL_ERROR';
    return Response.json(outputError(code), { status: code === 'REQUEST_ABORTED' ? 408 : 503, headers });
  }
}
