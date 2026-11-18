import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const load = createRequire(import.meta.url);
load.cache[load.resolve('server-only')] = { exports: {} };
load.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};
const { conversationText, storedMessageId } = load('../lib/conversation-text.ts');

// Fake only the database client; exercise the real storage functions and their queries.
const rows = { conversations: [], messages: [] };
let failWrite = false;
let writes = 0;
function query(table) {
  const filters = [];
  let order;
  let count;
  let action;
  let values;
  const q = {
    select: () => q,
    delete: () => { action = "delete"; return q; },
    update: input => { action = "update"; values = input; return q; },
    eq: (key, value) => { filters.push([key, value]); return q; },
    order: (key, options) => { order = [key, options.ascending]; return q; },
    limit: n => { count = n; return q; },
    maybeSingle: async () => ({ data: select()[0] ?? null, error: null }),
    then: (yes, no) => {
      const selected = select();
      if (action === 'update') selected.forEach(row => Object.assign(row, values));
      if (action === 'delete') {
        rows[table] = rows[table].filter(row => !selected.includes(row));
        if (table === 'conversations') rows.messages = rows.messages.filter(row => !selected.some(conv => conv.id === row.conversation_id));
      }
      return Promise.resolve({ data: selected, error: null }).then(yes, no);
    },
    upsert: async (input, options) => {
      assert.equal(options.onConflict, 'id');
      assert.equal(options.ignoreDuplicates, true);
      writes++;
      if (failWrite) return { error: { message: 'PRIVATE_DATABASE_ERROR' } };
      for (const row of Array.isArray(input) ? input : [input]) {
        if (!rows[table].some(existing => existing.id === row.id)) {
          rows[table].push({ ...row, position: rows[table].length + 1 });
        }
      }
      return { error: null };
    },
  };
  function select() {
    let result = rows[table].filter(row => filters.every(([key, value]) => row[key] === value));
    if (order) result = [...result].sort((a, b) => (a[order[0]] > b[order[0]] ? 1 : -1) * (order[1] ? 1 : -1));
    return count ? result.slice(0, count) : result;
  }
  return q;
}
load.cache[load.resolve('@supabase/supabase-js')] = { exports: {
  createClient: (_url, _key, options) => {
    assert.equal(options.auth.persistSession, false);
    return { from: query };
  },
} };
// Use explicit fake credentials, never load the project's .env.local.
process.env.SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = 'test-only-fake-key';
const store = load('../lib/supabase.ts');
const id = '12345678-1234-4234-8234-123456789012';
const user = { id: 'u1', role: 'user', parts: [
  { type: 'text', text: 'Opisz zdjęcie' },
  { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,PRIVATE_IMAGE' },
] };
const assistant = { id: storedMessageId(id, 'assistant', user.id), role: 'assistant',
  parts: [{ type: 'text', text: 'Opis. ![Zdjęcie](https://example.invalid/picture.png)' }] };

test('images become markers and message IDs remain stable', () => {
  assert.equal(conversationText(user), 'Opisz zdjęcie\n[obraz]');
  assert.equal(conversationText(assistant), 'Opis. [obraz]');
  assert.equal(storedMessageId(id, 'user', 'u1'), storedMessageId(id, 'user', 'u1'));
  assert.notEqual(storedMessageId(id, 'user', 'u1'), assistant.id);
});

test('complete pairs are saved atomically, ordered, and retries do not duplicate messages', async () => {
  assert.deepEqual(await store.prepareConversation('owner', id, user), []);
  assert.equal(rows.messages.length, 0);
  const before = writes;
  await store.saveConversationTurn('owner', id, user, assistant);
  assert.equal(writes, before + 1, 'pair must use one write');
  await store.saveConversationTurn('owner', id, user, assistant);
  assert.equal(rows.messages.length, 2);
  const restored = await store.loadConversation('owner', id);
  assert.deepEqual(restored.map(m => m.role), ['user', 'assistant']);
  assert.equal(restored[0].parts[0].text, 'Opisz zdjęcie\n[obraz]');
  assert.ok(!JSON.stringify(rows).includes('PRIVATE_IMAGE'));
  assert.equal((await store.latestConversation('owner')).id, id);
});

test('another session cannot load or write a conversation', async () => {
  const before = writes;
  await assert.rejects(store.loadConversation('other-owner', id), /nie jest dostępna/);
  await assert.rejects(store.saveConversationTurn('other-owner', id, user, assistant), /zapisać/);
  assert.equal(writes, before);
});

test('two conversations stay isolated when resuming and retrying a turn', async () => {
  const secondId = '22345678-1234-4234-8234-123456789012';
  const secondUser = { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Druga rozmowa' }] };
  const secondReply = { id: storedMessageId(secondId, 'assistant', 'u2'), role: 'assistant', parts: [{ type: 'text', text: 'Odpowiedź w drugiej rozmowie' }] };
  await store.prepareConversation('owner', secondId, secondUser);
  await store.saveConversationTurn('owner', secondId, secondUser, secondReply);
  const nextUser = { id: 'u3', role: 'user', parts: [{ type: 'text', text: 'Kontynuacja pierwszej' }] };
  const nextReply = { id: storedMessageId(id, 'assistant', 'u3'), role: 'assistant', parts: [{ type: 'text', text: 'Dalszy ciąg pierwszej' }] };
  await store.saveConversationTurn('owner', id, nextUser, nextReply);
  await store.saveConversationTurn('owner', id, nextUser, nextReply);
  const first = await store.loadConversation('owner', id);
  const second = await store.loadConversation('owner', secondId);
  assert.deepEqual(first.map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
  assert.equal(first[2].parts[0].text, 'Kontynuacja pierwszej');
  assert.deepEqual(second.map(m => m.parts[0].text), ['Druga rozmowa', 'Odpowiedź w drugiej rozmowie']);
  assert.equal(rows.messages.length, 6);
});

test('renaming and deleting are owner-scoped and deletion cascades to messages', async () => {
  const target = '32345678-1234-4234-8234-123456789012';
  await store.prepareConversation('owner', target, user);
  await store.saveConversationTurn('owner', target, user, { ...assistant, id: storedMessageId(target, 'assistant', user.id) });
  await store.setConversationTitle('owner', target, 'Spokojny plan na podróż');
  assert.equal(rows.conversations.find(row => row.id === target).title, 'Spokojny plan na podróż');
  await store.setConversationTitle('other-owner', target, 'Zmieniony tytuł');
  await store.deleteConversation('other-owner', target);
  assert.equal((await store.loadConversation('owner', target)).length, 2);
  assert.equal(rows.conversations.find(row => row.id === target).title, 'Spokojny plan na podróż');
  await store.deleteConversation('owner', target);
  assert.ok(!rows.conversations.some(row => row.id === target));
  assert.ok(!rows.messages.some(row => row.conversation_id === target));
  assert.equal((await store.loadConversation('owner', id)).length, 4);
});

test('database write failures return a safe actionable error', async () => {
  failWrite = true;
  await assert.rejects(store.saveConversationTurn('owner', id, user, assistant), error => {
    assert.match(error.message, /nie udało się zapisać/);
    assert.ok(!error.message.includes('PRIVATE_DATABASE_ERROR'));
    return true;
  });
  assert.equal(rows.messages.length, 6);
});
