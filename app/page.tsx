import { connection } from 'next/server';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import ActionIcon from './action-icon';
import Chat from './workshop-chat';
import ThemeSwitch from './theme-switch';
import { authenticated } from '@/lib/workshop';

function BrandHeading({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-heading">
      <Image
        src="/stan-naturalny-logo.svg"
        alt={compact ? "Stan Naturalny" : ""}
        width={500}
        height={150}
        className="brand-logo"
        unoptimized
      />
      <h1>{compact ? "Asystent" : "Asystent Stan Naturalny"}</h1>
    </div>
  );
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
          <BrandHeading />
          <p className="stan-naturalny-muted">{openDashboard ? 'Zaloguj się, aby otworzyć asystenta podróży.' : 'Zaloguj się, aby otworzyć czat.'}</p>
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
              className="stan-naturalny-field mt-2 mb-4 w-full"
            />
            <button
              type="submit"
              className="stan-naturalny-button stan-naturalny-primary login-submit w-full"
            >
              Wejdź
              <ActionIcon name="logout" />
            </button>
          </form>
          {params.login === 'bad' &&
            <p role="alert" className="stan-naturalny-error mt-4">
              Nieprawidłowe hasło.
            </p>}
        </div>
      </main>
    );
  }

  if (openDashboard) redirect('/dashboard');

  return (
    <main className="stan-naturalny-shell">
      <header className="stan-naturalny-header chat-header">
        <BrandHeading compact />
        <div className="stan-naturalny-header-actions">
          <Link href="/profile" className="stan-naturalny-button" title="Twój profil">Profil</Link>
          <Link href="/history" className="stan-naturalny-button" title="Historia rozmów">Historia</Link>
          <Link href="/dashboard" className="stan-naturalny-button icon-control" aria-label="Asystent podróży">
            <ActionIcon name="travel" />
          </Link>
          <ThemeSwitch />
          <form action="/api/workshop" method="post">
            <input type="hidden" name="action" value="logout" />
            <button type="submit" className="stan-naturalny-button icon-control" aria-label="Wyjdź">
              <ActionIcon name="logout" />
            </button>
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
