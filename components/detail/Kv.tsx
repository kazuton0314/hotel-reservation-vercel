type Props = {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
};

function displayValue(value: React.ReactNode) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

export function Kv({ label, value, multiline }: Props) {
  return (
    <div className={`kv${multiline ? " kv-multiline" : ""}`}>
      <div className="k">{label}</div>
      <div className="v">{displayValue(value)}</div>
    </div>
  );
}

export function FormSectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="form-section-label">{children}</p>;
}
