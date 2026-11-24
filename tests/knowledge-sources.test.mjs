import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const load = createRequire(import.meta.url);
load.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { usedKnowledgeSources, displayKnowledgeText, knowledgeSimilarityThreshold } = load('../lib/knowledge-sources.ts');
const source = (sourceId, title = 'Cennik') => ({ sourceId, title, content: `Dokładny tekst ${sourceId}.\nDruga linia.`, similarity: 0.632 });

test('only the specifically cited fragment is a source when titles are identical', () => {
  const first = source('K1'), second = source('K2');
  assert.deepEqual(usedKnowledgeSources('Odpowiedź.\n📎 Źródło: Cennik [K2]', [first, second]), [second]);
});
test('unknown, incorrectly titled, low-similarity and uncited fragments are not sources', () => {
  const first = source('K1');
  assert.deepEqual(usedKnowledgeSources('📎 Źródło: Cennik [K3]', [first]), []);
  assert.deepEqual(usedKnowledgeSources('📎 Źródło: Inny [K1]', [first]), []);
  assert.deepEqual(usedKnowledgeSources('📎 Źródło: Cennik [K1]', [{ ...first, similarity: knowledgeSimilarityThreshold - 0.001 }]), []);
  assert.deepEqual(usedKnowledgeSources('Nie mam tej informacji w bazie wiedzy', [first]), []);
});
test('multiple citations retain exact text and remove duplicate references', () => {
  const a = source('K1'), b = source('K2', 'FAQ');
  const text = 'Cena jest znana, rabatu brak w bazie.\n📎 Źródło: Cennik [K1]\n📎 Źródło: FAQ [K2]\n📎 Źródło: Cennik [K1]';
  assert.deepEqual(usedKnowledgeSources(text, [a, b]), [a, b]);
  assert.equal(displayKnowledgeText(text).includes('[K'), false);
  assert.equal(displayKnowledgeText('Treść [K1] bez cytowania'), 'Treść [K1] bez cytowania');
});
