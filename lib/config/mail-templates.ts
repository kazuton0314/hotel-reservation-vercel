export type MailTemplateCategory = "一般" | "リクエスト" | "本予約";

export type MailTemplate = {
  templateId: string;
  name: string;
  category: MailTemplateCategory;
  defaultPurpose: string;
  subject: string;
  body: string;
  active: boolean;
  sortOrder: number;
  note: string;
};

export type MailTemplateMeta = {
  categories: { value: MailTemplateCategory; label: string }[];
  defaultPurposes: { value: string; label: string }[];
  variables: {
    key: string;
    label: string;
    token: string;
    /** 差し込みチップを出すカテゴリ（一般＝両フォーム共通の回答項目） */
    categories: MailTemplateCategory[];
  }[];
};

export const MAIL_TEMPLATE_STORAGE_KEY = "mr_mail_templates_v1";

/** DB 旧値「共通」を新カテゴリ「一般」へ正規化 */
export function normalizeMailTemplateCategory(
  raw: string | null | undefined
): MailTemplateCategory {
  const value = String(raw ?? "").trim();
  if (value === "リクエスト" || value === "本予約" || value === "一般") {
    return value;
  }
  // 旧「共通」および不明値
  return "一般";
}

export const MAIL_TEMPLATE_META: MailTemplateMeta = {
  categories: [
    { value: "一般", label: "一般" },
    { value: "リクエスト", label: "リクエスト" },
    { value: "本予約", label: "本予約" },
  ],
  defaultPurposes: [
    { value: "", label: "（なし）" },
    { value: "予約確定", label: "予約確定" },
    { value: "11日前", label: "11日前" },
    { value: "3日前", label: "3日前" },
  ],
  /**
   * 差し込みチップはフォーム回答由来の項目のみ。
   * 施設名・却下理由・本予約URL・各ID などはチップに出さない
   * （本文への手書きや既存テンプレの置換は mail-placeholders 側で継続可）。
   */
  variables: [
    { key: "代表者名", label: "代表者名", token: "{{代表者名}}", categories: ["一般"] },
    { key: "姓", label: "姓", token: "{{姓}}", categories: ["一般"] },
    { key: "名", label: "名", token: "{{名}}", categories: ["一般"] },
    { key: "ふりがな", label: "ふりがな", token: "{{ふりがな}}", categories: ["一般"] },
    { key: "メール", label: "メール", token: "{{メール}}", categories: ["一般"] },
    { key: "電話", label: "電話", token: "{{電話}}", categories: ["一般"] },
    { key: "チェックイン", label: "チェックイン", token: "{{チェックイン}}", categories: ["一般"] },
    { key: "チェックアウト", label: "チェックアウト", token: "{{チェックアウト}}", categories: ["一般"] },
    { key: "泊数", label: "泊数", token: "{{泊数}}", categories: ["一般"] },
    { key: "人数", label: "人数", token: "{{人数}}", categories: ["一般"] },
    {
      key: "人数内訳",
      label: "人数内訳",
      token: "{{人数内訳}}",
      categories: ["本予約"],
    },
    {
      key: "チェックイン予定時間",
      label: "チェックイン予定時間",
      token: "{{チェックイン予定時間}}",
      categories: ["本予約"],
    },
    {
      key: "BBQ利用予定",
      label: "BBQ利用予定",
      token: "{{BBQ利用予定}}",
      categories: ["本予約"],
    },
    {
      key: "流しそうめんレンタル",
      label: "流しそうめんレンタル",
      token: "{{流しそうめんレンタル}}",
      categories: ["本予約"],
    },
    {
      key: "同行者フォームURL",
      label: "同行者リンク",
      token: "{{同行者フォームURL}}",
      categories: ["本予約"],
    },
  ],
};

export const DEFAULT_MAIL_TEMPLATES: MailTemplate[] = [
  {
    templateId: "TPL-001",
    name: "リクエスト承認（本予約案内）",
    category: "リクエスト",
    defaultPurpose: "",
    subject: "【みどりの時計台】ご予約リクエスト承認のお知らせ",
    body:
      "{{代表者名}} 様\n\n" +
      "この度はご予約リクエストをいただき、誠にありがとうございます。\n" +
      "内容を確認のうえ、承認いたしました。\n\n" +
      "以下のリンクより本予約フォームへお進みください。\n" +
      "{{本予約URL}}\n\n" +
      "【ご予約内容】\n" +
      "チェックイン：{{チェックイン}}\n" +
      "チェックアウト：{{チェックアウト}}\n" +
      "人数：{{人数}}\n\n" +
      "ご不明点がございましたら、このメールへご返信ください。\n\n" +
      "{{施設名}}",
    active: true,
    sortOrder: 1,
    note: "",
  },
  {
    templateId: "TPL-002",
    name: "リクエスト却下",
    category: "リクエスト",
    defaultPurpose: "",
    subject: "【みどりの時計台】ご予約リクエストについて",
    body:
      "{{代表者名}} 様\n\n" +
      "この度はご予約リクエストをいただき、誠にありがとうございました。\n" +
      "誠に恐れ入りますが、今回はご希望に沿えない状況のため、お受けできませんでした。\n\n" +
      "{{却下理由}}\n\n" +
      "またのご利用を心よりお待ちしております。\n\n" +
      "{{施設名}}",
    active: true,
    sortOrder: 2,
    note: "",
  },
  {
    templateId: "TPL-003",
    name: "本予約完了（同行者リンクあり）",
    category: "本予約",
    defaultPurpose: "予約確定",
    subject: "【みどりの時計台】ご予約完了のお知らせ",
    body:
      "{{代表者名}} 様\n\n" +
      "この度はご予約いただき、誠にありがとうございます。\n" +
      "以下の内容で予約を承りました。\n\n" +
      "【ご予約内容】\n" +
      "予約ID：{{予約ID}}\n" +
      "チェックイン：{{チェックイン}}\n" +
      "チェックアウト：{{チェックアウト}}\n" +
      "人数：{{人数}}\n\n" +
      "同行者情報のご入力は、以下の専用リンクよりお願いいたします。\n" +
      "{{同行者フォームURL}}\n\n" +
      "ご不明点がございましたら、このメールへご返信ください。\n\n" +
      "{{施設名}}",
    active: true,
    sortOrder: 3,
    note: "",
  },
  {
    templateId: "TPL-004",
    name: "本予約完了（同行者リンクなし）",
    category: "本予約",
    defaultPurpose: "予約確定",
    subject: "【みどりの時計台】ご予約完了のお知らせ",
    body:
      "{{代表者名}} 様\n\n" +
      "この度はご予約いただき、誠にありがとうございます。\n" +
      "以下の内容で予約を承りました。\n\n" +
      "【ご予約内容】\n" +
      "予約ID：{{予約ID}}\n" +
      "チェックイン：{{チェックイン}}\n" +
      "チェックアウト：{{チェックアウト}}\n" +
      "人数：{{人数}}\n\n" +
      "ご不明点がございましたら、このメールへご返信ください。\n\n" +
      "{{施設名}}",
    active: true,
    sortOrder: 4,
    note: "",
  },
  {
    templateId: "TPL-005",
    name: "キャンセル料案内（11日前）",
    category: "本予約",
    defaultPurpose: "11日前",
    subject: "【みどりの時計台】キャンセル料についてのご案内",
    body:
      "{{代表者名}} 様\n\n" +
      "ご予約のチェックイン日（{{チェックイン}}）が近づいてまいりました。\n" +
      "キャンセル料が発生する期間に入りますので、ご確認ください。\n\n" +
      "【ご予約内容】\n" +
      "チェックイン：{{チェックイン}}\n" +
      "チェックアウト：{{チェックアウト}}\n" +
      "人数：{{人数}}\n\n" +
      "ご不明点がございましたら、このメールへご返信ください。\n\n" +
      "{{施設名}}",
    active: true,
    sortOrder: 5,
    note: "",
  },
  {
    templateId: "TPL-006",
    name: "同行者情報リマインド（3日前）",
    category: "本予約",
    defaultPurpose: "3日前",
    subject: "【みどりの時計台】同行者情報のご入力のお願い",
    body:
      "{{代表者名}} 様\n\n" +
      "チェックイン（{{チェックイン}}）まであと数日となりました。\n" +
      "同行者情報のご入力がまだのようです。以下のリンクよりお願いいたします。\n\n" +
      "{{同行者フォームURL}}\n\n" +
      "【ご予約内容】\n" +
      "チェックイン：{{チェックイン}}\n" +
      "チェックアウト：{{チェックアウト}}\n" +
      "人数：{{人数}}\n\n" +
      "ご不明点がございましたら、このメールへご返信ください。\n\n" +
      "{{施設名}}",
    active: true,
    sortOrder: 6,
    note: "",
  },
];

export function nextTemplateId(templates: MailTemplate[]): string {
  let max = 0;
  for (const t of templates) {
    const m = /^TPL-(\d+)$/.exec(t.templateId);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `TPL-${String(max + 1).padStart(3, "0")}`;
}
