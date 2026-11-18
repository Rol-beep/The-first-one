import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authenticated } from "@/lib/workshop";
import HistoryList from "./history-list";

async function History() {
  await connection();
  if (!await authenticated()) redirect("/");
  return <main className="stan-naturalny-shell">
    <header className="stan-naturalny-header travel-header">
      <div><h1>Historia rozmów</h1><p className="stan-naturalny-muted">Wróć do rozmowy i kontynuuj tam, gdzie skończyłeś.</p></div>
      <Link href="/" className="stan-naturalny-button">Wróć do czatu</Link>
    </header>
    <HistoryList />
  </main>;
}

export default function HistoryPage() {
  return <Suspense fallback={<p className="p-6">Ładowanie…</p>}><History /></Suspense>;
}
