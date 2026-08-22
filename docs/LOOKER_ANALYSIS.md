# Looker 分析（最小 view 構成）

分析用の正は **4 view のみ** です。グラフのたびに view を増やしません。  
切り口（月・経路・BBQ など）は Looker 側で組み合わせます。

## 正とする 4 view

| view | 粒度（1行の意味） | 使うとき |
|------|-------------------|----------|
| `reservation_summary_view` | 予約 1 件 | 属性の分布（経路・BBQ・人数帯など）。**連泊の泊数分には使わない** |
| `reservation_nightly_stay_view` | 予約 × 滞在夜 | 月次のグループ泊・人泊・料金区分。連泊は泊数分 |
| `room_daily_occupancy_view` | 部屋 × 稼働夜 | 部屋稼働率。月次は Looker で集計 |
| `reservation_travel_purpose_view` | 予約 × 目的 | 旅行目的が複数選択のためだけ分解 |

### 料金区分（人泊）

| 列 | 意味 |
|----|------|
| `adult_guest_nights` | 大人＝中学生以上（男女合計） |
| `elementary_guest_nights` | 小学生（男女合計） |
| `age_3plus_guest_nights` | 3歳以上幼児 |
| `under_3_guest_nights` | 3歳未満（料金3段階の外。必要なら） |

### キャンセル・アーカイブ

| view | キャンセル | アーカイブ |
|------|------------|------------|
| `reservation_summary_view` | 含む（Looker で絞る） | 含む |
| `reservation_nightly_stay_view` | **除外** | 含む |
| `room_daily_occupancy_view` | **除外** | 含む |
| `reservation_travel_purpose_view` | 含む（Looker で絞る） | 含む |

実績グラフでは Looker フィルタ例: `reservation_status = 確定`

## 廃止した view（019 で DROP）

`reservation_monthly_stay_view` / `room_monthly_occupancy_view` / `room_usage_view` /  
`daily_operation_view` / `reservation_request_summary_view` / `task_summary_view`

月次集計は Looker 側で行います。

## Looker レシピ

### 月別グループ泊・宿泊者数（連泊込み）

- データソース: `reservation_nightly_stay_view`
- ディメンション: `stay_year_month`
- 指標: `group_night` 合計 / `guest_nights` 合計
- 任意フィルタ: `guest_count_status = 確定`

### 料金区分別の人泊推移

- 同じデータソース
- ディメンション: `stay_year_month`
- 指標: `adult_guest_nights` / `elementary_guest_nights` / `age_3plus_guest_nights`（合計）を折れ線に並べる

### 経路別の人泊（例）

- `reservation_nightly_stay_view`
- ディメンション: `stay_year_month`、内訳: `reservation_channel`
- 指標: `guest_nights` 合計

### BBQ / 食事 / きっかけの件数分布

- データソース: `reservation_summary_view`（予約件数ベース）
- ディメンション: `bbq_status` など
- 指標: `reservation_id` カウント
- フィルタ: `reservation_status = 確定`

連泊込みの「BBQ 人泊」なら `reservation_nightly_stay_view` の `bbq_status` × `guest_nights` 合計。

### 部屋×月の稼働率

- データソース: `room_daily_occupancy_view`
- ディメンション: `room_name`、列または内訳: `occupancy_year_month`
- 計算フィールド例（名前: `稼働率`）:

```
COUNT(occupancy_date) / MAX(days_in_month) * 100
```

### 旅行目的

- データソース: `reservation_travel_purpose_view`
- ディメンション: `travel_purpose`
- 指標: `reservation_id` のカウント Distinct
- フィルタ: `reservation_status = 確定`

## 新しい分析が欲しくなったとき

1. 上の 4 view のどれかで足りるか確認する  
2. **粒度が同じ** → view は増やさず Looker で切る  
3. **粒度がどうしても違う**（例: 1行の意味が変わる）→ そのときだけ view 追加を検討  

## Supabase

既存 DB では **`019_rebuild_looker_minimal_views.sql` を実行**すれば足ります（旧 view の DROP と正 4 本の再作成）。
