import { analyze } from "@/lib/agent-analyze";
import { chat } from "@/lib/agent-chat";
import { authenticated, sameOrigin } from "@/lib/workshop";

export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!await authenticated()) return new Response("Zaloguj się ponownie.", { status: 401, headers });
  if (!sameOrigin(request)) return new Response("Niedozwolone żądanie.", { status: 403, headers });

  let form: FormData | undefined;
  let body;
  try {
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      form = await request.formData();
    }
    body = form ? JSON.parse(String(form.get("history"))) : await request.json();
  } catch {
    return new Response("Niepoprawne żądanie.", { status: 400, headers });
  }

  const { mode, ...payload } = body ?? {};
  if (mode === "chat") return chat(request, payload, form);
  if (mode === "analyze" && !form) return analyze(request, payload);
  return new Response("Wybierz tryb chat albo analyze.", { status: 400, headers });
}
