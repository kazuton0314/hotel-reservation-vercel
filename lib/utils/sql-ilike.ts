/** Supabase ilike 用エスケープ */
export function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}
