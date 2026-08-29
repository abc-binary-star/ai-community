import assert from "node:assert/strict";
import test from "node:test";
import { canLeaveTeam, freeColorsForTeam } from "./rules";
import type { Team, TeamMember } from "./types";

function member(id: string, color?: string): TeamMember {
  return {
    id,
    userId: `u-${id}`,
    name: id,
    isCaptain: false,
    color,
    bookCount: 0,
    wordCount: 0,
  };
}

function team(overrides: Partial<Team> = {}): Team {
  return {
    id: "t1",
    name: "测试队",
    color: "#e25555",
    members: [],
    position: 0,
    points: 0,
    universalDice: 0,
    rollChances: 0,
    rainbowCount: 0,
    weekMinDelta: 0,
    colorBlocks: {},
    buffs: [],
    status: "collecting",
    ...overrides,
  };
}

test("freeColorsForTeam 排除队友占用色但保留自己当前色", () => {
  const t = team({
    members: [member("m1", "red"), member("m2", "blue"), member("m3")],
  });
  // m1 自己占着 red：可换集合应含 red（能停在原色），但不含队友的 blue
  const mine = freeColorsForTeam(t, "m1");
  assert.ok(mine.includes("red"), "自己当前色应仍可保留");
  assert.ok(!mine.includes("blue"), "队友已占用的色不应可选");
  assert.equal(mine.length, 6);
});

test("freeColorsForTeam 按彩虹序返回，且未入队时给满 7 色", () => {
  const t = team({ members: [member("m1", "purple"), member("m2", "red")] });
  const colors = freeColorsForTeam(t, "m1");
  assert.deepEqual(colors, ["orange", "yellow", "green", "cyan", "blue", "purple"]);
  assert.equal(freeColorsForTeam(undefined, null).length, 7);
  assert.equal(freeColorsForTeam(team(), "missing").length, 7);
});

test("freeColorsForTeam 忽略成员的空颜色占位", () => {
  // m2/m3 尚未认领颜色，不应占用色位；只有 m1 的 red 被真实占用
  const t = team({ members: [member("m1", "red"), member("m2", ""), member("m3", undefined)] });
  const colors = freeColorsForTeam(t, "m3");
  assert.ok(!colors.includes("red"), "队友已认领的 red 应被排除");
  assert.equal(colors.length, 6);
});

test("canLeaveTeam 全新队可退", () => {
  assert.equal(canLeaveTeam(team()), true);
  assert.equal(canLeaveTeam(team({ colorBlocks: { red: 0 } })), true);
  // 色块按 >0 判进展，负值不计（与后端 TeamHasProgress 一致）
  assert.equal(canLeaveTeam(team({ colorBlocks: { red: -1 } })), true);
  assert.equal(canLeaveTeam(undefined), false);
});

test("canLeaveTeam 已产生对战进展的队不可退", () => {
  const blocked: Team[] = [
    team({ position: 7 }),
    team({ points: 3 }),
    team({ universalDice: 1 }),
    team({ rollChances: 1 }),
    team({ rainbowCount: 1 }),
    team({ weekMinDelta: -1 }),
    team({ status: "ready" }),
    team({ status: "completed" }),
    team({ colorBlocks: { red: 2 } }),
    team({ buffs: [{ kind: "immunity", label: "无损通行", uses: 1 }] }),
  ];
  blocked.forEach((t, i) => {
    assert.equal(canLeaveTeam(t), false, `第 ${i} 项应判为不可退队`);
  });
});
