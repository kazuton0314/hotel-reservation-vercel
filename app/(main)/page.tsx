import { ConnectionError } from "@/components/SetupRequired";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getDashboardSummary } from "@/lib/queries/dashboard";

export default async function HomePage() {
  const { dashboard, error } = await getDashboardSummary();

  if (error) return <ConnectionError message={error} />;
  if (!dashboard) return <p className="empty">データを読み込めませんでした</p>;

  return <DashboardView dashboard={dashboard} />;
}
