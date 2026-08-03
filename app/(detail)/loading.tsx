import { Skeleton } from "@/components/ui/skeleton";

export default function DetailLoading() {
  return (
    <div className="detail-loading" aria-hidden>
      <Skeleton className="h-8 w-48 mb-4" />
      <Skeleton className="h-5 w-2/3 mb-6" />
      <div className="card skeleton-card mb-4">
        <Skeleton className="h-4 w-1/3 mb-3" />
        <Skeleton className="h-3 w-full mb-2" />
        <Skeleton className="h-3 w-4/5 mb-2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="card skeleton-card">
        <Skeleton className="h-4 w-1/4 mb-3" />
        <Skeleton className="h-3 w-full mb-2" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}
