import assert from "node:assert/strict";

/** SQL analysis_text_kind / analysis_definite_int と同じ規則 */
function analysisTextKind(raw: string | null | undefined): "empty" | "definite" | "indefinite" {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "empty";
  const halfWidth = trimmed.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );
  const stripped = halfWidth.replace(/[\s　人名]/g, "");
  return /^\d+$/.test(stripped) ? "definite" : "indefinite";
}

function analysisDefiniteInt(raw: string | null | undefined): number | null {
  if (analysisTextKind(raw) !== "definite") return null;
  const halfWidth = String(raw).trim().replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );
  return Number(halfWidth.replace(/[\s　人名]/g, ""));
}

assert.equal(analysisTextKind(""), "empty");
assert.equal(analysisTextKind("10"), "definite");
assert.equal(analysisDefiniteInt("10人"), 10);
assert.equal(analysisDefiniteInt("１０名"), 10);
assert.equal(analysisTextKind("30〜40人"), "indefinite");
assert.equal(analysisDefiniteInt("30〜40人"), null);
assert.notEqual(analysisDefiniteInt("30〜40人"), 3040);
assert.equal(analysisTextKind("5-6"), "indefinite");
assert.equal(analysisDefiniteInt("5〜6人"), null);

console.log("ok");
