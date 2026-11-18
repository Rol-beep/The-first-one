"use client";

import { useChat } from "@ai-sdk/react";
import { convertFileListToFileUIParts, DefaultChatTransport, getToolName, isToolUIPart, type FileUIPart, type SourceUrlUIPart, type UIMessage } from "ai";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { hasPhotoSignature, imagePromptLimit, photoTypes, validPhoto } from "@/lib/chat-image";
import { displayChatError } from "@/lib/stan-naturalny-output";
import AnalysisPanel from "./stan-naturalny-analysis";
import { profileGreeting } from "@/lib/profile-policy";
import ActionIcon from "./action-icon";

type ChatMessage = UIMessage<{
  sourcesRetrievedAt?: string;
  stepLimitReached?: number;
  stoppedByUser?: boolean;
  visionModelId?: string | null;
}>;

const imageSuggestions = [
  { label: "Konsultacja online", prompt: "Jasna, spokojna ilustracja konsultacji online dla marki Stan Naturalny. Dwie osoby rozmawiają przez wideopołączenie. Bez napisów." },
  { label: "Grafika do oferty", prompt: "Minimalistyczna grafika do oferty konsultacji Stan Naturalny. Laptop, notes i miękkie światło na jasnym biurku. Bez napisów." },
  { label: "Pomoc techniczna", prompt: "Przyjazna ilustracja pomocy technicznej Stan Naturalny. Słuchawki z mikrofonem i dymek rozmowy na jasnym tle. Bez napisów." },
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
    <div className="stan-naturalny-sources">
      <p className="font-semibold">Źródła</p>
      <ul className="stan-naturalny-chips my-2">
        {sources.map((source, index) => (
          <li key={index}>
            <a
              className="stan-naturalny-chip stan-naturalny-link"
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
    <ol aria-label="Kroki agenta" className="stan-naturalny-chips mb-2">
      {[...usedTools].map(([number, names]) => (
        <li key={number} className="stan-naturalny-chip">
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
    return <p role="alert" className="stan-naturalny-error mt-2 text-sm">Nie udało się wygenerować obrazu.</p>;
  }
  if (part.state !== "output-available") return null;
  const output = part.output as { image?: { url: string; modelId: string | null }; error?: string };
  if (!output.image) return <p role="alert" className="stan-naturalny-error mt-2 text-sm">{output.error}</p>;

  return (
    <figure className="mt-2">
      <Image src={output.image.url} alt="Wygenerowany obraz" width={512} height={512}
        unoptimized className="h-auto w-full rounded-lg" />
      <figcaption className="mt-2 text-xs">Model: {output.image.modelId ?? "identyfikator niedostępny"}</figcaption>
      <a href={output.image.url} download="stan-naturalny-obraz" className="stan-naturalny-button mt-2">
        Pobierz
      </a>
    </figure>
  );
}

type Conversation = { profileName?: string | null; id: string; messages: ChatMessage[] };

function PlainChat({ initial, onBusyChange }: { initial: Conversation; onBusyChange: (busy: boolean) => void }) {
  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState<FileUIPart>();
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [generating, setGenerating] = useState(false);
  const generationInFlight = useRef(false);
  const [imageError, setImageError] = useState("");
  const { messages, sendMessage, setMessages, status, error, clearError, stop } = useChat<ChatMessage>({
    transport: chatTransport,
    id: initial.id,
    messages: initial.messages,
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
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);

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
    <div className="stan-naturalny-chat">
      <form id="new-conversation" className="hidden" onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setMessages([]);
        setInput("");
        setPhoto(undefined);
        setImageError("");
        clearError();
        document.getElementById("message")?.focus();
      }} />

      <section
        aria-label="Rozmowa"
        role="log"
        aria-live="polite"
        className={messages.length === 0 ? "stan-naturalny-log chat-log-empty" : "stan-naturalny-log"}
      >
        {messages.length === 0 && (
          <div className="chat-welcome">
            <span className="chat-welcome-icon" aria-hidden="true">
              <ActionIcon name="chat" />
            </span>
            <h2>{profileGreeting(initial.profileName)}</h2>
            <p>Zadaj pytanie, zaplanuj podróż albo opisz obraz, który chcesz stworzyć.</p>
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`stan-naturalny-bubble ${message.role === "user" ? "stan-naturalny-bubble-user" : "stan-naturalny-bubble-agent"}`}>
            {message.role === "assistant" && <MessageTools message={message} />}
            <strong className="stan-naturalny-speaker">{message.role === "user" ? "Ty" : "Agent"}</strong>
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

      <div className="stan-naturalny-composer">
        {busy && (
          <p role="status" className="stan-naturalny-status">
            <span className="stan-naturalny-status-dot" aria-hidden="true" />
            {generating ? "Generuję obraz…" : readingPhoto ? "Wczytuję zdjęcie…" : status === "submitted" ? "Czekam na odpowiedź…" : "Agent pisze…"}
          </p>
        )}
        {imageError && <p role="alert" className="stan-naturalny-error mb-3">{imageError}</p>}

        {error && (
          <p role="alert" className="stan-naturalny-error mb-3">
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
          <div className="composer-box">
            <label htmlFor="message" className="sr-only">Wiadomość</label>
            <input
              id="message"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={busy}
              placeholder="Napisz wiadomość…"
              className="composer-input"
            />
            <div className="composer-actions">
              <label className="stan-naturalny-button icon-control stan-naturalny-upload" title="Dodaj zdjęcie">
                <ActionIcon name="attach" />
                <input
                  type="file"
                  aria-label="Dodaj zdjęcie"
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
              <button type="button" popoverTarget="image-ideas" disabled={busy || Boolean(photo)}
                className="stan-naturalny-button icon-control composer-ideas-trigger" aria-label="Pomysły na obraz">
                <ActionIcon name="ideas" />
              </button>
              <div id="image-ideas" popover="auto" className="composer-ideas">
                <p>Pomysły na obraz</p>
                {imageSuggestions.map(({ label, prompt }) => (
                  <button key={label} type="button" disabled={busy || Boolean(photo)} onClick={(event) => {
                    setInput(prompt);
                    setImageError("");
                    event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();
                    document.getElementById("message")?.focus();
                  }}>
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => void generate()} disabled={busy || !input.trim() || Boolean(photo)}
                className="stan-naturalny-button icon-control" aria-label="Wygeneruj obraz">
                <ActionIcon name="image" />
              </button>
              {agentWorking ? (
                <button type="button" onClick={() => void stop()}
                  className="stan-naturalny-button icon-control stan-naturalny-primary composer-submit" aria-label="Zatrzymaj odpowiedź">
                  <ActionIcon name="stop" />
                </button>
              ) : (
                <button type="submit" disabled={busy || (!input.trim() && !photo)}
                  className="stan-naturalny-button icon-control stan-naturalny-primary composer-submit" aria-label="Wyślij">
                  <ActionIcon name="send" />
                </button>
              )}
            </div>
          </div>
          {photo && (
            <div className="composer-photo">
              <span>{photo.filename ?? "Zdjęcie"}</span>
              <button type="button" disabled={busy} onClick={() => setPhoto(undefined)}
                className="stan-naturalny-button icon-control" aria-label="Usuń zdjęcie">
                <ActionIcon name="remove" />
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<'chat' | 'analysis'>('chat');
  const [initial, setInitial] = useState<Conversation>();
  const [memoryError, setMemoryError] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);

  async function readConversation(method = "GET", signal?: AbortSignal) {
    const selected = new URLSearchParams(window.location.search).get("conversation");
    const url = method === "GET" && selected !== null
      ? `/api/conversations?conversation=${encodeURIComponent(selected)}` : "/api/conversations";
    const response = await fetch(url, { method, cache: "no-store", signal });
    if (!response.ok) throw new Error(await response.text());
    return await response.json() as Conversation;
  }

  useEffect(() => {
    const controller = new AbortController();
    void readConversation("GET", controller.signal).then(setInitial).catch(error => {
      if (!controller.signal.aborted) setMemoryError(error.message);
    });
    return () => controller.abort();
  }, []);

  async function startNew() {
    if (pending || busy || !initial) return;
    setPending(true);
    setMemoryError("");
    try {
      setInitial(await readConversation("POST"));
      window.history.replaceState(null, "", "/");
      setMode("chat");
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : "Nie udało się rozpocząć rozmowy.");
    } finally {
      setPending(false);
    }
  }

  return <>
    <div className="chat-navigation">
    <div role="tablist" aria-label="Tryb pracy" className="stan-naturalny-tabs">
      <button id="chat-tab" role="tab" aria-selected={mode === 'chat'} aria-controls="chat-panel" onClick={() => setMode('chat')} className="stan-naturalny-button icon-control" aria-label="Zwykły czat">
        <ActionIcon name="chat" />
      </button>
      <button id="analysis-tab" role="tab" aria-selected={mode === 'analysis'} aria-controls="analysis-panel" onClick={() => setMode('analysis')} className="stan-naturalny-button icon-control" aria-label="Analiza wiadomości">
        <ActionIcon name="analysis" />
      </button>
    </div>
    <button type="button" disabled={pending || busy || !initial} className="stan-naturalny-button icon-control new-conversation-button"
      aria-label="Nowa rozmowa" title="Nowa rozmowa" onClick={() => void startNew()}>
      <ActionIcon name="newChat" />
    </button>
    </div>
    <div id="chat-panel" role="tabpanel" aria-labelledby="chat-tab" hidden={mode !== 'chat'}>{initial ? <PlainChat key={initial.id} initial={initial} onBusyChange={setBusy} />
      : !memoryError && <p role="status">Wczytuję rozmowę…</p>}
      {memoryError && <div role="alert" className="stan-naturalny-error p-4">
        <p>{memoryError}</p>
        {!initial && <button type="button" className="stan-naturalny-button" onClick={() => window.location.reload()}>Spróbuj ponownie</button>}
      </div>}</div>
    <div id="analysis-panel" role="tabpanel" aria-labelledby="analysis-tab" hidden={mode !== 'analysis'}><AnalysisPanel /></div>
  </>;
}
