import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const load = createRequire(import.meta.url);
const Module = load('node:module');
load.cache[load.resolve('server-only')] = { exports: {} };
load.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { splitKnowledgeDocument, validateKnowledgeDocument } = load('../lib/knowledge-text.ts');

test('each short paragraph is a separate chunk; blank lines and CRLF are handled', () => {
  assert.deepEqual(splitKnowledgeDocument('  Pierwszy.\r\n\r\nDrugi.\r\n \r\n\r\nTrzeci.  '), ['Pierwszy.', 'Drugi.', 'Trzeci.']);
  assert.deepEqual(splitKnowledgeDocument('Jedna linia.\nDruga linia.'), ['Jedna linia.\nDruga linia.']);
  assert.deepEqual(splitKnowledgeDocument(' \n\n '), []);
});

test('five paragraphs produce exactly five chunks, including a paragraph longer than 800 characters', () => {
  const paragraphs = ['Pierwszy akapit.', 'Drugi akapit.', 'Długie zdanie. '.repeat(100).trim(), 'Czwarty akapit.', 'Piąty akapit.'];
  assert.deepEqual(splitKnowledgeDocument(paragraphs.join('\n\n')), paragraphs);
});

test('long paragraphs preserve sentences, words and Unicode without additional splitting', () => {
  for (const text of ['word '.repeat(400).trim(), 'x'.repeat(1601), 'a'.repeat(799) + '🌿'.repeat(500)]) {
    assert.deepEqual(splitKnowledgeDocument(text), [text]);
  }
});

test('blank fields and the 20 000-character limit are validated before submission', () => {
  assert.ok(validateKnowledgeDocument(' ', '\n ').title);
  assert.ok(validateKnowledgeDocument(' ', '\n ').content);
  assert.equal(validateKnowledgeDocument('Tytuł', 'a'.repeat(20000)).content, '');
  assert.ok(validateKnowledgeDocument('Tytuł', 'a'.repeat(20001)).content);
});

const events = [];
let documents, chunks, failCommit, failEmbedding, malformedEmbedding, authenticated, calls;
let nextId = 10000;
const vector = index => Array(1536).fill((index + 1) / 1000);
const root = path.resolve(import.meta.dirname, '..');
load.cache[load.resolve('ai')] = { exports: { embedMany: async options => {
  calls.push(options);
  if (failEmbedding) throw new Error('provider secret detail');
  return { embeddings: malformedEmbedding ? [[NaN]] : options.values.map((_, index) => vector(index)) };
} } };
load.cache[path.join(root, 'lib/model.ts')] = { exports: {
  getEmbeddingModel: () => 'test-embedding-model', knowledgeEmbeddingDimensions: 1536,
} };
load.cache[load.resolve('@supabase/supabase-js')] = { exports: { createClient: () => ({
  from: table => {
    const filters = [];
    let from = 0, to = Infinity;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      is(key, value) { filters.push([key, value]); return query; },
      order() { return query; },
      range(start, end) { from = start; to = end; return query; },
      then(resolve, reject) {
        events.push(['select', table]);
        let rows = (table === 'documents' ? documents : chunks).filter(row => filters.every(([key, value]) => row[key] === value));
        if (table === 'documents') rows = rows.map(row => ({ ...row, chunks: [{ count: chunks.filter(chunk => chunk.document_id === row.id).length }] }));
        return Promise.resolve({ data: structuredClone(rows.slice(from, to + 1)), error: null }).then(resolve, reject);
      },
    };
    return query;
  },
  rpc: async (name, input) => {
    events.push(['rpc', name]);
    if (failCommit) return { error: { message: 'database detail' } };
    if (name === 'delete_knowledge_document') {
      documents = documents.filter(row => String(row.id) !== input.p_id);
      chunks = chunks.filter(row => String(row.document_id) !== input.p_id);
      return { error: null };
    }
    const current = documents.filter(row => row.title.trim() === input.p_title);
    if (current.length !== input.p_expected.length || current.some(row => !input.p_expected.some(version => version.id === String(row.id) && version.createdAt === row.created_at))) {
      return { error: { message: 'KNOWLEDGE_VERSION_CONFLICT' } };
    }
    for (const row of input.p_backfill) {
      const chunk = chunks.find(chunk => String(chunk.document_id) === row.documentId && chunk.chunk_index === row.chunkIndex);
      if (chunk && chunk.embedding === null) chunk.embedding = row.embedding;
    }
    const oldIds = current.map(row => row.id);
    documents = documents.filter(row => !oldIds.includes(row.id));
    chunks = chunks.filter(row => !oldIds.includes(row.document_id));
    const id = nextId++;
    documents.push({ id, title: input.p_title, created_at: '2026-11-19T21:00:00+00:00' });
    chunks.push(...input.p_chunks.map((row, chunk_index) => ({ ...row, document_id: id, chunk_index })));
    return { error: null };
  },
}) } };
process.env.SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = 'test-only';
load.cache[path.join(root, 'lib/workshop.ts')] = { exports: {
  authenticated: async () => authenticated,
  sameOrigin: request => request.headers.get('origin') === new URL(request.url).origin,
} };
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args);
};
const { GET, POST, DELETE } = load('../app/api/upload/route.ts');
Module._resolveFilename = originalResolve;
const request = (body = { title: 'Cennik', content: 'Pierwszy.\n\nDrugi.' }, origin = 'https://chat.test') => new Request('https://chat.test/api/upload', {
  method: 'POST', headers: { origin }, body: JSON.stringify(body),
});
beforeEach(() => {
  events.length = 0; calls = []; documents = []; chunks = []; nextId = 10000;
  failCommit = failEmbedding = malformedEmbedding = false;
  authenticated = true;
});
const readEvents = async response => (await response.text()).trim().split('\n').map(line => JSON.parse(line));
const addOld = () => {
  documents.push({ id: 7, title: 'Cennik', created_at: '2026-11-18T12:00:00+00:00' });
  chunks.push({ document_id: 7, chunk_index: 0, content: 'Stara treść.', embedding: null });
  return [{ id: '7', createdAt: documents[0].created_at }];
};

test('every method checks session and mutations check origin before touching database or model', async () => {
  authenticated = false;
  assert.equal((await GET()).status, 401);
  assert.equal((await DELETE(new Request('https://chat.test/api/upload?id=7', { method: 'DELETE' }))).status, 401);
  assert.equal((await POST(request())).status, 401);
  authenticated = true;
  assert.equal((await POST(request(undefined, 'https://other.test'))).status, 403);
  assert.equal((await DELETE(new Request('https://chat.test/api/upload?id=7', { method: 'DELETE', headers: { origin: 'https://other.test' } }))).status, 403);
  for (const body of [{ title: ' ', content: 'B' }, { title: 'A', content: '\n' }, { title: 'A', content: 'x'.repeat(20001) }]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  assert.equal(events.length, 0); assert.equal(calls.length, 0);
});

test('stream reports real split, embedding and save stages before success', async () => {
  const response = await POST(request());
  assert.match(response.headers.get('content-type'), /ndjson/);
  const stream = await readEvents(response);
  assert.deepEqual(stream, [
    { type: 'stage', stage: 'split' }, { type: 'stage', stage: 'embedding' }, { type: 'stage', stage: 'save' },
    { type: 'success', title: 'Cennik', chunkCount: 2 },
  ]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ['Pierwszy.', 'Drugi.']);
  assert.deepEqual(chunks.map(row => [row.chunk_index, row.content, row.embedding]), [
    [0, 'Pierwszy.', vector(0)], [1, 'Drugi.', vector(1)],
  ]);
});

test('list returns source title, version date and chunk count', async () => {
  addOld();
  const response = await GET();
  assert.deepEqual(await response.json(), [{ id: '7', title: 'Cennik', createdAt: documents[0].created_at, chunkCount: 1 }]);
});

test('existing title requires exact version confirmation before invoking the model', async () => {
  const expected = addOld();
  assert.equal((await POST(request())).status, 409);
  assert.equal(calls.length, 0);
  const response = await POST(request({ title: 'Cennik', content: 'Nowa wersja.', expected }));
  assert.equal((await readEvents(response)).at(-1).type, 'success');
  assert.equal(documents.length, 1);
  assert.notEqual(documents[0].id, 7);
  assert.deepEqual(chunks.map(row => row.content), ['Nowa wersja.']);
});

test('stale confirmation is rejected without paying for embeddings', async () => {
  addOld();
  const response = await POST(request({ title: 'Cennik', content: 'Nowa.', expected: [{ id: '7', createdAt: '2026-11-17T12:00:00+00:00' }] }));
  assert.equal(response.status, 409); assert.equal(calls.length, 0);
});

test('one embedMany call fills old NULLs without re-embedding completed rows', async () => {
  addOld(); documents[0].title = 'Inny';
  chunks.push({ document_id: 7, chunk_index: 1, content: 'Gotowy.', embedding: vector(9) });
  const response = await POST(request());
  assert.equal((await readEvents(response)).at(-1).type, 'success');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ['Pierwszy.', 'Drugi.', 'Stara treść.']);
  assert.deepEqual(chunks[0].embedding, vector(2)); assert.deepEqual(chunks[1].embedding, vector(9));
});

test('missing embedding pagination is complete', async () => {
  chunks = Array.from({ length: 501 }, (_, chunk_index) => ({ document_id: 7, chunk_index, content: `Akapit ${chunk_index}`, embedding: null }));
  const response = await POST(request());
  assert.equal((await readEvents(response)).at(-1).type, 'success');
  assert.equal(calls.length, 1); assert.equal(calls[0].values.length, 503);
  assert.ok(chunks.every(row => row.embedding?.length === 1536));
});

test('embedding failure identifies its stage, keeps the old version and creates no unfinished document', async () => {
  const expected = addOld(); failEmbedding = true;
  const response = await POST(request({ title: 'Cennik', content: 'Nowa.', expected }));
  const result = (await readEvents(response)).at(-1);
  assert.equal(result.type, 'error'); assert.equal(result.stage, 'embedding');
  assert.match(result.message, /OpenRouter/); assert.doesNotMatch(result.message, /provider secret/);
  assert.equal(documents.length, 1); assert.equal(documents[0].id, 7);
  assert.equal(chunks[0].content, 'Stara treść.'); assert.equal(chunks[0].embedding, null);
  assert.ok(!events.some(([op]) => op === 'rpc'));
});

test('malformed embeddings cannot be committed', async () => {
  malformedEmbedding = true;
  const response = await POST(request());
  assert.equal((await readEvents(response)).at(-1).type, 'error');
  assert.equal(documents.length, 0); assert.equal(chunks.length, 0);
  assert.ok(!events.some(([op]) => op === 'rpc'));
});

test('commit failure reports save stage with no success and preserves the prior version', async () => {
  const expected = addOld(); failCommit = true;
  const response = await POST(request({ title: 'Cennik', content: 'Nowa.', expected }));
  const result = (await readEvents(response)).at(-1);
  assert.equal(result.type, 'error'); assert.equal(result.stage, 'save');
  assert.match(result.message, /Odśwież listę/); assert.doesNotMatch(result.message, /database detail/);
  assert.equal(documents[0].id, 7); assert.equal(chunks[0].content, 'Stara treść.');
});

test('delete calls the transaction for the selected document only', async () => {
  addOld(); documents.push({ id: 8, title: 'Inny', created_at: '2026-11-18T12:00:00+00:00' });
  const response = await DELETE(new Request('https://chat.test/api/upload?id=7', { method: 'DELETE', headers: { origin: 'https://chat.test' } }));
  assert.equal(response.status, 204);
  assert.deepEqual(documents.map(row => row.id), [8]); assert.equal(chunks.length, 0);
});
