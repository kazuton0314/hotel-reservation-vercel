-- =============================================================================
-- Looker 分析ビュー再構築（正とする最小セット）
--
-- 方針:
--   - 粒度が違うものだけ view にする（4本）
--   - 月次集計・内訳の切り口は Looker 側で組み合わせる
--   - 個人情報は出さない
--
-- 正:
--   1. reservation_summary_view      … 予約 1 行（属性・選択項目の分布）
--   2. reservation_nightly_stay_view … 予約×滞在夜（連泊・人泊・料金区分）
--   3. room_daily_occupancy_view     … 部屋×稼働夜（稼働率。月次は Looker で集計）
--   4. reservation_travel_purpose_view … 旅行目的の複数選択を行分解
--
-- 廃止（このマイグレーションで DROP）:
--   reservation_monthly_stay_view, room_monthly_occupancy_view,
--   room_usage_view, daily_operation_view,
--   reservation_request_summary_view, task_summary_view
-- =============================================================================

-- 共通関数（014 相当。未適用環境でもこのファイル単体で完結させる）
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

-- 依存関係のある旧 view から先に DROP
drop view if exists public.reservation_monthly_stay_view;
drop view if exists public.room_monthly_occupancy_view;
drop view if exists public.room_usage_view;
drop view if exists public.daily_operation_view;
drop view if exists public.reservation_request_summary_view;
drop view if exists public.task_summary_view;
drop view if exists public.reservation_nightly_stay_view;
drop view if exists public.room_daily_occupancy_view;
drop view if exists public.reservation_travel_purpose_view;
drop view if exists public.reservation_summary_view;

-- ---------------------------------------------------------------------------
-- 1) 予約 1 行（属性分析）
--    キャンセル・アーカイブも残す。Looker で reservation_status / is_archived を絞る。
-- ---------------------------------------------------------------------------
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
    end as guest_count,
    case
      when b.adult_male_count is null or b.adult_female_count is null then null
      else b.adult_male_count + b.adult_female_count
    end as adult_count,
    case
      when b.boy_student_count is null or b.girl_student_count is null then null
      else b.boy_student_count + b.girl_student_count
    end as elementary_count
  from base b
)
select
  c.reservation_id as reservation_id,
  public.analysis_choice_label(c.channel) as reservation_channel,
  c.status as reservation_status,
  c.check_in as check_in_date,
  c.check_out as check_out_date,
  c.nights as nights,
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
  c.is_archived as is_archived,
  c.created_at as created_at,
  c.cancelled_at as cancelled_at,
  case when c.guest_count is null then '未設定' else '確定' end as guest_count_status,
  c.guest_count as guest_count_total,
  case
    when c.guest_count is null then '未設定'
    when c.guest_count between 1 and 2 then '1〜2名'
    when c.guest_count between 3 and 5 then '3〜5名'
    when c.guest_count between 6 and 10 then '6〜10名'
    when c.guest_count between 11 and 20 then '11〜20名'
    else '21名以上'
  end as guest_band,
  c.adult_count as adult_count,
  c.elementary_count as elementary_count,
  c.age_3plus_count as age_3plus_count,
  c.under_3_count as under_3_count,
  c.adult_male_count as adult_male_count,
  c.adult_female_count as adult_female_count,
  c.boy_student_count as boy_student_count,
  c.girl_student_count as girl_student_count,
  public.analysis_choice_label(c.bbq) as bbq_status,
  case public.analysis_choice_label(c.bbq)
    when '要' then 1
    when '未設定' then null
    else 0
  end as bbq_rental_flag,
  public.analysis_choice_label(c.somen) as somen_status,
  public.analysis_choice_label(c.meal) as meal_plan,
  public.analysis_choice_label(c.referral) as referral,
  public.analysis_choice_label(c.travel_purpose) as travel_purpose,
  public.analysis_definite_int(c.vehicle_count) as vehicle_count,
  public.analysis_choice_label(c.assignment_status) as room_assignment_status,
  c.companion_form_answered as companion_input_completed,
  public.analysis_choice_label(c.payment_status) as payment_status
from counted c;

comment on view public.reservation_summary_view is
  'Looker正: 予約1行。属性・選択項目の分布用。連泊の泊数分カウントには使わない。';

-- ---------------------------------------------------------------------------
-- 2) 予約 × 滞在夜（連泊・人泊・料金区分）
--    キャンセル除外・アーカイブ含む。月次推移は Looker で stay_year_month 集計。
--    大人=中学生以上 / 小学生 / 3歳以上幼児
-- ---------------------------------------------------------------------------
create view public.reservation_nightly_stay_view as
with base as (
  select
    r.reservation_id,
    r.status,
    r.channel,
    r.is_archived,
    r.check_in,
    r.check_out,
    r.bbq,
    r.somen,
    r.meal,
    r.referral,
    public.analysis_text_kind(r.guest_total) as guest_total_kind,
    public.analysis_definite_int(r.guest_total) as guest_total_definite,
    public.analysis_breakdown_int(r.adult_male) as adult_male_count,
    public.analysis_breakdown_int(r.adult_female) as adult_female_count,
    public.analysis_breakdown_int(r.boy_student) as boy_student_count,
    public.analysis_breakdown_int(r.girl_student) as girl_student_count,
    public.analysis_breakdown_int(r.age_3plus) as age_3plus_count,
    public.analysis_breakdown_int(r.under_3) as under_3_count
  from public.reservations r
  where r.status <> 'キャンセル'
    and r.check_in is not null
    and r.check_out is not null
    and r.check_in < r.check_out
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
    end as guest_count,
    case
      when b.adult_male_count is null or b.adult_female_count is null then null
      else b.adult_male_count + b.adult_female_count
    end as adult_count,
    case
      when b.boy_student_count is null or b.girl_student_count is null then null
      else b.boy_student_count + b.girl_student_count
    end as elementary_count
  from base b
)
select
  c.reservation_id as reservation_id,
  gs.stay_date::date as stay_date,
  to_char(gs.stay_date::date, 'YYYY-MM') as stay_year_month,
  public.analysis_choice_label(c.channel) as reservation_channel,
  c.status as reservation_status,
  c.is_archived as is_archived,
  case when c.guest_count is null then '未設定' else '確定' end as guest_count_status,
  1::int as group_night,
  c.guest_count as guest_nights,
  c.adult_count as adult_guest_nights,
  c.elementary_count as elementary_guest_nights,
  c.age_3plus_count as age_3plus_guest_nights,
  c.under_3_count as under_3_guest_nights,
  c.adult_male_count as adult_male_count,
  c.adult_female_count as adult_female_count,
  c.boy_student_count as boy_student_count,
  c.girl_student_count as girl_student_count,
  c.age_3plus_count as age_3plus_count,
  c.under_3_count as under_3_count,
  public.analysis_choice_label(c.bbq) as bbq_status,
  public.analysis_choice_label(c.somen) as somen_status,
  public.analysis_choice_label(c.meal) as meal_plan,
  public.analysis_choice_label(c.referral) as referral
from counted c
cross join lateral generate_series(
  c.check_in,
  c.check_out - 1,
  interval '1 day'
) as gs(stay_date);

comment on view public.reservation_nightly_stay_view is
  'Looker正: 予約×滞在夜。連泊は泊数分行。group_night/人泊/料金3区分。月次は Looker 集計。';

-- ---------------------------------------------------------------------------
-- 3) 部屋 × 稼働夜（稼働率）
--    キャンセル除外・アーカイブ含む。
--    月次稼働率 = COUNT(occupancy_date) / MAX(days_in_month) * 100（Looker）
-- ---------------------------------------------------------------------------
create view public.room_daily_occupancy_view as
with assignment_spans as (
  select
    ra.room_id,
    coalesce(nullif(btrim(ra.room_name), ''), rm.room_name, ra.room_id) as room_name,
    ra.reservation_id,
    coalesce(r.check_in, ra.stay_start) as stay_start,
    coalesce(r.check_out, ra.stay_end) as stay_end,
    r.status as reservation_status,
    public.analysis_choice_label(r.channel) as reservation_channel
  from public.room_assignments ra
  inner join public.reservations r
    on r.reservation_id = ra.reservation_id
  left join public.rooms rm
    on rm.room_id = ra.room_id
  where ra.room_id is not null
    and r.status <> 'キャンセル'
    and coalesce(r.check_in, ra.stay_start) is not null
    and coalesce(r.check_out, ra.stay_end) is not null
    and coalesce(r.check_in, ra.stay_start)
      < coalesce(r.check_out, ra.stay_end)
)
select distinct
  s.room_id as room_id,
  s.room_name as room_name,
  gs.occupancy_date::date as occupancy_date,
  to_char(gs.occupancy_date::date, 'YYYY-MM') as occupancy_year_month,
  extract(
    day from (
      date_trunc('month', gs.occupancy_date::date)
      + interval '1 month - 1 day'
    )
  )::int as days_in_month,
  s.reservation_id as reservation_id,
  s.reservation_status as reservation_status,
  s.reservation_channel as reservation_channel
from assignment_spans s
cross join lateral generate_series(
  s.stay_start,
  s.stay_end - 1,
  interval '1 day'
) as gs(occupancy_date);

comment on view public.room_daily_occupancy_view is
  'Looker正: 部屋×稼働夜。月次稼働率は Looker で COUNT/MAX(days_in_month)。';

-- ---------------------------------------------------------------------------
-- 4) 旅行目的（複数選択の行分解）のみ別粒度
-- ---------------------------------------------------------------------------
create view public.reservation_travel_purpose_view as
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
  'Looker正: 旅行目的の複数選択を1目的1行に分解。';

grant execute on function public.analysis_text_kind(text) to anon, authenticated, service_role;
grant execute on function public.analysis_definite_int(text) to anon, authenticated, service_role;
grant execute on function public.analysis_choice_label(text) to anon, authenticated, service_role;
grant execute on function public.analysis_breakdown_int(text) to anon, authenticated, service_role;
grant select on public.reservation_summary_view to anon, authenticated, service_role;
grant select on public.reservation_nightly_stay_view to anon, authenticated, service_role;
grant select on public.room_daily_occupancy_view to anon, authenticated, service_role;
grant select on public.reservation_travel_purpose_view to anon, authenticated, service_role;
