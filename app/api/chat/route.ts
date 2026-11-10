import { createScopedChatResponse } from "@/lib/studio-nova-chat";
import { isWithinStudioNovaScope, studioNovaScopeReply } from "@/lib/studio-nova-scope";
import { authenticated, sameOrigin } from "@/lib/workshop";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  validateUIMessages,
} from "ai";

export const maxDuration = 60;

const connectionError =
  "Nie udało się uzyskać odpowiedzi AI. Sprawdź klucz, model i środki w OpenRouter.";

export async function POST(request: Request) {
  if (!await authenticated()) {
    return new Response("Zaloguj się ponownie.", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!sameOrigin(request)) {
    return new Response("Niedozwolone żądanie.", { status: 403 });
  }

  let messages;
  let validationStage = "sdk";
  let diagnosticShape: unknown = null;


  try {
    const body = await request.json();
    const knownTypes = ["text", "step-start", "reasoning",
      "source-url", "source-document", "file"];
    diagnosticShape = Array.isArray(body.messages)
      ? body.messages.map((m: {
          role?: unknown;
          parts?: { type?: unknown }[];
        } | null) => ({
          role: ["user", "assistant", "system"].includes(String(m?.role))
            ? m?.role : "other",
          parts: Array.isArray(m?.parts)
            ? m.parts.map(p => knownTypes.includes(String(p?.type))
                ? p?.type : "other")
            : "missing",
        }))
      : "messages-not-array";

    messages = await validateUIMessages({
      messages: body.messages,
    });

    validationStage = "app";
    const last = messages.at(-1);

    if (
      !last ||
      last.role !== "user" ||
      !last.parts.some(
        (part) => part.type === "text" && part.text.trim(),
      ) ||
      messages.some(
        (message) =>
          !["user", "assistant"].includes(message.role) ||
          message.parts.some(
            (part) => !(
              ["text", "step-start"].includes(part.type) ||
              (message.role === "assistant" && part.type === "reasoning")
            ),
          ),
      )
    ) {
      throw new Error("Niepoprawna wiadomość");
    }
  } catch {
    console.warn("CHAT_VALIDATION_FAILED", {
      stage: validationStage,
      shape: diagnosticShape,
    });
    return new Response(
      "Wyślij niepustą wiadomość i poprawną historię rozmowy.",
      { status: 400 },
    );
  }

  const lastText = messages.at(-1)!.parts.filter(part => part.type === "text").map(part => part.text).join("\n");
  const previousUserTexts = messages.slice(0, -1).filter(message => message.role === "user")
    .map(message => message.parts.filter(part => part.type === "text").map(part => part.text).join("\n"));
  if (!isWithinStudioNovaScope(lastText, previousUserTexts)) {
    return new Response(studioNovaScopeReply, { status: 422, headers: { "Cache-Control": "no-store" } });
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.OPENROUTER_MODEL?.trim();

  if (!apiKey || !model) {
    return new Response(
      "Brak konfiguracji AI. Uzupełnij OPENROUTER_API_KEY i OPENROUTER_MODEL w .env.local, a następnie uruchom ponownie serwer.",
      { status: 503 },
    );
  }

  try {
    const openrouter = createOpenRouter({ apiKey });

    return createScopedChatResponse({
      model: openrouter(model),
      messages: await convertToModelMessages(messages),
      originalMessages: messages,
      signal: request.signal,
    });
  } catch {
    return new Response(connectionError, { status: 502 });
  }
}
