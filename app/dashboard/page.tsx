import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { authenticated } from "@/lib/workshop";
import ThemeSwitch from "../theme-switch";
import TravelPanel from "./travel-panel";

async function Dashboard() {
  await connection();
  if (!await authenticated()) redirect("/?next=dashboard");

  return (
    <main className="nova-shell">
      <header className="nova-header travel-header">
        <div>
          <h1>Asystent podróży</h1>
        </div>
        <div className="nova-header-actions">
          <ThemeSwitch />
          <Link href="/" className="nova-button">Wróć do czatu</Link>
        </div>
      </header>
      <TravelPanel />
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="p-6">Ładowanie…</p>}>
      <Dashboard />
    </Suspense>
  );
}
