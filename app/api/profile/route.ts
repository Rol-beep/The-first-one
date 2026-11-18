import { z } from 'zod';
import { authenticated, sameOrigin } from '@/lib/workshop';
import { getUserProfile, editUserProfile, clearUserProfile } from '@/lib/supabase';
import { validProfileEdit } from '@/lib/profile-policy';
const headers = { 'Cache-Control': 'no-store' };
const schema = z.object({
  field: z.enum(['name', 'miasto', 'ulubione_jedzenie', 'lubiane_jedzenie', 'hobby', 'styl_odpowiedzi', 'jezyk', 'ulubiony_kolor']),
  value: z.string().trim().min(1).max(1000).nullable(),
}).strict();

export async function GET() {
  if (!await authenticated()) return new Response('Zaloguj się ponownie.', { status: 401, headers });
  try { return Response.json(await getUserProfile(), { headers }); }
  catch { return new Response('Nie udało się wczytać profilu. Spróbuj ponownie.', { status: 503, headers }); }
}

export async function PATCH(request: Request) {
  if (!await authenticated()) return new Response('Zaloguj się ponownie.', { status: 401, headers });
  if (!sameOrigin(request)) return new Response('Niedozwolone żądanie.', { status: 403, headers });
  let data;
  try {
    const body = await request.text();
    if (body.length > 2048) throw new Error();
    data = schema.parse(JSON.parse(body));
  } catch { return new Response('Niepoprawne dane profilu.', { status: 400, headers }); }
  if (data.value !== null && !validProfileEdit(data.field, data.value)) {
    return new Response('Wpisz krótką, jednoznaczną wartość bez sekretów, danych wrażliwych ani instrukcji. Dla stylu użyj np. „krótkie” lub „szczegółowe”.', { status: 400, headers });
  }
  try {
    await editUserProfile(data.field, data.value);
    return Response.json(await getUserProfile(), { headers });
  } catch { return new Response('Nie udało się zapisać zmiany. Spróbuj ponownie.', { status: 503, headers }); }
}

export async function DELETE(request: Request) {
  if (!await authenticated()) return new Response('Zaloguj się ponownie.', { status: 401, headers });
  if (!sameOrigin(request)) return new Response('Niedozwolone żądanie.', { status: 403, headers });
  try {
    await clearUserProfile();
    return Response.json(await getUserProfile(), { headers });
  } catch { return new Response('Nie udało się wyczyścić profilu. Spróbuj ponownie.', { status: 503, headers }); }
}
