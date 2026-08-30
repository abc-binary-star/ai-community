"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  GripVertical,
  Rainbow,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { RAINBOW, RAINBOW_ORDER } from "../lib/board";
import type { RainbowColor } from "../lib/types";
import { Dialog, DialogCloseButton } from "./dialog";

const WHITE_BORDER = 8;
const STRIP_COVER_HEIGHT = 360;
const RAINBOW_CANVAS = { width: 1180, height: 600 };
const RAINBOW_GEOMETRY = { centerY: 590, outerRadius: 520, innerRadius: 270 };
type BridgeMode = "strip" | "rainbow";
type ColorScores = Record<RainbowColor, number>;

interface BridgeCover {
  id: string;
  name: string;
  img: HTMLImageElement;
  color: RainbowColor;
  detectedColor: RainbowColor;
  confidence: number;
  scores: ColorScores;
  manual: boolean;
}

interface CanvasDragState {
  sourceId: string;
  sourceColor: RainbowColor;
  overColor: RainbowColor;
}

interface StripSlot {
  key: RainbowColor;
  cover?: BridgeCover;
  x: number;
  y: number;
  width: number;
  height: number;
}

const HUE_CENTERS: Record<RainbowColor, number> = {
  red: 0,
  orange: 0.08,
  yellow: 0.16,
  green: 0.33,
  cyan: 0.5,
  blue: 0.62,
  purple: 0.75,
};

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hueDistance(a: number, b: number) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

/** 以饱和度加权的色相直方图分析封面，避免白底/黑字把主色拉偏。 */
function analyzeColor(img: HTMLImageElement): {
  scores: ColorScores;
  color: RainbowColor;
  confidence: number;
} {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const scores = Object.fromEntries(
    RAINBOW_ORDER.map((key) => [key, 0]),
  ) as ColorScores;
  if (!ctx) return { scores, color: "red", confidence: 0 };
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let colorfulWeight = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 180) continue;
    const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    if (s < 0.16 || v < 0.1) continue;
    const weight = s * (0.35 + v * 0.65);
    colorfulWeight += weight;
    for (const key of RAINBOW_ORDER) {
      const d = hueDistance(h, HUE_CENTERS[key]);
      scores[key] += weight * Math.exp(-(d * d) / (2 * 0.065 * 0.065));
    }
  }
  if (colorfulWeight === 0) scores.red = 1;
  const ordered = RAINBOW_ORDER.slice().sort((a, b) => scores[b] - scores[a]);
  const best = ordered[0];
  const max = scores[best];
  const second = scores[ordered[1]];
  const confidence = Math.round(
    Math.max(0, Math.min(1, (max - second) / Math.max(max, 0.001))) * 100,
  );
  return { scores, color: best, confidence };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(file.name));
    };
    img.src = url;
  });
}

function coverAspectRatio(img: HTMLImageElement) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  return iw && ih ? iw / ih : 2 / 3;
}

function arcBandPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
  ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
  ctx.closePath();
}

/**
 * 把一张完整封面按窄条采样后铺到一段弧带上。
 * 封面宽度映射弧长、高度映射弧带厚度；七段首尾相接后就是一条完整半圆。
 */
function drawCoverAlongArc(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;

  const radius = (outerRadius + innerRadius) / 2;
  const bandWidth = outerRadius - innerRadius;
  const angleSpan = endAngle - startAngle;
  const segments = Math.max(32, Math.ceil((angleSpan / Math.PI) * 240));
  const angleStep = angleSpan / segments;
  const sourceStep = iw / segments;

  ctx.save();
  arcBandPath(ctx, cx, cy, outerRadius, innerRadius, startAngle, endAngle);
  ctx.clip();
  for (let index = 0; index < segments; index += 1) {
    const angle = startAngle + (index + 0.5) * angleStep;
    const arcStep = radius * angleStep;
    const sourceX = index * sourceStep;
    const sampleWidth = Math.min(iw - sourceX, sourceStep + 0.75);

    ctx.save();
    ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.rotate(angle + Math.PI / 2);
    ctx.drawImage(
      img,
      sourceX,
      0,
      sampleWidth,
      ih,
      -arcStep / 2 - 0.8,
      -bandWidth / 2,
      arcStep + 1.6,
      bandWidth,
    );
    ctx.restore();
  }
  ctx.restore();
}

function drawRainbowParticles(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerRadius: number,
) {
  const particles = 38;
  ctx.save();
  for (let index = 0; index < particles; index += 1) {
    const progress = (index + 0.5) / particles;
    const angle = Math.PI * (1.06 + progress * 0.88);
    const radius = outerRadius + 18 + ((index * 17) % 43);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const color = RAINBOW[RAINBOW_ORDER[index % RAINBOW_ORDER.length]].hex;
    const size = 2.5 + ((index * 7) % 5);
    ctx.fillStyle = `${color}${index % 3 === 0 ? "a8" : "72"}`;

    if (index % 6 === 0) {
      ctx.beginPath();
      ctx.moveTo(x, y - size * 1.7);
      ctx.lineTo(x + size * 0.42, y - size * 0.42);
      ctx.lineTo(x + size * 1.7, y);
      ctx.lineTo(x + size * 0.42, y + size * 0.42);
      ctx.lineTo(x, y + size * 1.7);
      ctx.lineTo(x - size * 0.42, y + size * 0.42);
      ctx.lineTo(x - size * 1.7, y);
      ctx.lineTo(x - size * 0.42, y - size * 0.42);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function assignUnique(covers: BridgeCover[]): BridgeCover[] {
  if (covers.length <= 1)
    return covers.map((cover) => ({
      ...cover,
      color: cover.detectedColor,
      manual: false,
    }));
  let best: RainbowColor[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;
  const walk = (
    index: number,
    used: Set<RainbowColor>,
    picked: RainbowColor[],
    total: number,
  ) => {
    if (index === covers.length) {
      if (total > bestScore) {
        bestScore = total;
        best = picked.slice();
      }
      return;
    }
    for (const key of RAINBOW_ORDER) {
      if (used.has(key)) continue;
      used.add(key);
      picked.push(key);
      walk(index + 1, used, picked, total + covers[index].scores[key]);
      picked.pop();
      used.delete(key);
    }
  };
  walk(0, new Set(), [], 0);
  return covers.map((cover, index) => {
    const color = best[index] ?? cover.detectedColor;
    const values = RAINBOW_ORDER.map((key) => cover.scores[key]).sort(
      (a, b) => b - a,
    );
    const confidence = Math.round(
      Math.max(
        0,
        Math.min(
          1,
          (cover.scores[color] - values[1]) / Math.max(values[0], 0.001),
        ),
      ) * 100,
    );
    return { ...cover, color, confidence, manual: false };
  });
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function stripSlots(
  canvasWidth: number,
  canvasHeight: number,
  byColor: Map<RainbowColor, BridgeCover[]>,
): StripSlot[] {
  const covers = RAINBOW_ORDER.map((key) => ({
    key,
    cover: byColor.get(key)?.[0],
  }));
  const height = canvasHeight - WHITE_BORDER * 2;
  const widths = covers.map(({ cover }) =>
    cover ? coverAspectRatio(cover.img) * height : (2 / 3) * height,
  );
  const stripWidth = widths.reduce((sum, width) => sum + width, 0);
  let x = (canvasWidth - stripWidth) / 2;

  return covers.map(({ key, cover }, index) => {
    const slot = {
      key,
      cover,
      x,
      y: WHITE_BORDER,
      width: widths[index],
      height,
    };
    x += widths[index];
    return slot;
  });
}

function drawStrip(
  ctx: CanvasRenderingContext2D,
  byColor: Map<RainbowColor, BridgeCover[]>,
  dragState?: CanvasDragState | null,
) {
  stripSlots(ctx.canvas.width, ctx.canvas.height, byColor).forEach((slot) => {
    const { key, cover, x, y, width, height } = slot;
    if (cover) ctx.drawImage(cover.img, x, y, width, height);
    else {
      ctx.fillStyle = `${RAINBOW[key].hex}24`;
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = RAINBOW[key].hex;
      ctx.font = '900 18px "PingFang SC", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(`${RAINBOW[key].label}色`, x + width / 2, y + height / 2);
    }

    if (dragState && dragState.sourceColor === key) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fillRect(x, y, width, height);
    }
    if (dragState && dragState.overColor === key) {
      ctx.strokeStyle = "#7c3aed";
      ctx.lineWidth = 8;
      ctx.strokeRect(x + 4, y + 4, width - 8, height - 8);
    }
  });
}

function drawRainbow(
  ctx: CanvasRenderingContext2D,
  byColor: Map<RainbowColor, BridgeCover[]>,
  dragState?: CanvasDragState | null,
) {
  const cx = ctx.canvas.width / 2;
  const {
    centerY: cy,
    outerRadius: outer,
    innerRadius: inner,
  } = RAINBOW_GEOMETRY;

  RAINBOW_ORDER.forEach((key, index) => {
    const startAngle = Math.PI + (index * Math.PI) / RAINBOW_ORDER.length;
    const endAngle = Math.PI + ((index + 1) * Math.PI) / RAINBOW_ORDER.length;
    const cover = byColor.get(key)?.[0];

    // 保留长条的红→紫相邻顺序，再把整条封面带连续弯成一个厚半圆。
    ctx.save();
    arcBandPath(ctx, cx, cy, outer, inner, startAngle, endAngle);
    ctx.fillStyle = `${RAINBOW[key].hex}52`;
    ctx.fill();
    ctx.restore();

    if (cover)
      drawCoverAlongArc(
        ctx,
        cover.img,
        cx,
        cy,
        outer,
        inner,
        startAngle,
        endAngle,
      );

    ctx.save();
    arcBandPath(ctx, cx, cy, outer, inner, startAngle, endAngle);
    ctx.fillStyle = `${RAINBOW[key].hex}1f`;
    ctx.fill();
    ctx.restore();

    if (dragState && dragState.sourceColor === key) {
      ctx.save();
      arcBandPath(ctx, cx, cy, outer, inner, startAngle, endAngle);
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fill();
      ctx.restore();
    }
    if (dragState && dragState.overColor === key) {
      ctx.save();
      arcBandPath(ctx, cx, cy, outer, inner, startAngle, endAngle);
      ctx.strokeStyle = "#7c3aed";
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.restore();
    }
  });
  drawRainbowParticles(ctx, cx, cy, outer);
}

function drawBridge(
  canvas: HTMLCanvasElement,
  byColor: Map<RainbowColor, BridgeCover[]>,
  mode: BridgeMode,
  dragState?: CanvasDragState | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground(ctx);
  if (mode === "strip") drawStrip(ctx, byColor, dragState);
  else drawRainbow(ctx, byColor, dragState);
}

function canvasSizeFor(
  mode: BridgeMode,
  byColor: Map<RainbowColor, BridgeCover[]>,
) {
  if (mode === "rainbow") return RAINBOW_CANVAS;
  const totalRatio = RAINBOW_ORDER.reduce((sum, key) => {
    const cover = byColor.get(key)?.[0];
    return sum + (cover ? coverAspectRatio(cover.img) : 2 / 3);
  }, 0);
  return {
    width: Math.round(totalRatio * STRIP_COVER_HEIGHT) + WHITE_BORDER * 2,
    height: STRIP_COVER_HEIGHT + WHITE_BORDER * 2,
  };
}

function colorAtCanvasPointer(
  event: ReactPointerEvent<HTMLCanvasElement>,
  byColor: Map<RainbowColor, BridgeCover[]>,
  mode: BridgeMode,
): RainbowColor | null {
  const canvas = event.currentTarget;
  const bounds = canvas.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * canvas.width;
  const y = ((event.clientY - bounds.top) / bounds.height) * canvas.height;

  if (mode === "strip") {
    const slot = stripSlots(canvas.width, canvas.height, byColor).find(
      (item) =>
        x >= item.x &&
        x <= item.x + item.width &&
        y >= item.y &&
        y <= item.y + item.height,
    );
    return slot?.key ?? null;
  }

  const cx = canvas.width / 2;
  const dx = x - cx;
  const dy = y - RAINBOW_GEOMETRY.centerY;
  const radius = Math.hypot(dx, dy);
  if (
    radius < RAINBOW_GEOMETRY.innerRadius ||
    radius > RAINBOW_GEOMETRY.outerRadius
  )
    return null;

  let angle = Math.atan2(dy, dx);
  if (angle < Math.PI && dy <= 0) angle += Math.PI * 2;
  if (angle < Math.PI || angle > Math.PI * 2) return null;
  const index = Math.min(
    RAINBOW_ORDER.length - 1,
    Math.floor(((angle - Math.PI) / Math.PI) * RAINBOW_ORDER.length),
  );
  return RAINBOW_ORDER[index];
}

/** 「彩虹桥晒图」：程序排位后由用户确认，再导出 PNG。纯前端合成，不落库。 */
export function RainbowBridgeDialog({ onClose }: { onClose: () => void }) {
  const [covers, setCovers] = useState<BridgeCover[]>([]);
  const [mode, setMode] = useState<BridgeMode>("strip");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draggingCoverId, setDraggingCoverId] = useState<string | null>(null);
  const [canvasDrag, setCanvasDrag] = useState<CanvasDragState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasDragRef = useRef<{
    sourceId: string;
    sourceColor: RainbowColor;
  } | null>(null);

  const byColor = useMemo(() => {
    const map = new Map<RainbowColor, BridgeCover[]>();
    RAINBOW_ORDER.forEach((key) => map.set(key, []));
    covers.forEach((cover) => map.get(cover.color)?.push(cover));
    return map;
  }, [covers]);
  const canvasSize = useMemo(
    () => canvasSizeFor(mode, byColor),
    [byColor, mode],
  );
  const orderedCovers = useMemo(
    () =>
      covers
        .slice()
        .sort(
          (a, b) =>
            RAINBOW_ORDER.indexOf(a.color) - RAINBOW_ORDER.indexOf(b.color),
        ),
    [covers],
  );

  const redraw = useCallback(() => {
    if (canvasRef.current)
      drawBridge(canvasRef.current, byColor, mode, canvasDrag);
  }, [byColor, canvasDrag, mode]);

  useEffect(() => redraw(), [redraw]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setNotice(null);
    const room = RAINBOW_ORDER.length - covers.length;
    const loaded: BridgeCover[] = [];
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      try {
        const img = await loadImage(file);
        const analysis = analyzeColor(img);
        loaded.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name.replace(/\.[^.]+$/, ""),
          img,
          color: analysis.color,
          detectedColor: analysis.color,
          confidence: analysis.confidence,
          scores: analysis.scores,
          manual: false,
        });
      } catch {
        // 忽略无法解码的文件
      }
    }
    if (files.length > Math.max(0, room))
      setNotice("最多支持七本封面，超出的文件未加入。");
    if (loaded.length > 0) {
      setCovers((prev) => assignUnique([...prev, ...loaded]));
      setConfirmed(false);
    }
    setBusy(false);
  };

  const setColor = (id: string, next: RainbowColor) => {
    setCovers((prev) => {
      const current = prev.find((cover) => cover.id === id);
      if (!current || current.color === next) return prev;
      const occupied = prev.find(
        (cover) => cover.id !== id && cover.color === next,
      );
      return prev.map((cover) => {
        if (cover.id === id) return { ...cover, color: next, manual: true };
        if (occupied && cover.id === occupied.id)
          return { ...cover, color: current.color, manual: true };
        return cover;
      });
    });
    setConfirmed(false);
  };

  const swapCoverPositions = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setCovers((prev) => {
      const source = prev.find((cover) => cover.id === sourceId);
      const target = prev.find((cover) => cover.id === targetId);
      if (!source || !target) return prev;
      return prev.map((cover) => {
        if (cover.id === sourceId)
          return { ...cover, color: target.color, manual: true };
        if (cover.id === targetId)
          return { ...cover, color: source.color, manual: true };
        return cover;
      });
    });
    setConfirmed(false);
    setNotice("已按手工顺序调整，请重新确认后导出。");
  };

  const moveCoverOneStep = (id: string, direction: -1 | 1) => {
    const index = orderedCovers.findIndex((cover) => cover.id === id);
    const target = orderedCovers[index + direction];
    if (target) swapCoverPositions(id, target.id);
  };

  const startCanvasDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const sourceColor = colorAtCanvasPointer(event, byColor, mode);
    if (!sourceColor) return;
    const source = byColor.get(sourceColor)?.[0];
    if (!source) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    canvasDragRef.current = { sourceId: source.id, sourceColor };
    setCanvasDrag({
      sourceId: source.id,
      sourceColor,
      overColor: sourceColor,
    });
  };

  const moveCanvasDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = canvasDragRef.current;
    if (!active) return;
    event.preventDefault();
    const overColor = colorAtCanvasPointer(event, byColor, mode);
    if (!overColor) return;
    setCanvasDrag((prev) =>
      prev && prev.overColor !== overColor ? { ...prev, overColor } : prev,
    );
  };

  const finishCanvasDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = canvasDragRef.current;
    if (!active) return;
    event.preventDefault();
    const targetColor = colorAtCanvasPointer(event, byColor, mode);
    const target = targetColor ? byColor.get(targetColor)?.[0] : undefined;
    if (target && target.id !== active.sourceId)
      swapCoverPositions(active.sourceId, target.id);
    else if (targetColor && targetColor !== active.sourceColor)
      setColor(active.sourceId, targetColor);

    canvasDragRef.current = null;
    setCanvasDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const cancelCanvasDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    canvasDragRef.current = null;
    setCanvasDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const autoArrange = () => {
    setCovers((prev) => assignUnique(prev));
    setConfirmed(false);
    setNotice("已按七色评分重新排位，请确认后再导出。");
  };

  const changeMode = (next: BridgeMode) => {
    if (next === mode) return;
    setMode(next);
    setConfirmed(false);
    setNotice("排版模式已切换，请再次确认后导出。");
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !confirmed) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rainbow-bridge-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const filledSlots = RAINBOW_ORDER.filter(
    (key) => (byColor.get(key)?.length ?? 0) > 0,
  ).length;
  const canConfirm =
    covers.length === RAINBOW_ORDER.length &&
    new Set(covers.map((cover) => cover.color)).size === covers.length;

  return (
    <Dialog
      open
      onClose={onClose}
      className="max-w-3xl"
      labelledBy="rainbow-bridge-title"
    >
      <div className="flex items-center gap-2 border-b-2 border-stone-800 bg-[#fff1c2] px-4 py-3">
        <Rainbow className="size-4 text-violet-700" />
        <h3
          id="rainbow-bridge-title"
          className="text-sm font-black text-stone-900"
        >
          彩虹桥晒图
        </h3>
        <span className="text-[10px] font-bold text-stone-500">
          程序排位后需确认 · {filledSlots}/7
        </span>
        <DialogCloseButton onClose={onClose} />
      </div>

      <div className="max-h-[74vh] space-y-3 overflow-y-auto p-4">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          role="application"
          aria-label={`${mode === "strip" ? "长条" : "半圆彩虹"}封面排序区，按住封面拖到另一张封面上可交换位置`}
          onPointerDown={startCanvasDrag}
          onPointerMove={moveCanvasDrag}
          onPointerUp={finishCanvasDrag}
          onPointerCancel={cancelCanvasDrag}
          onLostPointerCapture={() => {
            canvasDragRef.current = null;
            setCanvasDrag(null);
          }}
          className={`w-full rounded-lg border-2 border-stone-800 shadow-[3px_3px_0_#292524] ${canvasDrag ? "cursor-grabbing" : "cursor-grab"}`}
          style={{
            aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
            touchAction: "none",
          }}
        />
        <p className="text-center text-[10px] font-bold text-violet-700">
          直接在上图按住封面拖动换位 · 支持电脑鼠标和手机手指
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-black text-stone-600">排版：</span>
          <button
            type="button"
            aria-pressed={mode === "strip"}
            onClick={() => changeMode("strip")}
            className={`rounded-md border-2 border-stone-800 px-2.5 py-1 text-[11px] font-black shadow-[2px_2px_0_#292524] ${mode === "strip" ? "bg-[#ffd166] text-[#4a3306]" : "bg-white text-stone-600"}`}
          >
            长条拼接
          </button>
          <button
            type="button"
            aria-pressed={mode === "rainbow"}
            onClick={() => changeMode("rainbow")}
            className={`rounded-md border-2 border-stone-800 px-2.5 py-1 text-[11px] font-black shadow-[2px_2px_0_#292524] ${mode === "rainbow" ? "bg-[#ffd166] text-[#4a3306]" : "bg-white text-stone-600"}`}
          >
            完整彩虹
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy || covers.length >= 7}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-3 py-1.5 text-xs font-black text-stone-700 shadow-[2px_2px_0_#292524] disabled:opacity-50"
          >
            <Upload className="size-3.5" />
            {busy ? "识别中…" : "上传封面"}
          </button>
          <button
            type="button"
            disabled={covers.length === 0 || busy}
            onClick={autoArrange}
            className="inline-flex items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-3 py-1.5 text-xs font-black text-stone-600 shadow-[2px_2px_0_#292524] disabled:opacity-40"
          >
            <RefreshCw className="size-3.5" />
            重新排位
          </button>
          <button
            type="button"
            disabled={covers.length === 0}
            onClick={() => {
              setCovers([]);
              setConfirmed(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border-2 border-stone-800 bg-white px-3 py-1.5 text-xs font-black text-stone-500 shadow-[2px_2px_0_#292524] disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
            清空
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => setConfirmed(true)}
            className="inline-flex items-center gap-1.5 rounded-md border-2 border-stone-800 bg-[#d9f99d] px-3 py-1.5 text-xs font-black text-emerald-900 shadow-[2px_2px_0_#292524] disabled:opacity-40"
          >
            <Check className="size-3.5" />
            {confirmed ? "已确认" : "确认排版"}
          </button>
          <button
            type="button"
            disabled={!confirmed}
            onClick={exportPng}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border-2 border-stone-800 bg-gradient-to-b from-[#fff1c2] to-[#ffd166] px-4 py-1.5 text-xs font-black text-[#4a3306] shadow-[2px_2px_0_#292524] disabled:opacity-40"
          >
            <Download className="size-3.5" />
            导出 PNG
          </button>
        </div>

        <p
          className={`rounded-md border px-3 py-2 text-[11px] font-bold ${confirmed ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-[#dccfa8] bg-[#f9f3e2]/70 text-stone-600"}`}
        >
          {notice ??
            (confirmed
              ? "排版已确认，可以导出。"
              : "系统已按颜色评分排位；可手动调整颜色，确认后才能导出。")}
        </p>

        {covers.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1 text-[10px] font-bold text-stone-500">
              <GripVertical className="size-3" />
              按住封面左右拖动调整顺序；也可使用卡片上的左右按钮微调。
            </p>
            <ul className="flex gap-2 overflow-x-auto pb-2">
              {orderedCovers.map((cover, index) => (
                <li
                  key={cover.id}
                  draggable
                  onDragStart={(event) => {
                    setDraggingCoverId(cover.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", cover.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId =
                      event.dataTransfer.getData("text/plain") ||
                      draggingCoverId;
                    if (sourceId) swapCoverPositions(sourceId, cover.id);
                    setDraggingCoverId(null);
                  }}
                  onDragEnd={() => setDraggingCoverId(null)}
                  className={`relative flex w-44 shrink-0 cursor-grab items-center gap-2 rounded-md border bg-white/90 p-1.5 active:cursor-grabbing ${draggingCoverId === cover.id ? "border-violet-400 opacity-50" : "border-[#dccfa8]"}`}
                >
                  <GripVertical className="size-3 shrink-0 text-stone-300" />
                  <span className="h-12 w-9 shrink-0 overflow-hidden rounded border border-stone-300 bg-stone-100">
                    <img
                      src={cover.img.src}
                      alt=""
                      className="size-full object-cover"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[10px] font-bold text-stone-700"
                      title={cover.name}
                    >
                      {cover.name}
                    </p>
                    <select
                      value={cover.color}
                      onChange={(e) =>
                        setColor(cover.id, e.target.value as RainbowColor)
                      }
                      aria-label={`${cover.name} 的颜色`}
                      className="mt-0.5 w-full rounded border border-stone-300 bg-white px-1 py-0.5 text-[10px] font-black"
                      style={{ color: RAINBOW[cover.color].hex }}
                    >
                      {RAINBOW_ORDER.map((key) => (
                        <option key={key} value={key}>
                          {RAINBOW[key].label}色
                        </option>
                      ))}
                    </select>
                    <span className="text-[9px] font-medium text-stone-400">
                      {cover.manual
                        ? "手动调整"
                        : `自动识别 ${cover.confidence}%`}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveCoverOneStep(cover.id, -1)}
                      aria-label={`${cover.name} 左移`}
                      className="rounded p-0.5 text-stone-500 hover:bg-amber-50 disabled:opacity-20"
                    >
                      <ChevronLeft className="size-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === orderedCovers.length - 1}
                      onClick={() => moveCoverOneStep(cover.id, 1)}
                      aria-label={`${cover.name} 右移`}
                      className="rounded p-0.5 text-stone-500 hover:bg-amber-50 disabled:opacity-20"
                    >
                      <ChevronRight className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCovers((prev) =>
                          prev.filter((item) => item.id !== cover.id),
                        );
                        setConfirmed(false);
                      }}
                      aria-label={`移除 ${cover.name}`}
                      className="rounded p-0.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {covers.length === 0 && !busy && (
          <p className="rounded-md border border-dashed border-[#c9b98f] bg-[#f9f3e2]/70 px-3 py-2.5 text-[11px] font-medium leading-relaxed text-stone-500">
            上传最多七本封面，程序会按色相评分并确保每本占据不同的红 / 橙 / 黄 /
            绿 / 青 / 蓝 / 紫槽位。确认排位后，再导出长条或完整彩虹图。
          </p>
        )}
      </div>
    </Dialog>
  );
}
