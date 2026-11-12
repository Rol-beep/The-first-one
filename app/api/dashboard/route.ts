import type { TravelEvent } from "@/lib/travel-cards";
import { prepareTravelDashboard, travelQuery } from "@/lib/travel-dashboard";
import { authenticated, sameOrigin } from "@/lib/workshop";

export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!await authenticated()) return new Response("Zaloguj się ponownie.", { status: 401, headers });
  if (!sameOrigin(request)) return new Response("Niedozwolone żądanie.", { status: 403, headers });

  const input = travelQuery.safeParse(await request.json().catch(() => null));
  if (!input.success) return new Response("Podaj nazwę miasta i poprawną datę.", { status: 400, headers });

  const cancel = new AbortController();
  const signal = AbortSignal.any([request.signal, cancel.signal]);
  try {
    const dashboard = await prepareTravelDashboard(input.data, signal);
    if (!dashboard) return new Response("Nie znaleziono miasta. Sprawdź pisownię lub dopisz kraj po przecinku.", { status: 404, headers });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        function publish(event: TravelEvent) {
          if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
        publish({ type: "destination", destination: dashboard.destination });
        try {
          const advice = await dashboard.collect(card => publish({ type: "card", card }));
          publish({ type: "summary", advice });
        } finally {
          if (!cancel.signal.aborted) controller.close();
        }
      },
      cancel() {
        cancel.abort();
      },
    });
    return new Response(stream, { headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8" } });
  } catch {
    return new Response("Nie udało się ustalić lokalizacji. Spróbuj ponownie za chwilę.", { status: 502, headers });
  }
}
