import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { authenticated, sameOrigin, cookieOptions, lifetime } from "@/lib/workshop";
import { conversationOwner, latestConversation, listConversations, deleteConversation, getUserProfile, ConversationStorageError } from "@/lib/supabase";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!await authenticated()) return new Response("Zaloguj się ponownie.", { status: 401, headers });
  try {
    const params = new URL(request.url).searchParams;
    const owner = conversationOwner(request);
    if (params.get("list") === "1") return Response.json(await listConversations(owner), { headers });
    const profile = await getUserProfile();
    const requested = params.get("conversation");
    if (requested !== null) {
      const id = z.uuid().safeParse(requested);
      if (!id.success) return new Response("Niepoprawny identyfikator rozmowy.", { status: 400, headers });
      return Response.json({ ...await latestConversation(owner, id.data), profileName: profile.name }, { headers });
    }
    const selected = (await cookies()).get("active_conversation")?.value;
    if (selected === "new") return Response.json({ id: randomUUID(), messages: [], profileName: profile.name }, { headers });
    const selectedId = z.uuid().safeParse(selected);
    const conversation = await latestConversation(owner, selectedId.success ? selectedId.data : undefined);
    return Response.json({ ...(conversation ?? { id: randomUUID(), messages: [] }), profileName: profile.name }, { headers });
  } catch (error) {
    return new Response(error instanceof ConversationStorageError ? error.message : "Nie udało się wczytać rozmowy.",
      { status: 503, headers });
  }
}

export async function POST(request: Request) {
  if (!await authenticated()) return new Response("Zaloguj się ponownie.", { status: 401, headers });
  if (!sameOrigin(request)) return new Response("Niedozwolone żądanie.", { status: 403, headers });
  try {
    const profile = await getUserProfile();
    (await cookies()).set("active_conversation", "new", { ...cookieOptions, maxAge: lifetime });
    return Response.json({ id: randomUUID(), messages: [], profileName: profile.name }, { headers });
  } catch { return new Response("Nie udało się wczytać profilu. Spróbuj ponownie.", { status: 503, headers }); }
}

export async function DELETE(request: Request) {
  if (!await authenticated()) return new Response("Zaloguj się ponownie.", { status: 401, headers });
  if (!sameOrigin(request)) return new Response("Niedozwolone żądanie.", { status: 403, headers });
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("conversation"));
  if (!id.success) return new Response("Niepoprawny identyfikator rozmowy.", { status: 400, headers });
  try {
    await deleteConversation(conversationOwner(request), id.data);
    const jar = await cookies();
    if (jar.get("active_conversation")?.value === id.data) {
      jar.set("active_conversation", "new", { ...cookieOptions, maxAge: lifetime });
    }
    return new Response(null, { status: 204, headers });
  } catch {
    return new Response("Nie udało się usunąć rozmowy. Spróbuj ponownie.", { status: 503, headers });
  }
}
