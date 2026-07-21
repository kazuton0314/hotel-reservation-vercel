"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SetupCommitBar } from "@/components/setup/SetupCommitBar";
import { batchUpdateRequestsSetupAction } from "@/lib/actions/setup-batch";
import {
  optionsWithCurrent,
  REQUEST_STATUS_EDIT_OPTIONS,
} from "@/lib/config/field-options";
import {
  getFullPath,
  loadJson,
  removeStorageKey,
  saveJson,
  setupDraftStorageKey,
} from "@/lib/nav/session-memory";
import type { RequestListItem } from "@/lib/queries/requests";
import {
  computeRequestSetupChanges,
  toRequestSetupEditable,
  type RequestSetupEditable,
} from "@/lib/services/setup-diff";
import { applyRequestListFilter } from "@/lib/services/request-list-filter";
import { filterListBySearch } from "@/lib/utils/list-search";
import { parseListSort, sortListItems } from "@/lib/utils/list-sort";
import { markLocalDataMutation } from "@/lib/utils/local-mutation";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

type Props = {
  requests: RequestListItem[];
};

type StoredRequestDraft = {
  sourceKey: string;
  draftRows: RequestSetupEditable[];
};

function cloneRows(rows: RequestSetupEditable[]): RequestSetupEditable[] {
  return rows.map((r) => ({ ...r }));
}

export function RequestSetupBoard({ requests }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fullPath = getFullPath(pathname, searchParams);
  const draftKey = setupDraftStorageKey(fullPath);
  const q = searchParams.get("q") ?? undefined;
  const checkIn = searchParams.get("checkIn") ?? undefined;
  const filterField = searchParams.get("filterField") ?? undefined;
  const filterValue = searchParams.get("filterValue") ?? undefined;
  const sort =
    searchParams.get("sort") || searchParams.get("dir")
      ? parseListSort(searchParams.get("sort"), searchParams.get("dir"))
      : ({ field: "received", dir: "desc" } as const);

  const filteredSource = useMemo(() => {
    const filtered = applyRequestListFilter(requests, filterField, filterValue);
    const searched = filterListBySearch(
      filtered.map((item) => ({ ...item, id: item.request_id })),
      q,
      checkIn
    );
    return sortListItems(searched, sort);
  }, [requests, filterField, filterValue, q, checkIn, sort]);

  const sourceKey = useMemo(
    () =>
      filteredSource.map((r) => `${r.request_id}:${r.updated_at}`).join("|"),
    [filteredSource]
  );

  const [baseRows, setBaseRows] = useState<RequestSetupEditable[]>([]);
  const [draftRows, setDraftRows] = useState<RequestSetupEditable[]>([]);
  const [committing, setCommitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    document.body.classList.add("setup-active");
    return () => {
      document.body.classList.remove("setup-active");
    };
  }, []);

  useEffect(() => {
    const next = filteredSource.map(toRequestSetupEditable);
    setBaseRows(cloneRows(next));
    const stored = loadJson<StoredRequestDraft>(draftKey);
    if (stored && stored.sourceKey === sourceKey && stored.draftRows?.length) {
      setDraftRows(cloneRows(stored.draftRows));
    } else {
      setDraftRows(cloneRows(next));
      if (stored) removeStorageKey(draftKey);
    }
    setHydrated(true);
  }, [sourceKey, draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirtyIds = useMemo(() => {
    const baseMap = new Map(baseRows.map((r) => [r.request_id, r]));
    const ids = new Set<string>();
    for (const draft of draftRows) {
      const base = baseMap.get(draft.request_id);
      if (!base) continue;
      if (computeRequestSetupChanges([base], [draft]).length) {
        ids.add(draft.request_id);
      }
    }
    return ids;
  }, [baseRows, draftRows]);

  const dirtyCount = dirtyIds.size;

  useEffect(() => {
    if (!hydrated) return;
    if (dirtyCount === 0) {
      removeStorageKey(draftKey);
      return;
    }
    const timer = window.setTimeout(() => {
      saveJson<StoredRequestDraft>(draftKey, {
        sourceKey,
        draftRows,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hydrated, dirtyCount, draftKey, sourceKey, draftRows]);

  const updateRow = useCallback(
    (id: string, patch: Partial<RequestSetupEditable>) => {
      setDraftRows((prev) =>
        prev.map((row) => (row.request_id === id ? { ...row, ...patch } : row))
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
    const changes = computeRequestSetupChanges(baseRows, draftRows);
    if (!changes.length) return;
    if (
      !window.confirm(`${changes.length} 件のリクエストをまとめて保存しますか？`)
    ) {
      return;
    }
    setCommitting(true);
    markLocalDataMutation(30_000);
    try {
      const result = await batchUpdateRequestsSetupAction(changes);
      if (!result.ok) {
        showErrorToast(result.message);
        return;
      }
      if (result.failures.length) {
        showErrorToast(
          `${result.updated} 件保存、${result.failures.length} 件失敗`
        );
      } else {
        showSuccessToast(`${result.updated} 件を保存しました`);
      }
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
          listHref="/requests"
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
              <th className="setup-sticky setup-col-id">リクエストID</th>
              <th className="setup-sticky setup-col-name">氏名</th>
              <th>希望日</th>
              <th>人数</th>
              <th>ステータス</th>
              <th>返信M</th>
              <th>メモ</th>
            </tr>
          </thead>
          <tbody>
            {draftRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="setup-empty">
                  対象のリクエストがありません
                </td>
              </tr>
            ) : (
              draftRows.map((row) => {
                const dirty = dirtyIds.has(row.request_id);
                return (
                  <tr
                    key={row.request_id}
                    className={dirty ? "is-dirty" : undefined}
                  >
                    <td className="setup-sticky setup-col-id">
                      <Link href={`/requests/${row.request_id}`}>
                        {row.request_id}
                      </Link>
                    </td>
                    <td
                      className="setup-sticky setup-col-name"
                      title={row.representative_name ?? ""}
                    >
                      {row.representative_name || "—"}
                    </td>
                    <td className="setup-text">{row.check_in || "—"}</td>
                    <td className="setup-text">{row.guest_total || "—"}</td>
                    <td>
                      <select
                        className="setup-cell"
                        value={row.status}
                        onChange={(e) =>
                          updateRow(row.request_id, { status: e.target.value })
                        }
                      >
                        {optionsWithCurrent(
                          REQUEST_STATUS_EDIT_OPTIONS,
                          row.status
                        ).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="setup-col-flag">
                      <input
                        type="checkbox"
                        checked={row.reply_email_sent}
                        onChange={(e) =>
                          updateRow(row.request_id, {
                            reply_email_sent: e.target.checked,
                          })
                        }
                        aria-label="返信メール済"
                      />
                    </td>
                    <td>
                      <input
                        className="setup-cell setup-cell-memo"
                        type="text"
                        value={row.internal_memo}
                        onChange={(e) =>
                          updateRow(row.request_id, {
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
