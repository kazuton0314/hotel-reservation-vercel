-- 011 修正: 部屋利用・日別運用・リクエスト紐付けでアーカイブ済みを含める
-- 011 実行済みの環境向けパッチ

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
inner join public.reservations r
  on r.reservation_id = ra.reservation_id
left join public.rooms rm
  on rm.room_id = ra.room_id
where r.status <> 'キャンセル';

comment on view public.room_usage_view is
  'Looker向け 部屋利用サマリ（アーカイブ含む・キャンセル除外）';

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
  where r.status <> 'キャンセル'
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
  'Looker向け 日別運用サマリ（アーカイブ含む・キャンセル除外）';

grant select on public.reservation_request_summary_view to anon, authenticated, service_role;
grant select on public.room_usage_view to anon, authenticated, service_role;
grant select on public.daily_operation_view to anon, authenticated, service_role;
