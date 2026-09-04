"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  confirmRequestReservationLinkAction,
  previewRenameReservationIdAction,
  renameReservationIdAction,
} from "@/lib/actions/ops";
import { mergeCustomersAction } from "@/lib/actions/customers";
import type { CustomerMergeCandidate, LinkCandidate, LinkCandidateSide } from "@/lib/queries/ops";
import type { ReservationIdRefCounts } from "@/lib/services/rename-reservation-id";
import { Button } from "@/components/ui/button";
import { formatDisplayName } from "@/lib/utils/display-name";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

type Props = {
  linkCandidates: LinkCandidate[];
  mergeCandidates: CustomerMergeCandidate[];
};

type RenamePreview = {
  fromId: string;
  representativeName: string | null;
  status: string | null;
  checkIn: string | null;
  refs: ReservationIdRefCounts;
};

function formatRefSummary(refs: ReservationIdRefCounts): string {
  return [
    `部屋割 ${refs.roomAssignments}`,
    `同行者 ${refs.companions}`,
    `RQ連携 ${refs.linkedRequests}`,
    `取込ログ ${refs.formImportLogs}`,
    `メールログ ${refs.mailLogs}`,
  ].join(" / ");
}

function scoreLabel(score: number) {
  if (score >= 80) return "高";
  if (score >= 70) return "中";
  return "低";
}

function stayLabel(side: LinkCandidateSide) {
  const from = side.checkIn ?? "—";
  const to = side.checkOut ?? "—";
  return `${from}〜${to}`;
}

function guestLabel(side: LinkCandidateSide) {
  const g = String(side.guestTotal ?? "").trim();
  if (!g) return "人数—";
  if (/^\d+$/.test(g)) return `${g}名`;
  return g;
}

function CandidateSideCard({
  kind,
  side,
  href,
}: {
  kind: "リクエスト" | "本予約";
  side: LinkCandidateSide;
  href: string;
}) {
  return (
    <div>
      <p className="settings-candidate-label">{kind}</p>
      <p className="settings-candidate-name">
        {formatDisplayName(side.name) || "—"}
      </p>
      <p className="settings-candidate-meta">
        {side.id} / {stayLabel(side)}
      </p>
      <p className="settings-candidate-meta">
        {side.status ?? "—"} · {guestLabel(side)}
      </p>
      <Link href={href} className="settings-link">
        {kind}を開く
      </Link>
    </div>
  );
}

export function OperationsConsole({ linkCandidates, mergeCandidates }: Props) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [renameFromId, setRenameFromId] = useState("");
  const [renameToId, setRenameToId] = useState("");
  const [renamePreview, setRenamePreview] = useState<RenamePreview | null>(null);

  async function runLink(candidate: LinkCandidate) {
    const key = `${candidate.requestId}:${candidate.reservationId}`;
    setBusyKey(key);
    const fd = new FormData();
    fd.set("request_id", candidate.requestId);
    fd.set("reservation_id", candidate.reservationId);
    const result = await confirmRequestReservationLinkAction(fd);
    setBusyKey(null);
    if (result.ok) {
      showSuccessToast("リクエストと本予約を連携しました");
      router.refresh();
      return;
    }
    showErrorToast(result.message);
  }

  async function runPreviewRename() {
    const fromId = renameFromId.trim();
    if (!fromId) {
      showErrorToast("変更元の予約IDを入力してください");
      return;
    }
    setBusyKey("rename-preview");
    const result = await previewRenameReservationIdAction(fromId);
    setBusyKey(null);
    if (!result.ok) {
      setRenamePreview(null);
      showErrorToast(result.message);
      return;
    }
    setRenamePreview({
      fromId: result.fromId,
      representativeName: result.representativeName,
      status: result.status,
      checkIn: result.checkIn,
      refs: result.refs,
    });
  }

  async function runRename() {
    const fromId = renameFromId.trim();
    const toId = renameToId.trim();
    if (!fromId || !toId) {
      showErrorToast("変更元・変更先の予約IDを入力してください");
      return;
    }
    if (
      !confirm(
        `${fromId} を ${toId} に変更します。\n紐づく部屋割・同行者・RQ連携・取込ログ・メールログもすべて付け替えます。\nよろしいですか？`
      )
    ) {
      return;
    }
    setBusyKey("rename-execute");
    const result = await renameReservationIdAction(fromId, toId);
    setBusyKey(null);
    if (!result.ok) {
      showErrorToast(result.message);
      return;
    }
    showSuccessToast(
      `${result.result.fromId} → ${result.result.toId}（${formatRefSummary(result.result.updated)}）`
    );
    setRenameFromId("");
    setRenameToId("");
    setRenamePreview(null);
    router.refresh();
  }

  async function runMerge(candidate: CustomerMergeCandidate) {
    const key = `${candidate.primaryCustomerId}:${candidate.duplicateCustomerId}`;
    if (
      !confirm(
        `${candidate.duplicateName ?? candidate.duplicateCustomerId} を ${candidate.primaryName ?? candidate.primaryCustomerId} に統合します。よろしいですか？`
      )
    ) {
      return;
    }
    setBusyKey(key);
    const fd = new FormData();
    fd.set("primary_customer_id", candidate.primaryCustomerId);
    fd.set("duplicate_customer_id", candidate.duplicateCustomerId);
    const result = await mergeCustomersAction(fd);
    setBusyKey(null);
    if (result.ok) {
      showSuccessToast("顧客を統合しました");
      router.refresh();
      return;
    }
    showErrorToast(result.message);
  }

  return (
    <>
      <section className="settings-section detail-block">
        <div className="settings-section-head">
          <h2 className="settings-section-title">重複レビュー（リクエスト ↔ 本予約）</h2>
          <p className="settings-section-desc">
            未連携のリクエストと本予約を照合し、同一人物の可能性が高い組を提案します。
            スコアは氏名40点・連絡先40点・宿泊日程20点（合計100点）で、60点以上を候補として表示します。
            承認するとリクエストを「承認済」にし、本予約側にも request_id を設定します。
            連携の有無はステータスではなくリンク（linked_reservation_id）で管理します。
          </p>
        </div>

        {linkCandidates.length === 0 ? (
          <p className="settings-empty">現在、確認が必要な候補はありません</p>
        ) : (
          <ul className="settings-candidate-list">
            {linkCandidates.map((c) => {
              const key = `${c.requestId}:${c.reservationId}`;
              const parts = [
                c.scoreParts.name ? "氏名" : null,
                c.scoreParts.contact ? "連絡先" : null,
                c.scoreParts.stay ? "日程" : null,
              ].filter(Boolean);
              return (
                <li key={key} className="settings-candidate-card">
                  <div className="settings-candidate-head">
                    <span className={`settings-score-badge score-${scoreLabel(c.score)}`}>
                      一致度 {c.score}
                    </span>
                    <span className="settings-activity-meta">
                      {parts.length ? parts.join("・") : "部分一致"}
                    </span>
                  </div>
                  {!c.scoreParts.stay ? (
                    <p className="settings-candidate-warning">
                      宿泊日が一致していません。別日程の再予約の可能性があります。確認してから連携してください。
                    </p>
                  ) : null}
                  <div className="settings-candidate-body">
                    <CandidateSideCard
                      kind="リクエスト"
                      side={c.request}
                      href={`/requests/${encodeURIComponent(c.requestId)}`}
                    />
                    <div className="settings-candidate-arrow" aria-hidden>
                      →
                    </div>
                    <CandidateSideCard
                      kind="本予約"
                      side={c.reservation}
                      href={`/reservations/${encodeURIComponent(c.reservationId)}`}
                    />
                  </div>
                  <div className="settings-candidate-actions">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyKey === key}
                      onClick={() => runLink(c)}
                    >
                      {busyKey === key ? "連携中…" : "この組み合わせで連携"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="settings-section detail-block">
        <div className="settings-section-head">
          <h2 className="settings-section-title">顧客統合候補</h2>
          <p className="settings-section-desc">
            同一人物と思われる顧客レコードを検出します。
            スコアは同一メール/電話70点・氏名20点・ふりがな10点（合計100点）で、70点以上を候補として表示します。
            統合すると重複側の customer_id を削除し、予約の customer_id を残す側へ移します。
          </p>
        </div>

        {mergeCandidates.length === 0 ? (
          <p className="settings-empty">現在、統合候補はありません</p>
        ) : (
          <ul className="settings-candidate-list">
            {mergeCandidates.map((c) => {
              const key = `${c.primaryCustomerId}:${c.duplicateCustomerId}`;
              return (
                <li key={key} className="settings-candidate-card">
                  <div className="settings-candidate-head">
                    <span className={`settings-score-badge score-${scoreLabel(c.score)}`}>
                      一致度 {c.score}
                    </span>
                  </div>
                  <div className="settings-candidate-body settings-candidate-body-merge">
                    <div>
                      <p className="settings-candidate-label">残す顧客</p>
                      <p className="settings-candidate-name">{c.primaryName ?? "—"}</p>
                      <p className="settings-activity-meta">{c.primaryCustomerId}</p>
                    </div>
                    <div className="settings-candidate-arrow" aria-hidden>
                      ←
                    </div>
                    <div>
                      <p className="settings-candidate-label">統合する顧客</p>
                      <p className="settings-candidate-name">{c.duplicateName ?? "—"}</p>
                      <p className="settings-activity-meta">{c.duplicateCustomerId}</p>
                    </div>
                  </div>
                  <div className="settings-candidate-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busyKey === key}
                      onClick={() => runMerge(c)}
                    >
                      {busyKey === key ? "統合中…" : "統合を実行"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="settings-section detail-block">
        <div className="settings-section-head">
          <h2 className="settings-section-title">予約IDの変更</h2>
          <p className="settings-section-desc">
            1件ずつ予約IDを付け替えます。変更先が既に存在するIDの場合は実行できません。
            部屋割・同行者・リクエスト連携・フォーム取込ログ・メールログの参照も新IDへ付け替え、
            採番カウンタ（studio_mt 等）を台帳の最大値に再同期します。
          </p>
        </div>
        <div
          className="settings-candidate-actions"
          style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
        >
          <input
            type="text"
            className="settings-filter-select"
            placeholder="変更元（例: STUDIO-RQ66）"
            value={renameFromId}
            onChange={(e) => {
              setRenameFromId(e.target.value);
              setRenamePreview(null);
            }}
            aria-label="変更元の予約ID"
          />
          <span aria-hidden>→</span>
          <input
            type="text"
            className="settings-filter-select"
            placeholder="変更先（例: STUDIO-MT200）"
            value={renameToId}
            onChange={(e) => setRenameToId(e.target.value)}
            aria-label="変更先の予約ID"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busyKey === "rename-preview" || busyKey === "rename-execute"}
            onClick={runPreviewRename}
          >
            {busyKey === "rename-preview" ? "確認中…" : "参照を確認"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busyKey === "rename-preview" || busyKey === "rename-execute"}
            onClick={runRename}
          >
            {busyKey === "rename-execute" ? "変更中…" : "IDを変更"}
          </Button>
        </div>
        {renamePreview ? (
          <p className="settings-inline-note" style={{ marginTop: "0.75rem" }}>
            {renamePreview.fromId} / {formatDisplayName(renamePreview.representativeName) || "—"} /{" "}
            {renamePreview.status ?? "—"} / {renamePreview.checkIn ?? "—"}
            <br />
            付け替え対象: {formatRefSummary(renamePreview.refs)}
          </p>
        ) : null}
      </section>
    </>
  );
}
