import test from "node:test";
import assert from "node:assert/strict";
import {
  HIDEABLE_FIELD_GROUPS,
  INVESTOR_HIDEABLE_FIELDS,
  canEditFieldVisibility,
  isFieldHidden,
  toHideableFields,
} from "../src/lib/investor/fields";

test("逐欄位隱藏只有 Enterprise 能編輯", () => {
  assert.equal(canEditFieldVisibility("free"), false);
  assert.equal(canEditFieldVisibility("pro"), false);
  assert.equal(canEditFieldVisibility("business"), false);
  assert.equal(canEditFieldVisibility("enterprise"), true);
});

test("隱藏的『生效』與擁有者方案無關 —— 降級不得讓資料重新曝光", () => {
  // isFieldHidden 刻意不接受 plan 參數：呼叫端沒有辦法「因為降級了」而讓它回 false。
  // 這條測試守的是本功能最重要的安全前提。
  const hidden = ["profile.seedFunding"];
  assert.equal(isFieldHidden(hidden, "profile.seedFunding"), true);
  assert.equal(isFieldHidden(hidden, "profile.industry"), false);
  assert.equal(isFieldHidden([], "profile.seedFunding"), false);
  assert.equal(isFieldHidden.length, 2, "isFieldHidden 不應新增 plan 參數");
});

test("toHideableFields 濾掉未知 key 並去重，不因舊資料而丟例外", () => {
  assert.deepEqual(
    toHideableFields(["profile.industry", "nope.removed", "profile.industry", 42, null]),
    ["profile.industry"],
  );
  // DB 對既有列是 NULL；讀取路徑必須寬容，否則整個投資人頁 500
  assert.deepEqual(toHideableFields(null), []);
  assert.deepEqual(toHideableFields(undefined), []);
  assert.deepEqual(toHideableFields("profile.industry"), []);
});

test("分組涵蓋全部可隱藏欄位，且不重複、不含未知 key", () => {
  const grouped = HIDEABLE_FIELD_GROUPS.flatMap((group) => [...group.fields]);
  assert.equal(
    new Set(grouped).size,
    grouped.length,
    "同一欄位不得出現在兩個分組",
  );
  assert.deepEqual(
    [...grouped].sort(),
    [...INVESTOR_HIDEABLE_FIELDS].sort(),
    "分組與白名單必須完全一致，否則 UI 會漏掉可隱藏欄位",
  );
});
