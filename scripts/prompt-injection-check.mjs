import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const load = createRequire(import.meta.url);
load.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  });
  module._compile(result.outputText, filename);
};
const { createStudioNovaResponse } = load('../lib/studio-nova-stream.ts');
const { studioNovaInstructions } = load('../lib/studio-nova-instructions.ts');
const { MockLanguageModelV4 } = load('ai/test');
const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/studio-nova-injection.json', import.meta.url), 'utf8'));
const text = JSON.stringify(fixture.simulated_compromised_output);
const model = new MockLanguageModelV4({ doStream: async () => ({
  stream: new ReadableStream({ start(controller) {
    for (const chunk of [
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: text },
      { type: 'text-end', id: 't' },
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      } },
    ]) controller.enqueue(chunk);
    controller.close();
  } }),
}) });
let networkCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('Network forbidden during local injection test'); };
const response = createStudioNovaResponse({
  model, instructions: studioNovaInstructions,
  messages: [{ role: 'user', content: fixture.customer_message }],
  originalMessages: [{ id: 'fictional-client', role: 'user', parts: [{ type: 'text', text: fixture.customer_message }] }],
  signal: new AbortController().signal,
});
const body = await response.text();
globalThis.fetch = originalFetch;
assert.equal(networkCalls, 0);
const events = body.split('\n').filter(line => line.startsWith('data: ') && !line.includes('[DONE]')).map(line => JSON.parse(line.slice(6)));
const visibleText = events.filter(event => event.type === 'text-delta').map(event => event.delta).join('');
const error = events.find(event => event.type === 'error');
const observation = {
  test_kind: 'Local application backend with a simulated compromised model; not a live LLM test',
  input: fixture.customer_message,
  simulated_model_output: fixture.simulated_compromised_output,
  model_calls: model.doStreamCalls.length,
  network_calls: networkCalls,
  successful_result_published: Boolean(visibleText),
  published_result: visibleText ? JSON.parse(visibleText) : null,
  error: error ? JSON.parse(error.errorText) : null,
  refund_executed: false,
};
if (process.argv.includes('--record-before')) {
  assert.equal(observation.successful_result_published, true);
  writeFileSync(new URL('../docs/prompt-injection-before.json', import.meta.url), JSON.stringify(observation, null, 2) + '\n');
  console.log('BEFORE: schema-valid unsafe draft was published; no refund or external operation executed.');
} else {
  assert.equal(observation.successful_result_published, false);
  assert.equal(observation.error.code, 'OUTPUT_POLICY_VIOLATION');
  writeFileSync(new URL('../docs/prompt-injection-after.json', import.meta.url), JSON.stringify(observation, null, 2) + '\n');
  console.log('AFTER: same simulated unsafe result rejected with OUTPUT_POLICY_VIOLATION; no draft or refund published.');
}
