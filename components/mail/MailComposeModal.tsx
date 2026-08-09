"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { sendComposeMailAction } from "@/lib/actions/mail-send";
import { saveMailTemplateAction } from "@/lib/actions/mail-templates";
import { getActiveMailTemplatesAction } from "@/lib/actions/mail-templates";
import { MailMergeEditor, normalizeMergeText } from "@/components/mail/MailMergeEditor";
import type { MailMergeEditorHandle } from "@/components/mail/MailMergeEditor";
import { MailPlaceholderBar } from "@/components/mail/MailPlaceholderBar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { MailTemplate, MailTemplateCategory } from "@/lib/config/mail-templates";
import {
  filterTemplatesForCompose,
  listUnresolvedPlaceholders,
  substituteMailPlaceholders,
} from "@/lib/services/mail-placeholders";
import type { MailEntityContext } from "@/lib/services/mail-placeholders";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

type Props = {
  open: boolean;
  onClose: () => void;
  to: string;
  defaultSubject?: string;
  defaultBody?: string;
  title?: string;
  templates?: MailTemplate[];
  entityType?: string;
  entityId?: string;
  mailKind?: string;
  placeholderContext?: MailEntityContext;
};

type ActiveField = "subject" | "body";

export function MailComposeModal({
  open,
  onClose,
  to,
  defaultSubject = "",
  defaultBody = "",
  title = "メール作成",
  templates: templatesProp,
  entityType = "general",
  entityId = "",
  mailKind = "",
  placeholderContext = {},
}: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState(() => normalizeMergeText(defaultSubject));
  const [body, setBody] = useState(() => normalizeMergeText(defaultBody));
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [fetchedTemplates, setFetchedTemplates] = useState<MailTemplate[]>([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateFormMode, setTemplateFormMode] = useState<"new" | "edit">("new");
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] =
    useState<MailTemplateCategory>("一般");
  const [activeField, setActiveField] = useState<ActiveField>("body");
  const [pending, startTransition] = useTransition();
  const [savePending, startSave] = useTransition();
  const subjectEditorRef = useRef<MailMergeEditorHandle>(null);
  const bodyEditorRef = useRef<MailMergeEditorHandle>(null);

  useEffect(() => {
    if (!open || templatesProp?.length) return;
    void getActiveMailTemplatesAction().then((res) => {
      if (!res.error) setFetchedTemplates(res.templates);
    });
  }, [open, templatesProp]);

  const allTemplates = templatesProp?.length ? templatesProp : fetchedTemplates;
  const templates = useMemo(
    () => filterTemplatesForCompose(allTemplates, entityType, mailKind),
    [allTemplates, entityType, mailKind]
  );

  const previewSubject = useMemo(
    () => substituteMailPlaceholders(subject, placeholderContext),
    [subject, placeholderContext]
  );
  const previewBody = useMemo(
    () => substituteMailPlaceholders(body, placeholderContext),
    [body, placeholderContext]
  );
  const unresolved = useMemo(
    () => listUnresolvedPlaceholders(`${subject}\n${body}`, placeholderContext),
    [subject, body, placeholderContext]
  );

  function insertMergeKey(key: string) {
    if (activeField === "subject") {
      const next = subjectEditorRef.current?.insertKey(key);
      if (next != null) setSubject(next);
      return;
    }
    const next = bodyEditorRef.current?.insertKey(key);
    if (next != null) setBody(next);
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const tpl = templates.find((t) => t.templateId === templateId);
    if (!tpl) return;
    setSubject(normalizeMergeText(tpl.subject));
    setBody(normalizeMergeText(tpl.body));
    setTemplateName(tpl.name);
    setTemplateCategory(tpl.category);
  }

  function openTemplateEditor(mode: "new" | "edit") {
    if (mode === "edit") {
      const tpl = templates.find((t) => t.templateId === selectedTemplateId);
      if (!tpl) {
        showErrorToast("編集するテンプレートを先に選択してください");
        return;
      }
      setTemplateName(tpl.name);
      setTemplateCategory(tpl.category);
    } else {
      setTemplateName("");
      setTemplateCategory(
        entityType === "request"
          ? "リクエスト"
          : entityType === "reservation"
            ? "本予約"
            : "一般"
      );
    }
    setTemplateFormMode(mode);
    setShowTemplateForm(true);
  }

  function handleSend() {
    const fd = new FormData();
    fd.set("to", to);
    fd.set("subject", subject);
    fd.set("body", body);
    fd.set("entity_type", entityType);
    fd.set("entity_id", entityId);
    fd.set("mail_kind", mailKind);
    if (selectedTemplateId) fd.set("template_id", selectedTemplateId);

    startTransition(async () => {
      const result = await sendComposeMailAction(null, fd);
      if (!result.ok) {
        showErrorToast(result.message);
        return;
      }
      showSuccessToast("メールを送信しました");
      router.refresh();
      onClose();
    });
  }

  function handleSaveTemplate() {
    if (!templateName.trim()) {
      showErrorToast("定型文名を入力してください");
      return;
    }
    const fd = new FormData();
    fd.set("mode", templateFormMode);
    if (templateFormMode === "edit" && selectedTemplateId) {
      fd.set("template_id", selectedTemplateId);
    }
    fd.set("name", templateName);
    fd.set("category", templateCategory);
    fd.set("default_purpose", mailKind || "");
    fd.set("subject", subject);
    fd.set("body", body);
    fd.set("active", "true");
    fd.set("sort_order", "999");
    fd.set("note", "");

    startSave(async () => {
      const result = await saveMailTemplateAction({ ok: true, templateId: "" }, fd);
      if (!result.ok) {
        showErrorToast(result.message);
        return;
      }
      showSuccessToast(
        templateFormMode === "edit" ? "定型文を更新しました" : "定型文を保存しました"
      );
      const refreshed = await getActiveMailTemplatesAction();
      if (!refreshed.error) setFetchedTemplates(refreshed.templates);
      if ("templateId" in result && result.templateId) {
        setSelectedTemplateId(result.templateId);
      }
      setShowTemplateForm(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="mail-compose-dialog" aria-describedby={undefined}>
        <div className="mail-compose-header">
          <h3 className="mail-modal-title">{title}</h3>
          <p className="form-hint">宛先: {to}</p>
        </div>

        <div className="mail-compose-grid">
          <section className="mail-compose-editor">
            <div className="form-group">
              <label htmlFor="mail-compose-template">定型文</label>
              <div className="mail-compose-template-row">
                <Select
                  id="mail-compose-template"
                  value={selectedTemplateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                >
                  <option value="">選択しない</option>
                  {templates.map((t) => (
                    <option key={t.templateId} value={t.templateId}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (showTemplateForm) setShowTemplateForm(false);
                    else openTemplateEditor("new");
                  }}
                >
                  {showTemplateForm ? "閉じる" : "＋ 新規"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!selectedTemplateId}
                  onClick={() => openTemplateEditor("edit")}
                >
                  編集
                </Button>
                <Link href="/settings/mail" className="btn btn-secondary btn-sm">
                  一覧
                </Link>
              </div>
            </div>

            {showTemplateForm ? (
              <div className="mail-template-inline">
                <div className="form-group">
                  <label htmlFor="mail-new-tpl-name">定型文名</label>
                  <Input
                    id="mail-new-tpl-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="例: 予約確定のお礼"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="mail-new-tpl-cat">カテゴリ</label>
                  <Select
                    id="mail-new-tpl-cat"
                    value={templateCategory}
                    onChange={(e) =>
                      setTemplateCategory(e.target.value as MailTemplateCategory)
                    }
                  >
                    <option value="一般">一般</option>
                    <option value="リクエスト">リクエスト</option>
                    <option value="本予約">本予約</option>
                  </Select>
                </div>
                <Button type="button" size="sm" disabled={savePending} onClick={handleSaveTemplate}>
                  {savePending
                    ? "保存中…"
                    : templateFormMode === "edit"
                      ? "選択中の定型文を更新"
                      : "現在の文面を定型文として保存"}
                </Button>
              </div>
            ) : null}

            <MailPlaceholderBar
              entityType={entityType}
              mailKind={mailKind}
              onInsert={insertMergeKey}
            />

            <div className="form-group">
              <label htmlFor="mail-compose-subject">件名</label>
              <MailMergeEditor
                ref={subjectEditorRef}
                id="mail-compose-subject"
                value={subject}
                onChange={setSubject}
                onFocus={() => setActiveField("subject")}
                multiline={false}
                placeholder="件名を入力"
                ariaLabel="件名"
                className="mail-merge-editor-subject"
              />
            </div>

            <div className="form-group">
              <label htmlFor="mail-compose-body">本文</label>
              <MailMergeEditor
                ref={bodyEditorRef}
                id="mail-compose-body"
                value={body}
                onChange={setBody}
                onFocus={() => setActiveField("body")}
                multiline
                placeholder="本文を入力"
                ariaLabel="本文"
                className="mail-merge-editor-body"
              />
            </div>
          </section>

          <section className="mail-compose-preview">
            <h4 className="mail-preview-title">プレビュー（送信時の置換後）</h4>
            <div className="mail-preview-card">
              <p className="mail-preview-subject">{previewSubject || "（件名なし）"}</p>
              <pre className="mail-preview-body">{previewBody || "（本文なし）"}</pre>
            </div>
            {unresolved.length > 0 ? (
              <p className="form-hint mail-preview-warn">
                未置換の差し込み: {unresolved.join(" ")}
              </p>
            ) : null}
          </section>
        </div>

        <div className="mail-compose-footer">
          <p className="form-hint">施設のメールアドレス（SMTP）から送信します</p>
          <div className="mail-modal-actions-main">
            <Button type="button" variant="secondary" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="button" disabled={pending} onClick={handleSend}>
              {pending ? "送信中…" : "送信する"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
