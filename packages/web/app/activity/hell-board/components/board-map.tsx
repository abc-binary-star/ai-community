"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Locate,
  Map as MapIcon,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BOARD_H, BOARD_W, trackIndexAt, trackPoint } from "../lib/track";
import { useActivityStore, useCurrentTeam } from "../lib/store";
import { useMapViewport } from "../hooks/use-map-viewport";
import { MapScene } from "./map-scene";
import { MapTeamTokens } from "./map-team-tokens";
import { PlacedMapTile, type MapLod } from "./map-tile";
import { MiniMap } from "./mini-map";
import { TileLegend } from "./tile-legend";
import type { Tile } from "../lib/types";

function lodForScale(scale: number): MapLod {
  if (scale < 0.65) return "overview";
  if (scale <= 1.15) return "browse";
  return "detail";
}

export function BoardMap({
  onSelectTile,
}: {
  onSelectTile: (index: number) => void;
}) {
  const tiles = useActivityStore((state) => state.tiles);
  const teams = useActivityStore((state) => state.teams);
  const pushToast = useActivityStore((s) => s.pushToast);
  const myTeam = useCurrentTeam();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [showMiniMap, setShowMiniMap] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 768;
  });
  const [focusedTile, setFocusedTile] = useState<number | null>(null);
  const firstFocusRef = useRef(true);
  const lastTapRef = useRef(0);
  const myPosition = myTeam?.position ?? 0;

  const pauseFollow = useCallback(() => {
    setFollow((prev) => {
      if (prev) {
        pushToast({ message: "已暂停自动跟随，点「跟随」恢复", tone: "info", duration: 2000 });
      }
      return false;
    });
  }, [pushToast]);

  const map = useMapViewport({
    wrapRef,
    boardW: BOARD_W,
    boardH: BOARD_H,
    onManualNavigate: pauseFollow,
  });
  const centerMapOn = map.centerOn;
  const zoomMapAt = map.zoomAt;

  const sortedTiles = useMemo(
    () => tiles.slice().sort((a, b) => a.index - b.index),
    [tiles],
  );
  const lod = lodForScale(map.scale);

  const centerOnIndex = useCallback(
    (index: number, smooth = true) => {
      if (index < 1) return;
      centerMapOn(trackPoint(index), smooth);
    },
    [centerMapOn],
  );

  // 100 个格子的共同回调：引用稳定，让 PlacedMapTile 的 memo 在拖拽/缩放期间生效
  const handleTileSelect = useCallback(
    (index: number) => {
      if (map.suppressClickRef.current) return;
      setFocusedTile(index);
      onSelectTile(index);
    },
    [map.suppressClickRef, onSelectTile],
  );

  useEffect(() => {
    if (!follow || myPosition < 1) return;
    if (firstFocusRef.current) {
      firstFocusRef.current = false;
      if ((wrapRef.current?.clientWidth ?? 999) < 640 && map.scale < 0.5) {
        zoomMapAt(0.52 / map.scale);
        centerOnIndex(myPosition, false);
      }
      return;
    }
    centerOnIndex(myPosition, true);
  }, [centerOnIndex, follow, map.scale, myPosition, zoomMapAt]);

  // 双击：桌面端聚焦格子；移动端双击缩放由 onPointerUpCapture 处理并阻止冒泡
  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-map-control]")) return;
    const element = wrapRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left - map.translation.x) / map.scale;
    const y = (event.clientY - rect.top - map.translation.y) / map.scale;
    setFollow(false);
    centerOnIndex(trackIndexAt(x, y));
  };

  // 移动端双击缩放（在 pointer up 捕获阶段检测，不干扰拖拽清理）
  const onPointerUpCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        const rect = event.currentTarget.getBoundingClientRect();
        zoomMapAt(1.5, event.clientX - rect.left, event.clientY - rect.top, true);
        // 阻止后续 click 事件误触格子
        map.suppressClickRef.current = true;
        window.setTimeout(() => {
          map.suppressClickRef.current = false;
        }, 50);
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;
    }
  };

  const jumpTo = (index: number) => {
    setFollow(false);
    centerOnIndex(index);
  };

  // 键盘导航：方向键在地图上移动焦点，Enter/Space 打开详情
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.min(100, (focusedTile ?? (myPosition || 1)) + 1);
      setFocusedTile(next);
      centerOnIndex(next, true);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      const prev = Math.max(1, (focusedTile ?? (myPosition || 1)) - 1);
      setFocusedTile(prev);
      centerOnIndex(prev, true);
    } else if (event.key === "Enter" || event.key === " ") {
      if (focusedTile !== null) {
        event.preventDefault();
        onSelectTile(focusedTile);
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      setFocusedTile(1);
      centerOnIndex(1, true);
    } else if (event.key === "End") {
      event.preventDefault();
      setFocusedTile(100);
      centerOnIndex(100, true);
    }
  };

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full touch-none select-none overflow-hidden rounded-2xl border-[3px] border-[#504339] bg-[#b9d6d1] shadow-[0_14px_38px_rgba(58,46,37,0.2),0_3px_0_#7d6a59] outline-none focus-visible:ring-[5px] focus-visible:ring-[#ffd75e]/60"
      onDoubleClick={onDoubleClick}
      onPointerUpCapture={onPointerUpCapture}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="application"
      aria-label="彩虹书岛大富翁地图，方向键移动焦点，Enter 查看格子详情"
      {...map.interactionProps}
    >
      <div
        className="absolute left-0 top-0 origin-top-left will-change-transform"
        style={{
          width: BOARD_W,
          height: BOARD_H,
          transform: `translate3d(${map.translation.x}px, ${map.translation.y}px, 0) scale(${map.scale})`,
        }}
      >
        <MapScene lod={lod} />

        {/* 100 个语义化交互路砖（PlacedMapTile 自带定位与 memo 边界） */}
        {sortedTiles.map((tile: Tile) => (
          <PlacedMapTile
            key={tile.index}
            tile={tile}
            lod={lod}
            active={myTeam?.position === tile.index}
            focused={focusedTile === tile.index}
            onSelect={handleTileSelect}
          />
        ))}

        <MapTeamTokens teams={teams} myTeamId={myTeam?.id ?? null} lod={lod} onSelectTile={onSelectTile} />
      </div>

      {/* 场景说明与当前 LOD，固定在视口上不参与缩放 */}
      <div
        data-map-control
        className="pointer-events-none absolute left-3 top-3 z-40 rounded-xl border border-white/60 bg-[#fffaf0]/90 px-3 py-2 shadow-[0_6px_18px_rgba(63,52,43,0.16)] backdrop-blur-sm"
      >
        <p className="text-[11px] font-black tracking-[0.12em] text-[#4d4036]">
          彩虹书岛
        </p>
        <p className="mt-0.5 text-[9px] font-bold text-[#79685a]">
          {lod === "overview"
            ? "全景 · 双击放大"
            : lod === "browse"
              ? "浏览 · 点击格子看效果"
              : "近景 · 方向键导航"}
        </p>
      </div>

      {/* 格子图例 */}
      <TileLegend />

      {/* 地图工具条 */}
      <div
        data-map-control
        className="absolute bottom-3 left-3 z-50 flex max-w-[calc(100%-24px)] items-center gap-1 rounded-xl border-2 border-[#514337] bg-[#fffaf0]/95 p-1.5 shadow-[0_7px_20px_rgba(58,46,37,0.24)] backdrop-blur-sm"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          title="缩小"
          aria-label="缩小"
          disabled={!map.canZoomOut}
          onClick={() => map.zoomAt(0.84)}
          className="map-control-button disabled:opacity-30"
        >
          <Minus className="size-3.5" />
        </button>
        <span className="w-10 text-center text-[10px] font-black tabular-nums text-[#6b5a4c]">
          {Math.round(map.scale * 100)}%
        </span>
        <button
          type="button"
          title="放大"
          aria-label="放大"
          disabled={!map.canZoomIn}
          onClick={() => map.zoomAt(1.18)}
          className="map-control-button disabled:opacity-30"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          title="显示完整地图"
          aria-label="显示完整地图"
          onClick={() => {
            setFollow(false);
            map.fit();
          }}
          className="map-control-button"
        >
          <RotateCcw className="size-3.5" />
        </button>
        <button
          type="button"
          title="跟随本队"
          aria-pressed={follow}
          onClick={() => {
            const next = !follow;
            setFollow(next);
            if (next && myTeam && myTeam.position >= 1)
              centerOnIndex(myTeam.position);
          }}
          className={cn(
            "map-control-button w-auto gap-1 px-2",
            follow && "!bg-[#ffd566] !text-[#5b4313]",
          )}
        >
          <Crosshair className="size-3.5" />
          <span className="hidden sm:inline">跟随</span>
        </button>
        {myTeam && myTeam.position >= 1 && (
          <button
            type="button"
            title="回到本队"
            aria-label="回到本队"
            onClick={() => centerOnIndex(myTeam.position)}
            className="map-control-button text-emerald-700"
          >
            <Locate className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          title="显示或隐藏缩略图"
          aria-pressed={showMiniMap}
          onClick={() => setShowMiniMap((value) => !value)}
          className="map-control-button"
        >
          <MapIcon className="size-3.5" />
        </button>
      </div>

      {showMiniMap && (
        <div
          data-map-control
          className="absolute bottom-[68px] right-3 z-50 h-[68px] w-[108px] md:bottom-3 md:h-[94px] md:w-[150px]"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MiniMap
            tiles={tiles}
            teams={teams}
            viewport={map.viewport}
            myTeamId={myTeam?.id ?? null}
            onJump={jumpTo}
          />
        </div>
      )}
    </div>
  );
}
