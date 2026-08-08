const SNIPPET_MAX_CHARS = 40;

function truncateText(value: string, maxChars: number): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

/** 一覧・ホームカード共通: 人数・部屋・到着等を同レベルで1行、問合せ/メモは文字数で省略 */
export function ListCardStayDetails({
  guests,
  rooms,
  arrivalTime,
  meal,
  bbq,
  vehicleCount,
  inquiry,
  internalMemo,
  guestMemo,
}: {
  guests?: string | null;
  rooms?: string | null;
  arrivalTime?: string | null;
  meal?: string | null;
  bbq?: string | null;
  vehicleCount?: string | null;
  inquiry?: string | null;
  /** 運用メモ（特別な事情・配慮）。一覧では赤文字で強調 */
  internalMemo?: string | null;
  /** 宿泊者メモ（当日知りえた情報） */
  guestMemo?: string | null;
}) {
  const facts: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null | undefined) => {
    const v = String(value ?? "").trim();
    if (!v || v === "—") return;
    facts.push({ label, value: v });
  };
  push("人数", guests);
  push("部屋", rooms);
  push("到着", arrivalTime);
  push("食事", meal);
  push("BBQ", bbq);
  push("車", vehicleCount);

  const inquiryText = truncateText(String(inquiry ?? ""), SNIPPET_MAX_CHARS);
  const opsMemoText = truncateText(String(internalMemo ?? ""), SNIPPET_MAX_CHARS);
  const guestMemoText = truncateText(String(guestMemo ?? ""), SNIPPET_MAX_CHARS);

  if (!facts.length && !inquiryText && !opsMemoText && !guestMemoText) return null;

  return (
    <div className="card-stay-details">
      {facts.length ? (
        <p className="card-stay-facts">
          {facts.map((f, i) => (
            <span key={f.label} className="card-stay-fact">
              {i > 0 ? <span className="card-stay-sep" aria-hidden>·</span> : null}
              <span className="card-stay-label">{f.label}</span>
              {f.value}
            </span>
          ))}
        </p>
      ) : null}
      {inquiryText ? (
        <p className="card-snippet" title={String(inquiry ?? "").trim()}>
          <span className="card-stay-label">問合せ</span>
          {inquiryText}
        </p>
      ) : null}
      {opsMemoText ? (
        <p
          className="card-snippet card-snippet-ops-memo"
          title={String(internalMemo ?? "").trim()}
        >
          <span className="card-stay-label">運用メモ</span>
          {opsMemoText}
        </p>
      ) : null}
      {guestMemoText ? (
        <p className="card-snippet" title={String(guestMemo ?? "").trim()}>
          <span className="card-stay-label">宿泊者メモ</span>
          {guestMemoText}
        </p>
      ) : null}
    </div>
  );
}
