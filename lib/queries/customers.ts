import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { createReadClient } from "@/lib/supabase/read";
import { buildCustomerKey } from "@/lib/services/customer-index";

export type CustomerSearchCriteria = {
  name?: string;
  email?: string;
  phone?: string;
  reservationId?: string;
  customerId?: string;
};

export type CustomerListItem = {
  customerKey: string;
  customerId: string | null;
  representativeName: string | null;
  nameKana: string | null;
  email: string | null;
  phone: string | null;
  visitCount: number;
  lastCheckOut: string | null;
  isRepeater: boolean;
};

export type CustomerDetail = CustomerListItem & {
  reservations: {
    reservationId: string;
    checkIn: string | null;
    checkOut: string | null;
    status: string;
    channel: string | null;
  }[];
};

type DbCustomer = {
  customer_id: string;
  customer_key: string;
  representative_name: string | null;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  visit_count: number;
  last_check_out: string | null;
  is_repeater: boolean;
};

function rowToListItem(row: DbCustomer): CustomerListItem {
  return {
    customerKey: row.customer_key,
    customerId: row.customer_id,
    representativeName: row.representative_name,
    nameKana: row.name_kana,
    email: row.email,
    phone: row.phone,
    visitCount: row.visit_count,
    lastCheckOut: row.last_check_out,
    isRepeater: row.is_repeater,
  };
}

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

async function searchCustomersUncached(criteria: CustomerSearchCriteria) {
  const supabase = await createReadClient();
  const orParts: string[] = [];

  if (criteria.customerId) {
    orParts.push(`customer_id.ilike.%${escapeIlike(criteria.customerId)}%`);
  }
  if (criteria.email) {
    orParts.push(`email.ilike.%${escapeIlike(criteria.email)}%`);
  }
  if (criteria.name) {
    const q = escapeIlike(criteria.name);
    orParts.push(`representative_name.ilike.%${q}%`);
    orParts.push(`name_kana.ilike.%${q}%`);
  }
  if (criteria.phone) {
    const digits = criteria.phone.replace(/[^\d]/g, "");
    if (digits.length >= 4) {
      orParts.push(`phone.ilike.%${digits}%`);
    }
  }

  let customerRows: DbCustomer[] = [];

  if (orParts.length) {
    const { data, error } = await supabase
      .from("customers")
      .select(
        "customer_id, customer_key, representative_name, name_kana, email, phone, visit_count, last_check_out, is_repeater"
      )
      .or(orParts.join(","))
      .order("representative_name", { ascending: true })
      .limit(50);

    if (error) {
      const msg = error.message ?? "";
      if (/customers/i.test(msg) && /schema cache|does not exist/i.test(msg)) {
        return { customers: [], error: null, tableMissing: true };
      }
      return { customers: [], error: msg, tableMissing: false };
    }
    customerRows = (data ?? []) as DbCustomer[];
  }

  if (criteria.reservationId) {
    const { data: reservations } = await supabase
      .from("reservations")
      .select("customer_id, representative_name, name_kana, email, phone, reservation_id")
      .ilike("reservation_id", `%${escapeIlike(criteria.reservationId)}%`);

    for (const r of reservations ?? []) {
      const key = buildCustomerKey(r);
      if (!key) continue;
      const { data: byKey } = await supabase
        .from("customers")
        .select(
          "customer_id, customer_key, representative_name, name_kana, email, phone, visit_count, last_check_out, is_repeater"
        )
        .eq("customer_key", key)
        .maybeSingle();
      if (byKey) customerRows.push(byKey as DbCustomer);
    }
  }

  if (criteria.name) {
    const { data: companions } = await supabase
      .from("companions")
      .select("reservation_id")
      .or(
        `name.ilike.%${escapeIlike(criteria.name)}%,name_kana.ilike.%${escapeIlike(criteria.name)}%`
      );
    const ids = Array.from(
      new Set((companions ?? []).map((c) => String(c.reservation_id)))
    );
    if (ids.length) {
      const { data: reservations } = await supabase
        .from("reservations")
        .select("customer_id, representative_name, name_kana, email, phone, reservation_id")
        .in("reservation_id", ids);
      for (const r of reservations ?? []) {
        const key = buildCustomerKey(r);
        if (!key) continue;
        const { data: byKey } = await supabase
          .from("customers")
          .select(
            "customer_id, customer_key, representative_name, name_kana, email, phone, visit_count, last_check_out, is_repeater"
          )
          .eq("customer_key", key)
          .maybeSingle();
        if (byKey) customerRows.push(byKey as DbCustomer);
      }
    }
  }

  const unique = new Map<string, DbCustomer>();
  for (const row of customerRows) unique.set(row.customer_key, row);

  const customers = Array.from(unique.values())
    .map(rowToListItem)
    .sort((a, b) =>
      (a.representativeName ?? "").localeCompare(b.representativeName ?? "", "ja")
    )
    .slice(0, 50);

  return { customers, error: null, tableMissing: false };
}

export async function searchCustomers(
  criteria: CustomerSearchCriteria
): Promise<{ customers: CustomerListItem[]; error: string | null }> {
  const active = Object.fromEntries(
    Object.entries(criteria).filter(([, v]) => String(v ?? "").trim())
  ) as CustomerSearchCriteria;
  if (!Object.keys(active).length) {
    return { customers: [], error: null };
  }

  const key = JSON.stringify(active);
  return unstable_cache(
    () => searchCustomersUncached(active),
    ["customers-search", key],
    { tags: [CACHE_TAGS.customers], revalidate: 60 }
  )();
}

async function getCustomerDetailUncached(openId: string) {
  const supabase = await createReadClient();
  const id = decodeURIComponent(openId).trim();
  if (!id) return { detail: null, error: null };

  let customer: DbCustomer | null = null;

  if (id.startsWith("cid:") || id.startsWith("email:") || id.startsWith("phone:") || id.startsWith("name:") || id.includes("|")) {
    const { data } = await supabase
      .from("customers")
      .select(
        "customer_id, customer_key, representative_name, name_kana, email, phone, visit_count, last_check_out, is_repeater"
      )
      .eq("customer_key", id)
      .maybeSingle();
    customer = (data as DbCustomer) ?? null;
  } else {
    const { data: byId } = await supabase
      .from("customers")
      .select(
        "customer_id, customer_key, representative_name, name_kana, email, phone, visit_count, last_check_out, is_repeater"
      )
      .eq("customer_id", id)
      .maybeSingle();
    customer = (byId as DbCustomer) ?? null;
    if (!customer) {
      const { data: byKey } = await supabase
        .from("customers")
        .select(
          "customer_id, customer_key, representative_name, name_kana, email, phone, visit_count, last_check_out, is_repeater"
        )
        .eq("customer_key", id)
        .maybeSingle();
      customer = (byKey as DbCustomer) ?? null;
    }
  }

  if (!customer) {
    return { detail: null, error: null };
  }

  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("reservation_id, check_in, check_out, status, channel, is_archived")
    .eq("customer_id", customer.customer_id)
    .order("check_in", { ascending: false });

  if (error) return { detail: null, error: error.message };

  const detail: CustomerDetail = {
    ...rowToListItem(customer),
    reservations: (reservations ?? []).map((r) => ({
      reservationId: r.reservation_id,
      checkIn: r.check_in,
      checkOut: r.check_out,
      status: r.status,
      channel: r.channel,
    })),
  };

  return { detail, error: null };
}

export async function getCustomerDetail(
  openId: string
): Promise<{ detail: CustomerDetail | null; error: string | null }> {
  return unstable_cache(
    () => getCustomerDetailUncached(openId),
    ["customer-detail", openId],
    { tags: [CACHE_TAGS.customers, CACHE_TAGS.customer(openId)], revalidate: 60 }
  )();
}

export function parseCustomerPrefill(
  searchParams: Record<string, string | string[] | undefined>
): CustomerSearchCriteria {
  const pick = (key: string) => {
    const v = searchParams[key];
    if (Array.isArray(v)) return v[0] ?? "";
    return v ?? "";
  };

  const criteria: CustomerSearchCriteria = {};
  const fields = ["name", "email", "phone", "reservationId", "customerId"] as const;
  for (const f of fields) {
    const v = pick(f).trim();
    if (v) criteria[f] = v;
  }

  const q = pick("q").trim();
  if (q) {
    if (q.includes("@")) criteria.email = criteria.email || q;
    else if (/^[\d\-+()]+$/.test(q.replace(/\s/g, ""))) criteria.phone = criteria.phone || q;
    else if (/^CU-/i.test(q)) criteria.customerId = criteria.customerId || q;
    else if (/^(STUDIO|MANUAL|CK)-/i.test(q)) criteria.customerId = criteria.customerId || q;
    else if (/^(STUDIO|MANUAL)-/i.test(q)) criteria.reservationId = criteria.reservationId || q;
    else criteria.name = criteria.name || q;
  }

  return criteria;
}

export function customerDetailPath(item: CustomerListItem): string {
  const openId = item.customerId || item.customerKey;
  return `/customers/${encodeURIComponent(openId)}`;
}
