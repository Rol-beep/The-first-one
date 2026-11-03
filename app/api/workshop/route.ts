
import { cookies } from 'next/headers';
import {
  authenticated, configured, cookieName, cookieOptions,
  equal, issueSession, lifetime, sameOrigin, reserveAttempt,
} from '@/lib/workshop';

export async function GET() {
  return Response.json(
    { authenticated: await authenticated() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };

  if (!sameOrigin(request)) {
    return new Response('Niedozwolone żądanie.', { status: 403, headers });
  }

  let form: URLSearchParams;
  try {
    const text = await request.text();
    if (text.length > 4096) throw new Error();
    form = new URLSearchParams(text);
  } catch {
    return new Response('Niepoprawne żądanie.', { status: 400, headers });
  }

  if (form.get('action') === 'logout') {
    (await cookies()).set(cookieName, '', {
      ...cookieOptions, maxAge: 0,
    });
    return new Response(null, {
      status: 303, headers: { ...headers, Location: '/' },
    });
  }

  if (!configured()) {
    return new Response(
      'Dostęp zablokowany. Ustaw CHAT_PASSWORD i SESSION_SECRET na serwerze.',
      { status: 503, headers }
    );
  }

  try {
    if (!await reserveAttempt()) {
      return new Response('Za dużo prób. Spróbuj za 15 minut.', {
        status: 429,
        headers: { ...headers, 'Retry-After': '900' },
      });
    }
  } catch {
    return new Response('Logowanie niedostępne: sprawdź magazyn limitera.', {
      status: 503, headers,
    });
  }

  if (!equal(form.get('password') ?? '', process.env.CHAT_PASSWORD!)) {
    return new Response(null, {
      status: 303,
      headers: { ...headers, Location: '/?login=bad' },
    });
  }

  (await cookies()).set(cookieName, issueSession(), {
    ...cookieOptions, maxAge: lifetime,
  });

  return new Response(null, {
    status: 303, headers: { ...headers, Location: '/' },
  });
}
