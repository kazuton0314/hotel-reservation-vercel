import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DetailNav } from "@/components/detail/DetailNav";
import { DetailBlock } from "@/components/detail/DetailBlock";
import { FormSectionLabel, Kv } from "@/components/detail/Kv";
import { StatusRail } from "@/components/detail/StatusRail";
import { RealtimeRefresh } from "@/components/realtime/RealtimeRefresh";
import { ConnectionError } from "@/components/SetupRequired";
import { ArchiveReservationButton } from "@/components/reservations/ArchiveReservationButton";
import { CompanionSection } from "@/components/reservations/CompanionSection";
import { OverlapStayList } from "@/components/requests/OverlapStayList";
import { ReservationDetailActions } from "@/components/reservations/ReservationDetailActions";
import { MailHistorySection } from "@/components/mail/MailHistorySection";
import { ReservationMailSection } from "@/components/reservations/ReservationMailSection";
import { ReservationUpdateForm } from "@/components/reservations/ReservationUpdateForm";
import { RoomAssignmentManager } from "@/components/reservations/RoomAssignmentManager";
import { getCompanionsByReservationId } from "@/lib/queries/companions";
import { getMailTemplates } from "@/lib/queries/mail-templates";
import { getRooms } from "@/lib/queries/rooms";
import {
  getReservationById,
  getRoomAssignmentsByReservationId,
} from "@/lib/queries/reservations";
import { getOverlappingStays } from "@/lib/queries/overlapping-stays";
import { buildMailEntityContext } from "@/lib/services/mail-context";
import { createReadClient } from "@/lib/supabase/read";
import { formatReceivedDateFromIso } from "@/lib/utils/received-date";
import { buildCustomerHistoryHref } from "@/lib/utils/customer-history-link";
import { formatGuestCompact } from "@/lib/utils/guest-display";
import {
  RESERVATION_STATUS_RAIL_BRANCH,
  RESERVATION_STATUS_RAIL_MAIN,
} from "@/lib/utils/status-rail";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; customer?: string }>;
};

export default async function ReservationDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  return (
    <AppShell hideNav>
      <DetailContent
        id={decodeURIComponent(id)}
        from={sp.from}
        customer={sp.customer}
      />
    </AppShell>
  );
}

async function DetailContent({
  id,
  from,
  customer,
}: {
  id: string;
  from?: string;
  customer?: string;
}) {
  const [
    { reservation, error },
    { assignments, error: assignmentError },
    { rooms, error: roomsError },
    { companions, tableMissing: companionsTableMissing },
    { templates: mailTemplates },
  ] = await Promise.all([
    getReservationById(id),
    getRoomAssignmentsByReservationId(id),
    getRooms(),
    getCompanionsByReservationId(id),
    getMailTemplates(),
  ]);

  if (error) return <ConnectionError message={error} />;
  if (assignmentError) return <ConnectionError message={assignmentError} />;
  if (roomsError) return <ConnectionError message={roomsError} />;
  if (!reservation) notFound();

  const r = reservation as Record<string, unknown>;
  const checkIn = asString(r.check_in);
  const checkOut = asString(r.check_out);
  const { stays, error: overlapError } = checkIn
    ? await getOverlappingStays(checkIn, checkOut, id)
    : { stays: [], error: null };
  if (overlapError) return <ConnectionError message={overlapError} />;

  const supabase = await createReadClient();
  const placeholderContext = await buildMailEntityContext(
    supabase,
    "reservation",
    id
  );

  const status = String(r.status ?? "");
  const representativeName = asString(r.representative_name) || id;
  const backHref =
    from === "customers" && customer
      ? `/customers/${encodeURIComponent(customer)}`
      : from === "home"
        ? "/"
        : undefined;

  return (
    <>
      <RealtimeRefresh tables={["reservations", "room_assignments"]} notify />
      <DetailNav
        backHref={backHref}
        backLabel={
          from === "customers"
            ? "← 顧客に戻る"
            : from === "home"
              ? "← ホームに戻る"
              : "← 戻る"
        }
        crumbs={[
          { label: "ホーム", href: "/" },
          ...(from === "customers"
            ? [
                { label: "顧客索引", href: "/customers" },
                ...(customer
                  ? [{ label: "顧客詳細", href: backHref }]
                  : []),
              ]
            : from === "home"
              ? []
              : [{ label: "本予約", href: "/reservations" }]),
          { label: representativeName },
        ]}
      />

      <DetailBlock title="ステータス">
        <StatusRail
          mainSteps={RESERVATION_STATUS_RAIL_MAIN}
          branchStep={RESERVATION_STATUS_RAIL_BRANCH}
          currentId={status}
        />
        <ReservationDetailActions
          reservationId={id}
          status={status}
          updatedAt={asString(r.updated_at)}
        />
      </DetailBlock>

      <ReservationMailSection
        reservationId={id}
        email={asString(r.email)}
        status={status}
        checkIn={asString(r.check_in)}
        checkOut={asString(r.check_out)}
        guestTotal={asString(r.guest_total)}
        adultMale={asString(r.adult_male)}
        adultFemale={asString(r.adult_female)}
        boyStudent={asString(r.boy_student)}
        girlStudent={asString(r.girl_student)}
        age3plus={asString(r.age_3plus)}
        under3={asString(r.under_3)}
        companionFormAnswered={Boolean(r.companion_form_answered)}
        completionEmailSent={Boolean(r.completion_email_sent)}
        day11EmailSent={Boolean(r.day11_email_sent)}
        day3EmailSent={Boolean(r.day3_email_sent)}
        completionEmailSentAt={asString(r.completion_email_sent_at)}
        day11EmailSentAt={asString(r.day11_email_sent_at)}
        day3EmailSentAt={asString(r.day3_email_sent_at)}
        mailTemplates={mailTemplates}
        placeholderContext={placeholderContext}
      />

      <DetailBlock title="メール履歴">
        <MailHistorySection entityType="reservation" entityId={id} />
      </DetailBlock>

      <RoomAssignmentManager
        reservationId={id}
        assignmentStatus={asString(r.assignment_status)}
        checkIn={asString(r.check_in) ?? ""}
        checkOut={asString(r.check_out) ?? ""}
        guestSource={{
          guest_total: asString(r.guest_total),
          adult_male: asString(r.adult_male),
          adult_female: asString(r.adult_female),
          boy_student: asString(r.boy_student),
          girl_student: asString(r.girl_student),
          age_3plus: asString(r.age_3plus),
          under_3: asString(r.under_3),
        }}
        rooms={rooms}
        assignments={assignments.filter((a) => !a.is_archived)}
      />

      <DetailBlock title="同行者">
        <CompanionSection
          reservationId={id}
          companions={companions}
          companionFormAnswered={Boolean(r.companion_form_answered)}
          tableMissing={companionsTableMissing}
        />
      </DetailBlock>

      <DetailBlock title="予約内容">
        <FormSectionLabel>管理</FormSectionLabel>
        <Kv label="予約ID" value={String(r.reservation_id)} />
        <Kv
          label="受付日"
          value={formatReceivedDateFromIso(
            asString(r.sheet_created_at) || asString(r.created_at)
          )}
        />
        <Kv label="予約経路" value={asString(r.channel)} />

        <FormSectionLabel>代表者</FormSectionLabel>
        <Kv label="代表者名" value={asString(r.representative_name)} />
        {asString(r.name_kana) ? (
          <Kv label="ふりがな" value={asString(r.name_kana)} />
        ) : null}
        <Kv label="グループ形態" value={asString(r.group_type)} />
        <Kv label="グループ名" value={asString(r.group_name)} />

        <FormSectionLabel>連絡先・住所</FormSectionLabel>
        <Kv label="メールアドレス" value={asString(r.email)} />
        <Kv label="電話番号" value={asString(r.phone)} />
        <Kv label="電話可能時間" value={asString(r.phone_available)} />
        <Kv label="住所" value={asString(r.address)} multiline />

        <FormSectionLabel>宿泊</FormSectionLabel>
        <Kv label="チェックイン日" value={asString(r.check_in)} />
        <Kv label="チェックアウト日" value={asString(r.check_out)} />
        <Kv label="泊数" value={asString(r.nights)} />
        <Kv
          label="宿泊人数"
          value={formatGuestCompact({
            guest_total: asString(r.guest_total),
            adult_male: asString(r.adult_male),
            adult_female: asString(r.adult_female),
            boy_student: asString(r.boy_student),
            girl_student: asString(r.girl_student),
            age_3plus: asString(r.age_3plus),
            under_3: asString(r.under_3),
          })}
        />
        <Kv label="到着時間" value={asString(r.arrival_time)} />

        <FormSectionLabel>食事・交通</FormSectionLabel>
        <Kv label="食事" value={asString(r.meal)} />
        <Kv label="BBQレンタル" value={asString(r.bbq)} />
        <Kv label="交通手段" value={asString(r.transport)} />
        <Kv label="車両台数" value={asString(r.vehicle_count)} />

        {asString(r.request_id) || asString(r.inquiry) ? (
          <>
            <FormSectionLabel>問い合わせ</FormSectionLabel>
            {asString(r.request_id) ? (
              <Kv label="リクエストID" value={asString(r.request_id)} />
            ) : null}
            {asString(r.inquiry) ? (
              <Kv label="お問い合わせ内容" value={asString(r.inquiry)} multiline />
            ) : null}
          </>
        ) : null}

        {asString(r.travel_purpose) ||
        asString(r.referral) ||
        asString(r.last_stay) ? (
          <>
            <FormSectionLabel>アンケート</FormSectionLabel>
            <Kv label="旅行の目的" value={asString(r.travel_purpose)} />
            {asString(r.travel_purpose_other) ? (
              <Kv
                label="旅行の目的（その他）"
                value={asString(r.travel_purpose_other)}
                multiline
              />
            ) : null}
            <Kv label="きっかけ" value={asString(r.referral)} />
            {asString(r.referral_other) ? (
              <Kv
                label="きっかけ（その他）"
                value={asString(r.referral_other)}
                multiline
              />
            ) : null}
            <Kv label="前回宿泊時期" value={asString(r.last_stay)} multiline />
          </>
        ) : null}

        <div className="detail-actions" style={{ marginTop: 10 }}>
          <Link
            href={buildCustomerHistoryHref({
              name: asString(r.representative_name),
              email: asString(r.email),
              phone: asString(r.phone),
            })}
            className="btn btn-secondary btn-sm"
          >
            この人の履歴
          </Link>
        </div>
      </DetailBlock>

      {checkIn ? (
        <DetailBlock id="res-overlap-section">
          <div className="section-title">同期間の他組の予約</div>
          <p className="detail-hint">
            チェックイン日・チェックアウト日に出入りする組も含みます
          </p>
          <OverlapStayList stays={stays} anchorCheckIn={checkIn} />
          <div className="detail-actions detail-actions-inline">
            <Link
              href={`/calendar?mode=day&date=${encodeURIComponent(checkIn)}`}
              className="btn btn-secondary"
            >
              {checkIn} の予定画面を開く
            </Link>
          </div>
        </DetailBlock>
      ) : null}

      <DetailBlock title="編集">
        <ReservationUpdateForm
          reservationId={id}
          updatedAt={asString(r.updated_at)}
          status={status}
          channel={asString(r.channel)}
          groupType={asString(r.group_type)}
          groupName={asString(r.group_name)}
          lastName={asString(r.last_name)}
          firstName={asString(r.first_name)}
          lastNameKana={asString(r.last_name_kana)}
          firstNameKana={asString(r.first_name_kana)}
          email={asString(r.email)}
          phone={asString(r.phone)}
          phoneAvailable={asString(r.phone_available)}
          postalCode={asString(r.postal_code)}
          prefecture={asString(r.prefecture)}
          city={asString(r.city)}
          addressLine={asString(r.address_line)}
          checkIn={asString(r.check_in)}
          checkOut={asString(r.check_out)}
          guestTotal={asString(r.guest_total)}
          adultMale={asString(r.adult_male)}
          adultFemale={asString(r.adult_female)}
          boyStudent={asString(r.boy_student)}
          girlStudent={asString(r.girl_student)}
          age3plus={asString(r.age_3plus)}
          under3={asString(r.under_3)}
          arrivalTime={asString(r.arrival_time)}
          transport={asString(r.transport)}
          vehicleCount={asString(r.vehicle_count)}
          meal={asString(r.meal)}
          bbq={asString(r.bbq)}
          inquiry={asString(r.inquiry)}
          travelPurpose={asString(r.travel_purpose)}
          travelPurposeOther={asString(r.travel_purpose_other)}
          referral={asString(r.referral)}
          referralOther={asString(r.referral_other)}
          lastStay={asString(r.last_stay)}
          internalMemo={asString(r.internal_memo)}
          paymentStatus={asString(r.payment_status)}
        />
      </DetailBlock>

      {asString(r.request_id) ? (
        <DetailBlock>
          <FormSectionLabel>連携リクエスト</FormSectionLabel>
          <Link
            href={`/requests/${encodeURIComponent(String(r.request_id))}`}
            className="btn btn-secondary btn-sm"
          >
            {String(r.request_id)} を開く
          </Link>
        </DetailBlock>
      ) : null}

      <ArchiveReservationButton
        reservationId={id}
        isArchived={Boolean(r.is_archived)}
      />
    </>
  );
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}
