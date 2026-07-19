import Link from "next/link";
import { Suspense } from "react";
import { ListSetupEntryLink } from "@/components/setup/ListSetupEntryLink";

export function ReservationsListManualAdd() {
  return (
    <div className="list-actions-row">
      <Suspense fallback={null}>
        <ListSetupEntryLink href="/reservations/setup" />
      </Suspense>
      <Link href="/reservations/new" className="btn btn-secondary btn-sm">
        + 手動追加
      </Link>
    </div>
  );
}
