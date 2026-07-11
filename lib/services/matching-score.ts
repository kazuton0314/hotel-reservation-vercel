import { contactMatches, nameMatches, stayMatches } from "@/lib/import/match-utils";

type PersonStay = {
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  check_in: string | null;
  check_out: string | null;
};

export function requestReservationMatchScore(request: PersonStay, reservation: PersonStay) {
  let score = 0;
  if (nameMatches(request.last_name, request.first_name, reservation.last_name, reservation.first_name)) {
    score += 40;
  }
  if (contactMatches(request.email, request.phone, reservation.email, reservation.phone)) {
    score += 40;
  }
  if (stayMatches(request.check_in, request.check_out, reservation.check_in, reservation.check_out)) {
    score += 20;
  }
  return score;
}

export function customerMergeScore(
  left: { representative_name: string | null; name_kana: string | null; email: string | null; phone: string | null },
  right: { representative_name: string | null; name_kana: string | null; email: string | null; phone: string | null }
) {
  const personLeft = {
    last_name: left.representative_name,
    first_name: "",
    email: left.email,
    phone: left.phone,
    check_in: null,
    check_out: null,
  };
  const personRight = {
    last_name: right.representative_name,
    first_name: "",
    email: right.email,
    phone: right.phone,
    check_in: null,
    check_out: null,
  };
  let score = 0;
  if (contactMatches(left.email, left.phone, right.email, right.phone)) score += 70;
  if (nameMatches(personLeft.last_name, personLeft.first_name, personRight.last_name, personRight.first_name)) {
    score += 20;
  }
  if ((left.name_kana ?? "").trim() && left.name_kana === right.name_kana) score += 10;
  return score;
}
