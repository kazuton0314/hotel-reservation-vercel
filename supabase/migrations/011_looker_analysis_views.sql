-- Looker Studio 向け分析ビュー
-- 個人情報（氏名/メール/電話/住所/問い合わせ本文/内部メモ）は含めない

-- ---------------------------------------------------------------------------
-- 共通: 人数帯分類を使うための式（各ビュー内で同等ロジックを使用）
-- 1-2 / 3-5 / 6-10 / 11-20 / 21+
-- ---------------------------------------------------------------------------

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


create or replace view public.reservation_request_summary_view as
with base as (
  select
    rr.request_id,
    rr.status,
    rr.check_in,
    rr.check_out,
    rr.nights,
    coalesce(nullif(regexp_replace(coalesce(rr.guest_total, ''), '[^0-9]', '', 'g'), ''), '0')::int as guest_count,
    rr.created_at,
    rr.updated_at,
    rr.linked_reservation_id,
    rr.reply_email_sent,
    r.channel as reservation_channel
  from public.reservation_requests rr
  left join public.reservations r
    on r.request_id = rr.request_id
   and r.is_archived = false
)
select
  b.request_id as request_id,
  b.status as request_status,
  b.check_in as check_in_date,
  b.check_out as check_out_date,
  b.nights as nights,
  b.guest_count as guest_count,
  case
    when b.guest_count between 1 and 2 then '1〜2名'
    when b.guest_count between 3 and 5 then '3〜5名'
    when b.guest_count between 6 and 10 then '6〜10名'
    when b.guest_count between 11 and 20 then '11〜20名'
    when b.guest_count >= 21 then '21名以上'
    else '不明'
  end as guest_band,
  to_char(coalesce(b.check_in, b.created_at::date), 'YYYY-MM') as received_year_month,
  coalesce(b.reservation_channel, '不明') as reservation_channel,
  case when b.status = '承認済' then b.updated_at else null end as approved_at,
  case when b.status = '却下' then b.updated_at else null end as rejected_at,
  b.reply_email_sent as answered_main_reservation,
  b.linked_reservation_id as linked_reservation_id,
  (b.linked_reservation_id is not null) as converted_to_reservation,
  case
    when b.status = 'リクエスト' then greatest(0, (current_date - b.created_at::date))
    else 0
  end as waiting_days
from base b;

comment on view public.reservation_request_summary_view is
  'Looker向け リクエスト単位サマリ（個人情報除外）';


create or replace view public.room_usage_view as
select
  ra.reservation_id as reservation_id,
  ra.room_id as room_id,
  coalesce(ra.room_name, rm.room_name) as room_name,
  ra.stay_start as usage_start_date,
  ra.stay_end as usage_end_date,
  greatest(0, (ra.stay_end - ra.stay_start))::int as usage_nights,
  coalesce(ra.assigned_guest_count, 0) as assigned_guest_count,
  to_char(ra.stay_start, 'YYYY-MM') as check_in_year_month,
  r.channel as reservation_channel,
  r.status as reservation_status
from public.room_assignments ra
left join public.reservations r
  on r.reservation_id = ra.reservation_id
left join public.rooms rm
  on rm.room_id = ra.room_id
where ra.is_archived = false;

comment on view public.room_usage_view is
  'Looker向け 部屋利用サマリ';


create or replace view public.daily_operation_view as
with date_range as (
  select
    generate_series(
      coalesce((select min(check_in) from public.reservations where check_in is not null), current_date - 30),
      coalesce((select max(check_out) from public.reservations where check_out is not null), current_date + 30),
      interval '1 day'
    )::date as op_date
),
active_reservations as (
  select
    r.*,
    rr.reply_email_sent as request_reply_email_sent,
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
    end as guest_count
  from public.reservations r
  left join public.reservation_requests rr
    on rr.request_id = r.request_id
  where r.is_archived = false
    and r.status <> 'キャンセル'
)
select
  d.op_date as operation_date,
  coalesce(sum(case when ar.check_in = d.op_date then 1 else 0 end), 0)::int as checkin_count,
  coalesce(sum(case when ar.check_out = d.op_date then 1 else 0 end), 0)::int as checkout_count,
  coalesce(sum(case when ar.check_in <= d.op_date and d.op_date < ar.check_out then 1 else 0 end), 0)::int as staying_reservation_count,
  coalesce(sum(case when ar.check_in <= d.op_date and d.op_date < ar.check_out then ar.guest_count else 0 end), 0)::int as staying_guest_count,
  coalesce(sum(case when ar.request_id is not null and coalesce(ar.request_reply_email_sent, false) = false then 1 else 0 end), 0)::int as pending_main_reservation_count,
  coalesce(sum(case when ar.check_in = d.op_date and coalesce(ar.bbq, '') <> '' and ar.bbq <> '不要' then 1 else 0 end), 0)::int as bbq_planned_count,
  coalesce(sum(case when ar.check_in = d.op_date then coalesce(nullif(regexp_replace(coalesce(ar.vehicle_count, ''), '[^0-9]', '', 'g'), ''), '0')::int else 0 end), 0)::int as vehicle_count_total,
  coalesce(sum(case when ar.check_in = d.op_date and ar.assignment_status = '未割当' then 1 else 0 end), 0)::int as unassigned_count,
  coalesce(sum(case when ar.check_in = d.op_date and ar.companion_form_answered = false then 1 else 0 end), 0)::int as companion_not_input_count
from date_range d
left join active_reservations ar
  on ar.check_in <= d.op_date
 and ar.check_out >= d.op_date
group by d.op_date
order by d.op_date;

comment on view public.daily_operation_view is
  'Looker向け 日別運用サマリ';


create or replace view public.task_summary_view as
with today_jst as (
  select (now() at time zone 'Asia/Tokyo')::date as d
),
active_reservations as (
  select
    r.*,
    rr.reply_email_sent as request_reply_email_sent
  from public.reservations
  r
  left join public.reservation_requests rr
    on rr.request_id = r.request_id
  where r.is_archived = false
    and r.status <> 'キャンセル'
),
active_requests as (
  select *
  from public.reservation_requests
  where is_archived = false
)
select
  '未対応リクエスト'::text as task_type,
  rr.request_id as target_id,
  null::text as related_reservation_id,
  rr.created_at::date as occurred_date,
  rr.created_at::date + 2 as due_date,
  case when rr.status = 'リクエスト' then 'open' else 'closed' end as status,
  '未対応リクエスト'::text as display_label
from active_requests rr
where rr.status = 'リクエスト'

union all

select
  '本予約回答待ち'::text as task_type,
  r.reservation_id as target_id,
  r.reservation_id as related_reservation_id,
  r.created_at::date as occurred_date,
  r.check_in - 3 as due_date,
  case when coalesce(r.request_reply_email_sent, false) then 'closed' else 'open' end as status,
  '本予約回答待ち'::text as display_label
from active_reservations r
where r.request_id is not null
  and coalesce(r.request_reply_email_sent, false) = false

union all

select
  '部屋割り未設定'::text as task_type,
  r.reservation_id as target_id,
  r.reservation_id as related_reservation_id,
  r.created_at::date as occurred_date,
  r.check_in - 1 as due_date,
  case when r.assignment_status = '未割当' then 'open' else 'closed' end as status,
  '部屋割り未設定'::text as display_label
from active_reservations r
where r.status = '確定'
  and r.assignment_status = '未割当'

union all

select
  '宿泊者情報未入力'::text as task_type,
  r.reservation_id as target_id,
  r.reservation_id as related_reservation_id,
  r.created_at::date as occurred_date,
  r.check_in - 3 as due_date,
  case when r.companion_form_answered then 'closed' else 'open' end as status,
  '宿泊者情報未入力'::text as display_label
from active_reservations r
where r.status = '確定'
  and r.companion_form_answered = false

union all

select
  '今日チェックイン'::text as task_type,
  r.reservation_id as target_id,
  r.reservation_id as related_reservation_id,
  r.check_in as occurred_date,
  r.check_in as due_date,
  'open'::text as status,
  '今日チェックイン'::text as display_label
from active_reservations r
cross join today_jst t
where r.check_in = t.d

union all

select
  '今日チェックアウト'::text as task_type,
  r.reservation_id as target_id,
  r.reservation_id as related_reservation_id,
  r.check_out as occurred_date,
  r.check_out as due_date,
  'open'::text as status,
  '今日チェックアウト'::text as display_label
from active_reservations r
cross join today_jst t
where r.check_out = t.d;

comment on view public.task_summary_view is
  'Looker向け 運用タスク一覧';

grant select on public.reservation_summary_view to anon, authenticated, service_role;
grant select on public.reservation_request_summary_view to anon, authenticated, service_role;
grant select on public.room_usage_view to anon, authenticated, service_role;
grant select on public.daily_operation_view to anon, authenticated, service_role;
grant select on public.task_summary_view to anon, authenticated, service_role;
