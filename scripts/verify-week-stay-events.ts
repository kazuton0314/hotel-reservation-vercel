import assert from "node:assert/strict";
import {
  buildCalendarEventsForRange,
  type CalendarReservation,
} from "../lib/services/calendar";

function res(
  id: string,
  name: string,
  checkIn: string,
  checkOut: string,
  nights: number
): CalendarReservation {
  return {
    reservation_id: id,
    request_id: null,
    representative_name: name,
    status: "確定",
    check_in: checkIn,
    check_out: checkOut,
    nights,
    guest_total: "2",
    adult_male: "1",
    adult_female: "1",
    boy_student: null,
    girl_student: null,
    age_3plus: null,
    under_3: null,
    arrival_time: id === "IN" ? "17:00" : null,
    meal: null,
    bbq: null,
    somen: null,
    channel: null,
    inquiry: null,
    internal_memo: null,
    guest_memo: null,
    assignment_status: null,
    vehicle_count: null,
    companion_form_answered: false,
    email: null,
    completion_email_sent: false,
    day11_email_sent: false,
    day3_email_sent: false,
    created_at: null,
    sheet_created_at: null,
    updated_at: null,
  };
}

const events = buildCalendarEventsForRange(
  [
    res("STAY", "滞在太郎", "2026-08-10", "2026-08-14", 4),
    res("IN", "到着花子", "2026-08-12", "2026-08-13", 1),
    res("OUT", "出発次郎", "2026-08-11", "2026-08-12", 1),
  ],
  new Map(),
  "2026-08-10",
  "2026-08-16"
);

const byDate = (iso: string) =>
  events.filter((e) => e.date === iso).map((e) => `${e.type}:${e.reservationId}`);

assert.deepEqual(byDate("2026-08-10"), ["checkin:STAY"]);
assert.deepEqual(byDate("2026-08-11"), ["checkin:OUT", "stay:STAY"]);
assert.deepEqual(byDate("2026-08-12"), [
  "checkin:IN",
  "stay:STAY",
  "checkout:OUT",
]);
assert.deepEqual(byDate("2026-08-13"), ["stay:STAY", "checkout:IN"]);
assert.deepEqual(byDate("2026-08-14"), ["checkout:STAY"]);
assert.equal(
  events.find((e) => e.date === "2026-08-11" && e.type === "stay")?.nightNumber,
  2
);
assert.equal(
  events.find((e) => e.date === "2026-08-12" && e.type === "stay")?.nightNumber,
  3
);

console.log("verify-week-stay-events: ok");
