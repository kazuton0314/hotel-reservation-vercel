import Link from "next/link";
import type { TodayRoomBoardItem } from "@/lib/queries/dashboard";
import { formatGuestCompact } from "@/lib/utils/guest-display";

function EventTags({
  isCheckin,
  isCheckout,
  isStay,
}: {
  isCheckin: boolean;
  isCheckout: boolean;
  isStay: boolean;
}) {
  if (isCheckin && isCheckout) {
    return (
      <>
        <span className="occ-tag in">IN</span>
        <span className="occ-tag out">OUT</span>
      </>
    );
  }
  if (isCheckin) return <span className="occ-tag in">IN</span>;
  if (isCheckout) return <span className="occ-tag out">OUT</span>;
  if (isStay) return <span className="occ-tag stay">滞在中</span>;
  return null;
}

function formatNightLabel(ev: {
  nightNumber?: number;
  nightsTotal?: number;
}) {
  if (!ev.nightNumber) return "";
  if (ev.nightsTotal && ev.nightsTotal > 0) {
    return `${ev.nightNumber}/${ev.nightsTotal}泊目`;
  }
  return `${ev.nightNumber}泊目`;
}

export function TodayRoomsBoard({ rooms }: { rooms: TodayRoomBoardItem[] }) {
  if (!rooms.length) {
    return <div className="empty">部屋マスタがありません</div>;
  }

  return (
    <div className="today-rooms">
      {rooms.map((room) => {
        const hasGuest = room.events.length > 0;
        return (
          <article
            key={room.roomId}
            className={
              hasGuest ? "today-room today-room-occupied" : "today-room today-room-empty"
            }
          >
            <p className="today-room-name">{room.roomName}</p>
            {!hasGuest ? (
              <p className="today-room-status">空き</p>
            ) : (
              room.events.map((ev) => {
                const nightLbl = formatNightLabel(ev);
                const meta = formatGuestCompact({
                  guest_total: ev.guestTotal,
                  adult_male: ev.adultMale,
                  adult_female: ev.adultFemale,
                  boy_student: ev.boyStudent,
                  girl_student: ev.girlStudent,
                  age_3plus: ev.age3plus,
                  under_3: ev.under3,
                });
                return (
                  <div
                    key={`${room.roomId}-${ev.reservationId}-${ev.isCheckin}-${ev.isCheckout}`}
                    className="today-room-event"
                  >
                    <EventTags
                      isCheckin={ev.isCheckin}
                      isCheckout={ev.isCheckout}
                      isStay={ev.isStay}
                    />
                    <Link
                      href={`/reservations/${encodeURIComponent(ev.reservationId)}?from=home`}
                      className="today-room-guest"
                    >
                      {ev.representativeName}
                    </Link>
                    {nightLbl ? (
                      <span className="today-room-nights">{nightLbl}</span>
                    ) : null}
                    {meta && meta !== "—" ? (
                      <span className="today-room-meta">
                        {formatGuestCompact({
                          guest_total: ev.guestTotal,
                          adult_male: ev.adultMale,
                          adult_female: ev.adultFemale,
                          boy_student: ev.boyStudent,
                          girl_student: ev.girlStudent,
                          age_3plus: ev.age3plus,
                          under_3: ev.under3,
                        })}
                      </span>
                    ) : null}
                  </div>
                );
              })
            )}
          </article>
        );
      })}
    </div>
  );
}
