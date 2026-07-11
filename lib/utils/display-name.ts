export function formatDisplayName(name: string | null | undefined): string {
  if (!name) return "—";
  return name.replace(/\s+/g, " ").trim();
}
