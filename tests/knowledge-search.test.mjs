import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const load = createRequire(import.meta.url);
const Module = load('node:module');
const root = path.resolve(import.meta.dirname, '..');
load.cache[load.resolve('server-only')] = { exports: {} };
load.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
let rows, dbError, embedError, dimension, embeds, queries, authenticated, chatCalls;
const model = { modelId: 'shared-import-and-search-model' };
load.cache[path.join(root, 'lib/model.ts')] = { exports: { getEmbeddingModel: () => model, knowledgeEmbeddingDimensions: 1536 } };
load.cache[load.resolve('ai')] = { exports: {
  tool: value => value,
  embed: async options => { embeds.push(options); if (embedError) throw new Error('secret-key'); return { embedding: Array(dimension).fill(0.01) }; },
} };
load.cache[load.resolve('@supabase/supabase-js')] = { exports: { createClient: () => ({
  rpc: (name, parameters) => { queries.push({ name, parameters }); return { abortSignal: async () => ({ data: rows, error: dbError }) }; },
}) } };
process.env.SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = 'test-only';
const { searchKnowledgeTool } = load('../lib/knowledge-tool.ts');
const execute = question => searchKnowledgeTool(new AbortController().signal).execute({ question });

beforeEach(() => {
  rows = [
    { title: 'FAQ', content: 'Pierwszy fakt.', similarity: 0.6 },
    { title: 'Cennik', content: 'Drugi fakt.', similarity: 0.9 },
    { title: 'Regulamin', content: 'Trzeci fakt.', similarity: 0.7 },
  ];
  dbError = null; embedError = false; dimension = 1536; embeds = []; queries = []; authenticated = false; chatCalls = 0;
});

test('question uses the shared model and match_chunks requests top three with only public result fields', async () => {
  const result = await execute('Ile kosztuje konsultacja?');
  assert.equal(embeds.length, 1);
  assert.equal(embeds[0].model, model);
  assert.equal(embeds[0].value, 'Ile kosztuje konsultacja?');
  assert.equal(queries.length, 1);
  assert.equal(queries[0].name, 'match_chunks');
  assert.equal(queries[0].parameters.match_count, 3);
  assert.equal(queries[0].parameters.query_embedding.length, 1536);
  assert.deepEqual(result.fragments.map(row => row.title), ['Cennik', 'Regulamin', 'FAQ']);
  assert.deepEqual(Object.keys(result.fragments[0]).sort(), ['content', 'similarity', 'sourceId', 'title']);
});

test('no matching rows means empty fragments, without invented content or an outage error', async () => {
  rows = [];
  assert.deepEqual(await execute('Czy są zajęcia na Marsie?'), { fragments: [] });
});

test('embedding failure does not query the database or expose provider secrets', async () => {
  embedError = true;
  const result = await execute('Cena?');
  assert.equal(queries.length, 0);
  assert.deepEqual(result.fragments, []); assert.match(result.error, /Nie udało się sprawdzić/);
  assert.doesNotMatch(JSON.stringify(result), /secret-key/);
});

test('incompatible vectors cannot reach match_chunks', async () => {
  dimension = 768;
  assert.ok((await execute('Cena?')).error);
  assert.equal(queries.length, 0);
});

test('database outage or malformed search result is distinct from missing knowledge', async () => {
  dbError = { message: 'private database detail' };
  assert.ok((await execute('Cena?')).error);
  dbError = null; rows[0].similarity = 'invalid';
  assert.ok((await execute('Cena?')).error);
});

test('low similarity is filtered before the result reaches the model', async () => {
  rows = [{ title: 'Niepasujący', content: 'Inny temat.', similarity: 0.2 }];
  assert.deepEqual(await execute('Cena?'), { fragments: [] });
});

test('source IDs remain distinct across repeated searches in the same response', async () => {
  const search = searchKnowledgeTool(new AbortController().signal);
  const first = await search.execute({ question: 'Cena?' });
  const next = await search.execute({ question: 'Termin?' });
  assert.equal(new Set([...first.fragments, ...next.fragments].map(row => row.sourceId)).size, 6);
});

load.cache[path.join(root, 'lib/workshop.ts')] = { exports: { authenticated: async () => authenticated, sameOrigin: () => true } };
load.cache[path.join(root, 'lib/agent-chat.ts')] = { exports: { chat: async () => { chatCalls++; return new Response('OK'); } } };
load.cache[path.join(root, 'lib/agent-analyze.ts')] = { exports: { analyze: async () => new Response('OK') } };
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) { return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args); };
const { POST } = load('../app/api/agent/route.ts');
Module._resolveFilename = resolve;

test('agent endpoint rejects missing session before executing chat, database or model', async () => {
  const request = () => new Request('https://chat.test/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'chat' }) });
  assert.equal((await POST(request())).status, 401);
  assert.equal(chatCalls, 0); assert.equal(embeds.length, 0); assert.equal(queries.length, 0);
  authenticated = true;
  assert.equal((await POST(request())).status, 200); assert.equal(chatCalls, 1);
});
