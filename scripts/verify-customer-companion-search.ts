import assert from "node:assert/strict";
import {
  buildCustomerHistoryHref,
  buildCustomerSearchHref,
} from "../lib/utils/customer-history-link";

const href = buildCustomerSearchHref({
  name: "山田",
  companionName: "佐藤",
});
const params = new URL(href, "https://example.invalid").searchParams;
assert.equal(params.get("name"), "山田");
assert.equal(params.get("companionName"), "佐藤");

const companionOnly = buildCustomerSearchHref({ companionName: " 花子 " });
assert.equal(
  new URL(companionOnly, "https://example.invalid").searchParams.get(
    "companionName"
  ),
  "花子"
);
assert.equal(
  new URL(companionOnly, "https://example.invalid").searchParams.has("name"),
  false
);

const history = buildCustomerHistoryHref({
  name: "山田",
  email: "a@example.com",
  phone: "09012345678",
});
assert.equal(
  new URL(history, "https://example.invalid").searchParams.has("companionName"),
  false
);

console.log("ok");
