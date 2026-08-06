import { Suspense } from "react";
import { CustomersView } from "@/components/customers/CustomersView";
import { CustomersSearchSkeleton } from "@/components/ui/skeleton";
import {
  parseCustomerPrefill,
  searchCustomers,
} from "@/lib/queries/customers";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const criteria = parseCustomerPrefill(sp);
  const hasPrefill = Object.values(criteria).some((v) => String(v ?? "").trim());
  const initial = hasPrefill ? await searchCustomers(criteria) : null;

  return (
    <Suspense fallback={<CustomersSearchSkeleton />}>
      <CustomersView
        initialCriteria={hasPrefill ? criteria : undefined}
        initialResults={hasPrefill ? (initial?.customers ?? []) : undefined}
        initialError={initial?.error ?? null}
      />
    </Suspense>
  );
}
