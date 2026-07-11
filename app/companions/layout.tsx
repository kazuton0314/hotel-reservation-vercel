import "./companion-public.css";

export default function CompanionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="companions-public-page">{children}</div>;
}
