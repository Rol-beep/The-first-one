import { connection } from 'next/server';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import Chat from './workshop-chat';
import ThemeSwitch from './theme-switch';
import { authenticated } from '@/lib/workshop';

function BrandLogo() {
  return <Image
    src="/stan-naturalny-logo.svg"
    alt="Stan Naturalny"
    width={500}
    height={150}
    className="nova-mark"
    unoptimized
  />;
}

async function WorkshopPage({
  searchParams,
}: {
  searchParams: Promise<{ login?: string; next?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const openDashboard = params.next === 'dashboard';

  if (!await authenticated()) {
    return (
      <main className="login-screen">
        <div className="login-card">
          <header className="nova-login-header">
            <BrandLogo />
            <ThemeSwitch />
          </header>
          <h1>Asystent Stan Naturalny</h1>
          <p className="nova-muted">{openDashboard ? 'Zaloguj się, aby otworzyć asystenta podróży.' : 'Zaloguj się, aby otworzyć czat.'}</p>
          <form action="/api/workshop" method="post" className="mt-7">
            {openDashboard && <input type="hidden" name="next" value="dashboard" />}
            <label htmlFor="password">Hasło warsztatowe</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              className="nova-field mt-2 mb-4 w-full"
            />
            <button
              type="submit"
              className="nova-button nova-primary w-full"
            >
              Wejdź
            </button>
          </form>
          {params.login === 'bad' &&
            <p role="alert" className="nova-error mt-4">
              Nieprawidłowe hasło.
            </p>}
        </div>
      </main>
    );
  }

  if (openDashboard) redirect('/dashboard');

  return (
    <main className="nova-shell">
      <header className="nova-header">
        <BrandLogo />
        <div>
          <h1>Asystent Stan Naturalny</h1>
          <p className="nova-muted">Zadawaj pytania, twórz obrazy i przygotowuj szkice odpowiedzi dla klientów.</p>
        </div>
        <div className="nova-header-actions">
          <Link href="/dashboard" className="nova-button">Asystent podróży</Link>
          <ThemeSwitch />
          <form action="/api/workshop" method="post">
            <input type="hidden" name="action" value="logout" />
            <button type="submit" className="nova-button">Wyjdź</button>
          </form>
        </div>
      </header>
      <Chat />
    </main>
  );
}

export default function Home(props: Parameters<typeof WorkshopPage>[0]) {
  return (
    <Suspense fallback={<p className="p-6">Ładowanie…</p>}>
      <WorkshopPage {...props} />
    </Suspense>
  );
}
