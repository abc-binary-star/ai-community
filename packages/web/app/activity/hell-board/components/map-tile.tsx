"use client";

import { memo } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Flag,
  Sparkles,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isFinish, KIND_META } from "../lib/board";
import { CELL, TILE_SAMPLES } from "../lib/track";
import { tileDetailText } from "../lib/rules";
import type { Tile } from "../lib/types";

export type MapLod = "overview" | "browse" | "detail";

const SURFACE: Record<Tile["kind"], string> = {
  forward: "from-[#eefbea] to-[#a9d9a6] border-[#4e8d58]",
  backward: "from-[#fff0eb] to-[#efaaa0] border-[#ad5651]",
  special: "from-[#fff8d6] to-[#efca64] border-[#ad7d2e]",
  swap: "from-[#ecfaff] to-[#9fd4df] border-[#4f8899]",
  blank: "from-[#fffdf7] to-[#ddd2bd] border-[#887763]",
};

function TileIcon({ tile, className }: { tile: Tile; className?: string }) {
  const meta = KIND_META[tile.kind];
  if (isFinish(tile.index))
    return <Flag className={className} aria-hidden strokeWidth={3} />;
  if (meta.icon === "up")
    return <ArrowUp className={className} aria-hidden strokeWidth={3} />;
  if (meta.icon === "down")
    return <ArrowDown className={className} aria-hidden strokeWidth={3} />;
  if (meta.icon === "swap")
    return <ArrowRightLeft className={className} aria-hidden strokeWidth={3} />;
  if (meta.icon === "star")
    return (
      <Star
        className={className}
        aria-hidden
        fill="currentColor"
        strokeWidth={2.5}
      />
    );
  return <Sparkles className={className} aria-hidden strokeWidth={2.5} />;
}

interface MapTileProps {
  tile: Tile;
  lod: MapLod;
  active: boolean;
  focused?: boolean;
  angle: number;
  onSelect: (index: number) => void;
}

/**
 * 2.5D 路砖本体。外层随路线轻微转向，内容层反向旋转以保持数字可读。
 * 全景仍保留全部可点击按钮，但只突出里程格和特殊格。
 */
function MapTileInner({
  tile,
  lod,
  active,
  focused = false,
  angle,
  onSelect,
}: MapTileProps) {
  const finish = isFinish(tile.index);
  const isMilestone = tile.index === 1 || tile.index % 5 === 0 || finish;
  const isFeature = tile.kind !== "blank";
  const quiet = lod === "overview" && !isMilestone && !isFeature && !active;
  const displayAngle = Math.max(-12, Math.min(12, angle));

  return (
    <button
      type="button"
      onClick={() => onSelect(tile.index)}
      title={`第 ${tile.index} 格 · ${tileDetailText(tile)}`}
      aria-label={`第 ${tile.index} 格 ${tileDetailText(tile)}`}
      className={cn(
        "group relative flex h-full w-full items-center justify-center rounded-[13px] border-[3px] bg-gradient-to-b outline-none transition-[filter,transform] duration-200",
        SURFACE[tile.kind],
        "before:absolute before:inset-x-[3px] before:top-[3px] before:h-[8px] before:rounded-full before:bg-white/55",
        "after:absolute after:-bottom-[7px] after:left-[3px] after:right-[3px] after:h-[8px] after:rounded-b-[11px] after:bg-[#55483a]/35",
        "hover:brightness-105 focus-visible:ring-[5px] focus-visible:ring-[#ffd75e]/90 focus-visible:ring-offset-2 focus-visible:ring-offset-[#e8e1c2]",
        active &&
          "z-10 ring-[5px] ring-[#ffd75e]/80 drop-shadow-[0_8px_8px_rgba(75,55,30,0.34)]",
        focused && !active && "z-10 ring-[4px] ring-[#3b82f6]/70",
        finish && "from-[#fff4b8] to-[#f2b94d] border-[#9c6627]",
        quiet && "scale-[0.72] opacity-75 saturate-50",
      )}
      style={{ transform: `rotate(${displayAngle}deg)` }}
    >
      {/* 移动端扩大触控热区 */}
      <span
        aria-hidden
        className="absolute -inset-[10px] z-[-1] [@media(pointer:fine)]:hidden"
      />
      <span
        className="relative z-[1] flex h-full w-full flex-col items-center justify-center leading-none"
        style={{ transform: `rotate(${-displayAngle}deg)` }}
      >
        {lod === "overview" ? (
          isMilestone || active ? (
            <span className="text-[13px] font-black tabular-nums text-[#493b30] drop-shadow-[0_1px_0_rgba(255,255,255,0.8)]">
              {tile.index}
            </span>
          ) : isFeature ? (
            <TileIcon tile={tile} className="size-[15px] text-[#4d4035]" />
          ) : (
            <span className="size-1.5 rounded-full bg-[#655546]/45" />
          )
        ) : (
          <>
            <span className="absolute left-[4px] top-[4px] text-[8px] font-black tabular-nums text-[#5d4e42]/80">
              {tile.index}
            </span>
            <TileIcon
              tile={tile}
              className={cn(
                "size-[16px] text-[#4d4035]",
                lod === "detail" && "mb-[2px] size-[18px]",
              )}
            />
            {lod === "detail" && (
              <span className="max-w-[38px] truncate text-[7px] font-black tracking-[-0.02em] text-[#514338]">
                {finish ? "终点" : KIND_META[tile.kind].short}
              </span>
            )}
          </>
        )}
      </span>
      {active && (
        <span
          className="absolute -inset-2 -z-10 animate-pulse rounded-[18px] border-[4px] border-[#ffd75e]/70 motion-reduce:animate-none"
          aria-hidden
        />
      )}
    </button>
  );
}

export const MapTile = memo(MapTileInner);

/**
 * 主地图专用：自带轨道绝对定位包裹层，位置与转向角查 TILE_SAMPLES 表。
 * memo 边界覆盖整个定位层，拖拽/缩放期间上层重渲染时整块跳过。
 */
export const PlacedMapTile = memo(function PlacedMapTile({
  tile,
  lod,
  active,
  focused,
  onSelect,
}: Omit<MapTileProps, "angle">) {
  const sample = TILE_SAMPLES[tile.index - 1];
  return (
    <div
      className="absolute z-20"
      style={{
        left: sample.x - CELL / 2,
        top: sample.y - CELL / 2,
        width: CELL,
        height: CELL,
      }}
    >
      <MapTileInner
        tile={tile}
        lod={lod}
        active={active}
        focused={focused}
        angle={sample.tangent}
        onSelect={onSelect}
      />
    </div>
  );
});
