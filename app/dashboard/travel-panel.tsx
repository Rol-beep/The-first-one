"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { travelCardTitles, travelSources, type TravelCard, type TravelCardTitle, type TravelEvent } from "@/lib/travel-cards";

const retrievedTime = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

type Trip = { city: string; date: string };

export default function TravelPanel() {
  const [cards, setCards] = useState<Partial<Record<TravelCardTitle, TravelCard>>>({});
  const [destination, setDestination] = useState("");
  const [advice, setAdvice] = useState<string | null>();
  const [lastTrip, setLastTrip] = useState<Trip>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  async function load(trip: Trip) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setLastTrip(trip);
    setDestination(trip.city.trim());
    setCards({});
    setAdvice(undefined);
    setPending(true);
    setError("");
    setNeedsLogin(false);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trip),
        signal: controller.signal,
      });
      if (response.status === 401) {
        setNeedsLogin(true);
        return;
      }
      if (!response.ok) {
        setError(await response.text());
        return;
      }
      if (!response.body) throw new Error("Empty dashboard response");
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let summaryReceived = false;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const event: TravelEvent = JSON.parse(line);
            switch (event.type) {
              case "destination":
                setDestination(event.destination);
                break;
              case "card":
                setCards(current => ({ ...current, [event.card.title]: event.card }));
                break;
              case "summary":
                summaryReceived = true;
                setAdvice(event.advice);
                break;
            }
          }
        }
        if (buffer || !summaryReceived) throw new Error("Incomplete dashboard response");
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } catch {
      if (!controller.signal.aborted) setError("Nie udało się pobrać danych. Spróbuj ponownie.");
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  const missingSources = travelCardTitles.flatMap(title => {
    const card = cards[title];
    return card?.unavailable || (!card && !pending) ? [card?.source ?? travelSources[title]] : [];
  });

  return (
    <>
      <form className="nova-analysis travel-form" onSubmit={event => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        void load({ city: String(fields.get("city")), date: String(fields.get("date")) });
      }}>
        <label htmlFor="city">Dokąd jedziesz?
          <input id="city" name="city" placeholder="Np. Lizbona" required minLength={2} maxLength={100}
            className="nova-field mt-2 w-full" />
        </label>
        <label htmlFor="trip-date">Kiedy?
          <input id="trip-date" name="date" type="date" required className="nova-field mt-2 w-full" />
        </label>
        <button className="nova-button nova-primary" type="submit" disabled={pending}>Sprawdź</button>
      </form>

      {pending && <p role="status" className="nova-status">
        <span className="nova-status-dot" aria-hidden="true" /> Pobieram dane i przygotowuję podsumowanie…
      </p>}
      {error && <p role="alert" className="nova-error mb-4">{error}</p>}
      {needsLogin && <p role="alert" className="nova-error mb-4">
        Sesja wygasła. <Link href="/?next=dashboard" className="nova-link">Zaloguj się ponownie</Link>
      </p>}

      {lastTrip && (
        <section aria-label="Dane podróży" className="travel-results">
          <div className="travel-destination">
            <div>
              <h2>{destination}</h2>
              <p className="nova-muted"><time dateTime={lastTrip.date}>{lastTrip.date}</time></p>
            </div>
            <button type="button" className="nova-button" disabled={pending}
              onClick={() => { if (lastTrip) void load(lastTrip); }}>Odśwież</button>
          </div>
          <div className="travel-grid">
            {travelCardTitles.map(title => {
              const card = cards[title];
              const loaded = card && !card.unavailable;
              const loading = pending && !card;
              return (
                <article key={title} className="nova-result travel-card" aria-busy={loading}>
                  <div className="travel-card-heading">
                    <h3>{title}</h3>
                    <span className="travel-card-status nova-muted">{loaded ? "OK" : loading ? "Ładuję…" : "Brak danych"}</span>
                  </div>
                  {loaded ? (
                    <>
                      <p className={title === "Wikipedia" ? "" : "travel-value"}>{card.value}</p>
                      {card.details && <ul>{card.details.map(detail => <li key={detail}>{detail}</li>)}</ul>}
                      {card.link && <a href={card.link} className="nova-link" target="_blank" rel="noreferrer">Czytaj w Wikipedii</a>}
                    </>
                  ) : !loading && <p>Brak danych — spróbuj odświeżyć</p>}
                  <footer className="nova-muted">
                    {card?.source ?? travelSources[title]}
                    {card && <>
                      {" · "}{loaded ? "Pobrano" : "Próba pobrania"}{" "}
                      <time dateTime={card.retrievedAt}>{retrievedTime.format(new Date(card.retrievedAt))}</time>
                      {" "}czasu polskiego
                    </>}
                  </footer>
                </article>
              );
            })}
          </div>
          <aside className="nova-result travel-advice">
            <h3>Podsumowanie agenta</h3>
            {missingSources.length > 0 && <p>Brak danych ze źródeł: {missingSources.join(", ")}.</p>}
            <p>{advice ?? (pending
              ? "Ładuję…"
              : "Podsumowanie jest chwilowo niedostępne. Użyj przycisku „Odśwież”, aby spróbować ponownie.")}</p>
          </aside>
        </section>
      )}
    </>
  );
}
