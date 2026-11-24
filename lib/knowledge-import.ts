export type KnowledgeStage = 'split' | 'embedding' | 'save';
export const knowledgeStageLabels: Record<KnowledgeStage, string> = {
  split: 'Dzielę tekst…', embedding: 'Tworzę embeddingi…', save: 'Zapisuję…',
};
export type KnowledgeVersion = { id: string; createdAt: string };
export type KnowledgeDocument = KnowledgeVersion & { title: string; chunkCount: number };
export type KnowledgeImportEvent =
  | { type: 'stage'; stage: KnowledgeStage }
  | { type: 'success'; title: string; chunkCount: number }
  | { type: 'error'; stage: KnowledgeStage; message: string };
