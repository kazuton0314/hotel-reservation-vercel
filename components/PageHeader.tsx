export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="settings-page-header detail-block">
      <h1 className="settings-page-title">{title}</h1>
      {description ? <p className="settings-page-desc">{description}</p> : null}
    </header>
  );
}
