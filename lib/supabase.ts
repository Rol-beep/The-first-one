import "server-only";
import { safeProfile, mergeHobbies, type ProfilePatch } from "./profile-policy";

import { createHash } from "node:crypto";
import type { UIMessage } from "ai";
import { z } from "zod";
import { cookieName } from "./workshop";
import { conversationText, storedMessageId } from "./conversation-text";
import { createClient } from "@supabase/supabase-js";

// Call only after the endpoint has verified the workshop session.
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new ConversationStorageError("Brak konfiguracji pamięci. Ustaw SUPABASE_URL i SUPABASE_SECRET_KEY na serwerze.");
  }

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export class ConversationStorageError extends Error {
  constructor(message = "Nie udało się odczytać pamięci rozmów. Spróbuj ponownie.") {
    super(message);
    this.name = "ConversationStorageError";
  }
}

function databaseError(error: { code?: string; message?: string }) {
  const code = error.code ?? "unknown";
  // Log only an error code, never SQL details, credentials, or message contents.
  console.error("[conversation-memory] database error", code);
  if (code === "22P02" || code === "42804") {
    return new ConversationStorageError("Niezgodny schemat bazy: identyfikatory rozmów i wiadomości muszą mieć typ UUID. Uruchom skrypt naprawczy SQL przyciskiem Run w Supabase.");
  }
  if (code === "42501") {
    return new ConversationStorageError("Brak uprawnień do zapisu rozmów. Sprawdź serwerowy klucz Supabase i uprawnienia service_role w skrypcie SQL.");
  }
  if (code === "23502") {
    const column = error.message?.match(/column "([a-z_]+)"/)?.[1];
    return new ConversationStorageError(`Baza wymaga dodatkowego pola${column ? ` „${column}”` : ""}. Schemat tabel nie odpowiada aplikacji.`);
  }
  return new ConversationStorageError(`Nie udało się odczytać lub zapisać rozmowy. Kod błędu bazy: ${/^[A-Z0-9]+$/.test(code) ? code : "nieznany"}.`);
}

export function conversationOwner(request: Request) {
  const token = request.headers.get("cookie")?.split(";").map(item => item.trim())
    .find(item => item.startsWith(cookieName + "="));
  if (!token) throw new ConversationStorageError("Zaloguj się ponownie.");
  return createHash("sha256").update(token).digest("hex");
}

const rowSchema = z.object({
  id: z.uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export async function loadConversation(owner: string, id: string): Promise<UIMessage[]> {
  const db = getSupabase();
  const conversation = await db.from("conversations").select("id").eq("id", id).eq("owner_key", owner).maybeSingle();
  if (conversation.error) throw databaseError(conversation.error);
  if (!conversation.data) throw new ConversationStorageError("Rozmowa nie jest dostępna w tej sesji.");
  const result = await db.from("messages").select("id, role, content").eq("conversation_id", id)
    .order("position", { ascending: true });
  if (result.error) throw databaseError(result.error);
  const rows = z.array(rowSchema).safeParse(result.data);
  if (!rows.success) throw new ConversationStorageError();
  return rows.data.map(row => ({ id: row.id, role: row.role, parts: [{ type: "text", text: row.content }] }));
}

export async function latestConversation(owner: string, selectedId?: string) {
  if (selectedId) return { id: selectedId, messages: await loadConversation(owner, selectedId) };
  const result = await getSupabase().from("conversations").select("id").eq("owner_key", owner)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw databaseError(result.error);
  if (!result.data) return null;
  const id = z.uuid().parse(result.data.id);
  return { id, messages: await loadConversation(owner, id) };
}

export async function listConversations(owner: string) {
  const result = await getSupabase().from("conversations")
    .select("id, title, created_at, messages(count)").eq("owner_key", owner)
    .order("created_at", { ascending: false });
  if (result.error) throw databaseError(result.error);
  const rows = z.array(z.object({
    id: z.uuid(), title: z.string(), created_at: z.string(),
    messages: z.array(z.object({ count: z.number().int().nonnegative() })),
  })).safeParse(result.data);
  if (!rows.success) throw new ConversationStorageError();
  return rows.data.map(row => ({
    id: row.id, title: row.title, createdAt: row.created_at,
    messageCount: row.messages[0]?.count ?? 0,
  }));
}

export async function prepareConversation(owner: string, id: string, user: UIMessage) {
  const db = getSupabase();
  const result = await db.from("conversations").upsert({
    id, title: conversationText(user).slice(0, 100) || "Nowa rozmowa", owner_key: owner,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (result.error) throw databaseError(result.error);
  return loadConversation(owner, id);
}

export async function saveConversationTurn(owner: string, id: string, user: UIMessage, assistant: UIMessage) {
  const db = getSupabase();
  // Ownership is checked again immediately before writing.
  const access = await db.from("conversations").select("id").eq("id", id).eq("owner_key", owner).maybeSingle();
  if (access.error || !access.data) throw new ConversationStorageError("Nie udało się zapisać rozmowy.");
  // One INSERT for the whole pair is atomic. Stable IDs also make retries idempotent.
  const { error } = await db.from("messages").upsert([
    { id: storedMessageId(id, "user", user.id), conversation_id: id, role: "user", content: conversationText(user) },
    { id: assistant.id, conversation_id: id, role: "assistant", content: conversationText(assistant) },
  ], { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new ConversationStorageError("Odpowiedź jest gotowa, ale nie udało się zapisać rozmowy. Zachowaj jej treść przed odświeżeniem.");
}

export async function setConversationTitle(owner: string, id: string, title: string) {
  const { error } = await getSupabase().from("conversations").update({ title }).eq("id", id).eq("owner_key", owner);
  if (error) throw databaseError(error);
}

export async function deleteConversation(owner: string, id: string) {
  // The foreign key ON DELETE CASCADE removes messages in the same transaction.
  const { error } = await getSupabase().from("conversations").delete().eq("id", id).eq("owner_key", owner);
  if (error) throw new ConversationStorageError("Nie udało się usunąć rozmowy. Spróbuj ponownie.");
}

// One owner profile, shared across conversations and password-login sessions.
// These functions are called only from authenticated server request handlers.
export async function getUserProfile() {
  const { data, error } = await getSupabase().from("user_profiles")
    .select("name, preferences").eq("singleton", true).maybeSingle();
  if (error) throw new ConversationStorageError("Nie udało się wczytać profilu użytkownika. Sprawdź konfigurację tabeli user_profiles.");
  return safeProfile(data);
}

export async function saveUserProfile(patch: ProfilePatch, appendHobbies = false) {
  const safe = safeProfile({ name: patch.name, preferences: patch.preferences });
  if (!safe.name && !Object.keys(safe.preferences).length) return;
  const db = getSupabase();
  const incomingHobby = appendHobbies ? safe.preferences.hobby : undefined;
  const preferences = { ...safe.preferences };
  if (incomingHobby) delete preferences.hobby;
  const { error } = await db.rpc("save_owner_profile", {
    p_name: safe.name, p_preferences: preferences,
  });
  if (error) throw new ConversationStorageError("Nie udało się zapisać profilu użytkownika.");
  if (!incomingHobby) return;
  // Append interests without losing previous hobbies or concurrent updates.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await db.from("user_profiles").select("preferences").eq("singleton", true).maybeSingle();
    if (current.error || !current.data) throw new ConversationStorageError("Nie udało się wczytać zainteresowań.");
    const previous = z.record(z.string(), z.unknown()).parse(current.data.preferences);
    const hobby = mergeHobbies(previous.hobby, incomingHobby);
    const result = await db.from("user_profiles").update({ preferences: { ...previous, hobby } })
      .eq("singleton", true).eq("preferences", JSON.stringify(previous)).select("singleton");
    if (result.error) throw new ConversationStorageError("Nie udało się zapisać zainteresowań.");
    if (result.data?.length) return;
  }
  throw new ConversationStorageError("Profil zmienił się w innym oknie. Spróbuj ponownie.");
}

export async function editUserProfile(field: string, value: string | null) {
  if (value !== null) {
    await saveUserProfile(field === "name" ? { name: value, preferences: {} } : { preferences: { [field]: value } });
    return;
  }
  const db = getSupabase();
  if (field === "name") {
    const { error } = await db.from("user_profiles").update({ name: null }).eq("singleton", true);
    if (error) throw new ConversationStorageError("Nie udało się usunąć imienia.");
    return;
  }
  // Compare-and-swap preserves facts saved concurrently by another chat.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await db.from("user_profiles").select("preferences").eq("singleton", true).maybeSingle();
    if (current.error) throw new ConversationStorageError("Nie udało się odczytać profilu.");
    if (!current.data) return;
    const preferences = z.record(z.string(), z.unknown()).parse(current.data.preferences);
    const next = { ...preferences };
    delete next[field];
    const result = await db.from("user_profiles").update({ preferences: next })
      .eq("singleton", true).eq("preferences", JSON.stringify(preferences)).select("singleton");
    if (result.error) throw new ConversationStorageError("Nie udało się usunąć preferencji.");
    if (result.data?.length) return;
  }
  throw new ConversationStorageError("Profil zmienił się w innym oknie. Spróbuj ponownie.");
}

export async function clearUserProfile() {
  // Keep the singleton row; remove all remembered information together.
  const { error } = await getSupabase().from("user_profiles")
    .update({ name: null, preferences: {} }).eq("singleton", true);
  if (error) throw new ConversationStorageError("Nie udało się wyczyścić profilu.");
}
