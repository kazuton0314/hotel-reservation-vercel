import Link from "next/link";

import { notFound } from "next/navigation";

import { AppShell } from "@/components/AppShell";

import { ConnectionError } from "@/components/SetupRequired";

import { PageHeader } from "@/components/PageHeader";

import { SupabaseGate } from "@/components/SupabaseGate";

import { CompanionSection } from "@/components/reservations/CompanionSection";
import { ArchiveReservationButton } from "@/components/reservations/ArchiveReservationButton";

import { MailStatusForm } from "@/components/reservations/MailStatusForm";

import { ReservationUpdateForm } from "@/components/reservations/ReservationUpdateForm";

import { RoomAssignmentManager } from "@/components/reservations/RoomAssignmentManager";

import { getCompanionsByReservationId } from "@/lib/queries/companions";

import { getRooms } from "@/lib/queries/rooms";

import {

  getReservationById,

  getRoomAssignmentsByReservationId,

} from "@/lib/queries/reservations";



type PageProps = {

  params: Promise<{ id: string }>;

};



const READONLY_FIELDS: { key: string; label: string }[] = [

  { key: "reservation_id", label: "予約ID" },

  { key: "access_key", label: "外部受付キー" },

  { key: "import_source", label: "取込元" },

  { key: "assignment_status", label: "割当状況" },

  { key: "nights", label: "泊数" },

  { key: "request_id", label: "リクエストID" },

];



export default async function ReservationDetailPage({ params }: PageProps) {

  const { id } = await params;



  return (

    <SupabaseGate>

      <AppShell>

        <DetailContent id={decodeURIComponent(id)} />

      </AppShell>

    </SupabaseGate>

  );

}



async function DetailContent({ id }: { id: string }) {

  const [

    { reservation, error },

    { assignments, error: assignmentError },

    { rooms, error: roomsError },

    { companions, error: companionsError },

  ] = await Promise.all([

    getReservationById(id),

    getRoomAssignmentsByReservationId(id),

    getRooms(),

    getCompanionsByReservationId(id),

  ]);



  if (error) return <ConnectionError message={error} />;

  if (assignmentError) return <ConnectionError message={assignmentError} />;

  if (roomsError) return <ConnectionError message={roomsError} />;

  if (companionsError) return <ConnectionError message={companionsError} />;

  if (!reservation) notFound();



  const record = reservation as Record<string, unknown>;



  return (

    <>

      <div className="mb-4">

        <Link

          href="/reservations"

          className="text-sm text-zinc-500 hover:underline"

        >

          ← 一覧に戻る

        </Link>

      </div>



      <PageHeader

        title={String(record.representative_name || record.reservation_id)}

        description={String(record.reservation_id)}

      />



      <dl className="mb-6 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-zinc-50">

        {READONLY_FIELDS.map(({ key, label }) => {

          const value = record[key];

          if (value === null || value === undefined || value === "") return null;

          return (

            <div key={key} className="grid gap-1 px-4 py-2 sm:grid-cols-3">

              <dt className="text-sm text-zinc-500">{label}</dt>

              <dd className="sm:col-span-2 text-sm">{String(value)}</dd>

            </div>

          );

        })}

      </dl>



      <section className="rounded-xl border border-zinc-200 bg-white p-4">

        <h2 className="font-semibold">予約情報の編集</h2>

        <div className="mt-4">

          <ReservationUpdateForm

            reservationId={id}

            status={String(record.status ?? "")}

            channel={record.channel as string | null}

            groupType={record.group_type as string | null}

            groupName={record.group_name as string | null}

            lastName={record.last_name as string | null}

            firstName={record.first_name as string | null}

            lastNameKana={record.last_name_kana as string | null}

            firstNameKana={record.first_name_kana as string | null}

            email={record.email as string | null}

            phone={record.phone as string | null}

            phoneAvailable={record.phone_available as string | null}

            postalCode={record.postal_code as string | null}

            prefecture={record.prefecture as string | null}

            city={record.city as string | null}

            addressLine={record.address_line as string | null}

            checkIn={record.check_in as string | null}

            checkOut={record.check_out as string | null}

            guestTotal={record.guest_total as string | null}

            adultMale={record.adult_male as string | null}

            adultFemale={record.adult_female as string | null}

            arrivalTime={record.arrival_time as string | null}

            transport={record.transport as string | null}

            meal={record.meal as string | null}

            bbq={record.bbq as string | null}

            inquiry={record.inquiry as string | null}

            internalMemo={record.internal_memo as string | null}

            paymentStatus={record.payment_status as string | null}

          />

        </div>

      </section>



      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">

        <h2 className="font-semibold">部屋割り</h2>

        <div className="mt-4">

          <RoomAssignmentManager

            reservationId={id}

            rooms={rooms}

            assignments={assignments.filter((a) => !a.is_archived)}

          />

        </div>

      </section>



      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">

        <h2 className="font-semibold">メール送付状況</h2>

        <div className="mt-4">

          <MailStatusForm

            reservationId={id}

            completionEmailSent={Boolean(record.completion_email_sent)}

            day11EmailSent={Boolean(record.day11_email_sent)}

            day3EmailSent={Boolean(record.day3_email_sent)}

            completionEmailSentAt={

              record.completion_email_sent_at as string | null

            }

            day11EmailSentAt={record.day11_email_sent_at as string | null}

            day3EmailSentAt={record.day3_email_sent_at as string | null}

          />

        </div>

      </section>



      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">

        <h2 className="font-semibold">同行者</h2>

        <div className="mt-4">

          <CompanionSection

            reservationId={id}

            companions={companions}

            companionFormAnswered={Boolean(record.companion_form_answered)}

          />

        </div>

      </section>



      {record.request_id ? (

        <section className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">

          <h2 className="font-semibold text-sm">連携リクエスト</h2>

          <Link

            href={`/requests/${encodeURIComponent(String(record.request_id))}`}

            className="mt-2 inline-block text-sm text-emerald-700 hover:underline"

          >

            {String(record.request_id)} を開く →

          </Link>

        </section>

      ) : null}

      <ArchiveReservationButton
        reservationId={id}
        isArchived={Boolean(record.is_archived)}
      />
    </>
  );
}


