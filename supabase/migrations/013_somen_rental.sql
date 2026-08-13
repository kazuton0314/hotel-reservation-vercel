-- STUDIO 本予約フォームに追加された「流しそうめんレンタル」（要 / 不要）
alter table public.reservations
  add column if not exists somen text;

comment on column public.reservations.somen is '流しそうめんレンタル（要 / 不要）。過去データは空';

-- Looker 予約サマリに流しそうめんを追加
create or replace view public.reservation_summary_view as
with base as (
  select
    r.reservation_id,
    r.channel,
    r.status,
    r.check_in,
    r.check_out,
    r.nights,
    case
      when coalesce(nullif(regexp_replace(coalesce(r.guest_total, ''), '[^0-9]', '', 'g'), ''), '0')::int > 0
        then coalesce(nullif(regexp_replace(coalesce(r.guest_total, ''), '[^0-9]', '', 'g'), ''), '0')::int
      else
        coalesce(nullif(regexp_replace(coalesce(r.adult_male, ''), '[^0-9]', '', 'g'), ''), '0')::int
        + coalesce(nullif(regexp_replace(coalesce(r.adult_female, ''), '[^0-9]', '', 'g'), ''), '0')::int
        + coalesce(nullif(regexp_replace(coalesce(r.boy_student, ''), '[^0-9]', '', 'g'), ''), '0')::int
        + coalesce(nullif(regexp_replace(coalesce(r.girl_student, ''), '[^0-9]', '', 'g'), ''), '0')::int
        + coalesce(nullif(regexp_replace(coalesce(r.age_3plus, ''), '[^0-9]', '', 'g'), ''), '0')::int
        + coalesce(nullif(regexp_replace(coalesce(r.under_3, ''), '[^0-9]', '', 'g'), ''), '0')::int
    end as guest_count,
    r.bbq,
    r.somen,
    r.meal,
    coalesce(nullif(regexp_replace(coalesce(r.vehicle_count, ''), '[^0-9]', '', 'g'), ''), '0')::int as vehicle_count,
    r.assignment_status,
    r.companion_form_answered,
    r.payment_status,
    r.created_at,
    case when r.status = 'キャンセル' then r.updated_at else null end as cancelled_at
  from public.reservations r
)
select
  b.reservation_id as reservation_id,
  b.channel as reservation_channel,
  b.status as reservation_status,
  b.check_in as check_in_date,
  b.check_out as check_out_date,
  b.nights as nights,
  b.guest_count as guest_count_total,
  case
    when b.guest_count between 1 and 2 then '1〜2名'
    when b.guest_count between 3 and 5 then '3〜5名'
    when b.guest_count between 6 and 10 then '6〜10名'
    when b.guest_count between 11 and 20 then '11〜20名'
    when b.guest_count >= 21 then '21名以上'
    else '不明'
  end as guest_band,
  to_char(b.check_in, 'YYYY-MM') as check_in_year_month,
  case extract(dow from b.check_in)
    when 0 then '日'
    when 1 then '月'
    when 2 then '火'
    when 3 then '水'
    when 4 then '木'
    when 5 then '金'
    when 6 then '土'
    else null
  end as check_in_weekday,
  b.bbq as bbq_usage,
  b.somen as somen_rental,
  b.meal as meal_plan,
  b.vehicle_count as vehicle_count,
  b.assignment_status as room_assignment_status,
  b.companion_form_answered as companion_input_completed,
  b.payment_status as payment_status,
  b.created_at as created_at,
  b.cancelled_at as cancelled_at
from base b;

comment on view public.reservation_summary_view is
  'Looker向け 予約単位サマリ（個人情報除外）';

grant select on public.reservation_summary_view to anon, authenticated, service_role;
