import { SupabaseGate } from "@/components/SupabaseGate";
import { MainShell } from "@/components/MainShell";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <SupabaseGate>
      <MainShell>{children}</MainShell>
    </SupabaseGate>
  );
}
