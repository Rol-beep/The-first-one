
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { cookies } from 'next/headers';

export const cookieName = 'workshop_session';
export const lifetime = 8 * 60 * 60;
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export function configured() {
  return Boolean(
    process.env.CHAT_PASSWORD &&
    (process.env.SESSION_SECRET?.length ?? 0) >= 32
  );
}

export function equal(a: string, b: string) {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest()
  );
}

function sign(value: string) {
  return createHmac('sha256', process.env.SESSION_SECRET!)
    .update(value).digest('base64url');
}

export function issueSession() {
  if (!configured()) throw new Error('Brak konfiguracji');
  const body = String(Math.floor(Date.now() / 1000) + lifetime)
    + '.' + randomBytes(24).toString('base64url');
  return body + '.' + sign(body);
}

export async function authenticated() {
  if (!configured()) return false;
  const value = (await cookies()).get(cookieName)?.value;
  if (!value || value.length > 300) return false;
  const parts = value.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
  const now = Math.floor(Date.now() / 1000);
  const expires = Number(parts[0]);
  return expires > now && expires <= now + lifetime
    && equal(parts[2], sign(parts[0] + '.' + parts[1]));
}

export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

// Jeden wspólny budżet warsztatu, utrwalony poza pamięcią procesu.
export async function reserveAttempt() {
  // W tym trybie limit egzekwuje aktywna reguła Vercel Firewall.
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL === '1' &&
    process.env.CHAT_LOGIN_LIMIT_MODE === 'vercel-firewall'
  ) {
    return true;
  }

  const directory = process.env.CHAT_RATE_LIMIT_DIR ||
    (process.env.NODE_ENV !== 'production'
      ? '/tmp/moj-chatbot-workshop-limit' : '');

  if (!directory) throw new Error('Brak wspólnego katalogu limitera');

  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, 'lock');
  let handle;

  try {
    handle = await open(lock, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }

  try {
    const file = join(directory, 'attempts.json');
    let state = { start: Date.now(), count: 0 };

    try {
      state = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    if (!Number.isFinite(state.start) ||
        !Number.isInteger(state.count) || state.count < 0) {
      throw new Error('Niepoprawny stan limitera');
    }

    if (Date.now() - state.start >= 15 * 60 * 1000) {
      state = { start: Date.now(), count: 0 };
    }

    if (state.count >= 10) return false;

    state.count++;
    await writeFile(file, JSON.stringify(state), { mode: 0o600 });
    return true;
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
