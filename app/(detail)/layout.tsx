import { SupabaseGate } from "@/components/SupabaseGate";

export const dynamic = "force-dynamic";

export default function DetailLayout({ children }: { children: React.ReactNode }) {
  return <SupabaseGate>{children}</SupabaseGate>;
}
