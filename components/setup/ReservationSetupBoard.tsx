"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SetupCommitBar } from "@/components/setup/SetupCommitBar";
import {
  SetupRoomPicker,
  type SetupRoomOption,
} from "@/components/setup/SetupRoomPicker";
import { SetupMultiCheckPicker } from "@/components/setup/SetupMultiCheckPicker";
import { batchRoomAssignmentChangesAction } from "@/lib/actions/room-assignments";
import { batchUpdateReservationsSetupAction } from "@/lib/actions/setup-batch";
import {
  optionsWithCurrent,
  optionsWithCurrentValues,
  parseMultiSelectValues,
  joinMultiSelectValues,
  PAYMENT_STATUS_OPTIONS,
  REFERRAL_OPTIONS,
  RESERVATION_STATUS_OPTIONS,
  TRAVEL_PURPOSE_OPTIONS,
} from "@/lib/config/field-options";
import {
  getFullPath,
  loadJson,
  removeStorageKey,
  saveJson,
  setupDraftStorageKey,
} from "@/lib/nav/session-memory";
import type { ReservationListItem } from "@/lib/queries/reservations";
import { applyReservationListFilter } from "@/lib/services/reservation-list-filter";
import {
  computeReservationRoomChanges,
  computeReservationSetupChanges,
  countReservationSetupDirties,
  toReservationSetupEditable,
  type ReservationSetupEditable,
} from "@/lib/services/setup-diff";
import { filterListBySearch } from "@/lib/utils/list-search";
import { parseListSort, sortListItems } from "@/lib/utils/list-sort";
import { markLocalDataMutation } from "@/lib/utils/local-mutation";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

type Props = {
  reservations: ReservationListItem[];
  rooms: SetupRoomOption[];
};

type StoredReservationDraft = {
  sourceKey: string;
  draftRows: ReservationSetupEditable[];
};

const GUEST_COLS = [
  ["guest_total", "合計"],
  ["adult_male", "男"],
  ["adult_female", "女"],
  ["boy_student", "小♂"],
  ["girl_student", "小♀"],
  ["age_3plus", "3↑"],
  ["under_3", "3↓"],
] as const;

function cloneRows(rows: ReservationSetupEditable[]): ReservationSetupEditable[] {
  return rows.map((r) => ({
    ...r,
    room_ids: [...r.room_ids],
    base_assignments: r.base_assignments.map((a) => ({ ...a })),
  }));
}

export function ReservationSetupBoard({ reservations, rooms }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fullPath = getFullPath(pathname, searchParams);
  const draftKey = setupDraftStorageKey(fullPath);
  const q = searchParams.get("q") ?? undefined;
  const checkIn = searchParams.get("checkIn") ?? undefined;
  const filterField = searchParams.get("filterField") ?? undefined;
  const filterValue = searchParams.get("filterValue") ?? undefined;
  const sort = parseListSort(searchParams.get("sort"), searchParams.get("dir"));

  const filteredSource = useMemo(() => {
    const filtered = applyReservationListFilter(
      reservations,
      filterField,
      filterValue
    );
    const searched = filterListBySearch(
      filtered.map((item) => ({ ...item, id: item.reservation_id })),
      q,
      checkIn
    );
    return sortListItems(searched, sort);
  }, [reservations, filterField, filterValue, q, checkIn, sort]);

  const sourceKey = useMemo(
    () =>
      filteredSource
        .map(
          (r) =>
            `${r.reservation_id}:${r.updated_at ?? ""}:${r.assignments
              .map((a) => a.room_assignment_id)
              .join(",")}`
        )
        .join("|"),
    [filteredSource]
  );

  const [baseRows, setBaseRows] = useState<ReservationSetupEditable[]>([]);
  const [draftRows, setDraftRows] = useState<ReservationSetupEditable[]>([]);
  const [committing, setCommitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    document.body.classList.add("setup-active");
    return () => {
      document.body.classList.remove("setup-active");
    };
  }, []);

  useEffect(() => {
    const next = filteredSource.map(toReservationSetupEditable);
    const base = cloneRows(next);
    setBaseRows(base);
    const stored = loadJson<StoredReservationDraft>(draftKey);
    if (stored && stored.sourceKey === sourceKey && stored.draftRows?.length) {
      setDraftRows(cloneRows(stored.draftRows));
    } else {
      setDraftRows(cloneRows(next));
      if (stored) removeStorageKey(draftKey);
    }
    setHydrated(true);
  }, [sourceKey, draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirtyIds = useMemo(
    () => countReservationSetupDirties(baseRows, draftRows),
    [baseRows, draftRows]
  );
  const dirtyCount = dirtyIds.size;

  useEffect(() => {
    if (!hydrated) return;
    if (dirtyCount === 0) {
      removeStorageKey(draftKey);
      return;
    }
    const timer = window.setTimeout(() => {
      saveJson<StoredReservationDraft>(draftKey, {
        sourceKey,
        draftRows,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hydrated, dirtyCount, draftKey, sourceKey, draftRows]);

  const updateRow = useCallback(
    (id: string, patch: Partial<ReservationSetupEditable>) => {
      setDraftRows((prev) =>
        prev.map((row) =>
          row.reservation_id === id ? { ...row, ...patch } : row
        )
      );
    },
    []
  );

  const handleDiscard = () => {
    if (dirtyCount === 0) return;
    if (!window.confirm("未保存の変更をすべて破棄しますか？")) return;
    setDraftRows(cloneRows(baseRows));
    removeStorageKey(draftKey);
  };

  const handleSave = async () => {
    const fieldChanges = computeReservationSetupChanges(baseRows, draftRows);
    const roomChanges = computeReservationRoomChanges(baseRows, draftRows);
    if (!fieldChanges.length && !roomChanges.length) return;

    if (
      !window.confirm(
        `変更をまとめて保存しますか？（予約 ${fieldChanges.length} 件 / 部屋割操作 ${roomChanges.length} 件）`
      )
    ) {
      return;
    }

    setCommitting(true);
    markLocalDataMutation(30_000);
    try {
      if (fieldChanges.length) {
        const result = await batchUpdateReservationsSetupAction(fieldChanges);
        if (!result.ok) {
          showErrorToast(result.message);
          return;
        }
        if (result.failures.length) {
          showErrorToast(
            `予約 ${result.updated} 件保存、${result.failures.length} 件失敗`
          );
        }
      }

      if (roomChanges.length) {
        let roomResult = await batchRoomAssignmentChangesAction(
          roomChanges,
          false
        );
        if (!roomResult.ok && roomResult.needsConfirm) {
          if (!window.confirm(roomResult.message)) return;
          roomResult = await batchRoomAssignmentChangesAction(
            roomChanges,
            true
          );
        }
        if (!roomResult.ok) {
          showErrorToast(roomResult.message || "部屋割の保存に失敗しました");
          return;
        }
      }

      showSuccessToast("保存しました");
      removeStorageKey(draftKey);
      router.refresh();
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="setup-page">
      <div className="setup-page-toolbar">
        <SetupCommitBar
          listHref="/reservations"
          dirtyCount={dirtyCount}
          committing={committing}
          onDiscard={handleDiscard}
          onSave={handleSave}
        />
        <p className="setup-summary">{draftRows.length}件</p>
      </div>

      <div className="setup-table-wrap">
        <table className="setup-sheet">
          <thead>
            <tr>
              <th className="setup-sticky setup-col-id">予約ID</th>
              <th className="setup-sticky setup-col-name">氏名</th>
              <th>CI</th>
              <th>ステータス</th>
              {GUEST_COLS.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
              <th>部屋割</th>
              <th>旅行の目的</th>
              <th>きっかけ</th>
              <th>確定M</th>
              <th>11前M</th>
              <th>3前M</th>
              <th>支払</th>
              <th>メモ</th>
            </tr>
          </thead>
          <tbody>
            {draftRows.length === 0 ? (
              <tr>
                <td colSpan={17} className="setup-empty">
                  対象の本予約がありません
                </td>
              </tr>
            ) : (
              draftRows.map((row) => {
                const dirty = dirtyIds.has(row.reservation_id);
                return (
                  <tr
                    key={row.reservation_id}
                    className={dirty ? "is-dirty" : undefined}
                  >
                    <td className="setup-sticky setup-col-id">
                      <Link href={`/reservations/${row.reservation_id}`}>
                        {row.reservation_id}
                      </Link>
                    </td>
                    <td
                      className="setup-sticky setup-col-name"
                      title={row.representative_name ?? ""}
                    >
                      {row.representative_name || "—"}
                    </td>
                    <td className="setup-text">{row.check_in || "—"}</td>
                    <td>
                      <select
                        className="setup-cell"
                        value={row.status}
                        onChange={(e) =>
                          updateRow(row.reservation_id, {
                            status: e.target.value,
                          })
                        }
                      >
                        {optionsWithCurrent(
                          RESERVATION_STATUS_OPTIONS,
                          row.status
                        ).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    {GUEST_COLS.map(([key]) => (
                      <td key={key}>
                        <input
                          className="setup-cell setup-cell-num"
                          type="text"
                          inputMode="numeric"
                          value={row[key]}
                          onChange={(e) =>
                            updateRow(row.reservation_id, {
                              [key]: e.target.value,
                            })
                          }
                        />
                      </td>
                    ))}
                    <td className="setup-col-rooms">
                      <SetupRoomPicker
                        rooms={rooms}
                        value={row.room_ids}
                        onChange={(room_ids) =>
                          updateRow(row.reservation_id, { room_ids })
                        }
                        disabled={!row.check_in || !row.check_out}
                      />
                    </td>
                    <td className="setup-col-rooms">
                      <SetupMultiCheckPicker
                        options={optionsWithCurrentValues(
                          TRAVEL_PURPOSE_OPTIONS,
                          row.travel_purpose
                        ).map((v) => ({ value: v, label: v }))}
                        value={parseMultiSelectValues(row.travel_purpose)}
                        onChange={(vals) =>
                          updateRow(row.reservation_id, {
                            travel_purpose: joinMultiSelectValues(vals),
                          })
                        }
                        emptyLabel="—"
                      />
                    </td>
                    <td>
                      <select
                        className="setup-cell"
                        value={row.referral}
                        onChange={(e) =>
                          updateRow(row.reservation_id, {
                            referral: e.target.value,
                          })
                        }
                      >
                        <option value="">—</option>
                        {optionsWithCurrent(REFERRAL_OPTIONS, row.referral).map(
                          (opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          )
                        )}
                      </select>
                    </td>
                    <td className="setup-col-flag">
                      <input
                        type="checkbox"
                        checked={row.completion_email_sent}
                        onChange={(e) =>
                          updateRow(row.reservation_id, {
                            completion_email_sent: e.target.checked,
                          })
                        }
                        aria-label="確定メール済"
                      />
                    </td>
                    <td className="setup-col-flag">
                      <input
                        type="checkbox"
                        checked={row.day11_email_sent}
                        onChange={(e) =>
                          updateRow(row.reservation_id, {
                            day11_email_sent: e.target.checked,
                          })
                        }
                        aria-label="11日前メール済"
                      />
                    </td>
                    <td className="setup-col-flag">
                      <input
                        type="checkbox"
                        checked={row.day3_email_sent}
                        onChange={(e) =>
                          updateRow(row.reservation_id, {
                            day3_email_sent: e.target.checked,
                          })
                        }
                        aria-label="3日前メール済"
                      />
                    </td>
                    <td>
                      <select
                        className="setup-cell"
                        value={row.payment_status}
                        onChange={(e) =>
                          updateRow(row.reservation_id, {
                            payment_status: e.target.value,
                          })
                        }
                      >
                        <option value="">—</option>
                        {optionsWithCurrent(
                          PAYMENT_STATUS_OPTIONS,
                          row.payment_status
                        ).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="setup-cell setup-cell-memo"
                        type="text"
                        value={row.internal_memo}
                        onChange={(e) =>
                          updateRow(row.reservation_id, {
                            internal_memo: e.target.value,
                          })
                        }
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
