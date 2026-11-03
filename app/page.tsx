import { connection } from 'next/server';
import { Suspense } from 'react';

import Chat from './workshop-chat';
import { authenticated } from '@/lib/workshop';

async function WorkshopPage({
  searchParams,
}: {
  searchParams: Promise<{ login?: string }>;
}) {
  await connection();
  const params = await searchParams;

  if (!await authenticated()) {
    return (
      <main style={{ maxWidth: 420, margin: '60px auto', padding: 24 }}>
        <h1 style={{ fontSize: 30, marginBottom: 24 }}>Wpisz hasło</h1>
        <form action="/api/workshop" method="post">
          <label htmlFor="password">Hasło warsztatowe</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
            style={{
              display: 'block', width: '100%', padding: 12,
              border: '1px solid #888', borderRadius: 8, margin: '12px 0',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '12px 24px', background: '#1d4ed8',
              color: 'white', borderRadius: 8,
            }}
          >
            Wejdź
          </button>
        </form>
        {params.login === 'bad' &&
          <p role="alert" style={{ color: '#dc2626', marginTop: 16 }}>
            Nieprawidłowe hasło.
          </p>}
      </main>
    );
  }

  return (
    <>
      <form
        action="/api/workshop"
        method="post"
        style={{ maxWidth: 672, margin: '20px auto', padding: '0 24px' }}
      >
        <input type="hidden" name="action" value="logout" />
        <button
          type="submit"
          style={{ padding: '8px 16px', border: '1px solid #888', borderRadius: 8 }}
        >
          Wyjdź
        </button>
      </form>
      <Chat />
    </>
  );
}

export default function Home(props: Parameters<typeof WorkshopPage>[0]) {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>Ładowanie…</p>}>
      <WorkshopPage {...props} />
    </Suspense>
  );
}
