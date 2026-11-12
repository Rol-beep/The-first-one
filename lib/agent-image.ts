import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateImage } from "ai";

export const imageUnavailable = "Model generowania obrazów jest teraz niedostępny. Spróbuj ponownie później.";

export async function generateAgentImage(apiKey: string, prompt: string, signal: AbortSignal, references: URL[] = []) {
  let modelId: string | undefined;
  const openrouter = createOpenRouter({
    apiKey,
    // The image adapter reports the requested ID, so read the upstream response.
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      if (response.ok) {
        const data = await response.clone().json().catch(() => null);
        if (typeof data?.model === "string" && /^[\w./:@+-]+$/.test(data.model)) {
          modelId = data.model;
        }
      }
      return response;
    },
  });
  const { image } = await generateImage({
    model: openrouter.imageModel("google/gemini-3.1-flash-image-preview"),
    prompt: references.length ? { text: prompt, images: references.map((url) => url.href) } : prompt,
    abortSignal: signal,
    maxRetries: 0,
  });
  return { url: `data:${image.mediaType};base64,${image.base64}`, modelId: modelId ?? null };
}
