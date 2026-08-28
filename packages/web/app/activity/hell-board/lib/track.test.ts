import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_H,
  BOARD_W,
  TILE_COUNT,
  TRACK_CONTROL_POINTS,
  TRACK_LENGTH,
  flowingTrackPath,
  trackIndexAt,
  trackPoint,
  trackSampleAtPosition,
  trackZone,
} from "./track";

test("彩虹书岛路线由足够多的控制点和曲线段组成", () => {
  assert.ok(TRACK_CONTROL_POINTS.length >= 20);
  assert.ok(TRACK_LENGTH > 3_800);
  assert.match(flowingTrackPath(), /^M .* C /);
  assert.equal(
    (flowingTrackPath().match(/ C /g) ?? []).length,
    TRACK_CONTROL_POINTS.length - 1,
  );
});

test("100 个格子均落在地图安全边距内", () => {
  for (let index = 1; index <= TILE_COUNT; index++) {
    const point = trackPoint(index);
    assert.ok(
      point.x >= 70 && point.x <= BOARD_W - 70,
      `第 ${index} 格 x 越界: ${point.x}`,
    );
    assert.ok(
      point.y >= 70 && point.y <= BOARD_H - 70,
      `第 ${index} 格 y 越界: ${point.y}`,
    );
  }
});

test("弧长采样让相邻格距离保持稳定", () => {
  const distances: number[] = [];
  for (let index = 1; index < TILE_COUNT; index++) {
    const a = trackPoint(index);
    const b = trackPoint(index + 1);
    distances.push(Math.hypot(a.x - b.x, a.y - b.y));
  }
  const average =
    distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
  assert.ok(average >= 38 && average <= 60, `平均间距异常: ${average}`);
  for (const [offset, distance] of distances.entries()) {
    assert.ok(
      distance >= average * 0.82 && distance <= average * 1.08,
      `第 ${offset + 1} 段间距异常: ${distance}`,
    );
  }
});

test("路线拥有足够多转向且非相邻路段保持安全距离", () => {
  let turns = 0;
  let previousAngle = trackSampleAtPosition(1).tangent;
  for (let index = 2; index <= TILE_COUNT; index++) {
    const angle = trackSampleAtPosition(index).tangent;
    const delta = Math.abs(((angle - previousAngle + 540) % 360) - 180);
    if (delta > 18) turns++;
    previousAngle = angle;
  }
  assert.ok(turns >= 16, `明显转向不足: ${turns}`);

  for (let left = 1; left <= TILE_COUNT; left++) {
    for (let right = left + 4; right <= TILE_COUNT; right++) {
      const a = trackPoint(left);
      const b = trackPoint(right);
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(distance >= 100, `第 ${left} 与 ${right} 格过近: ${distance}`);
    }
  }
});

test("每个格子中心都能准确命中自身编号", () => {
  for (let index = 1; index <= TILE_COUNT; index++) {
    const point = trackPoint(index);
    assert.equal(trackIndexAt(point.x, point.y), index);
  }
});

test("切线与法线在全程均为有限值和单位向量", () => {
  for (let position = 1; position <= TILE_COUNT; position += 0.25) {
    const sample = trackSampleAtPosition(position);
    assert.ok(Number.isFinite(sample.tangent));
    assert.ok(Number.isFinite(sample.normalX));
    assert.ok(Number.isFinite(sample.normalY));
    assert.ok(Math.abs(Math.hypot(sample.normalX, sample.normalY) - 1) < 0.001);
  }
});

test("七个主题区覆盖完整且边界稳定", () => {
  assert.equal(trackZone(1), "harbor");
  assert.equal(trackZone(14), "harbor");
  assert.equal(trackZone(15), "field");
  assert.equal(trackZone(43), "cloud");
  assert.equal(trackZone(70), "lake");
  assert.equal(trackZone(84), "crystal");
  assert.equal(trackZone(85), "finale");
  assert.equal(trackZone(100), "finale");
});
