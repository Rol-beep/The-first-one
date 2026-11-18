import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authenticated } from '@/lib/workshop';
import ProfileEditor from './profile-editor';

async function Profile() {
  await connection();
  if (!await authenticated()) redirect('/');
  return <main className="stan-naturalny-shell">
    <header className="stan-naturalny-header travel-header">
      <div><h1>Twój profil</h1><p className="stan-naturalny-muted">Ty decydujesz, co mam o Tobie pamiętać.</p></div>
      <Link href="/" className="stan-naturalny-button">Wróć do czatu</Link>
    </header>
    <ProfileEditor />
  </main>;
}
export default function ProfilePage() {
  return <Suspense fallback={<p className="p-6">Ładowanie…</p>}><Profile /></Suspense>;
}
