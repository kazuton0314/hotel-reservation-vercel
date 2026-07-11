import type { ReactNode } from "react";

type Props = {
  title?: string;
  id?: string;
  children: ReactNode;
};

export function DetailBlock({ title, id, children }: Props) {
  return (
    <div className="detail-block" id={id}>
      {title ? <h3>{title}</h3> : null}
      {children}
    </div>
  );
}
