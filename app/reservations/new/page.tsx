import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ManualReservationForm } from "@/components/reservations/ManualReservationForm";
import { SupabaseGate } from "@/components/SupabaseGate";

export default function NewReservationPage() {
  return (
    <SupabaseGate>
      <AppShell>
        <div className="mb-4">
          <Link
            href="/reservations"
            className="text-sm text-zinc-500 hover:underline"
          >
            ← 一覧に戻る
          </Link>
        </div>
        <PageHeader
          title="手動予約の作成"
          description="MANUAL-MT ID を自動採番（GAS createManualReservation 相当）"
        />
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
          <ManualReservationForm />
        </div>
      </AppShell>
    </SupabaseGate>
  );
}
