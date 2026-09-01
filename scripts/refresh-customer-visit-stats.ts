import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import { refreshCustomerVisitStats } from "@/lib/services/customer-index";

loadEnvLocal();

function argValue(flag: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return "";
  return String(process.argv[idx + 1] ?? "").trim();
}

async function main() {
  const customerId = argValue("--customer-id");
  const name = argValue("--name");
  if (!customerId && !name) {
    console.error(
      "Usage: npx tsx scripts/refresh-customer-visit-stats.ts --customer-id CU-2025-1"
    );
    console.error("   or: npx tsx scripts/refresh-customer-visit-stats.ts --name 真木");
    process.exit(1);
  }

  const supabase = createAdminClient();
  let targetId = customerId;

  if (!targetId && name) {
    const like = `%${name}%`;
    const { data, error } = await supabase
      .from("customers")
      .select("customer_id, representative_name, visit_count")
      .or(`representative_name.ilike.${like},name_kana.ilike.${like}`)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    if (!data?.length) {
      console.error("No customer matched:", name);
      process.exit(1);
    }
    if (data.length > 1) {
      console.table(data);
      console.error("Multiple matches — pass --customer-id");
      process.exit(1);
    }
    targetId = data[0].customer_id;
    console.log("Matched:", data[0]);
  }

  const before = await supabase
    .from("customers")
    .select("visit_count, last_check_out, is_repeater")
    .eq("customer_id", targetId!)
    .maybeSingle();
  console.log("Before:", before.data);

  await refreshCustomerVisitStats(supabase, targetId!);

  const after = await supabase
    .from("customers")
    .select("visit_count, last_check_out, is_repeater")
    .eq("customer_id", targetId!)
    .maybeSingle();
  console.log("After:", after.data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
