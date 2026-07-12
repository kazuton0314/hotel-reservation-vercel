"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { MailMergeEditor, normalizeMergeText } from "@/components/mail/MailMergeEditor";
import type { MailMergeEditorHandle } from "@/components/mail/MailMergeEditor";
import { MailPlaceholderBar } from "@/components/mail/MailPlaceholderBar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  deleteMailTemplateAction,
  saveMailTemplateAction,
  seedMailTemplatesAction,
} from "@/lib/actions/mail-templates";
import {
  MAIL_TEMPLATE_META,
  nextTemplateId,
  type MailTemplate,
} from "@/lib/config/mail-templates";

type EditorState = {
  mode: "new" | "edit";
  template: MailTemplate;
} | null;

type Props = {
  initialTemplates: MailTemplate[];
  loadError?: string | null;
  tableMissing?: boolean;
};

export function MailTemplatesView({
  initialTemplates,
  loadError = null,
  tableMissing = false,
}: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [editor, setEditor] = useState<EditorState>(null);
  const [message, setMessage] = useState<string | null>(loadError);
  const [pending, startTransition] = useTransition();
  const [categoryFilter, setCategoryFilter] = useState<"all" | MailTemplate["category"]>(
    "all"
  );
  const [activeField, setActiveField] = useState<"subject" | "body">("body");
  const subjectEditorRef = useRef<MailMergeEditorHandle>(null);
  const bodyEditorRef = useRef<MailMergeEditorHandle>(null);

  const visibleTemplates =
    categoryFilter === "all"
      ? templates
      : templates.filter((t) => t.category === categoryFilter);

  function refreshList(next: MailTemplate[]) {
    setTemplates(next);
    router.refresh();
  }

  function openNew() {
    setEditor({
      mode: "new",
      template: {
        templateId: nextTemplateId(templates),
        name: "",
        category: "共通",
        defaultPurpose: "",
        subject: "",
        body: "",
        active: true,
        sortOrder: templates.length + 1,
        note: "",
      },
    });
  }

  function openEdit(tpl: MailTemplate) {
    setEditor({
      mode: "edit",
      template: {
        ...tpl,
        subject: normalizeMergeText(tpl.subject),
        body: normalizeMergeText(tpl.body),
      },
    });
  }

  function insertMergeKey(key: string) {
    if (!editor) return;
    if (activeField === "subject") {
      const next = subjectEditorRef.current?.insertKey(key);
      if (next != null) {
        setEditor({ ...editor, template: { ...editor.template, subject: next } });
      }
      return;
    }
    const next = bodyEditorRef.current?.insertKey(key);
    if (next != null) {
      setEditor({ ...editor, template: { ...editor.template, body: next } });
    }
  }

  function deleteTemplate(id: string) {
    if (!confirm("このテンプレートを削除しますか？")) return;
    const fd = new FormData();
    fd.set("template_id", id);
    startTransition(async () => {
      const res = await deleteMailTemplateAction({ ok: true, templateId: "" }, fd);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      refreshList(templates.filter((t) => t.templateId !== id));
      setMessage(null);
    });
  }

  function saveEditor() {
    if (!editor) return;
    const tpl = editor.template;
    if (!tpl.name.trim()) {
      alert("テンプレート名を入力してください");
      return;
    }
    const fd = new FormData();
    fd.set("mode", editor.mode);
    fd.set("template_id", tpl.templateId);
    fd.set("name", tpl.name);
    fd.set("category", tpl.category);
    fd.set("default_purpose", tpl.defaultPurpose);
    fd.set("subject", tpl.subject);
    fd.set("body", tpl.body);
    fd.set("active", String(tpl.active));
    fd.set("sort_order", String(tpl.sortOrder));
    fd.set("note", tpl.note);

    startTransition(async () => {
      const res = await saveMailTemplateAction({ ok: true, templateId: "" }, fd);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      const next =
        editor.mode === "new"
          ? [...templates, tpl].sort((a, b) => a.sortOrder - b.sortOrder)
          : templates
              .map((t) => (t.templateId === tpl.templateId ? tpl : t))
              .sort((a, b) => a.sortOrder - b.sortOrder);
      refreshList(next);
      setEditor(null);
      setMessage(null);
    });
  }

  function resetToDefaults() {
    if (!confirm("初期テンプレートをデータベースに投入しますか？")) return;
    startTransition(async () => {
      const res = await seedMailTemplatesAction();
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      setMessage(null);
      router.refresh();
    });
  }

  return (
    <div className="settings-stack">
      <div className="settings-section detail-block">
        <div className="settings-toolbar">
          <div className="settings-toolbar-start">
            <label htmlFor="mailtpl-filter" className="settings-filter-label">
              表示
            </label>
            <Select
              id="mailtpl-filter"
              className="settings-filter-select"
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as "all" | MailTemplate["category"])
              }
            >
              <option value="all">すべて</option>
              {MAIL_TEMPLATE_META.categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="settings-toolbar-actions">
            <Button type="button" disabled={pending} onClick={openNew}>
              新規テンプレート
            </Button>
          </div>
        </div>

        {tableMissing ? (
          <p className="settings-inline-note">
            テーブル未作成のため表示は初期データです。マイグレーション 005 を適用してください。
          </p>
        ) : null}
        {message ? <div className="settings-inline-alert">{message}</div> : null}

        <div id="mailtpl-list" className="settings-template-list">
          {!visibleTemplates.length ? (
            <p className="settings-empty">テンプレートがありません</p>
          ) : (
            visibleTemplates.map((tpl) => (
              <article key={tpl.templateId} className="settings-template-card">
                <div className="settings-template-head">
                  <div>
                    <p className="settings-template-title">
                      {tpl.name}
                      {!tpl.active ? (
                        <span className="badge badge-muted">無効</span>
                      ) : null}
                    </p>
                    <p className="settings-template-meta">
                      {tpl.category}
                      {tpl.defaultPurpose ? ` · ${tpl.defaultPurpose}` : ""}
                    </p>
                  </div>
                  <div className="settings-template-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() => openEdit(tpl)}
                    >
                      編集
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={pending}
                      onClick={() => deleteTemplate(tpl.templateId)}
                    >
                      削除
                    </Button>
                  </div>
                </div>
                <p className="settings-template-subject">
                  <span>件名</span>
                  {tpl.subject || "—"}
                </p>
              </article>
            ))
          )}
        </div>

        <details className="settings-advanced">
          <summary>詳細オプション</summary>
          <div className="settings-advanced-body">
            <p className="settings-inline-note">
              初期テンプレートの再投入は、既存データを上書きする可能性があります。通常運用では使用しないでください。
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={resetToDefaults}
            >
              初期テンプレートを再投入
            </Button>
          </div>
        </details>
      </div>

      <Dialog open={editor != null} onOpenChange={(next) => !next && setEditor(null)}>
        <DialogContent className="mail-compose-dialog mail-modal-wide mail-template-dialog" aria-describedby={undefined}>
          {editor ? (
            <>
            <h3 className="mail-modal-title">
              {editor.mode === "new" ? "新規テンプレート" : "テンプレート編集"}
            </h3>
            <div className="form-group">
              <label htmlFor="mt-name">テンプレート名</label>
              <Input
                id="mt-name"
                value={editor.template.name}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    template: { ...editor.template, name: e.target.value },
                  })
                }
              />
            </div>
            <div className="form-group">
              <label htmlFor="mt-cat">カテゴリ</label>
              <Select
                id="mt-cat"
                value={editor.template.category}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    template: {
                      ...editor.template,
                      category: e.target.value as MailTemplate["category"],
                    },
                  })
                }
              >
                {MAIL_TEMPLATE_META.categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="form-group">
              <label htmlFor="mt-purpose">デフォルト用途</label>
              <Select
                id="mt-purpose"
                value={editor.template.defaultPurpose}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    template: {
                      ...editor.template,
                      defaultPurpose: e.target.value,
                    },
                  })
                }
              >
                {MAIL_TEMPLATE_META.defaultPurposes.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="form-group">
              <label htmlFor="mt-subject">件名</label>
              <MailMergeEditor
                ref={subjectEditorRef}
                id="mt-subject"
                value={editor.template.subject}
                onChange={(subject) =>
                  setEditor({
                    ...editor,
                    template: { ...editor.template, subject },
                  })
                }
                onFocus={() => setActiveField("subject")}
                multiline={false}
                placeholder="件名"
                ariaLabel="件名"
                className="mail-merge-editor-subject"
              />
            </div>
            <MailPlaceholderBar
              entityType={
                editor.template.category === "リクエスト"
                  ? "request"
                  : editor.template.category === "本予約"
                    ? "reservation"
                    : "general"
              }
              mailKind={editor.template.defaultPurpose}
              onInsert={insertMergeKey}
            />
            <div className="form-group">
              <label htmlFor="mt-body">本文</label>
              <MailMergeEditor
                ref={bodyEditorRef}
                id="mt-body"
                value={editor.template.body}
                onChange={(body) =>
                  setEditor({
                    ...editor,
                    template: { ...editor.template, body },
                  })
                }
                onFocus={() => setActiveField("body")}
                multiline
                placeholder="本文"
                ariaLabel="本文"
                className="mail-merge-editor-body"
              />
            </div>
            <div className="mail-modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditor(null)}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={saveEditor}
              >
                {pending ? "保存中…" : "保存"}
              </Button>
            </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
