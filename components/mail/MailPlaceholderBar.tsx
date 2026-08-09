"use client";

import { filterVariablesForEntity } from "@/lib/services/mail-placeholders";

type Props = {
  entityType: string;
  mailKind?: string;
  onInsert: (key: string) => void;
};

export function MailPlaceholderBar({ entityType, mailKind, onInsert }: Props) {
  const variables = filterVariablesForEntity(entityType, mailKind);

  return (
    <div className="mail-placeholder-bar">
      <p className="mail-placeholder-label">
        差し込み（クリックでカーソル位置へ挿入 / ドラッグ可）
      </p>
      <div className="mail-placeholder-chips">
        {variables.map((v) => (
          <button
            key={v.key}
            type="button"
            className="mail-placeholder-chip"
            title="件名・本文に挿入"
            onClick={() => onInsert(v.key)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-mail-merge", v.key);
              e.dataTransfer.effectAllowed = "copy";
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
