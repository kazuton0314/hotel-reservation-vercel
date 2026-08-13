import assert from "node:assert/strict";
import {
  mapStudioFormRow,
  readStudioSomen,
} from "../lib/import/reservation-mapper";

const headers = [
  "姓",
  "名",
  "姓ふりがな",
  "名ふりがな",
  "グループ形態",
  "グループ名",
  "メールアドレス",
  "電話番号",
  "電話可能時間",
  "郵便番号",
  "都道府県",
  "市区町村",
  "建物名・番地",
  "チェックイン月",
  "チェックイン日",
  "チェックアウト月",
  "チェックアウト日",
  "人数",
  "大人男",
  "小学生男",
  "3歳以上",
  "大人女",
  "小学生女",
  "3歳未満",
  "到着時間",
  "交通手段",
  "車両台数",
  "食事",
  "BBQレンタル",
  "流しそうめんレンタル",
  "お問い合わせ内容",
  "旅行の目的",
  "旅行の目的-その他",
  "きっかけ",
  "きっかけ-その他",
  "前回宿泊時期",
  "プライバシーポリシー",
];

const values = Array(headers.length).fill("");
values[0] = "青木";
values[1] = "和佐";
values[6] = "test@example.com";
values[13] = "8";
values[14] = "20";
values[15] = "8";
values[16] = "21";
values[17] = "2";
values[18] = "1";
values[21] = "1";
values[28] = "要";
values[29] = "要";
values[31] = "観光";

assert.equal(readStudioSomen(headers, values), "要");

const mapped = mapStudioFormRow(
  { sheetRow: 63, values },
  headers,
  "TEST",
  new Date("2026-08-13T00:00:00Z"),
  { validateBookingHorizon: false }
);
assert.equal(mapped.somen, "要");
assert.equal(mapped.bbq, "要");

const questionHeaders = [...headers];
questionHeaders[29] = "流しそうめんレンタルは必要ですか？";
assert.equal(readStudioSomen(questionHeaders, values), "要");

const empty = [...values];
empty[29] = "";
assert.equal(readStudioSomen(headers, empty), null);

console.log("verify-somen-import: ok");
