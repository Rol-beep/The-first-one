import { z } from 'zod';
import { authenticated, sameOrigin } from '@/lib/workshop';
import { saveKnowledgeDocument, listKnowledgeDocuments, deleteKnowledgeDocument, KnowledgeSaveError } from '@/lib/supabase';
import { knowledgeContentLimit, knowledgeTitleLimit, validateKnowledgeDocument, splitKnowledgeDocument } from '@/lib/knowledge-text';
import type { KnowledgeImportEvent, KnowledgeStage } from '@/lib/knowledge-import';

const headers = { 'Cache-Control': 'no-store' };
const versionSchema = z.object({ id: z.string().min(1).max(80), createdAt: z.iso.datetime({ offset: true }) }).strict();
const schema = z.object({ title: z.string().max(knowledgeTitleLimit * 2), content: z.string().max(knowledgeContentLimit),
  expected: z.array(versionSchema).max(1000).default([]) }).strict();
export async function GET() {
  if (!await authenticated()) return new Response('Zaloguj się ponownie.', { status: 401, headers });
  try { return Response.json(await listKnowledgeDocuments(), { headers }); }
  catch { return new Response('Nie udało się wczytać dokumentów. Sprawdź połączenie z bazą i spróbuj ponownie.', { status: 503, headers }); }
}
export async function DELETE(request: Request) {
  if (!await authenticated()) return new Response('Zaloguj się ponownie.', { status: 401, headers });
  if (!sameOrigin(request)) return new Response('Niedozwolone żądanie.', { status: 403, headers });
  const id = z.union([z.uuid(), z.string().regex(/^\d+$/)]).safeParse(new URL(request.url).searchParams.get('id'));
  if (!id.success) return new Response('Niepoprawny identyfikator dokumentu.', { status: 400, headers });
  try { await deleteKnowledgeDocument(id.data); return new Response(null, { status: 204, headers }); }
  catch (error) { return new Response(error instanceof KnowledgeSaveError ? error.message : 'Nie udało się usunąć dokumentu. Odśwież listę przed ponowieniem.', { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (!await authenticated()) return new Response('Zaloguj się ponownie.', { status: 401, headers });
  if (!sameOrigin(request)) return new Response('Niedozwolone żądanie.', { status: 403, headers });
  let input;
  try {
    const body = await request.text();
    if (body.length > 300_000) throw new Error();
    input = schema.parse(JSON.parse(body));
  } catch { return new Response('Sprawdź tytuł i treść dokumentu oraz odśwież listę. Treść może mieć maksymalnie 20 000 znaków.', { status: 400, headers }); }
  const errors = validateKnowledgeDocument(input.title, input.content);
  if (errors.title || errors.content) return new Response(errors.title || errors.content, { status: 400, headers });
  const title = input.title.trim();
  // Check current versions before paying for embeddings; RPC rechecks under a lock.
  try {
    const versions = (await listKnowledgeDocuments()).filter(doc => doc.title.trim() === title);
    if (versions.length !== input.expected.length || versions.some(doc => !input.expected.some(version =>
      version.id === doc.id && Date.parse(version.createdAt) === Date.parse(doc.createdAt)))) {
      return new Response('Lista dokumentów zmieniła się. Odśwież ją i potwierdź zastąpienie aktualnej wersji.', { status: 409, headers });
    }
  } catch { return new Response('Nie udało się sprawdzić wersji dokumentu. Odśwież listę i spróbuj ponownie.', { status: 503, headers }); }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let stage: KnowledgeStage = 'split';
      let connected = true;
      const send = (event: KnowledgeImportEvent) => {
        if (!connected) return;
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); } catch { connected = false; }
      };
      try {
        send({ type: 'stage', stage });
        const chunks = splitKnowledgeDocument(input.content);
        await saveKnowledgeDocument(title, chunks, input.expected, next => { stage = next; send({ type: 'stage', stage }); });
        send({ type: 'success', title, chunkCount: chunks.length });
      } catch (error) {
        send({ type: 'error', stage, message: error instanceof KnowledgeSaveError ? error.message :
          'Nie udało się zakończyć importu. Odśwież listę dokumentów, sprawdź połączenie i spróbuj ponownie.' });
      } finally { if (connected) controller.close(); }
    },
  });
  return new Response(stream, { headers: { ...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' } });
}
