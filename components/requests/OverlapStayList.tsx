"use client";

import Link from "next/link";
import type { OverlapStayItem } from "@/lib/queries/overlapping-stays";
import { groupOverlapStays } from "@/lib/utils/overlap-stay-display";

export function OverlapStayList({
  stays,
  anchorCheckIn,
}: {
  stays: OverlapStayItem[];
  anchorCheckIn: string;
}) {
  if (stays.length === 0) {
    return (
      <div className="detail-empty-note">同期間に重なる予約はありません</div>
    );
  }

  const groups = groupOverlapStays(stays, anchorCheckIn);

  return (
    <>
      {groups.map((group) => (
        <div key={group.kind} className="overlap-stay-group">
          <p className="overlap-stay-group-label">{group.label}</p>
          {group.stays.map((stay) => (
            <Link
              key={stay.reservation_id}
              href={`/reservations/${encodeURIComponent(stay.reservation_id)}`}
              className="card overlap-stay-card block"
            >
              <p className="card-title list-card-title">
                {stay.representative_name || "—"}
              </p>
              <p className="card-sub">
                {stay.reservation_id} / {stay.check_in}〜{stay.check_out} /{" "}
                {stay.status || "—"}
                {stay.guest_total ? ` / ${stay.guest_total}名` : ""}
              </p>
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}
