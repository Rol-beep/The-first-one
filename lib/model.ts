import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";

function required(name: "OPENROUTER_API_KEY" | "OPENROUTER_MODEL" | "OPENROUTER_EMBEDDING_MODEL") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Brak konfiguracji: ${name}.`);
  return value;
}

function provider() {
  return createOpenRouter({ apiKey: required("OPENROUTER_API_KEY") });
}

export function getConversationModel() {
  return provider().chat(required("OPENROUTER_MODEL"));
}

// Pomiar 2026-11-19: openai/text-embedding-3-small, 1536 liczb dla tekstu „test”.
// Jeden rzeczywisty request, bez wymuszania dimensions i bez ponowień.
// Po zmianie OPENROUTER_EMBEDDING_MODEL trzeba ponownie sprawdzić wymiar
// oraz przeliczyć wcześniej zapisane embeddingi; jednakowy wymiar nie oznacza zgodności modeli.
// Zapis dokumentów i embeddingi pytań powinny korzystać z tej samej fabryki.
export const knowledgeEmbeddingDimensions = 1536;

export function getEmbeddingModel() {
  return provider().textEmbeddingModel(required("OPENROUTER_EMBEDDING_MODEL"));
}
