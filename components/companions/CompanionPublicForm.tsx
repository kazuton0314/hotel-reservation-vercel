"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MAX_COMPANION_ENTRIES } from "@/lib/config/companions";
import { submitCompanionsPublicAction } from "@/lib/actions/companion-public";
import {
  COMPANION_FORM_LANGS,
  companionFormMessages,
  type CompanionFormLang,
} from "@/lib/i18n/companion-form";
import { normalizeCompanionAgeInput } from "@/lib/utils/companion-age";

const GENDER_VALUES = ["男性", "女性", "その他", "回答しない"] as const;
const initialState = { ok: false, message: "" } as const;

type Props = {
  accessKey: string;
  alreadyAnswered: boolean;
  representativeName: string | null;
};

type Row = { id: number; name: string; nameKana: string; age: string; gender: string };

type DraftPayload = {
  lang: CompanionFormLang;
  rows: Row[];
  nextId: number;
};

function loadDraft(accessKey: string): DraftPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(accessKey));
    if (!raw) return null;
    return JSON.parse(raw) as DraftPayload;
  } catch {
    return null;
  }
}

function draftKey(accessKey: string) {
  return `companion-draft:${accessKey}`;
}

function emptyRow(id: number): Row {
  return { id, name: "", nameKana: "", age: "", gender: "" };
}

export function CompanionPublicForm({
  accessKey,
  alreadyAnswered,
  representativeName,
}: Props) {
  const draft = loadDraft(accessKey);
  const formRef = useRef<HTMLFormElement>(null);
  const [lang, setLang] = useState<CompanionFormLang>(() => {
    if (draft?.lang && COMPANION_FORM_LANGS.includes(draft.lang)) return draft.lang;
    return "ja";
  });
  const t = companionFormMessages(lang);
  const [rows, setRows] = useState<Row[]>(() => {
    if (Array.isArray(draft?.rows) && draft.rows.length) {
      return draft.rows.slice(0, MAX_COMPANION_ENTRIES);
    }
    return [emptyRow(1)];
  });
  const [nextId, setNextId] = useState(() => {
    if (Array.isArray(draft?.rows) && draft.rows.length) {
      return draft.nextId || draft.rows.length + 1;
    }
    return 2;
  });
  const [draftNotice] = useState(
    () => Boolean(Array.isArray(draft?.rows) && draft.rows.length)
  );

  const [state, action, pending] = useActionState(
    submitCompanionsPublicAction,
    initialState
  );

  useEffect(() => {
    try {
      const payload: DraftPayload = { lang, rows, nextId };
      localStorage.setItem(draftKey(accessKey), JSON.stringify(payload));
    } catch {
      /* storage full / private mode */
    }
  }, [accessKey, lang, rows, nextId]);

  useEffect(() => {
    if (state.ok) {
      try {
        localStorage.removeItem(draftKey(accessKey));
      } catch {
        /* ignore */
      }
    }
  }, [state.ok, accessKey]);

  const genderOptions = [
    { value: "", label: t.genderUnset },
    { value: GENDER_VALUES[0], label: t.genderMale },
    { value: GENDER_VALUES[1], label: t.genderFemale },
    { value: GENDER_VALUES[2], label: t.genderOther },
    { value: GENDER_VALUES[3], label: t.genderSkip },
  ];

  function updateRow(id: number, patch: Partial<Omit<Row, "id">>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!window.confirm(t.confirmSubmit)) {
      e.preventDefault();
      return;
    }
    if (state.ok) {
      try {
        localStorage.removeItem(draftKey(accessKey));
      } catch {
        /* ignore */
      }
    }
  }

  const canAddMore = rows.length < MAX_COMPANION_ENTRIES;

  if (state.ok) {
    return (
      <div className="companions-public-inner">
        <div className="companions-done">
          <h2>{t.doneTitle}</h2>
          <p>{t.doneBody(state.count)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="companions-public-inner">
      <header className="companions-public-header">
        <h1>{t.title}</h1>
        {representativeName ? (
          <p className="companions-public-sub">
            {representativeName}
            {t.subtitle}
          </p>
        ) : null}
      </header>

      <div className="companions-lang-toggle" role="group" aria-label="Language">
        {COMPANION_FORM_LANGS.map((code) => (
          <button
            key={code}
            type="button"
            className={`companions-lang-btn${lang === code ? " active" : ""}`}
            onClick={() => setLang(code)}
          >
            {companionFormMessages(code)[
              code === "ja"
                ? "langJa"
                : code === "en"
                  ? "langEn"
                  : code === "zh"
                    ? "langZh"
                    : "langKo"
            ]}
          </button>
        ))}
      </div>

      <form ref={formRef} action={action} onSubmit={handleSubmit}>
        <input type="hidden" name="access_key" value={accessKey} />

        {draftNotice ? (
          <p className="companions-hint companions-draft-note">{t.draftRestored}</p>
        ) : null}

        {alreadyAnswered ? (
          <p className="companions-hint">{t.alreadyAnswered}</p>
        ) : (
          <p className="companions-hint">{t.intro}</p>
        )}

        {rows.map((row, index) => (
          <section key={row.id} className="companions-form-card">
            <div className="companions-field-row-head">
              <h2>{t.companionN(index + 1)}</h2>
              {rows.length > 1 ? (
                <button
                  type="button"
                  className="companions-remove-btn"
                  onClick={() =>
                    setRows((prev) => prev.filter((r) => r.id !== row.id))
                  }
                >
                  {t.removeCompanion}
                </button>
              ) : null}
            </div>
            <div className="companions-field">
              <label htmlFor={`name-${row.id}`}>{t.name}</label>
              <input
                id={`name-${row.id}`}
                name="name"
                required={index === 0}
                autoComplete="name"
                value={row.name}
                onChange={(e) => updateRow(row.id, { name: e.target.value })}
              />
            </div>
            <div className="companions-field">
              <label htmlFor={`kana-${row.id}`}>{t.nameKana}</label>
              <input
                id={`kana-${row.id}`}
                name="name_kana"
                autoComplete="off"
                value={row.nameKana}
                onChange={(e) => updateRow(row.id, { nameKana: e.target.value })}
              />
            </div>
            <div className="companions-field">
              <label htmlFor={`age-${row.id}`}>{t.age}</label>
              <input
                id={`age-${row.id}`}
                name="age"
                type="number"
                min={0}
                max={120}
                step={1}
                inputMode="numeric"
                autoComplete="off"
                placeholder="例: 32"
                value={row.age}
                onChange={(e) =>
                  updateRow(row.id, { age: normalizeCompanionAgeInput(e.target.value) })
                }
              />
            </div>
            <div className="companions-field">
              <label htmlFor={`gender-${row.id}`}>{t.gender}</label>
              <select
                id={`gender-${row.id}`}
                name="gender"
                value={row.gender}
                onChange={(e) => updateRow(row.id, { gender: e.target.value })}
              >
                {genderOptions.map((opt) => (
                  <option key={opt.value || "unset"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </section>
        ))}

        {state.ok === false && state.message ? (
          <p className="companions-error">{state.message}</p>
        ) : null}

        <div className="companions-actions">
          <button
            type="button"
            className="companions-add-btn"
            disabled={!canAddMore}
            title={
              canAddMore
                ? undefined
                : `同行者は最大${MAX_COMPANION_ENTRIES}名までです`
            }
            onClick={() => {
              if (!canAddMore) return;
              setRows((prev) => [...prev, emptyRow(nextId)]);
              setNextId((n) => n + 1);
            }}
          >
            {`+ ${t.addCompanion}`}
          </button>
          <button type="submit" className="companions-submit-btn" disabled={pending}>
            {pending ? t.submitting : t.submit}
          </button>
        </div>
      </form>
    </div>
  );
}
