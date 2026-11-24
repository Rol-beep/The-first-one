import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authenticated } from '@/lib/workshop';
import { listKnowledgeDocuments } from '@/lib/supabase';
import type { KnowledgeDocument } from '@/lib/knowledge-import';
import UploadForm from './upload-form';

async function Upload() {
  await connection();
  if (!await authenticated()) redirect('/');
  let documents: KnowledgeDocument[] = [];
  let error = '';
  try { documents = await listKnowledgeDocuments(); }
  catch { error = 'Nie udało się wczytać dokumentów. Sprawdź połączenie i odśwież listę.'; }
  return <main className="stan-naturalny-shell">
    <header className="stan-naturalny-header travel-header">
      <div><h1>Baza wiedzy</h1><p className="stan-naturalny-muted">Dodaj dokument, który Twój asystent ma poznać.</p></div>
      <Link href="/" className="stan-naturalny-button">Wróć do czatu</Link>
    </header>
    <UploadForm initialDocuments={documents} initialError={error} />
  </main>;
}
export default function UploadPage() {
  return <Suspense fallback={<p className="p-6">Ładowanie…</p>}><Upload /></Suspense>;
}
