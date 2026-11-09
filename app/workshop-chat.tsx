"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
import { displayChatError } from "@/lib/studio-nova-output";
import AnalysisPanel from "./studio-nova-analysis";

function PlainChat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const busy = status === "submitted" || status === "streaming";

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Mój chatbot</h1>

      <section
        aria-label="Rozmowa"
        role="log"
        aria-live="polite"
        className="mb-4 h-96 overflow-y-auto rounded-xl border p-4"
      >
        {messages.map((message) => (
          <div key={message.id} className="mb-3 rounded-lg border p-3">
            <strong>{message.role === "user" ? "Ty" : "AI"}: </strong>
            {message.parts.map((part, index) =>
              part.type === "text" ? (
                <span key={index} className="whitespace-pre-wrap">
                  {part.text}
                </span>
              ) : null,
            )}
          </div>
        ))}
      </section>

      {busy && (
        <p role="status" className="mb-3">
          {status === "submitted" ? "Czekam na odpowiedź…" : "AI pisze…"}
        </p>
      )}

      {error && (
        <p role="alert" className="mb-3 text-red-600">
          {displayChatError(error.message || "Błąd połączenia. Spróbuj ponownie.")}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !input.trim()) return;
          void sendMessage({ text: input.trim() });
          setInput("");
        }}
      >
        <label htmlFor="message">Wiadomość</label>
        <div className="mt-2 flex gap-2">
          <input
            id="message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={busy}
            placeholder="Napisz wiadomość…"
            className="min-w-0 flex-1 rounded-lg border p-3"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-blue-700 px-5 py-3 text-white disabled:opacity-50"
          >
            {busy ? "Czekaj…" : "Wyślij"}
          </button>
        </div>
      </form>
    </main>
  );
}

export default function Home() {
  const [mode, setMode] = useState<'chat' | 'analysis'>('chat');
  return <>
    <div role="tablist" aria-label="Tryb pracy" className="mx-auto mt-4 flex max-w-2xl gap-3 px-6">
      <button id="chat-tab" role="tab" aria-selected={mode === 'chat'} aria-controls="chat-panel" onClick={() => setMode('chat')} className="rounded border px-4 py-2 aria-selected:bg-blue-700 aria-selected:text-white">Zwykły czat</button>
      <button id="analysis-tab" role="tab" aria-selected={mode === 'analysis'} aria-controls="analysis-panel" onClick={() => setMode('analysis')} className="rounded border px-4 py-2 aria-selected:bg-blue-700 aria-selected:text-white">Analiza wiadomości</button>
    </div>
    <div id="chat-panel" role="tabpanel" aria-labelledby="chat-tab" hidden={mode !== 'chat'}><PlainChat /></div>
    <div id="analysis-panel" role="tabpanel" aria-labelledby="analysis-tab" hidden={mode !== 'analysis'}><AnalysisPanel /></div>
  </>;
}
