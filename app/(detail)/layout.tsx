import { SupabaseGate } from "@/components/SupabaseGate";

export default function DetailLayout({ children }: { children: React.ReactNode }) {
  return <SupabaseGate>{children}</SupabaseGate>;
}
