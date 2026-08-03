import { Suspense } from "react";
import { ConnectionError } from "@/components/SetupRequired";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { getDashboardSummary } from "@/lib/queries/dashboard";

export default function HomePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <HomeDashboard />
    </Suspense>
  );
}

async function HomeDashboard() {
  const { dashboard, error } = await getDashboardSummary();

  if (error) return <ConnectionError message={error} />;
  if (!dashboard) return <p className="empty">データを読み込めませんでした</p>;

  return <DashboardView dashboard={dashboard} />;
}
