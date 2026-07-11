-- Mail templates + customer index tables

create table if not exists public.mail_templates (
  template_id      text primary key,
  name             text not null,
  category         text not null,
  default_purpose  text not null default '',
  subject          text not null default '',
  body             text not null default '',
  active           boolean not null default true,
  sort_order       int not null default 999,
  note             text not null default '',
  updated_at       timestamptz not null default now()
);

create index if not exists idx_mail_templates_sort
  on public.mail_templates (sort_order, template_id);

create table if not exists public.customers (
  customer_id          text primary key,
  customer_key         text not null unique,
  representative_name  text,
  name_kana            text,
  email                text,
  phone                text,
  visit_count          int not null default 0,
  last_check_out       date,
  is_repeater          boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_customers_email on public.customers (lower(email));
create index if not exists idx_customers_phone on public.customers (phone);
create index if not exists idx_customers_name on public.customers (representative_name);
create index if not exists idx_customers_name_kana on public.customers (name_kana);

alter table public.mail_templates enable row level security;
alter table public.customers enable row level security;

create policy "staff_all_mail_templates" on public.mail_templates
  for all to authenticated using (true) with check (true);
create policy "staff_all_customers" on public.customers
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.mail_templates
  to authenticated, service_role;
grant select, insert, update, delete on table public.customers
  to authenticated, service_role;

-- Initial mail templates (GAS Config.initialEmailTemplates equivalent)
insert into public.mail_templates (
  template_id, name, category, default_purpose, subject, body, active, sort_order
) values
  (
    'TPL-001',
    'リクエスト承認（本予約案内）',
    'リクエスト',
    '',
    '【みどりの時計台】ご予約リクエスト承認のお知らせ',
    '{{代表者名}} 様

この度はご予約リクエストをいただき、誠にありがとうございます。
内容を確認のうえ、承認いたしました。

以下のリンクより本予約フォームへお進みください。
{{本予約URL}}

【ご予約内容】
チェックイン：{{チェックイン}}
チェックアウト：{{チェックアウト}}
人数：{{人数}}

ご不明点がございましたら、このメールへご返信ください。

{{施設名}}',
    true,
    1
  ),
  (
    'TPL-002',
    'リクエスト却下',
    'リクエスト',
    '',
    '【みどりの時計台】ご予約リクエストについて',
    '{{代表者名}} 様

この度はご予約リクエストをいただき、誠にありがとうございました。
誠に恐れ入りますが、今回はご希望に沿えない状況のため、お受けできませんでした。

{{却下理由}}

またのご利用を心よりお待ちしております。

{{施設名}}',
    true,
    2
  ),
  (
    'TPL-003',
    '本予約完了（同行者リンクあり）',
    '本予約',
    '予約確定',
    '【みどりの時計台】ご予約完了のお知らせ',
    '{{代表者名}} 様

この度はご予約いただき、誠にありがとうございます。
以下の内容で予約を承りました。

【ご予約内容】
予約ID：{{予約ID}}
チェックイン：{{チェックイン}}
チェックアウト：{{チェックアウト}}
人数：{{人数}}

同行者情報のご入力は、以下の専用リンクよりお願いいたします。
{{同行者フォームURL}}

ご不明点がございましたら、このメールへご返信ください。

{{施設名}}',
    true,
    3
  ),
  (
    'TPL-004',
    '本予約完了（同行者リンクなし）',
    '本予約',
    '予約確定',
    '【みどりの時計台】ご予約完了のお知らせ',
    '{{代表者名}} 様

この度はご予約いただき、誠にありがとうございます。
以下の内容で予約を承りました。

【ご予約内容】
予約ID：{{予約ID}}
チェックイン：{{チェックイン}}
チェックアウト：{{チェックアウト}}
人数：{{人数}}

ご不明点がございましたら、このメールへご返信ください。

{{施設名}}',
    true,
    4
  ),
  (
    'TPL-005',
    'キャンセル料案内（11日前）',
    '本予約',
    '11日前',
    '【みどりの時計台】キャンセル料についてのご案内',
    '{{代表者名}} 様

ご予約のチェックイン日（{{チェックイン}}）が近づいてまいりました。
キャンセル料が発生する期間に入りますので、ご確認ください。

【ご予約内容】
チェックイン：{{チェックイン}}（到着予定 {{チェックイン予定時間}}）
チェックアウト：{{チェックアウト}}
人数：{{人数}}
BBQ：{{BBQ利用予定}}

ご不明点がございましたら、このメールへご返信ください。

{{施設名}}',
    true,
    5
  ),
  (
    'TPL-006',
    '同行者情報リマインド（3日前）',
    '本予約',
    '3日前',
    '【みどりの時計台】同行者情報のご入力のお願い',
    '{{代表者名}} 様

チェックイン（{{チェックイン}}）まであと数日となりました。
同行者情報のご入力がまだのようです。以下のリンクよりお願いいたします。

{{同行者フォームURL}}

【ご予約内容】
チェックイン：{{チェックイン}}（到着予定 {{チェックイン予定時間}}）
チェックアウト：{{チェックアウト}}
人数：{{人数}}
BBQ：{{BBQ利用予定}}

ご不明点がございましたら、このメールへご返信ください。

{{施設名}}',
    true,
    6
  )
on conflict (template_id) do nothing;
