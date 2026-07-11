import { CustomersView } from "@/components/customers/CustomersView";
import {
  parseCustomerPrefill,
  searchCustomers,
} from "@/lib/queries/customers";
import { searchCustomersAction } from "@/lib/actions/customers";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const criteria = parseCustomerPrefill(sp);
  const hasPrefill = Object.values(criteria).some((v) => String(v ?? "").trim());
  const initial = hasPrefill ? await searchCustomers(criteria) : null;

  return (
    <CustomersView
      initialCriteria={hasPrefill ? criteria : undefined}
      initialResults={initial?.customers}
      searchAction={searchCustomersAction}
    />
  );
}
