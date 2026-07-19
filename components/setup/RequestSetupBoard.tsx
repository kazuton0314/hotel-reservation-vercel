"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SetupCommitBar } from "@/components/setup/SetupCommitBar";
import { Button } from "@/components/ui/button";
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
import { useRememberedScrollArea } from "@/lib/nav/use-remembered-scroll-area";
import type { RequestListItem } from "@/lib/queries/requests";
import {
  computeRequestSetupChanges,
  toRequestSetupEditable,
  type RequestSetupEditable,
} from "@/lib/services/setup-diff";
import { filterListBySearch } from "@/lib/utils/list-search";
import { parseListSort, sortListItems } from "@/lib/utils/list-sort";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

type Props = {
  requests: RequestListItem[];
};

type StoredRequestDraft = {
  sourceKey: string;
  draftRows: RequestSetupEditable[];
  selected: string[];
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
  const tableScrollRef = useRememberedScrollArea("setup-table");
  const q = searchParams.get("q") ?? undefined;
  const checkIn = searchParams.get("checkIn") ?? undefined;
  const sort =
    searchParams.get("sort") || searchParams.get("dir")
      ? parseListSort(searchParams.get("sort"), searchParams.get("dir"))
      : ({ field: "received", dir: "desc" } as const);

  const filteredSource = useMemo(() => {
    const searched = filterListBySearch(
      requests.map((item) => ({ ...item, id: item.request_id })),
      q,
      checkIn
    );
    return sortListItems(searched, sort);
  }, [requests, q, checkIn, sort]);

  const sourceKey = useMemo(
    () =>
      filteredSource.map((r) => `${r.request_id}:${r.updated_at}`).join("|"),
    [filteredSource]
  );

  const [baseRows, setBaseRows] = useState<RequestSetupEditable[]>([]);
  const [draftRows, setDraftRows] = useState<RequestSetupEditable[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkReply, setBulkReply] = useState("");

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
      setSelected(new Set(stored.selected ?? []));
    } else {
      setDraftRows(cloneRows(next));
      setSelected(new Set());
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
        selected: [...selected],
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hydrated, dirtyCount, draftKey, sourceKey, draftRows, selected]);

  const updateRow = useCallback(
    (id: string, patch: Partial<RequestSetupEditable>) => {
      setDraftRows((prev) =>
        prev.map((row) => (row.request_id === id ? { ...row, ...patch } : row))
      );
    },
    []
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === draftRows.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(draftRows.map((r) => r.request_id)));
  };

  const applyBulk = () => {
    if (!selected.size) {
      showErrorToast("行を選択してください。");
      return;
    }
    if (!bulkStatus && !bulkReply) {
      showErrorToast("一括適用する項目を選んでください。");
      return;
    }
    setDraftRows((prev) =>
      prev.map((row) => {
        if (!selected.has(row.request_id)) return row;
        const next = { ...row };
        if (bulkStatus) next.status = bulkStatus;
        if (bulkReply === "sent") next.reply_email_sent = true;
        if (bulkReply === "unsent") next.reply_email_sent = false;
        return next;
      })
    );
    showSuccessToast(`${selected.size} 件に適用しました（まだ未保存）`);
  };

  const handleDiscard = () => {
    if (dirtyCount === 0) return;
    if (!window.confirm("未保存の変更をすべて破棄しますか？")) return;
    setDraftRows(cloneRows(baseRows));
    setSelected(new Set());
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
      <SetupCommitBar
        listHref="/requests"
        dirtyCount={dirtyCount}
        selectedCount={selected.size}
        committing={committing}
        onDiscard={handleDiscard}
        onSave={handleSave}
      />

      <div className="setup-bulk-bar">
        <span className="setup-bulk-label">選択した行に適用</span>
        <select
          className="setup-cell"
          value={bulkStatus}
          onChange={(e) => setBulkStatus(e.target.value)}
          aria-label="一括ステータス"
        >
          <option value="">ステータス…</option>
          {REQUEST_STATUS_EDIT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <select
          className="setup-cell"
          value={bulkReply}
          onChange={(e) => setBulkReply(e.target.value)}
          aria-label="一括返信メール"
        >
          <option value="">返信メール…</option>
          <option value="sent">済にする</option>
          <option value="unsent">未にする</option>
        </select>
        <Button type="button" size="sm" variant="secondary" onClick={applyBulk}>
          適用
        </Button>
      </div>

      <p className="setup-summary">
        {draftRows.length} 件表示 ／ 各セルを直接編集 ／ 人数は参照のみ ／
        承認時の仮予約作成は詳細から
      </p>

      <div className="setup-table-wrap" ref={tableScrollRef}>
        <table className="setup-sheet">
          <thead>
            <tr>
              <th className="setup-sticky setup-col-check">
                <input
                  type="checkbox"
                  checked={
                    draftRows.length > 0 && selected.size === draftRows.length
                  }
                  onChange={toggleSelectAll}
                  aria-label="すべて選択"
                />
              </th>
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
                <td colSpan={8} className="setup-empty">
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
                    <td className="setup-sticky setup-col-check">
                      <input
                        type="checkbox"
                        checked={selected.has(row.request_id)}
                        onChange={() => toggleSelect(row.request_id)}
                        aria-label={`${row.request_id} を選択`}
                      />
                    </td>
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
