"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { filterListBySearch } from "@/lib/utils/list-search";

type Candidate = {
  reservation_id: string;
  representative_name: string | null;
  status: string | null;
  check_in: string | null;
  check_out: string | null;
  guest_total: string | null;
};

type Props = {
  candidates: Candidate[];
  onClose: () => void;
  onSelect: (reservationId: string) => void;
};

export function LinkReservationPicker({
  candidates,
  onClose,
  onSelect,
}: Props) {
  const [q, setQ] = useState("");

  const filtered = filterListBySearch(
    candidates.map((c) => ({
      ...c,
      id: c.reservation_id,
      check_in: c.check_in,
    })),
    q
  );

  return (
    <div className="date-jump-overlay" role="dialog" aria-modal>
      <div className="date-jump-popup" style={{ maxWidth: 420 }}>
        <h4>本予約を紐づけ</h4>
        <Input
          type="search"
          placeholder="予約ID・代表者名で検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <div style={{ maxHeight: 280, overflow: "auto" }}>
          {filtered.length === 0 ? (
            <p className="detail-hint">該当する予約がありません</p>
          ) : (
            filtered.map((c) => (
              <Button
                key={c.reservation_id}
                type="button"
                variant="secondary"
                className="card overlap-stay-card"
                style={{ width: "100%", textAlign: "left" }}
                onClick={() => onSelect(c.reservation_id)}
              >
                <p className="card-title list-card-title">
                  {c.representative_name || "—"}
                </p>
                <p className="card-sub">
                  {c.reservation_id} / {c.check_in}〜{c.check_out} /{" "}
                  {c.status}
                </p>
              </Button>
            ))
          )}
        </div>
        <div className="detail-actions detail-actions-inline" style={{ marginTop: 12 }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            閉じる
          </Button>
        </div>
      </div>
    </div>
  );
}
