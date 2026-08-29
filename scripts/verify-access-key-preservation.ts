import assert from "node:assert/strict";
import { resolvePreservedAccessKey } from "../lib/utils/access-key";

function testResolvePreservedAccessKey() {
  assert.equal(resolvePreservedAccessKey("ABCD-1234", "WXYZ-5678"), "ABCD-1234");
  assert.equal(resolvePreservedAccessKey("", "WXYZ-5678"), "WXYZ-5678");
  assert.equal(resolvePreservedAccessKey(null, "WXYZ-5678"), "WXYZ-5678");
  assert.equal(resolvePreservedAccessKey("ABCD-1234", null), "ABCD-1234");
  assert.equal(resolvePreservedAccessKey(null, null), null);
  assert.equal(resolvePreservedAccessKey("  ", "WXYZ-5678"), "WXYZ-5678");
}

testResolvePreservedAccessKey();
console.log("verify-access-key-preservation: ok");
