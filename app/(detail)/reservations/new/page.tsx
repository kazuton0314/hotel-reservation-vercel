import { AppShell } from "@/components/AppShell";
import { ManualReservationForm } from "@/components/reservations/ManualReservationForm";

export default function NewReservationPage() {
  return (
    <AppShell title="予約を手動追加" hideNav>
        <ManualReservationForm />
      </AppShell>
  );
}
