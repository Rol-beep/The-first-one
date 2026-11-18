"use client";
import { useEffect, useState } from 'react';
import type { UserProfile } from '@/lib/profile-policy';
const labels: Record<string, string> = {
  name: 'Imię', miasto: 'Miasto', ulubione_jedzenie: 'Ulubione jedzenie', lubiane_jedzenie: 'Lubiane jedzenie',
  hobby: 'Hobby', styl_odpowiedzi: 'Styl odpowiedzi', jezyk: 'Język', ulubiony_kolor: 'Ulubiony kolor',
};

export default function ProfileEditor() {
  const [profile, setProfile] = useState<UserProfile>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/profile', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(await response.text());
      return await response.json() as UserProfile;
    }).then(setProfile).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [attempt]);

  async function change(field: string, value: string | null) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/profile', {
        method: field === '__clear__' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        ...(field === '__clear__' ? {} : { body: JSON.stringify({ field, value }) }),
      });
      if (!response.ok) throw new Error(await response.text());
      setProfile(await response.json()); setEditing(undefined); setConfirm(undefined);
      setNotice(field === '__clear__' ? 'Profil wyczyszczony.' : value === null ? 'Informacja usunięta.' : 'Zmiana zapisana.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Nie udało się zapisać profilu.'); }
    finally { setBusy(false); }
  }

  if (!profile) return <section>{error ? <div role="alert"><p className="stan-naturalny-error">{error}</p><button className="stan-naturalny-button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Spróbuj ponownie</button></div> : <p role="status">Wczytuję profil…</p>}</section>;
  const entries = [['name', profile.name], ...Object.entries(profile.preferences)] as [string, string | null][];
  const hasFacts = Boolean(profile.name || Object.keys(profile.preferences).length);
  return <section className="profile-panel" aria-label="Zapisane informacje o Tobie">
    <p className="stan-naturalny-muted">Zmiany obowiązują przy kolejnej odpowiedzi i w nowych rozmowach. Historia rozmów pozostaje bez zmian.</p>
    {error && <p role="alert" className="stan-naturalny-error">{error}</p>}
    <p role="status">{notice}</p>
    {!hasFacts && <p>Nie mam jeszcze zapisanych informacji o Tobie. Możesz podać imię tutaj lub przedstawić się w czacie.</p>}
    {entries.map(([key, value]) => <div className="profile-row" key={key}>
      <div><strong>{labels[key] ?? key}</strong><p>{value ?? 'Jeszcze nie zapisano'}</p></div>
      {editing === key ? <form className="profile-edit" onSubmit={event => { event.preventDefault(); void change(key, draft.trim()); }}>
        <label htmlFor={`profile-${key}`}>Nowa wartość: {labels[key] ?? key}</label>
        <input id={`profile-${key}`} className="stan-naturalny-field" value={draft} onChange={event => setDraft(event.target.value)} maxLength={key === 'hobby' ? 1000 : 80} required disabled={busy} autoFocus />
        <button className="stan-naturalny-button" disabled={busy || !draft.trim()}>Zapisz</button>
        <button type="button" className="stan-naturalny-button" disabled={busy} onClick={() => setEditing(undefined)}>Anuluj</button>
      </form> : <div className="profile-actions">
        <button className="stan-naturalny-button" disabled={busy} aria-label={`Edytuj: ${labels[key] ?? key}`} onClick={() => { setEditing(key); setDraft(value ?? ''); setConfirm(undefined); }}>{value ? 'Edytuj' : 'Dodaj imię'}</button>
        {value && <button className="stan-naturalny-button history-delete" disabled={busy} aria-label={`Usuń: ${labels[key] ?? key}`} onClick={() => { setConfirm(key); setEditing(undefined); }}>Usuń</button>}
      </div>}
      {confirm === key && <div className="profile-confirm" role="group" aria-label={`Potwierdź usunięcie: ${labels[key] ?? key}`}>
        <p>Usunąć tę informację z profilu?</p><button className="stan-naturalny-button" disabled={busy} onClick={() => setConfirm(undefined)}>Anuluj</button><button className="stan-naturalny-button history-delete" disabled={busy} onClick={() => void change(key, null)}>Tak, usuń</button>
      </div>}
    </div>)}
    {hasFacts && <button className="stan-naturalny-button history-delete" disabled={busy} onClick={() => { setConfirm('__clear__'); setEditing(undefined); }}>Wyczyść cały profil</button>}
    {confirm === '__clear__' && <div className="profile-confirm" role="group" aria-label="Potwierdź wyczyszczenie profilu">
      <p>Usunąć imię i wszystkie preferencje? Tej operacji nie można cofnąć. Rozmowy pozostaną zapisane.</p>
      <button className="stan-naturalny-button" disabled={busy} onClick={() => setConfirm(undefined)}>Anuluj</button><button className="stan-naturalny-button history-delete" disabled={busy} onClick={() => void change('__clear__', null)}>Tak, wyczyść profil</button>
    </div>}
  </section>;
}
