import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { createReadClient } from "@/lib/supabase/read";
import {
  buildCustomerKey,
  buildEphemeralCustomerKey,
  countsAsVisit,
  isEphemeralCustomerKey,
  reservationIdFromEphemeralKey,
} from "@/lib/services/customer-index";
import {
  idPrefixIlikePattern,
  isIdLikeQuery,
  matchesIdPrefix,
} from "@/lib/utils/id-search";

export type CustomerSearchCriteria = {
  name?: string;
  companionName?: string;
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

import { escapeIlike } from "@/lib/utils/sql-ilike";

type ReservationProfileRow = {
  reservation_id: string;
  customer_id: string | null;
  representative_name: string | null;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string;
};

const RESERVATION_PROFILE_SELECT =
  "reservation_id, customer_id, representative_name, name_kana, email, phone, check_in, check_out, status";

/** 連絡先なし予約向け（索引外・リピーター対象外・当該予約のみ） */
function ephemeralListItem(r: ReservationProfileRow): CustomerListItem {
  return ephemeralListItemFromRows([r]);
}

function ephemeralListItemFromRows(rows: ReservationProfileRow[]): CustomerListItem {
  const profile =
    rows.find((r) => r.representative_name) ?? rows[0];
  let visitCount = 0;
  let lastCheckOut: string | null = null;
  for (const r of rows) {
    if (!countsAsVisit(r)) continue;
    visitCount++;
    if (r.check_out && (!lastCheckOut || r.check_out > lastCheckOut)) {
      lastCheckOut = r.check_out;
    }
  }
  return {
    customerKey: buildEphemeralCustomerKey(profile.reservation_id),
    customerId: profile.customer_id,
    representativeName: profile.representative_name,
    nameKana: profile.name_kana,
    email: profile.email,
    phone: profile.phone,
    visitCount,
    lastCheckOut,
    isRepeater: false,
  };
}

async function loadIndexedCustomerByReservation(
  supabase: Awaited<ReturnType<typeof createReadClient>>,
  r: Pick<ReservationProfileRow, "email" | "phone" | "representative_name">
): Promise<DbCustomer | null> {
  const key = buildCustomerKey(r);
  if (!key) return null;
  const { data } = await supabase
    .from("customers")
    .select(
      "customer_id, customer_key, representative_name, name_kana, email, phone, visit_count, last_check_out, is_repeater"
    )
    .eq("customer_key", key)
    .maybeSingle();
  return (data as DbCustomer) ?? null;
}

async function addReservationSearchHits(
  supabase: Awaited<ReturnType<typeof createReadClient>>,
  items: Map<string, CustomerListItem>,
  reservations: ReservationProfileRow[]
) {
  const keys = new Set<string>();
  const ephemeralRows: ReservationProfileRow[] = [];

  for (const r of reservations) {
    const key = buildCustomerKey(r);
    if (key) {
      keys.add(key);
      continue;
    }
    if (!String(r.representative_name ?? "").trim()) continue;
    ephemeralRows.push(r);
  }

  if (keys.size) {
    const { data: customers } = await supabase
      .from("customers")
      .select(
        "customer_id, customer_key, representative_name, name_kana, email, phone, visit_count, last_check_out, is_repeater"
      )
      .in("customer_key", [...keys]);

    const byKey = new Map(
      ((customers ?? []) as DbCustomer[]).map((row) => [row.customer_key, row])
    );

    for (const r of reservations) {
      const key = buildCustomerKey(r);
      if (!key) continue;
      const indexed = byKey.get(key);
      if (indexed) {
        items.set(indexed.customer_key, rowToListItem(indexed));
      }
    }
  }

  for (const r of ephemeralRows) {
    items.set(buildEphemeralCustomerKey(r.reservation_id), ephemeralListItem(r));
  }
}

async function addReservationGuestNameSearchHits(
  supabase: Awaited<ReturnType<typeof createReadClient>>,
  items: Map<string, CustomerListItem>,
  guestName: string
) {
  const q = escapeIlike(guestName);
  const { data: byName } = await supabase
    .from("reservations")
    .select(RESERVATION_PROFILE_SELECT)
    .or(
      [
        `representative_name.ilike.%${q}%`,
        `name_kana.ilike.%${q}%`,
        `last_name.ilike.%${q}%`,
        `first_name.ilike.%${q}%`,
        `last_name_kana.ilike.%${q}%`,
        `first_name_kana.ilike.%${q}%`,
      ].join(",")
    )
    .order("check_in", { ascending: false })
    .limit(50);

  await addReservationSearchHits(
    supabase,
    items,
    (byName ?? []) as ReservationProfileRow[]
  );
}

async function addCompanionNameSearchHits(
  supabase: Awaited<ReturnType<typeof createReadClient>>,
  items: Map<string, CustomerListItem>,
  companionName: string
) {
  const q = escapeIlike(companionName);
  const { data: companions, error } = await supabase
    .from("companions")
    .select("reservation_id")
    .or(`name.ilike.%${q}%,name_kana.ilike.%${q}%`)
    .limit(80);

  if (error) return;

  const ids = Array.from(
    new Set(
      (companions ?? [])
        .map((c) => String(c.reservation_id ?? "").trim())
        .filter(Boolean)
    )
  );
  if (!ids.length) return;

  const { data: reservations } = await supabase
    .from("reservations")
    .select(RESERVATION_PROFILE_SELECT)
    .in("reservation_id", ids);
  await addReservationSearchHits(
    supabase,
    items,
    (reservations ?? []) as ReservationProfileRow[]
  );
}

async function searchCustomersUncached(criteria: CustomerSearchCriteria) {
  const supabase = await createReadClient();
  const orParts: string[] = [];

  if (criteria.customerId) {
    const cid = criteria.customerId.trim();
    if (isIdLikeQuery(cid)) {
      orParts.push(`customer_id.ilike.${idPrefixIlikePattern(cid)}%`);
    } else {
      orParts.push(`customer_id.ilike.%${escapeIlike(cid)}%`);
    }
  }
  if (criteria.email) {
    orParts.push(`email.ilike.%${escapeIlike(criteria.email)}%`);
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

  const items = new Map<string, CustomerListItem>();
  for (const row of customerRows) {
    items.set(row.customer_key, rowToListItem(row));
  }

  if (criteria.reservationId) {
    const rid = criteria.reservationId.trim();
    const pattern = isIdLikeQuery(rid)
      ? `${idPrefixIlikePattern(rid)}%`
      : `%${escapeIlike(rid)}%`;
    const { data: reservations } = await supabase
      .from("reservations")
      .select(RESERVATION_PROFILE_SELECT)
      .ilike("reservation_id", pattern);

    const hits = (reservations ?? []).filter(
      (r) => !isIdLikeQuery(rid) || matchesIdPrefix(r.reservation_id, rid)
    ) as ReservationProfileRow[];
    await addReservationSearchHits(supabase, items, hits);
  }

  if (criteria.name) {
    await addReservationGuestNameSearchHits(supabase, items, criteria.name);
  }

  if (criteria.companionName) {
    await addCompanionNameSearchHits(
      supabase,
      items,
      criteria.companionName
    );
  }

  const customers = Array.from(items.values())
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

  const ephemeralReservationId = reservationIdFromEphemeralKey(id);
  if (ephemeralReservationId) {
    const { data: r } = await supabase
      .from("reservations")
      .select(`${RESERVATION_PROFILE_SELECT}, channel, is_archived`)
      .eq("reservation_id", ephemeralReservationId)
      .maybeSingle();
    if (!r) return { detail: null, error: null };

    const indexed = await loadIndexedCustomerByReservation(supabase, r);
    if (indexed) {
      return getCustomerDetailUncached(indexed.customer_id);
    }

    const row = r as ReservationProfileRow & {
      channel: string | null;
    };
    const detail: CustomerDetail = {
      ...ephemeralListItem(row),
      reservations: [
        {
          reservationId: row.reservation_id,
          checkIn: row.check_in,
          checkOut: row.check_out,
          status: row.status,
          channel: row.channel,
        },
      ],
    };
    return { detail, error: null };
  }

  let customer: DbCustomer | null = null;

  // customer_id での直指定を最優先し、見つからない場合に customer_key を試す。
  // 旧データには "CK--|..." のように記号入り customer_id が存在しうる。
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

  if (!customer) {
    const { data: orphanReservations } = await supabase
      .from("reservations")
      .select(`${RESERVATION_PROFILE_SELECT}, channel, is_archived`)
      .eq("customer_id", id)
      .order("check_in", { ascending: false });

    if (orphanReservations?.length) {
      const rows = orphanReservations as (ReservationProfileRow & {
        channel: string | null;
      })[];
      const indexed = await loadIndexedCustomerByReservation(supabase, rows[0]);
      if (indexed) {
        return getCustomerDetailUncached(indexed.customer_id);
      }

      const detail: CustomerDetail = {
        ...ephemeralListItemFromRows(rows),
        reservations: rows.map((r) => ({
          reservationId: r.reservation_id,
          checkIn: r.check_in,
          checkOut: r.check_out,
          status: r.status,
          channel: r.channel,
        })),
      };
      return { detail, error: null };
    }

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
  const fields = [
    "name",
    "companionName",
    "email",
    "phone",
    "reservationId",
    "customerId",
  ] as const;
  for (const f of fields) {
    const v = pick(f).trim();
    if (v) criteria[f] = v;
  }

  const q = pick("q").trim();
  if (q) {
    if (q.includes("@")) criteria.email = criteria.email || q;
    else if (/^[\d\-+()]+$/.test(q.replace(/\s/g, ""))) criteria.phone = criteria.phone || q;
    else if (/^CU-/i.test(q)) criteria.customerId = criteria.customerId || q;
    else if (/^CK-/i.test(q)) criteria.customerId = criteria.customerId || q;
    else if (isIdLikeQuery(q)) criteria.reservationId = criteria.reservationId || q;
    else criteria.name = criteria.name || q;
  }

  return criteria;
}

export function customerDetailPath(item: CustomerListItem): string {
  if (isEphemeralCustomerKey(item.customerKey)) {
    return `/customers/${encodeURIComponent(item.customerKey)}`;
  }
  const openId = item.customerId || item.customerKey;
  return `/customers/${encodeURIComponent(openId)}`;
}
