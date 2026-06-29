import Link from "next/link";

const NAV = [
  { href: "/", label: "ホーム" },
  { href: "/reservations", label: "本予約" },
  { href: "/settings/setup", label: "設定" },
  { href: "/settings/sync", label: "同期" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs text-zinc-500">みどりの時計台</p>
            <h1 className="text-lg font-bold">予約管理</h1>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            Phase 1
          </span>
        </div>
      </header>
      <main className="mx-auto min-h-full w-full max-w-3xl flex-1 px-4 py-6">
        {children}
      </main>
      <nav className="sticky bottom-0 border-t border-zinc-200 bg-white">
        <ul className="mx-auto flex max-w-3xl">
          {NAV.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className="block py-3 text-center text-sm font-medium text-zinc-700 hover:text-zinc-900"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
