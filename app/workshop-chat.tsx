"use client";

import { useChat } from "@ai-sdk/react";
import { convertFileListToFileUIParts, DefaultChatTransport, getToolName, isToolUIPart, type FileUIPart, type SourceUrlUIPart, type UIMessage } from "ai";
import Image from "next/image";
import { useRef, useState } from "react";
import { hasPhotoSignature, imagePromptLimit, photoTypes, validPhoto } from "@/lib/chat-image";
import { displayChatError } from "@/lib/studio-nova-output";
import AnalysisPanel from "./studio-nova-analysis";

type ChatMessage = UIMessage<{
  sourcesRetrievedAt?: string;
  stepLimitReached?: number;
  stoppedByUser?: boolean;
  visionModelId?: string | null;
}>;

const imageSuggestions = [
  { label: "Konsultacja online", prompt: "Jasna, spokojna ilustracja konsultacji online dla Studio Nova. Dwie osoby rozmawiają przez wideopołączenie. Bez napisów." },
  { label: "Grafika do oferty", prompt: "Minimalistyczna grafika do oferty konsultacji Studio Nova. Laptop, notes i miękkie światło na jasnym biurku. Bez napisów." },
  { label: "Pomoc techniczna", prompt: "Przyjazna ilustracja pomocy technicznej Studio Nova. Słuchawki z mikrofonem i dymek rozmowy na jasnym tle. Bez napisów." },
];

const chatTransport = new DefaultChatTransport<ChatMessage>({
  api: "/api/agent",
  prepareSendMessagesRequest: ({ body, id, messages, trigger, messageId }) => ({
    body: {
      ...body,
      mode: "chat",
      id,
      trigger,
      messageId,
      messages: messages
        .filter((message) => !message.metadata?.stoppedByUser ||
          message.parts.some((part) => part.type === "text" && part.text.trim()))
        .map((message) => ({
          ...message,
          parts: message.parts.filter((part) => !isToolUIPart(part)),
        })),
    },
  }),
  fetch: async (url, init) => {
    const history = JSON.parse(String(init?.body)) as { messages: ChatMessage[] };
    const photoIndex = history.messages.findLastIndex((message) =>
      message.role === "user" && message.parts.some((part) => part.type === "file"),
    );
    const photo = history.messages[photoIndex]?.parts.find((part) => part.type === "file");
    if (!photo) return fetch(url, init);

    // Send the latest photo as binary to stay within the hosting request limit.
    const form = new FormData();
    form.set("photo", await (await fetch(photo.url, { signal: init?.signal })).blob(), photo.filename ?? "zdjecie");
    form.set("photoIndex", String(photoIndex));
    form.set("history", JSON.stringify({
      ...history,
      messages: history.messages.map((message) => ({
        ...message,
        parts: message.parts.filter((part) => part.type !== "file"),
      })),
    }));
    const headers = new Headers(init?.headers);
    headers.delete("Content-Type");
    return fetch(url, { ...init, headers, body: form });
  },
});

const sourceDateFormat = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Warsaw",
});

function MessageSources({ message }: { message: ChatMessage }) {
  const sources = message.parts.filter(
    (part): part is SourceUrlUIPart =>
      part.type === "source-url" && /^https?:\/\//i.test(part.url),
  );
  if (sources.length === 0) return null;

  const retrievedAt = message.metadata?.sourcesRetrievedAt;
  return (
    <div className="nova-sources">
      <p className="font-semibold">Źródła</p>
      <ul className="nova-chips my-2">
        {sources.map((source, index) => (
          <li key={index}>
            <a
              className="nova-chip nova-link"
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {source.title?.trim() || source.url}
            </a>
          </li>
        ))}
      </ul>
      {retrievedAt && (
        <p>pobrano: <time dateTime={retrievedAt}>{sourceDateFormat.format(new Date(retrievedAt))}</time></p>
      )}
    </div>
  );
}

function MessageTools({ message }: { message: ChatMessage }) {
  let step = 0;
  const usedTools = new Map<number, Set<string>>();
  for (const part of message.parts) {
    if (part.type === "step-start") step++;
    const name = part.type === "source-url" ? "webSearch"
      : isToolUIPart(part) && ["input-available", "output-available", "output-error"].includes(part.state)
        ? getToolName(part) : undefined;
    if (name) {
      const stepTools = usedTools.get(step || 1) ?? new Set<string>();
      stepTools.add(name);
      usedTools.set(step || 1, stepTools);
    }
  }

  const labels = new Map([
    ["webSearch", "🔎 wyszukiwanie"],
    ["aktualnyCzas", "🕒 aktualnyCzas"],
    ["pogoda", "🌤️ pogoda"],
    ["waluty", "💱 waluty"],
    ["swieta", "📅 święta"],
    ["wikipedia", "📖 Wikipedia"],
    ["kalkulator", "🧮 kalkulator"],
    ["czas", "🕒 czas"],
    ["notatki", "📝 notatki"],
    ["diagnostyka", "🔧 diagnostyka"],
    ["generujObraz", "🖼️ generowanie obrazu"],
  ]);
  if (usedTools.size === 0) return null;

  return (
    <ol aria-label="Kroki agenta" className="nova-chips mb-2">
      {[...usedTools].map(([number, names]) => (
        <li key={number} className="nova-chip">
          {number}. {[...names].map(name => labels.get(name) ?? name).join(", ")}
        </li>
      ))}
    </ol>
  );
}

function AgentNotice({ message }: { message: ChatMessage }) {
  const limit = message.metadata?.stepLimitReached;
  const stopped = message.metadata?.stoppedByUser;
  if (!limit && !stopped) return null;

  const lastStep = message.parts.findLastIndex(part => part.type === "step-start");
  const hasFinalText = message.parts.slice(lastStep + 1)
    .some(part => part.type === "text" && part.text.trim());

  return (
    <div className="mt-2 text-sm">
      <p role="status">{stopped ? "Przerwane przez użytkownika" : `Zatrzymałem się po ${limit} krokach`}</p>
      {(stopped || !hasFinalText) && message.parts.map(part =>
        isToolUIPart(part) && part.state === "output-available" && getToolName(part) !== "generujObraz" ? (
          <details key={part.toolCallId} className="mt-2">
            <summary>Wynik narzędzia {getToolName(part)}</summary>
            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(part.output, null, 2)}</pre>
          </details>
        ) : null,
      )}
    </div>
  );
}

function GeneratedImage({ part }: { part: Extract<ChatMessage["parts"][number], { toolCallId: string }> }) {
  if (part.state === "input-available" || part.state === "input-streaming") {
    return <p role="status" className="mt-2 text-sm">Generuję obraz…</p>;
  }
  if (part.state === "output-error") {
    return <p role="alert" className="nova-error mt-2 text-sm">Nie udało się wygenerować obrazu.</p>;
  }
  if (part.state !== "output-available") return null;
  const output = part.output as { image?: { url: string; modelId: string | null }; error?: string };
  if (!output.image) return <p role="alert" className="nova-error mt-2 text-sm">{output.error}</p>;

  return (
    <figure className="mt-2">
      <Image src={output.image.url} alt="Wygenerowany obraz" width={512} height={512}
        unoptimized className="h-auto w-full rounded-lg" />
      <figcaption className="mt-2 text-xs">Model: {output.image.modelId ?? "identyfikator niedostępny"}</figcaption>
      <a href={output.image.url} download="studio-nova-obraz" className="nova-button mt-2">
        Pobierz
      </a>
    </figure>
  );
}

function PlainChat() {
  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState<FileUIPart>();
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [generating, setGenerating] = useState(false);
  const generationInFlight = useRef(false);
  const [imageError, setImageError] = useState("");
  const { messages, sendMessage, setMessages, status, error, clearError, stop } = useChat<ChatMessage>({
    transport: chatTransport,
    onFinish: ({ isAbort, message }) => {
      if (!isAbort) return;
      setMessages((history) => {
        const index = history.findIndex((entry) => entry.id === message.id);
        const partial = history[index] ?? message;
        const stopped = {
          ...partial,
          metadata: { ...partial.metadata, stoppedByUser: true },
        };
        return index !== -1
          ? history.map((entry, position) => position === index ? stopped : entry)
          : [...history, stopped];
      });
    },
  });

  const agentWorking = status === "submitted" || status === "streaming";
  const busy = agentWorking || generating || readingPhoto;

  async function generate() {
    const prompt = input.trim();
    if (busy || generationInFlight.current || photo || !prompt) return;
    clearError();
    setImageError("");
    if (prompt.length > imagePromptLimit) {
      setImageError("Opis obrazu może mieć maksymalnie 500 znaków.");
      return;
    }
    generationInFlight.current = true;
    setGenerating(true);
    try {
      await sendMessage({ text: prompt }, { body: { generateImage: true } });
      setInput("");
    } catch {
      setImageError("Nie udało się wygenerować obrazu. Spróbuj ponownie.");
    } finally {
      generationInFlight.current = false;
      setGenerating(false);
    }
  }

  return (
    <div className="nova-chat">

      <section
        aria-label="Rozmowa"
        role="log"
        aria-live="polite"
        className="nova-log"
      >
        {messages.map((message) => (
          <div key={message.id} className={`nova-bubble ${message.role === "user" ? "nova-bubble-user" : "nova-bubble-agent"}`}>
            {message.role === "assistant" && <MessageTools message={message} />}
            <strong className="nova-speaker">{message.role === "user" ? "Ty" : "Agent"}</strong>
            {message.parts.map((part, index) =>
              part.type === "text" ? (
                <span key={index} className="whitespace-pre-wrap">
                  {part.text}
                </span>
              ) : part.type === "file" ? (
                <Image key={index} src={part.url} alt={part.filename ?? "Zdjęcie"}
                  width={512} height={512} unoptimized className="mt-2 h-auto w-40 rounded-lg" />
              ) : isToolUIPart(part) && getToolName(part) === "generujObraz" &&
                (!message.metadata?.stoppedByUser || part.state === "output-available" || part.state === "output-error") ? (
                <GeneratedImage key={part.toolCallId} part={part} />
              ) : null,
            )}
            {message.role === "assistant" && <MessageSources message={message} />}
            <AgentNotice message={message} />
            {(message.metadata?.visionModelId !== undefined) && (
              <p className="mt-2 text-xs">
                Model: {message.metadata.visionModelId ?? "identyfikator niedostępny"}
              </p>
            )}
          </div>
        ))}
      </section>

      <div className="nova-composer">
        {busy && (
          <p role="status" className="nova-status">
            <span className="nova-status-dot" aria-hidden="true" />
            {generating ? "Generuję obraz…" : readingPhoto ? "Wczytuję zdjęcie…" : status === "submitted" ? "Czekam na odpowiedź…" : "Agent pisze…"}
          </p>
        )}
        {imageError && <p role="alert" className="nova-error mb-3">{imageError}</p>}

        {error && (
          <p role="alert" className="nova-error mb-3">
            {displayChatError(error.message || "Błąd połączenia. Spróbuj ponownie.")}
          </p>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || generationInFlight.current || (!input.trim() && !photo)) return;
            setImageError("");
            void sendMessage({
              text: input.trim() || "Opisz zdjęcie.",
              files: photo ? [photo] : undefined,
            });
            setInput("");
            setPhoto(undefined);
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
              className="nova-field min-w-0 flex-1"
            />
            {agentWorking ? (
              <button type="button" onClick={() => void stop()} className="nova-button">
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={busy || (!input.trim() && !photo)}
                className="nova-button nova-primary"
              >
                {busy ? "Czekaj…" : "Wyślij"}
              </button>
            )}
          </div>
          <div className="mt-3">
            <p className="mb-1 text-sm">Pomysły na obraz</p>
            <div className="flex flex-wrap gap-2">
              {imageSuggestions.map(({ label, prompt }) => (
                <button
                  key={label}
                  type="button"
                  disabled={busy || Boolean(photo)}
                  onClick={() => {
                    setInput(prompt);
                    setImageError("");
                  }}
                  className="nova-chip"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="nova-button nova-upload">
              Dodaj zdjęcie
              <input
                type="file"
                accept={photoTypes.join(",")}
                className="sr-only"
                disabled={busy}
                onChange={async (event) => {
                  const files = event.currentTarget.files;
                  const file = files?.[0];
                  if (!files || !file) return;
                  setImageError("");
                  setReadingPhoto(true);
                  try {
                    if (!validPhoto(file) || !await hasPhotoSignature(file)) {
                      setPhoto(undefined);
                      setImageError("Dodaj zdjęcie JPG, PNG lub WebP o rozmiarze do 4 MB.");
                      return;
                    }
                    const [part] = await convertFileListToFileUIParts(files);
                    setPhoto(part);
                  } catch {
                    setImageError("Nie udało się wczytać zdjęcia.");
                  } finally {
                    event.target.value = "";
                    setReadingPhoto(false);
                  }
                }}
              />
            </label>
            <button type="button" onClick={() => void generate()} disabled={busy || !input.trim() || Boolean(photo)} className="nova-button">
              Wygeneruj obraz
            </button>
            {photo && (
              <button type="button" disabled={busy} onClick={() => setPhoto(undefined)} className="nova-button break-all">
                Usuń zdjęcie ({photo.filename})
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<'chat' | 'analysis'>('chat');
  return <>
    <div role="tablist" aria-label="Tryb pracy" className="nova-tabs">
      <button id="chat-tab" role="tab" aria-selected={mode === 'chat'} aria-controls="chat-panel" onClick={() => setMode('chat')} className="nova-button">Zwykły czat</button>
      <button id="analysis-tab" role="tab" aria-selected={mode === 'analysis'} aria-controls="analysis-panel" onClick={() => setMode('analysis')} className="nova-button">Analiza wiadomości</button>
    </div>
    <div id="chat-panel" role="tabpanel" aria-labelledby="chat-tab" hidden={mode !== 'chat'}><PlainChat /></div>
    <div id="analysis-panel" role="tabpanel" aria-labelledby="analysis-tab" hidden={mode !== 'analysis'}><AnalysisPanel /></div>
  </>;
}
