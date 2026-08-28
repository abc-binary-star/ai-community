/**
 * 彩虹书岛 V2 路线几何。
 *
 * 一组易于美术调优的控制点先被转换为 Catmull-Rom 风格的三次贝塞尔段，
 * 再建立高精度弧长表。主地图、缩略图、格子、棋子动画与点击命中都只
 * 使用本模块，避免出现多套坐标口径。
 */

/** 格子视觉边长（世界坐标） */
export const CELL = 46;
export const BOARD_W = 1600;
export const BOARD_H = 1000;
export const TILE_COUNT = 100;

export type TrackZone =
  "harbor" | "field" | "forest" | "cloud" | "lake" | "crystal" | "finale";

export interface TrackControlPoint {
  x: number;
  y: number;
  zone: TrackZone;
}

export interface TrackSample {
  x: number;
  y: number;
  /** 路线方向，单位为角度 */
  tangent: number;
  normalX: number;
  normalY: number;
  distance: number;
}

/**
 * 23 个控制点构成 22 段连续曲线：路线横纵展开，包含连续 S 弯和回头弯。
 * 控制点是构图资产，不等同于格子位置；100 格由弧长等距采样得到。
 */
export const TRACK_CONTROL_POINTS: readonly TrackControlPoint[] = [
  { x: 112, y: 858, zone: "harbor" },
  { x: 288, y: 868, zone: "harbor" },
  { x: 468, y: 806, zone: "harbor" },
  { x: 388, y: 690, zone: "field" },
  { x: 186, y: 650, zone: "field" },
  { x: 252, y: 522, zone: "field" },
  { x: 472, y: 548, zone: "forest" },
  { x: 654, y: 696, zone: "forest" },
  { x: 842, y: 824, zone: "forest" },
  { x: 1064, y: 788, zone: "cloud" },
  { x: 1196, y: 664, zone: "cloud" },
  { x: 1112, y: 532, zone: "cloud" },
  { x: 884, y: 558, zone: "lake" },
  { x: 698, y: 478, zone: "lake" },
  { x: 558, y: 350, zone: "lake" },
  { x: 346, y: 400, zone: "crystal" },
  { x: 164, y: 320, zone: "crystal" },
  { x: 304, y: 204, zone: "crystal" },
  { x: 526, y: 246, zone: "finale" },
  { x: 716, y: 158, zone: "finale" },
  { x: 918, y: 250, zone: "finale" },
  { x: 1140, y: 350, zone: "finale" },
  { x: 1252, y: 292, zone: "finale" },
  { x: 1352, y: 286, zone: "finale" },
  // 最后几格回落到冠军小屋门前，避免路线从屋顶穿过。
  { x: 1402, y: 292, zone: "finale" },
] as const;

interface Point {
  x: number;
  y: number;
}

interface CubicSegment {
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
}

interface ArcPoint extends Point {
  distance: number;
}

const CURVE_TENSION = 0.84;
const SAMPLES_PER_SEGMENT = 42;

function cubicSegments(): CubicSegment[] {
  const segments: CubicSegment[] = [];
  for (let i = 0; i < TRACK_CONTROL_POINTS.length - 1; i++) {
    const previous = TRACK_CONTROL_POINTS[Math.max(0, i - 1)];
    const start = TRACK_CONTROL_POINTS[i];
    const end = TRACK_CONTROL_POINTS[i + 1];
    const next =
      TRACK_CONTROL_POINTS[Math.min(TRACK_CONTROL_POINTS.length - 1, i + 2)];
    const factor = CURVE_TENSION / 6;
    segments.push({
      p0: start,
      c1: {
        x: start.x + (end.x - previous.x) * factor,
        y: start.y + (end.y - previous.y) * factor,
      },
      c2: {
        x: end.x - (next.x - start.x) * factor,
        y: end.y - (next.y - start.y) * factor,
      },
      p1: end,
    });
  }
  return segments;
}

const SEGMENTS = cubicSegments();

function cubicPoint(segment: CubicSegment, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x:
      segment.p0.x * mt2 * mt +
      3 * segment.c1.x * mt2 * t +
      3 * segment.c2.x * mt * t2 +
      segment.p1.x * t2 * t,
    y:
      segment.p0.y * mt2 * mt +
      3 * segment.c1.y * mt2 * t +
      3 * segment.c2.y * mt * t2 +
      segment.p1.y * t2 * t,
  };
}

function buildArcTable(): ArcPoint[] {
  const points: ArcPoint[] = [];
  let distance = 0;
  let previous: Point | null = null;
  SEGMENTS.forEach((segment, segmentIndex) => {
    for (
      let step = segmentIndex === 0 ? 0 : 1;
      step <= SAMPLES_PER_SEGMENT;
      step++
    ) {
      const point = cubicPoint(segment, step / SAMPLES_PER_SEGMENT);
      if (previous)
        distance += Math.hypot(point.x - previous.x, point.y - previous.y);
      points.push({ ...point, distance });
      previous = point;
    }
  });
  return points;
}

const ARC_TABLE = buildArcTable();
export const TRACK_LENGTH = ARC_TABLE[ARC_TABLE.length - 1].distance;

function pointAtDistance(target: number): TrackSample {
  const wanted = Math.max(0, Math.min(TRACK_LENGTH, target));
  let low = 0;
  let high = ARC_TABLE.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (ARC_TABLE[middle].distance < wanted) low = middle + 1;
    else high = middle;
  }

  const rightIndex = Math.max(1, low);
  const leftIndex = rightIndex - 1;
  const left = ARC_TABLE[leftIndex];
  const right = ARC_TABLE[rightIndex];
  const span = Math.max(0.0001, right.distance - left.distance);
  const ratio = (wanted - left.distance) / span;
  const x = left.x + (right.x - left.x) * ratio;
  const y = left.y + (right.y - left.y) * ratio;
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const magnitude = Math.max(0.0001, Math.hypot(dx, dy));
  return {
    x,
    y,
    tangent: (Math.atan2(dy, dx) * 180) / Math.PI,
    normalX: -dy / magnitude,
    normalY: dx / magnitude,
    distance: wanted,
  };
}

/**
 * 支持小数位置，供棋子沿 1→100 的真实曲线移动。
 * 0（未出发）与 1 共用起点视觉位置。
 */
export function trackSampleAtPosition(position: number): TrackSample {
  const normalized =
    (Math.max(1, Math.min(TILE_COUNT, position)) - 1) / (TILE_COUNT - 1);
  return pointAtDistance(normalized * TRACK_LENGTH);
}

/** 格子编号 → 路线中心点 */
export function trackPoint(index: number): { x: number; y: number } {
  const sample = trackSampleAtPosition(index);
  return { x: sample.x, y: sample.y };
}

/** 格子编号 → 路线切线角度 */
export function trackAngle(index: number): number {
  return trackSampleAtPosition(index).tangent;
}

/**
 * 100 个格子的路线采样，模块加载时预计算一次。
 * 主地图与缩略图每帧渲染都查此表，避免重复二分查找。
 */
export const TILE_SAMPLES: readonly TrackSample[] = Array.from(
  { length: TILE_COUNT },
  (_, i) => trackSampleAtPosition(i + 1),
);

/** 最近格命中；主地图和缩略图点击共用 */
export function trackIndexAt(px: number, py: number): number {
  let best = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index <= TILE_COUNT; index++) {
    const point = trackPoint(index);
    const distance = (point.x - px) ** 2 + (point.y - py) ** 2;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/** SVG 使用的三次贝塞尔路径 */
export function flowingTrackPath(): string {
  const [first] = SEGMENTS;
  if (!first) return "";
  const commands = [`M ${first.p0.x.toFixed(2)} ${first.p0.y.toFixed(2)}`];
  for (const segment of SEGMENTS) {
    commands.push(
      `C ${segment.c1.x.toFixed(2)} ${segment.c1.y.toFixed(2)}, ${segment.c2.x.toFixed(2)} ${segment.c2.y.toFixed(2)}, ${segment.p1.x.toFixed(2)} ${segment.p1.y.toFixed(2)}`,
    );
  }
  return commands.join(" ");
}

export function trackZone(index: number): TrackZone {
  if (index <= 14) return "harbor";
  if (index <= 28) return "field";
  if (index <= 42) return "forest";
  if (index <= 56) return "cloud";
  if (index <= 70) return "lake";
  if (index <= 84) return "crystal";
  return "finale";
}
