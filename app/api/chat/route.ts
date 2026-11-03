import { authenticated, sameOrigin } from "@/lib/workshop";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
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

  try {
    const body = await request.json();
    messages = await validateUIMessages({
      messages: body.messages,
    });

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
    return new Response(
      "Wyślij niepustą wiadomość i poprawną historię rozmowy.",
      { status: 400 },
    );
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

    const result = streamText({
      model: openrouter(model),
      messages: await convertToModelMessages(messages),
      abortSignal: request.signal,
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        onError: () => connectionError,
      }),
    });
  } catch {
    return new Response(connectionError, { status: 502 });
  }
}