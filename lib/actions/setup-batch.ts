"use server";

import { after } from "next/server";
import {
  revalidateRequestDetailsBatch,
  revalidateReservationDetailsBatch,
  revalidateReservationMailFlagsBatch,
} from "@/lib/cache/revalidate";
import {
  validateRequestSetupPatch,
  validateReservationSetupPatch,
  type RequestSetupChange,
  type ReservationSetupChange,
} from "@/lib/services/setup-diff";
import { deleteLinkedProvisionalIfAny } from "@/lib/actions/request-provisional";
import { syncReservationToGCal } from "@/lib/services/gcal-sync";
import { applyRequestLinkAfterStatusChange } from "@/lib/services/request-reservation-link";
import { syncRoomAssignmentGuestBreakdown } from "@/lib/services/room-assignment-guest-sync";
import {
  clearRoomAssignmentsForReservation,
  shouldClearRoomAssignmentsOnStatus,
} from "@/lib/services/room-assignment-lifecycle";
import { createAdminClient, createStaffClient } from "@/lib/supabase/server";
import { updateRowWithLock } from "@/lib/utils/optimistic-lock";
import {
  normalizeGuestBreakdownForStorage,
  normalizeGuestTotalForStorage,
} from "@/lib/utils/guest-count-format";
import { normalizeRequestStatus } from "@/lib/domain/request-status";

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

function isReservationMailOnlyPatch(
  patch: ReservationSetupChange["patch"]
): boolean {
  const keys = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  return (
    keys.length > 0 &&
    keys.every((key) =>
      ["completion_email_sent", "day11_email_sent", "day3_email_sent"].includes(
        key
      )
    )
  );
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
  const detailRevalidateIds: string[] = [];
  const mailRevalidateIds: string[] = [];

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
    if (p.guest_total !== undefined) {
      dbPatch.guest_total = normalizeGuestTotalForStorage(p.guest_total);
    }
    if (p.adult_male !== undefined) {
      dbPatch.adult_male = normalizeGuestBreakdownForStorage(p.adult_male);
    }
    if (p.adult_female !== undefined) {
      dbPatch.adult_female = normalizeGuestBreakdownForStorage(p.adult_female);
    }
    if (p.boy_student !== undefined) {
      dbPatch.boy_student = normalizeGuestBreakdownForStorage(p.boy_student);
    }
    if (p.girl_student !== undefined) {
      dbPatch.girl_student = normalizeGuestBreakdownForStorage(p.girl_student);
    }
    if (p.age_3plus !== undefined) {
      dbPatch.age_3plus = normalizeGuestBreakdownForStorage(p.age_3plus);
    }
    if (p.under_3 !== undefined) {
      dbPatch.under_3 = normalizeGuestBreakdownForStorage(p.under_3);
    }
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

    if (p.status !== undefined && shouldClearRoomAssignmentsOnStatus(p.status)) {
      await clearRoomAssignmentsForReservation(supabase, change.reservationId);
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

    // タイトル・説明に出る項目（人数・ステータス・メモ等）は GCal へ反映
    gcalIds.push(change.reservationId);
    if (isReservationMailOnlyPatch(change.patch)) {
      mailRevalidateIds.push(change.reservationId);
    } else {
      detailRevalidateIds.push(change.reservationId);
    }
    updated += 1;
  }

  if (mailRevalidateIds.length) {
    revalidateReservationMailFlagsBatch(mailRevalidateIds);
  }
  if (detailRevalidateIds.length) {
    revalidateReservationDetailsBatch(detailRevalidateIds);
  }

  if (gcalIds.length) {
    const uniqueIds = [...new Set(gcalIds)];
    after(async () => {
      const admin = createAdminClient();
      for (const id of uniqueIds) {
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
  const requestRevalidateIds: string[] = [];
  const linkedReservationIds: string[] = [];

  for (const change of changes) {
    const invalid = validateRequestSetupPatch(change.patch);
    if (invalid) {
      failures.push({ id: change.requestId, message: invalid });
      continue;
    }

    const { data: current, error: loadError } = await supabase
      .from("reservation_requests")
      .select(
        "request_id, status, linked_reservation_id, access_key, updated_at"
      )
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

    const previousLinked = current.linked_reservation_id as string | null;
    let nextLinked = previousLinked;

    if (p.status !== undefined) {
      const status = normalizeRequestStatus(p.status);
      if (!status) {
        failures.push({ id: change.requestId, message: "ステータスが不正です。" });
        continue;
      }
      // 一覧設定では仮予約の自動作成はしない。差し戻し時はリンク解除。
      if (status === "リクエスト" || status === "却下") {
        nextLinked = await deleteLinkedProvisionalIfAny(
          supabase,
          change.requestId,
          previousLinked
        );
        if (nextLinked) nextLinked = null;
      }
      dbPatch.status = status;
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

    if (p.status !== undefined) {
      const sync = await applyRequestLinkAfterStatusChange(supabase, {
        requestId: change.requestId,
        previousLinkedId: previousLinked,
        nextLinkedId: nextLinked,
        accessKey: (current.access_key as string | null) ?? null,
      });
      if (!sync.ok) {
        failures.push({ id: change.requestId, message: sync.message });
        continue;
      }
    }

    requestRevalidateIds.push(change.requestId);
    if (nextLinked) linkedReservationIds.push(nextLinked);
    if (previousLinked && previousLinked !== nextLinked) {
      linkedReservationIds.push(previousLinked);
    }
    updated += 1;
  }

  revalidateRequestDetailsBatch(requestRevalidateIds, linkedReservationIds);

  if (updated === 0 && failures.length) {
    return {
      ok: false,
      message: failures[0]?.message ?? "保存に失敗しました。",
      failures,
    };
  }

  return { ok: true, updated, failures };
}
