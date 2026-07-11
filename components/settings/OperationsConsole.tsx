"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmRequestReservationLinkAction } from "@/lib/actions/ops";
import { mergeCustomersAction } from "@/lib/actions/customers";
import type { CustomerMergeCandidate, LinkCandidate } from "@/lib/queries/ops";
import { Button } from "@/components/ui/button";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

type Props = {
  linkCandidates: LinkCandidate[];
  mergeCandidates: CustomerMergeCandidate[];
};

function scoreLabel(score: number) {
  if (score >= 80) return "高";
  if (score >= 70) return "中";
  return "低";
}

export function OperationsConsole({ linkCandidates, mergeCandidates }: Props) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);

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
            承認するとリクエストを「本予約連携済」にし、本予約側にも request_id を設定します。
          </p>
        </div>

        {linkCandidates.length === 0 ? (
          <p className="settings-empty">現在、確認が必要な候補はありません</p>
        ) : (
          <ul className="settings-candidate-list">
            {linkCandidates.map((c) => {
              const key = `${c.requestId}:${c.reservationId}`;
              return (
                <li key={key} className="settings-candidate-card">
                  <div className="settings-candidate-head">
                    <span className={`settings-score-badge score-${scoreLabel(c.score)}`}>
                      一致度 {c.score}
                    </span>
                    <span className="settings-activity-meta">check-in {c.checkIn ?? "—"}</span>
                  </div>
                  <div className="settings-candidate-body">
                    <div>
                      <p className="settings-candidate-label">リクエスト</p>
                      <p className="settings-candidate-name">{c.requestName ?? "—"}</p>
                      <Link href={`/requests/${encodeURIComponent(c.requestId)}`} className="settings-link">
                        {c.requestId}
                      </Link>
                    </div>
                    <div className="settings-candidate-arrow" aria-hidden>
                      →
                    </div>
                    <div>
                      <p className="settings-candidate-label">本予約</p>
                      <p className="settings-candidate-name">{c.reservationName ?? "—"}</p>
                      <Link
                        href={`/reservations/${encodeURIComponent(c.reservationId)}`}
                        className="settings-link"
                      >
                        {c.reservationId}
                      </Link>
                    </div>
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
    </>
  );
}
