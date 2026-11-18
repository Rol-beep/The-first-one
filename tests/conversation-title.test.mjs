import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const load = createRequire(import.meta.url);
load.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { generateConversationTitle } = load('../lib/conversation-title.ts');
const { MockLanguageModelV4 } = load('ai/test');
const message = { id: 'u', role: 'user', parts: [{ type: 'text', text: 'Planuję weekend w Lizbonie' }] };
function modelFor(text) {
  return new MockLanguageModelV4({ doGenerate: async () => ({
    content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: 'stop' },
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [],
  }) });
}
test('model creates a themed title of 3–5 words', async () => {
  const model = modelFor('Spokojny weekend w Lizbonie');
  assert.equal(await generateConversationTitle(model, message, message), 'Spokojny weekend w Lizbonie');
  assert.equal(model.doGenerateCalls.length, 1);
});
for (const text of ['Podróż', 'To jest stanowczo zbyt długi tytuł rozmowy', '# Weekend w Lizbonie']) {
  test(`reject invalid title: ${text}`, async () => {
    await assert.rejects(generateConversationTitle(modelFor(text), message, message), /Invalid conversation title/);
  });
}
