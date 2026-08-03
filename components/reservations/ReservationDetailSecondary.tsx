import { Suspense } from "react";
import Link from "next/link";
import { DetailBlock } from "@/components/detail/DetailBlock";
import { MailHistorySection } from "@/components/mail/MailHistorySection";
import { OverlapStayList } from "@/components/requests/OverlapStayList";
import { CompanionSection } from "@/components/reservations/CompanionSection";
import { ReservationMailSection } from "@/components/reservations/ReservationMailSection";
import { RoomAssignmentManager } from "@/components/reservations/RoomAssignmentManager";
import { getCompanionsByReservationId } from "@/lib/queries/companions";
import { getMailTemplates } from "@/lib/queries/mail-templates";
import { getOverlappingStays } from "@/lib/queries/overlapping-stays";
import {
  getRoomAssignmentsByReservationId,
} from "@/lib/queries/reservations";
import { getRooms } from "@/lib/queries/rooms";
import { buildMailEntityContext } from "@/lib/services/mail-context";
import { createReadClient } from "@/lib/supabase/read";
import { ConnectionError } from "@/components/SetupRequired";

function SectionFallback({ label }: { label: string }) {
  return (
    <DetailBlock>
      <div className="inline-loading">{label}</div>
    </DetailBlock>
  );
}

export function ReservationMailSuspense({
  reservationId,
  reservation,
}: {
  reservationId: string;
  reservation: Record<string, unknown>;
}) {
  return (
    <Suspense fallback={<SectionFallback label="連絡状況を読み込み中…" />}>
      <ReservationMailAsync
        reservationId={reservationId}
        reservation={reservation}
      />
    </Suspense>
  );
}

async function ReservationMailAsync({
  reservationId,
  reservation,
}: {
  reservationId: string;
  reservation: Record<string, unknown>;
}) {
  const supabase = await createReadClient();
  const [{ templates: mailTemplates }, placeholderContext] = await Promise.all([
    getMailTemplates(),
    buildMailEntityContext(supabase, "reservation", reservationId),
  ]);
  const r = reservation;

  return (
    <ReservationMailSection
      reservationId={reservationId}
      email={asString(r.email)}
      status={String(r.status ?? "")}
      checkIn={asString(r.check_in)}
      checkOut={asString(r.check_out)}
      createdAt={asString(r.created_at)}
      sheetCreatedAt={asString(r.sheet_created_at)}
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
  );
}

export function ReservationMailHistorySuspense({
  reservationId,
}: {
  reservationId: string;
}) {
  return (
    <Suspense fallback={<SectionFallback label="メール履歴を読み込み中…" />}>
      <DetailBlock title="メール履歴">
        <MailHistorySection entityType="reservation" entityId={reservationId} />
      </DetailBlock>
    </Suspense>
  );
}

export function ReservationRoomsCompanionsSuspense({
  reservationId,
  reservation,
}: {
  reservationId: string;
  reservation: Record<string, unknown>;
}) {
  return (
    <Suspense
      fallback={<SectionFallback label="部屋割当・同行者を読み込み中…" />}
    >
      <RoomsCompanionsAsync
        reservationId={reservationId}
        reservation={reservation}
      />
    </Suspense>
  );
}

async function RoomsCompanionsAsync({
  reservationId,
  reservation,
}: {
  reservationId: string;
  reservation: Record<string, unknown>;
}) {
  const [
    { assignments, error: assignmentError },
    { rooms, error: roomsError },
    { companions, tableMissing: companionsTableMissing },
  ] = await Promise.all([
    getRoomAssignmentsByReservationId(reservationId),
    getRooms(),
    getCompanionsByReservationId(reservationId),
  ]);

  if (assignmentError) return <ConnectionError message={assignmentError} />;
  if (roomsError) return <ConnectionError message={roomsError} />;

  const r = reservation;

  return (
    <>
      <RoomAssignmentManager
        reservationId={reservationId}
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
          reservationId={reservationId}
          companions={companions}
          companionFormAnswered={Boolean(r.companion_form_answered)}
          tableMissing={companionsTableMissing}
        />
      </DetailBlock>
    </>
  );
}

export function ReservationOverlapSuspense({
  reservationId,
  checkIn,
  checkOut,
}: {
  reservationId: string;
  checkIn: string;
  checkOut: string | null;
}) {
  return (
    <Suspense fallback={<SectionFallback label="同期間の予約を読み込み中…" />}>
      <OverlapAsync
        reservationId={reservationId}
        checkIn={checkIn}
        checkOut={checkOut}
      />
    </Suspense>
  );
}

async function OverlapAsync({
  reservationId,
  checkIn,
  checkOut,
}: {
  reservationId: string;
  checkIn: string;
  checkOut: string | null;
}) {
  const { stays, error } = await getOverlappingStays(
    checkIn,
    checkOut,
    reservationId
  );
  if (error) return <ConnectionError message={error} />;

  return (
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
  );
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}
