import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { authenticated } from "@/lib/workshop";
import ActionIcon from "../action-icon";
import ThemeSwitch from "../theme-switch";
import TravelPanel from "./travel-panel";

async function Dashboard() {
  await connection();
  if (!await authenticated()) redirect("/?next=dashboard");

  return (
    <main className="stan-naturalny-shell">
      <header className="stan-naturalny-header travel-header">
        <div>
          <h1>Asystent podróży</h1>
        </div>
        <div className="stan-naturalny-header-actions">
          <ThemeSwitch />
          <Link href="/" className="stan-naturalny-button icon-control" aria-label="Wróć do czatu" title="Wróć do czatu">
            <ActionIcon name="chat" />
          </Link>
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
