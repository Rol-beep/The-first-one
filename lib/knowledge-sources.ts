// Calibration 2026-11-19, text-embedding-3-small, eight questions against
// Cennik 2026. and FAQ: unrelated <= .281; useful partial-answer match .479.
// Similarity is not confidence or proof of an answer. Recalibrate after model/corpus changes.
export const knowledgeSimilarityThreshold = 0.45;
export type KnowledgeSource = { sourceId: string; title: string; content: string; similarity: number };

export function isKnowledgeSource(value: unknown): value is KnowledgeSource {
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;
  return typeof source.sourceId === 'string' && /^K\d+$/.test(source.sourceId)
    && typeof source.title === 'string' && Boolean(source.title.trim())
    && typeof source.content === 'string' && Boolean(source.content.trim())
    && typeof source.similarity === 'number' && Number.isFinite(source.similarity)
    && source.similarity >= knowledgeSimilarityThreshold && source.similarity <= 1;
}

// Only an explicit citation of a returned fragment qualifies as a used source.
// Two fragments with the same title remain distinguishable by their sourceId.
export function usedKnowledgeSources(text: string, candidates: unknown[]): KnowledgeSource[] {
  const available = candidates.filter(isKnowledgeSource);
  const used: KnowledgeSource[] = [];
  for (const line of text.split('\n')) {
    const citation = line.trim().match(/^📎 Źródło: (.+) \[(K\d+)\]$/u);
    if (!citation) continue;
    const source = available.find(item => item.sourceId === citation[2] && item.title === citation[1]);
    if (source && !used.some(item => item.sourceId === source.sourceId)) used.push(source);
  }
  return used;
}

export function displayKnowledgeText(text: string) {
  return text.replace(/(^📎 Źródło: .+) \[K\d+\]$/gmu, '$1');
}
