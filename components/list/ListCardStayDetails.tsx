const SNIPPET_MAX_CHARS = 28;

function truncateText(value: string, maxChars: number): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

type Fact = {
  label: string;
  value: string;
  title?: string;
  accent?: "ops-memo";
};

/** 一覧・ホームカード共通: 人数・部屋・到着・問合せ・メモを同一行に並べて縦伸びを抑える */
export function ListCardStayDetails({
  guests,
  rooms,
  arrivalTime,
  meal,
  bbq,
  vehicleCount,
  inquiry,
  internalMemo,
}: {
  guests?: string | null;
  rooms?: string | null;
  arrivalTime?: string | null;
  meal?: string | null;
  bbq?: string | null;
  vehicleCount?: string | null;
  inquiry?: string | null;
  /** 運用メモ（特別な事情・配慮）。赤文字で同一行に表示 */
  internalMemo?: string | null;
}) {
  const facts: Fact[] = [];
  const push = (
    label: string,
    value: string | null | undefined,
    opts?: { truncate?: boolean; accent?: "ops-memo" }
  ) => {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "—") return;
    const shown = opts?.truncate ? truncateText(raw, SNIPPET_MAX_CHARS) : raw;
    facts.push({
      label,
      value: shown,
      title: opts?.truncate && shown !== raw ? raw : undefined,
      accent: opts?.accent,
    });
  };

  push("人数", guests);
  push("部屋", rooms);
  push("到着", arrivalTime);
  push("食事", meal);
  push("BBQ", bbq);
  push("車", vehicleCount);
  push("問合せ", inquiry, { truncate: true });
  push("運用メモ", internalMemo, { truncate: true, accent: "ops-memo" });

  if (!facts.length) return null;

  return (
    <div className="card-stay-details">
      <p className="card-stay-facts">
        {facts.map((f, i) => (
          <span
            key={`${f.label}-${i}`}
            className={
              f.accent === "ops-memo"
                ? "card-stay-fact card-stay-fact-ops-memo"
                : "card-stay-fact"
            }
            title={f.title}
          >
            {i > 0 ? <span className="card-stay-sep" aria-hidden>·</span> : null}
            <span className="card-stay-label">{f.label}</span>
            {f.value}
          </span>
        ))}
      </p>
    </div>
  );
}
