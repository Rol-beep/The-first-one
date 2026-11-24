"use client";
import { useRef, useState } from 'react';
import { knowledgeStageLabels, type KnowledgeStage, type KnowledgeDocument, type KnowledgeImportEvent } from '@/lib/knowledge-import';
import { knowledgeContentLimit, knowledgeTitleLimit, validateKnowledgeDocument } from '@/lib/knowledge-text';

export default function UploadForm({ initialDocuments, initialError }: { initialDocuments: KnowledgeDocument[]; initialError: string }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [touched, setTouched] = useState({ title: false, content: false });
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stage, setStage] = useState<KnowledgeStage | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>(initialDocuments);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(initialError);
  async function refresh() {
    setListLoading(true); setListError('');
    try {
      const response = await fetch('/api/upload', { cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());
      setDocuments(await response.json());
    } catch (error) { setListError(error instanceof Error ? error.message : 'Nie udało się odświeżyć listy.'); }
    finally { setListLoading(false); }
  }
  async function remove(document: KnowledgeDocument) {
    if (submitting.current || !window.confirm(`Usunąć dokument „${document.title}” i wszystkie jego fragmenty?`)) return;
    submitting.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      const response = await fetch(`/api/upload?id=${encodeURIComponent(document.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await response.text());
      setDocuments(current => current.filter(row => row.id !== document.id));
    } catch (error) { setError(error instanceof Error ? error.message : 'Nie udało się usunąć dokumentu. Odśwież listę.'); }
    finally { await refresh(); submitting.current = false; setBusy(false); }
  }
  const validation = validateKnowledgeDocument(title, content);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setTouched({ title: true, content: true });
    setSuccess(''); setError('');
    if (validation.title || validation.content) return;
    if (listLoading || listError) { setError('Odśwież listę dokumentów przed importem.'); return; }
    const expected = documents.filter(doc => doc.title.trim() === title.trim()).map(({ id, createdAt }) => ({ id, createdAt }));
    if (expected.length && !window.confirm(`Dokument „${title.trim()}” już istnieje. Zastąpić poprzednią wersję? Jej stare fragmenty zostaną usunięte po zapisaniu nowej wersji.`)) return;
    submitting.current = true; setBusy(true); setStage(null);
    let currentStage: KnowledgeStage | null = null;
    try {
      const response = await fetch('/api/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, expected }),
      });
      if (!response.ok) throw new Error(await response.text());
      if (!response.body) throw new Error('Brak odpowiedzi serwera. Odśwież listę przed ponowieniem importu.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', completed = false;
      function receive(line: string) {
        if (!line.trim()) return;
        const event = JSON.parse(line) as KnowledgeImportEvent;
        if (event.type === 'stage') { currentStage = event.stage; setStage(event.stage); }
        else if (event.type === 'error') { currentStage = event.stage; throw new Error(event.message); }
        else if (event.type === 'success') {
          completed = true;
          setSuccess(`Zapisano dokument „${event.title}”: ${event.chunkCount} fragmentów`);
        }
      }
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          let newline;
          while ((newline = buffer.indexOf('\n')) >= 0) { receive(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
          if (done) { receive(buffer); break; }
        }
      } finally { reader.releaseLock(); }
      if (!completed) throw new Error('Połączenie przerwane. Odśwież listę dokumentów przed ponowieniem importu.');
    } catch (error) {
      setSuccess('');
      const step = currentStage ? `Etap: ${knowledgeStageLabels[currentStage]} ` : 'Sprawdzanie dokumentu: ';
      setError(step + (error instanceof Error ? error.message : 'Nie udało się zakończyć importu.') + ' Przed kolejną próbą sprawdź aktualną listę dokumentów poniżej.');
    } finally {
      setStage(null); await refresh(); submitting.current = false; setBusy(false);
    }
  }

  return <><form className="knowledge-upload" noValidate onSubmit={event => void submit(event)} aria-busy={busy}>
    <div>
      <label htmlFor="knowledge-title">Tytuł</label>
      <input id="knowledge-title" className="stan-naturalny-field" maxLength={knowledgeTitleLimit} value={title} disabled={busy} required
        onChange={event => { setTitle(event.target.value); setSuccess(''); }} onBlur={() => setTouched(current => ({ ...current, title: true }))}
        aria-invalid={touched.title && Boolean(validation.title)} aria-describedby={touched.title && validation.title ? 'knowledge-title-error' : undefined} />
      {touched.title && validation.title && <p id="knowledge-title-error" role="alert" className="stan-naturalny-error">{validation.title}</p>}
    </div>
    <div>
      <label htmlFor="knowledge-content">Treść</label>
      <textarea id="knowledge-content" className="stan-naturalny-field" rows={14} maxLength={knowledgeContentLimit} value={content} disabled={busy} required
        onChange={event => { setContent(event.target.value); setSuccess(''); }} onBlur={() => setTouched(current => ({ ...current, content: true }))}
        aria-invalid={touched.content && Boolean(validation.content)} aria-describedby="knowledge-help knowledge-count knowledge-content-error" />
      <p id="knowledge-help" className="stan-naturalny-muted">Oddzielaj akapity pustą linią. Każdy akapit będzie dokładnie jednym fragmentem, także gdy jest długi.</p>
      <p id="knowledge-count" className="stan-naturalny-muted">{content.length.toLocaleString('pl-PL')} / 20 000 znaków</p>
      <p id="knowledge-content-error" role={touched.content && validation.content ? 'alert' : undefined} className="stan-naturalny-error">{touched.content ? validation.content : ''}</p>
    </div>
    {stage && <ol className="knowledge-progress" aria-label="Postęp importu">{(['split', 'embedding', 'save'] as const).map((step, index) => {
      const activeIndex = ['split', 'embedding', 'save'].indexOf(stage);
      return <li key={step} aria-current={step === stage ? 'step' : undefined}>
        {index < activeIndex ? '✓ ' : ''}{knowledgeStageLabels[step]}{step === stage ? ' — teraz' : ''}
      </li>;
    })}</ol>}
    {stage && <p role="status" aria-live="polite">{knowledgeStageLabels[stage]}</p>}
    {error && <p role="alert" className="stan-naturalny-error">{error}</p>}
    {success && <p role="status" className="knowledge-success">{success}</p>}
    <button type="submit" disabled={busy || listLoading || Boolean(listError) || Boolean(success)} className="stan-naturalny-button stan-naturalny-primary">{busy ? (stage ? knowledgeStageLabels[stage] : 'Sprawdzam…') : 'Dodaj do bazy wiedzy'}</button>
  </form>
    <section className="knowledge-documents" aria-labelledby="documents-heading" aria-busy={listLoading}>
      <div className="knowledge-documents-heading"><h2 id="documents-heading">Dokumenty w bazie</h2>
        <button type="button" className="stan-naturalny-button" disabled={busy || listLoading} onClick={() => void refresh()}>Odśwież listę</button></div>
      {listLoading && <p role="status">Ładuję dokumenty…</p>}
      {listError && <p role="alert" className="stan-naturalny-error">{listError}</p>}
      {!listLoading && !listError && !documents.length && <p className="stan-naturalny-muted">Dodaj pierwszy dokument — dzięki niemu Twój asystent lepiej pozna Stan Naturalny.</p>}
      {!listLoading && !listError && <ul className="history-list">{documents.map(document => <li key={document.id} className="history-entry">
        <div className="history-entry-body"><strong>{document.title}</strong>
          <span className="stan-naturalny-muted">Źródło: {document.title} · Wersja: <time dateTime={document.createdAt}>{new Date(document.createdAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}</time> · Fragmenty: {document.chunkCount}</span></div>
        <button type="button" disabled={busy} className="stan-naturalny-button history-delete" onClick={() => void remove(document)}>Usuń</button>
      </li>)}</ul>}
    </section>
  </>;
}
