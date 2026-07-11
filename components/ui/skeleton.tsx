import { cn } from "@/lib/utils/cn";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} {...props} />;
}

export function ListCardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="list-skeleton" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card skeleton-card">
          <Skeleton className="h-4 w-2/3 mb-2" />
          <Skeleton className="h-3 w-1/2 mb-2" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-hidden>
      <div className="stats-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="stat-card skeleton-card">
            <Skeleton className="h-3 w-1/2 mb-2" />
            <Skeleton className="h-6 w-1/3" />
          </div>
        ))}
      </div>
      <ListCardSkeleton rows={3} />
    </div>
  );
}

export function RoomBoardSkeleton() {
  return (
    <div className="room-board-skeleton" aria-hidden>
      <Skeleton className="h-10 w-full mb-3 rounded-xl" />
      <div className="room-grid-skeleton">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="calendar-skeleton" aria-hidden>
      <Skeleton className="h-10 w-full mb-3 rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export function CustomersSearchSkeleton() {
  return (
    <div className="customers-skeleton" aria-hidden>
      <Skeleton className="h-24 w-full mb-4 rounded-xl" />
      <ListCardSkeleton rows={4} />
    </div>
  );
}

export function ListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="list-page-skeleton" aria-hidden>
      <div className="list-scope-bar">
        <Skeleton className="h-10 flex-1 rounded-xl" />
        <Skeleton className="h-10 flex-1 rounded-xl" />
      </div>
      <div className="tabs tabs-3">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-10 rounded-xl" />
      </div>
      <Skeleton className="h-16 w-full mb-3 rounded-xl" />
      <ListCardSkeleton rows={rows} />
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <div className="settings-skeleton" aria-hidden>
      <Skeleton className="h-8 w-2/3 mb-2" />
      <Skeleton className="h-4 w-full mb-6" />
      <Skeleton className="h-32 w-full mb-4 rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
