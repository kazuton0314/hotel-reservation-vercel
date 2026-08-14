-- 015 修正: アーカイブ済み（過去予約・部屋割）も稼働率に含める。キャンセルのみ除外。
-- 015 実行済みの環境向けパッチ（015 未実行なら 015 の内容と同等）

create or replace view public.room_daily_occupancy_view as
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
  'Looker向け 部屋×日の稼働（1泊=1行。CO日は含めない。アーカイブ含む・キャンセル除外）';

-- room_monthly_occupancy_view は room_daily_occupancy_view を参照するため再作成不要だが、
-- 015 未実行環境との整合のため明示的に再定義
create or replace view public.room_monthly_occupancy_view as
with occupied as (
  select
    room_id,
    room_name,
    occupancy_year_month,
    count(*)::int as occupied_nights
  from public.room_daily_occupancy_view
  group by room_id, room_name, occupancy_year_month
),
months as (
  select distinct occupancy_year_month as year_month
  from occupied
),
active_rooms as (
  select
    room_id,
    room_name
  from public.rooms
  where is_active = true
  union
  select distinct
    room_id,
    room_name
  from occupied
  where room_id is not null
),
grid as (
  select
    ar.room_id,
    ar.room_name,
    m.year_month,
    (
      date_trunc(
        'month',
        to_date(m.year_month || '-01', 'YYYY-MM-DD')
      )
      + interval '1 month - 1 day'
    )::date as month_last_day
  from active_rooms ar
  cross join months m
)
select
  g.room_id as room_id,
  g.room_name as room_name,
  g.year_month as occupancy_year_month,
  coalesce(o.occupied_nights, 0)::int as occupied_nights,
  extract(day from g.month_last_day)::int as days_in_month,
  round(
    100.0 * coalesce(o.occupied_nights, 0)
      / nullif(extract(day from g.month_last_day), 0),
    1
  ) as occupancy_rate_pct
from grid g
left join occupied o
  on o.room_id = g.room_id
 and o.occupancy_year_month = g.year_month
order by g.year_month, g.room_name;

comment on view public.room_monthly_occupancy_view is
  'Looker向け 部屋×月の稼働率（occupied_nights / 当月日数 × 100。アーカイブ含む・キャンセル除外）';

grant select on public.room_daily_occupancy_view to anon, authenticated, service_role;
grant select on public.room_monthly_occupancy_view to anon, authenticated, service_role;
