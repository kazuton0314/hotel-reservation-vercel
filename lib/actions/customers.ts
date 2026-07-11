"use server";

import {
  getCustomerDetail,
  searchCustomers,
  type CustomerSearchCriteria,
} from "@/lib/queries/customers";
import { revalidatePath } from "next/cache";
import { revalidateCustomers } from "@/lib/cache/revalidate";
import { rebuildAllCustomers } from "@/lib/services/customer-index";
import { createStaffClient } from "@/lib/supabase/server";

export async function searchCustomersAction(criteria: CustomerSearchCriteria) {
  return searchCustomers(criteria);
}

export async function getCustomerDetailAction(openId: string) {
  return getCustomerDetail(openId);
}

export async function rebuildCustomersAction(): Promise<
  { ok: true; count: number } | { ok: false; message: string }
> {
  try {
    const supabase = await createStaffClient();
    const count = await rebuildAllCustomers(supabase);
    revalidateCustomers();
    return { ok: true, count };
  } catch (e) {
    const message = e instanceof Error ? e.message : "顧客索引の再構築に失敗しました";
    return { ok: false, message };
  }
}

export async function mergeCustomersAction(formData: FormData): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const primaryCustomerId = String(formData.get("primary_customer_id") ?? "").trim();
  const duplicateCustomerId = String(formData.get("duplicate_customer_id") ?? "").trim();
  if (!primaryCustomerId || !duplicateCustomerId || primaryCustomerId === duplicateCustomerId) {
    return { ok: false, message: "顧客IDが不正です。" };
  }
  try {
    const supabase = await createStaffClient();
    await supabase
      .from("reservations")
      .update({ customer_id: primaryCustomerId, updated_at: new Date().toISOString() })
      .eq("customer_id", duplicateCustomerId);
    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("customer_id", duplicateCustomerId);
    if (error) return { ok: false, message: error.message };
    revalidateCustomers();
    revalidatePath("/settings/operations");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "顧客統合に失敗しました" };
  }
}