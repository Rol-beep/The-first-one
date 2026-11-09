'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';
import { displayChatError, studioNovaOutputSchema } from '@/lib/studio-nova-output';

const categories = { sales: 'Oferta i cena', support: 'Problem techniczny', billing: 'Płatność lub zwrot', unknown: 'Brak rozpoznanej sprawy' };

export default function AnalysisPanel() {
  const [input, setInput] = useState('');
  const [interrupted, setInterrupted] = useState(false);
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/analyze',
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages: messages.filter(message => message.role === 'user').slice(-1) },
      }),
    }),
  });
  const busy = status === 'submitted' || status === 'streaming';
  const last = messages.at(-1);
  let result = null;
  let invalidResult = false;
  if (!busy && !error && !interrupted && last?.role === 'assistant') {
    try {
      const text = last.parts.filter(part => part.type === 'text').map(part => part.text).join('');
      const validated = studioNovaOutputSchema.safeParse(JSON.parse(text));
      if (validated.success) result = validated.data;
      else invalidResult = true;
    } catch { invalidResult = true; }
  }

  return <main className="mx-auto max-w-2xl p-6">
    <h1 className="mb-3 text-3xl font-bold">Analiza wiadomości Studio Nova</h1>
    <p className="mb-5">Wklej wiadomość klienta. Każda analiza dotyczy jednej wiadomości. Wynik zawsze jest szkicem — niczego nie wysyłamy ani nie rezerwujemy.</p>
    <form onSubmit={event => {
      event.preventDefault();
      if (busy || !input.trim()) return;
      setInterrupted(false);
      void sendMessage({ text: input.trim() });
    }}>
      <label htmlFor="customer-message">Wiadomość klienta</label>
      <textarea id="customer-message" value={input} onChange={event => setInput(event.target.value)} required maxLength={16000} disabled={busy} rows={5} className="my-2 w-full rounded-lg border p-3" />
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-blue-700 px-5 py-3 text-white disabled:opacity-50">{busy ? 'Analizuję…' : 'Analizuj wiadomość'}</button>
        {busy && <button type="button" onClick={() => { setInterrupted(true); void stop(); }} className="rounded-lg border px-5 py-3">Przerwij analizę</button>}
        {!busy && <button type="button" onClick={() => { setInput(''); setMessages([]); clearError(); setInterrupted(false); }} className="rounded-lg border px-5 py-3">Wyczyść analizę</button>}
      </div>
    </form>
    {busy && !interrupted && <p role="status" className="mt-4">Przygotowuję i sprawdzam wynik. Niepełna odpowiedź nie jest gotową analizą.</p>}
    {interrupted && <p role="status" className="mt-4">Analiza została przerwana. Nie zapisano wyniku.</p>}
    {error && <p role="alert" className="mt-4 text-red-600">{displayChatError(error.message)}</p>}
    {invalidResult && <p role="alert" className="mt-4 text-red-600">Odpowiedź jest niepełna lub ma błędny format (wymagane: category, priority, draft i needs_review). Nie pokazano jej jako poprawnej analizy.</p>}
    {result && <section aria-label="Wynik analizy" aria-live="polite" className="mt-6 rounded-xl border p-5">
      <h2 className="mb-4 text-xl font-bold">Szkic odpowiedzi</h2>
      <dl className="space-y-3">
        <div><dt className="font-bold">Kategoria</dt><dd>{categories[result.category]} ({result.category})</dd></div>
        <div><dt className="font-bold">Priorytet</dt><dd>{result.priority === 'high' ? 'Wysoki (high)' : 'Normalny (normal)'}</dd></div>
        <div><dt className="font-bold">Szkic</dt><dd className="whitespace-pre-wrap">{result.draft}</dd></div>
        <div><dt className="font-bold">Status sprawdzenia</dt><dd>{result.needs_review ? 'Wymaga sprawdzenia przez pracownika (needs_review: true)' : 'Model nie wskazał potrzeby dodatkowego sprawdzenia (needs_review: false)'}</dd></div>
      </dl>
      {!result.draft.trim() && <p role="alert" className="mt-4 text-red-600">Model zwrócił pusty szkic. Nie używaj go jako odpowiedzi dla klienta; ponów analizę lub skonsultuj sprawę z pracownikiem.</p>}
      <p className="mt-4 font-semibold">To nadal szkic, także gdy needs_review=false. Wiadomość nie została wysłana.</p>
    </section>}
  </main>;
}
