import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
  id?: string;
};

export function SettingsSection({ title, description, children, id }: Props) {
  return (
    <section className="settings-section detail-block" id={id}>
      <div className="settings-section-head">
        <h2 className="settings-section-title">{title}</h2>
        {description ? <p className="settings-section-desc">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
