"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

export default function Home() {
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
          {error.message || "Błąd połączenia. Spróbuj ponownie."}
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
