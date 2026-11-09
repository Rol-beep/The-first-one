import { APICallError, UnsupportedFunctionalityError } from 'ai';
import { z } from 'zod';
import type { OutputErrorCode } from './studio-nova-output';

export class AnalysisConfigurationError extends Error {
  constructor(public readonly code: OutputErrorCode) { super(code); }
}

const modelsSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    supported_parameters: z.array(z.string()).nullish(),
  })),
});

// Public metadata only, without sending the API key. Never substitute a different model.
export async function requireStructuredOutputSupport(
  modelId: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  let catalog;
  try {
    const response = await fetcher('https://openrouter.ai/api/v1/models', {
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok) throw new Error('Catalog unavailable');
    catalog = modelsSchema.parse(await response.json());
  } catch {
    throw new AnalysisConfigurationError(signal.aborted ? 'REQUEST_ABORTED' : 'MODEL_CAPABILITIES_UNAVAILABLE');
  }
  const configured = catalog.data.find(model => model.id === modelId);
  if (!configured) throw new AnalysisConfigurationError('MODEL_UNSUPPORTED');
  const parameters = configured.supported_parameters;
  if (!parameters) throw new AnalysisConfigurationError('MODEL_CAPABILITIES_UNAVAILABLE');
  if (!parameters.includes('structured_outputs') || !parameters.includes('response_format')) {
    throw new AnalysisConfigurationError('MODEL_UNSUPPORTED');
  }
}

export function isUnsupportedStructuredOutput(error: unknown): boolean {
  if (UnsupportedFunctionalityError.isInstance(error)) return true;
  if (!APICallError.isInstance(error)) return false;
  if (![400, 404, 422].includes(error.statusCode ?? 0)) return false;
  // Inspect for classification only. Never expose or log the provider response.
  return /structured.?outputs?|json.?schema|response.?format|no endpoints.*(parameters|support)/i
    .test(error.message + ' ' + (error.responseBody ?? ''));
}
