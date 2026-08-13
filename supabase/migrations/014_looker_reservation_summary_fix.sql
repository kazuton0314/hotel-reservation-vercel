-- 分析用予約サマリの人数計算を修正し、内訳・選択項目を追加
-- 不定人数（例: 30〜40人）を数字連結しない。未設定として残し、人数合計の母数からは外す。

create or replace function public.analysis_text_kind(raw text)
returns text
language sql
immutable
as $$
  select case
    when btrim(coalesce(raw, '')) = '' then 'empty'
    when regexp_replace(
           translate(btrim(raw), '０１２３４５６７８９', '0123456789'),
           '[\s　人名]',
           '',
           'g'
         ) ~ '^[0-9]+$'
      then 'definite'
    else 'indefinite'
  end
$$;

create or replace function public.analysis_definite_int(raw text)
returns int
language sql
immutable
as $$
  select case
    when public.analysis_text_kind(raw) = 'definite'
      then regexp_replace(
             translate(btrim(raw), '０１２３４５６７８９', '0123456789'),
             '[\s　人名]',
             '',
             'g'
           )::int
    else null
  end
$$;

create or replace function public.analysis_choice_label(raw text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(btrim(coalesce(raw, '')), ''), '未設定')
$$;

create or replace function public.analysis_breakdown_int(raw text)
returns int
language sql
immutable
as $$
  select case public.analysis_text_kind(raw)
    when 'definite' then public.analysis_definite_int(raw)
    when 'empty' then 0
    else null
  end
$$;

drop view if exists public.reservation_summary_view;

create view public.reservation_summary_view as
with base as (
  select
    r.reservation_id,
    r.channel,
    r.status,
    r.check_in,
    r.check_out,
    r.nights,
    r.is_archived,
    public.analysis_text_kind(r.guest_total) as guest_total_kind,
    public.analysis_definite_int(r.guest_total) as guest_total_definite,
    public.analysis_breakdown_int(r.adult_male) as adult_male_count,
    public.analysis_breakdown_int(r.adult_female) as adult_female_count,
    public.analysis_breakdown_int(r.boy_student) as boy_student_count,
    public.analysis_breakdown_int(r.girl_student) as girl_student_count,
    public.analysis_breakdown_int(r.age_3plus) as age_3plus_count,
    public.analysis_breakdown_int(r.under_3) as under_3_count,
    r.bbq,
    r.somen,
    r.meal,
    r.travel_purpose,
    r.referral,
    r.vehicle_count,
    r.assignment_status,
    r.companion_form_answered,
    r.payment_status,
    r.created_at,
    case when r.status = 'キャンセル' then r.updated_at else null end as cancelled_at
  from public.reservations r
),
counted as (
  select
    b.*,
    case
      when b.guest_total_kind = 'definite' then b.guest_total_definite
      when b.guest_total_kind = 'indefinite' then null
      when b.adult_male_count is null
        or b.adult_female_count is null
        or b.boy_student_count is null
        or b.girl_student_count is null
        or b.age_3plus_count is null
        or b.under_3_count is null
        then null
      when (
        b.adult_male_count
        + b.adult_female_count
        + b.boy_student_count
        + b.girl_student_count
        + b.age_3plus_count
        + b.under_3_count
      ) > 0 then
        b.adult_male_count
        + b.adult_female_count
        + b.boy_student_count
        + b.girl_student_count
        + b.age_3plus_count
        + b.under_3_count
      else null
    end as guest_count
  from base b
)
select
  c.reservation_id as reservation_id,
  public.analysis_choice_label(c.channel) as reservation_channel,
  c.status as reservation_status,
  c.check_in as check_in_date,
  c.check_out as check_out_date,
  c.nights as nights,
  c.guest_count as guest_count_total,
  case
    when c.guest_count is null then '未設定'
    when c.guest_count between 1 and 2 then '1〜2名'
    when c.guest_count between 3 and 5 then '3〜5名'
    when c.guest_count between 6 and 10 then '6〜10名'
    when c.guest_count between 11 and 20 then '11〜20名'
    else '21名以上'
  end as guest_band,
  to_char(c.check_in, 'YYYY-MM') as check_in_year_month,
  case extract(dow from c.check_in)
    when 0 then '日'
    when 1 then '月'
    when 2 then '火'
    when 3 then '水'
    when 4 then '木'
    when 5 then '金'
    when 6 then '土'
    else null
  end as check_in_weekday,
  c.bbq as bbq_usage,
  c.somen as somen_rental,
  public.analysis_choice_label(c.meal) as meal_plan,
  public.analysis_definite_int(c.vehicle_count) as vehicle_count,
  public.analysis_choice_label(c.assignment_status) as room_assignment_status,
  c.companion_form_answered as companion_input_completed,
  public.analysis_choice_label(c.payment_status) as payment_status,
  c.created_at as created_at,
  c.cancelled_at as cancelled_at,
  c.is_archived as is_archived,
  case when c.guest_count is null then '未設定' else '確定' end as guest_count_status,
  c.adult_male_count as adult_male_count,
  c.adult_female_count as adult_female_count,
  c.boy_student_count as boy_student_count,
  c.girl_student_count as girl_student_count,
  c.age_3plus_count as age_3plus_count,
  c.under_3_count as under_3_count,
  public.analysis_choice_label(c.bbq) as bbq_status,
  case public.analysis_choice_label(c.bbq)
    when '要' then 1
    when '未設定' then null
    else 0
  end as bbq_rental_flag,
  public.analysis_choice_label(c.somen) as somen_status,
  public.analysis_choice_label(c.travel_purpose) as travel_purpose,
  public.analysis_choice_label(c.referral) as referral
from counted c;

comment on view public.reservation_summary_view is
  'Looker向け 予約単位サマリ（個人情報除外）。不定人数は未設定、人数合計の母数から除外';

-- 旅行目的は複数選択のため、1予約を目的ごとに1行へ分解
create or replace view public.reservation_travel_purpose_view as
select
  r.reservation_id as reservation_id,
  r.status as reservation_status,
  r.is_archived as is_archived,
  r.check_in as check_in_date,
  to_char(r.check_in, 'YYYY-MM') as check_in_year_month,
  public.analysis_choice_label(nullif(btrim(p.purpose), '')) as travel_purpose
from public.reservations r
left join lateral unnest(
  case
    when btrim(coalesce(r.travel_purpose, '')) = '' then array['']::text[]
    else regexp_split_to_array(r.travel_purpose, '[、,／/|]+')
  end
) as p(purpose) on true;

comment on view public.reservation_travel_purpose_view is
  'Looker向け 旅行目的の内訳（複数選択を行に分解。空は未設定）';

grant execute on function public.analysis_text_kind(text) to anon, authenticated, service_role;
grant execute on function public.analysis_definite_int(text) to anon, authenticated, service_role;
grant execute on function public.analysis_choice_label(text) to anon, authenticated, service_role;
grant execute on function public.analysis_breakdown_int(text) to anon, authenticated, service_role;
grant select on public.reservation_summary_view to anon, authenticated, service_role;
grant select on public.reservation_travel_purpose_view to anon, authenticated, service_role;
