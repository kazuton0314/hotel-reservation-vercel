import assert from "node:assert/strict";
import { guestDisplayFieldsFromRoomAssignment } from "../lib/services/room-occupancy";
import {
  formatBbqBadgeLabel,
  formatSomenBadgeLabel,
} from "../lib/utils/occ-display";

assert.equal(formatSomenBadgeLabel("要"), "そうめん要");
assert.equal(formatSomenBadgeLabel("必要"), "そうめん要");
assert.equal(formatSomenBadgeLabel(" 要 "), "そうめん要");
assert.equal(formatSomenBadgeLabel("不要"), null);
assert.equal(formatSomenBadgeLabel("不必要"), null);
assert.equal(formatSomenBadgeLabel(""), null);
assert.equal(formatSomenBadgeLabel(null), null);

assert.equal(formatBbqBadgeLabel("要"), "BBQ要");
assert.equal(formatSomenBadgeLabel("要"), "そうめん要");

const guests = guestDisplayFieldsFromRoomAssignment(
  {
    assigned_guest_count: 2,
    male_count: 1,
    female_count: 1,
  },
  {
    guest_total: "2",
    bbq: "要",
    somen: "要",
  }
);
assert.equal(guests.bbq, "要");
assert.equal(guests.somen, "要");
assert.equal(formatBbqBadgeLabel(guests.bbq), "BBQ要");
assert.equal(formatSomenBadgeLabel(guests.somen), "そうめん要");

console.log("verify-somen-badge: ok");
