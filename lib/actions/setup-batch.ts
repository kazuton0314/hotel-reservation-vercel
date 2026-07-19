"use server";

import { after } from "next/server";
import {
  revalidateRequestDetail,
  revalidateReservationDetail,
  revalidateReservationsList,
} from "@/lib/cache/revalidate";
import {
  validateRequestSetupPatch,
  validateReservationSetupPatch,
  type RequestSetupChange,
  type ReservationSetupChange,
} from "@/lib/services/setup-diff";
import { deleteLinkedProvisionalIfAny } from "@/lib/actions/request-provisional";
import { syncReservationToGCal } from "@/lib/services/gcal-sync";
import { syncRoomAssignmentGuestBreakdown } from "@/lib/services/room-assignment-guest-sync";
import { createAdminClient, createStaffClient } from "@/lib/supabase/server";
import { updateRowWithLock } from "@/lib/utils/optimistic-lock";

export type SetupBatchResult =
  | {
      ok: true;
      updated: number;
      failures: { id: string; message: string }[];
    }
  | {
      ok: false;
      message: string;
      failures?: { id: string; message: string }[];
    };

function applyMailFlag(
  patch: Record<string, unknown>,
  flag: string,
  at: string,
  value: boolean | undefined,
  nowIso: string
) {
  if (value === undefined) return;
  patch[flag] = value;
  patch[at] = value ? nowIso : null;
}

export async function batchUpdateReservationsSetupAction(
  changes: ReservationSetupChange[]
): Promise<SetupBatchResult> {
  if (!changes.length) {
    return { ok: true, updated: 0, failures: [] };
  }

  const supabase = await createStaffClient();
  const failures: { id: string; message: string }[] = [];
  let updated = 0;
  const gcalIds: string[] = [];

  for (const change of changes) {
    const invalid = validateReservationSetupPatch(change.patch);
    if (invalid) {
      failures.push({ id: change.reservationId, message: invalid });
      continue;
    }

    const nowIso = new Date().toISOString();
    const p = change.patch;
    const dbPatch: Record<string, unknown> = { updated_at: nowIso };

    if (p.status !== undefined) dbPatch.status = p.status;
    if (p.guest_total !== undefined) dbPatch.guest_total = p.guest_total || null;
    if (p.adult_male !== undefined) dbPatch.adult_male = p.adult_male || null;
    if (p.adult_female !== undefined) {
      dbPatch.adult_female = p.adult_female || null;
    }
    if (p.boy_student !== undefined) dbPatch.boy_student = p.boy_student || null;
    if (p.girl_student !== undefined) {
      dbPatch.girl_student = p.girl_student || null;
    }
    if (p.age_3plus !== undefined) dbPatch.age_3plus = p.age_3plus || null;
    if (p.under_3 !== undefined) dbPatch.under_3 = p.under_3 || null;
    if (p.referral !== undefined) dbPatch.referral = p.referral || null;
    if (p.travel_purpose !== undefined) {
      dbPatch.travel_purpose = p.travel_purpose || null;
    }
    if (p.payment_status !== undefined) {
      dbPatch.payment_status = p.payment_status || null;
    }
    if (p.internal_memo !== undefined) {
      dbPatch.internal_memo = p.internal_memo.trim() || null;
    }

    applyMailFlag(
      dbPatch,
      "completion_email_sent",
      "completion_email_sent_at",
      p.completion_email_sent,
      nowIso
    );
    applyMailFlag(
      dbPatch,
      "day11_email_sent",
      "day11_email_sent_at",
      p.day11_email_sent,
      nowIso
    );
    applyMailFlag(
      dbPatch,
      "day3_email_sent",
      "day3_email_sent_at",
      p.day3_email_sent,
      nowIso
    );

    const result = await updateRowWithLock<Record<string, unknown>>({
      supabase,
      table: "reservations",
      idColumn: "reservation_id",
      idValue: change.reservationId,
      expectedUpdatedAt: change.expectedUpdatedAt,
      patch: dbPatch,
    });

    if (!result.ok) {
      failures.push({ id: change.reservationId, message: result.message });
      continue;
    }

    const guestTouched =
      p.adult_male !== undefined ||
      p.adult_female !== undefined ||
      p.boy_student !== undefined ||
      p.girl_student !== undefined ||
      p.age_3plus !== undefined ||
      p.under_3 !== undefined;

    if (guestTouched) {
      const { data: current } = await supabase
        .from("reservations")
        .select(
          "adult_male, adult_female, boy_student, girl_student, age_3plus, under_3"
        )
        .eq("reservation_id", change.reservationId)
        .maybeSingle();
      if (current) {
        await syncRoomAssignmentGuestBreakdown(supabase, change.reservationId, {
          adult_male: current.adult_male,
          adult_female: current.adult_female,
          boy_student: current.boy_student,
          girl_student: current.girl_student,
          age_3plus: current.age_3plus,
          under_3: current.under_3,
        });
      }
    }

    if (p.status !== undefined) {
      gcalIds.push(change.reservationId);
    }

    revalidateReservationDetail(change.reservationId);
    updated += 1;
  }

  if (gcalIds.length) {
    after(async () => {
      const admin = createAdminClient();
      for (const id of gcalIds) {
        await syncReservationToGCal(admin, id);
      }
    });
  }

  if (updated === 0 && failures.length) {
    return {
      ok: false,
      message: failures[0]?.message ?? "保存に失敗しました。",
      failures,
    };
  }

  return { ok: true, updated, failures };
}

export async function batchUpdateRequestsSetupAction(
  changes: RequestSetupChange[]
): Promise<SetupBatchResult> {
  if (!changes.length) {
    return { ok: true, updated: 0, failures: [] };
  }

  const supabase = await createStaffClient();
  const failures: { id: string; message: string }[] = [];
  let updated = 0;

  for (const change of changes) {
    const invalid = validateRequestSetupPatch(change.patch);
    if (invalid) {
      failures.push({ id: change.requestId, message: invalid });
      continue;
    }

    const { data: current, error: loadError } = await supabase
      .from("reservation_requests")
      .select("*")
      .eq("request_id", change.requestId)
      .maybeSingle();

    if (loadError || !current) {
      failures.push({
        id: change.requestId,
        message: loadError?.message ?? "リクエストが見つかりません。",
      });
      continue;
    }

    const nowIso = new Date().toISOString();
    const p = change.patch;
    const dbPatch: Record<string, unknown> = { updated_at: nowIso };

    let nextLinked = current.linked_reservation_id as string | null;

    if (p.status !== undefined) {
      // 一覧設定では仮予約の自動作成はしない。戻すときだけ連携解除。
      if (p.status === "リクエスト") {
        nextLinked = await deleteLinkedProvisionalIfAny(
          supabase,
          change.requestId,
          nextLinked
        );
      }
      if (p.status === "本予約連携済" && !nextLinked) {
        failures.push({
          id: change.requestId,
          message: "本予約連携済にする場合は連携予約IDが必要です。",
        });
        continue;
      }
      dbPatch.status = p.status;
      dbPatch.linked_reservation_id = nextLinked;
      dbPatch.reject_reason = null;
    }

    if (p.internal_memo !== undefined) {
      dbPatch.internal_memo = p.internal_memo.trim() || null;
    }

    if (p.reply_email_sent !== undefined) {
      dbPatch.reply_email_sent = p.reply_email_sent;
      dbPatch.reply_email_sent_at = p.reply_email_sent ? nowIso : null;
    }

    const result = await updateRowWithLock<Record<string, unknown>>({
      supabase,
      table: "reservation_requests",
      idColumn: "request_id",
      idValue: change.requestId,
      expectedUpdatedAt: change.expectedUpdatedAt,
      patch: dbPatch,
    });

    if (!result.ok) {
      failures.push({ id: change.requestId, message: result.message });
      continue;
    }

    revalidateRequestDetail(change.requestId);
    revalidateReservationsList();
    if (nextLinked) {
      revalidateReservationDetail(nextLinked);
    }
    updated += 1;
  }

  if (updated === 0 && failures.length) {
    return {
      ok: false,
      message: failures[0]?.message ?? "保存に失敗しました。",
      failures,
    };
  }

  return { ok: true, updated, failures };
}
