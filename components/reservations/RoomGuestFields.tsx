type GuestDefaults = {
  guestTotal: number;
  maleCount: number;
  femaleCount: number;
  boyStudent: number;
  girlStudent: number;
  age3plus: number;
  under3: number;
};

type Props = {
  defaults: GuestDefaults;
  variant?: "reservation" | "assignment";
};

function fieldNames(variant: "reservation" | "assignment") {
  if (variant === "assignment") {
    return {
      total: "assigned_guest_count",
      male: "male_count",
      female: "female_count",
      boy: "boy_student_count",
      girl: "girl_student_count",
      age3: "age_3plus_count",
      under3: "under_3_count",
    };
  }
  return {
    total: "guest_total",
    male: "adult_male",
    female: "adult_female",
    boy: "boy_student",
    girl: "girl_student",
    age3: "age_3plus",
    under3: "under_3",
  };
}

function parseIntField(value: string): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

export function RoomGuestFields({
  defaults,
  variant = "assignment",
}: Props) {
  const names = fieldNames(variant);
  const fields = [
    { name: names.total, label: "人数", defaultValue: defaults.guestTotal },
    { name: names.male, label: "男", defaultValue: defaults.maleCount },
    { name: names.female, label: "女", defaultValue: defaults.femaleCount },
    { name: names.boy, label: "小学生男", defaultValue: defaults.boyStudent },
    { name: names.girl, label: "小学生女", defaultValue: defaults.girlStudent },
    { name: names.age3, label: "3歳以上", defaultValue: defaults.age3plus },
    { name: names.under3, label: "3歳未満", defaultValue: defaults.under3 },
  ];

  return (
    <div className="room-guest-grid">
      {fields.map((f) => (
        <div key={f.name} className="form-group">
          <label htmlFor={f.name}>{f.label}</label>
          <input
            id={f.name}
            name={f.name}
            type="number"
            min={0}
            defaultValue={f.defaultValue || ""}
          />
        </div>
      ))}
    </div>
  );
}

export function guestDefaultsFromReservation(r: {
  guest_total?: string | null;
  adult_male?: string | null;
  adult_female?: string | null;
  boy_student?: string | null;
  girl_student?: string | null;
  age_3plus?: string | null;
  under_3?: string | null;
}): GuestDefaults {
  return {
    guestTotal: parseIntField(String(r.guest_total ?? "0")),
    maleCount: parseIntField(String(r.adult_male ?? "0")),
    femaleCount: parseIntField(String(r.adult_female ?? "0")),
    boyStudent: parseIntField(String(r.boy_student ?? "0")),
    girlStudent: parseIntField(String(r.girl_student ?? "0")),
    age3plus: parseIntField(String(r.age_3plus ?? "0")),
    under3: parseIntField(String(r.under_3 ?? "0")),
  };
}

export type { GuestDefaults };
