"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ActionIcon from "../action-icon";

type Entry = { id: string; title: string; createdAt: string; messageCount: number };
const date = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" });

export default function HistoryList() {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string>();
  const [confirmId, setConfirmId] = useState<string>();
  const [entries, setEntries] = useState<Entry[]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/conversations?list=1", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await response.text());
        return await response.json() as Entry[];
      }).then(setEntries).catch(error => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [attempt]);

  async function startNew() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/conversations", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      setBusy(false);
      router.push("/");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Nie udało się rozpocząć rozmowy.");
      setBusy(false);
    }
  }

  async function removeConversation(id: string) {
    if (deleting) return;
    setDeleting(id);
    setError("");
    try {
      const response = await fetch(`/api/conversations?conversation=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await response.text());
      setEntries(current => current?.filter(entry => entry.id !== id));
      setConfirmId(undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Nie udało się usunąć rozmowy.");
    } finally {
      setDeleting(undefined);
    }
  }

  return <section aria-label="Zapisane rozmowy" className="history-panel">
    <button type="button" onClick={() => void startNew()} disabled={busy || Boolean(deleting)} className="stan-naturalny-button history-new">
      <ActionIcon name="newChat" /> {busy ? "Otwieram…" : "Nowa rozmowa"}
    </button>
    {error && <div role="alert" className="stan-naturalny-error">
      <p>{error}</p><button className="stan-naturalny-button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Spróbuj ponownie</button>
    </div>}
    {!entries && !error && <p role="status">Wczytuję historię…</p>}
    {entries?.length === 0 && <div className="history-empty">
      <ActionIcon name="chat" /><h2>Od czego dziś zaczniemy?</h2>
      <p className="stan-naturalny-muted">Masz pytanie, pomysł albo podróż w planach? Napisz do mnie — wspólnie znajdziemy kolejny krok.</p>
      <button className="stan-naturalny-button" disabled={busy} onClick={() => void startNew()}>Zacznijmy rozmowę</button>
    </div>}
    <ul className="history-list">
      {entries?.map(entry => <li key={entry.id} className="history-row">
        <Link href={`/?conversation=${entry.id}`} prefetch={false} className="history-entry">
          <ActionIcon name="chat" />
          <span className="history-entry-body"><strong>{entry.title}</strong>
            <span className="stan-naturalny-muted"><time dateTime={entry.createdAt}>{date.format(new Date(entry.createdAt))}</time> · Wiadomości: {entry.messageCount}</span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
        {confirmId === entry.id ? <div className="history-delete-confirm" role="group" aria-label={`Potwierdź usunięcie: ${entry.title}`}>
          <p>Usunąć tę rozmowę i wszystkie jej wiadomości? Tej operacji nie można cofnąć.</p>
          <button className="stan-naturalny-button" disabled={Boolean(deleting)} onClick={() => setConfirmId(undefined)}>Anuluj</button>
          <button className="stan-naturalny-button history-delete" disabled={Boolean(deleting)} onClick={() => void removeConversation(entry.id)}>{deleting === entry.id ? "Usuwam…" : "Tak, usuń"}</button>
        </div> : <button className="stan-naturalny-button history-delete" disabled={Boolean(deleting)} aria-label={`Usuń rozmowę: ${entry.title}`} onClick={() => setConfirmId(entry.id)}>Usuń</button>}
      </li>)}
    </ul>
  </section>;
}
