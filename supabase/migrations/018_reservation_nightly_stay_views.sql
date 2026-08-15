-- Looker向け: 連泊を泊数分カウントする宿泊実績ビュー
-- 1行 = 予約 × 滞在夜（CI〜CO前日）
-- 料金区分: 大人=中学生以上(男女合計) / 小学生(男女合計) / 3歳以上幼児
-- アーカイブ含む・キャンセル除外（部屋稼働率と同じ方針）

create or replace view public.reservation_nightly_stay_view as
with base as (
  select
    r.reservation_id,
    r.status,
    r.channel,
    r.is_archived,
    r.check_in,
    r.check_out,
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
    end as elementary_count,
    b.age_3plus_count as toddler_3plus_count
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
  c.toddler_3plus_count as age_3plus_guest_nights,
  c.under_3_count as under_3_guest_nights,
  c.adult_male_count as adult_male_count,
  c.adult_female_count as adult_female_count,
  c.boy_student_count as boy_student_count,
  c.girl_student_count as girl_student_count,
  c.age_3plus_count as age_3plus_count,
  c.under_3_count as under_3_count
from counted c
cross join lateral generate_series(
  c.check_in,
  c.check_out - 1,
  interval '1 day'
) as gs(stay_date);

comment on view public.reservation_nightly_stay_view is
  'Looker向け 予約×滞在夜（連泊は泊数分行）。group_night=1、人数は人泊。大人=中学生以上、小学生、3歳以上幼児。キャンセル除外・アーカイブ含む';

-- 月次集計（推移グラフ用）
create or replace view public.reservation_monthly_stay_view as
select
  stay_year_month,
  count(*)::int as group_nights,
  count(distinct reservation_id)::int as reservation_count,
  sum(guest_nights)::int as guest_nights,
  sum(adult_guest_nights)::int as adult_guest_nights,
  sum(elementary_guest_nights)::int as elementary_guest_nights,
  sum(age_3plus_guest_nights)::int as age_3plus_guest_nights,
  sum(under_3_guest_nights)::int as under_3_guest_nights
from public.reservation_nightly_stay_view
group by stay_year_month
order by stay_year_month;

comment on view public.reservation_monthly_stay_view is
  'Looker向け 月次宿泊実績（連泊を泊数分カウント）。group_nights=グループ泊、guest_nights=人泊、料金3区分の人泊';

grant select on public.reservation_nightly_stay_view to anon, authenticated, service_role;
grant select on public.reservation_monthly_stay_view to anon, authenticated, service_role;
