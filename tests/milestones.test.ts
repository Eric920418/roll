import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMilestoneMutation,
  buildMilestoneBoard,
} from "../src/lib/tools/checklist";

test("Milestones 保留系統完成狀態，並加入每週／每月與群組改名", () => {
  const groups = buildMilestoneBoard(
    ["market-entry"],
    "en",
    { "market-entry-1": true },
    {
      groupTitles: { "market-entry": "Taiwan launch" },
      items: [
        { id: "weekly-1", groupKey: "weekly", title: "Call five prospects", done: false },
        { id: "monthly-1", groupKey: "monthly", title: "Review revenue", done: true },
      ],
    },
  );

  assert.deepEqual(groups.map((group) => group.key), ["market-entry", "weekly", "monthly"]);
  assert.equal(groups[0].title, "Taiwan launch");
  assert.equal(groups[0].items[0].done, true);
  assert.equal(groups[1].items[0].text, "Call five prospects");
  assert.equal(groups[2].items[0].done, true);
});

test("Milestones 自訂項目可新增、編輯、完成與刪除", () => {
  let config = applyMilestoneMutation(
    {},
    { type: "addItem", groupKey: "weekly", title: "Send follow-ups" },
    "item-1",
  );
  config = applyMilestoneMutation(config, {
    type: "updateItem",
    itemId: "item-1",
    title: "Send ten follow-ups",
    done: true,
  });
  assert.deepEqual(config.items[0], {
    id: "item-1",
    groupKey: "weekly",
    title: "Send ten follow-ups",
    done: true,
  });

  config = applyMilestoneMutation(config, { type: "deleteItem", itemId: "item-1" });
  assert.equal(config.items.length, 0);
});

test("Milestones 系統項目可改名，勾選狀態與 key 不受影響", () => {
  const config = applyMilestoneMutation({}, {
    type: "updateSystemItem",
    itemKey: "market-entry-2",
    title: "改成我們自己的說法",
  });

  const [group] = buildMilestoneBoard(["market-entry"], "zh-tw", { "market-entry-2": true }, config);
  const item = group.items.find((row) => row.key === "market-entry-2");

  assert.equal(item?.text, "改成我們自己的說法");
  assert.equal(item?.done, true, "改名不能弄丟 checklistState 的完成狀態");
  assert.equal(item?.defaultText, "申請 FIA 外國人投資審查");
});

test("Milestones 系統項目刪除為軟刪，可整組還原預設", () => {
  let config = applyMilestoneMutation({}, { type: "deleteSystemItem", itemKey: "market-entry-1" });
  config = applyMilestoneMutation(config, {
    type: "updateSystemItem",
    itemKey: "market-entry-3",
    title: "Renamed",
  });

  let [group] = buildMilestoneBoard(["market-entry"], "en", {}, config);
  assert.equal(group.items.filter((item) => !item.hidden).length, 3);
  assert.equal(group.items[0].hidden, true, "軟刪的項目要留在資料裡才能還原");

  config = applyMilestoneMutation(config, { type: "restoreSystemItems", groupKey: "market-entry" });
  [group] = buildMilestoneBoard(["market-entry"], "en", {}, config);
  assert.equal(group.items.filter((item) => !item.hidden).length, 4);
  assert.equal(group.items[2].text, "Secure a registered office address & business registration");
});

test("Milestones 還原預設只影響該群組（market-entry 不能誤傷 marketing）", () => {
  let config = applyMilestoneMutation({}, { type: "deleteSystemItem", itemKey: "marketing-1" });
  config = applyMilestoneMutation(config, { type: "deleteSystemItem", itemKey: "market-entry-1" });
  config = applyMilestoneMutation(config, { type: "restoreSystemItems", groupKey: "market-entry" });

  assert.deepEqual(config.hiddenSystemKeys, ["marketing-1"]);
});

test("Milestones 拒絕不在白名單內的系統 item key", () => {
  assert.throws(() => applyMilestoneMutation({}, { type: "deleteSystemItem", itemKey: "__proto__" }));
  assert.throws(() => applyMilestoneMutation({}, {
    type: "updateSystemItem",
    itemKey: "market-entry-99",
    title: "x",
  }));
});
