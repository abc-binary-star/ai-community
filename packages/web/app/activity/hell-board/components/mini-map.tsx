"use client";

import { memo, useMemo } from "react";
import {
  BOARD_H,
  BOARD_W,
  flowingTrackPath,
  TILE_SAMPLES,
  trackIndexAt,
} from "../lib/track";
import type { Team, Tile } from "../lib/types";

const FILL: Record<string, string> = {
  forward: "#6ebd7c",
  backward: "#dd756c",
  special: "#e5b943",
  swap: "#62b0bf",
  blank: "#eee4cf",
};

/** 静态底图：岛、跑道与 100 个格子圆点，只在 tiles 变化时重渲染。 */
const MiniMapScene = memo(function MiniMapScene({ tiles }: { tiles: Tile[] }) {
  const pathD = useMemo(() => flowingTrackPath(), []);
  return (
    <>
      <path
        d="M42 688C8 544 65 363 169 238 299 84 520 67 699 91c160 21 273-33 431-14 177 21 370 91 413 260 37 144-24 323-144 430-130 114-316 134-488 116-169-18-312 49-476 25C252 882 86 858 42 688z"
        fill="#dce9bd"
        stroke="#718c73"
        strokeWidth="18"
      />
      <path
        d={pathD}
        fill="none"
        stroke="#5d4d40"
        strokeWidth="94"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.38"
      />
      <path
        d={pathD}
        fill="none"
        stroke="#f8edcf"
        strokeWidth="70"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={pathD}
        pathLength="99"
        fill="none"
        stroke="#d09e45"
        strokeWidth="8"
        strokeDasharray="1 2"
        strokeLinecap="round"
        opacity="0.75"
      />
      {tiles.map((tile) => {
        const sample = TILE_SAMPLES[tile.index - 1];
        const milestone = tile.index === 1 || tile.index % 5 === 0;
        return (
          <circle
            key={tile.index}
            cx={sample.x}
            cy={sample.y}
            r={milestone ? 13 : 8}
            fill={FILL[tile.kind] ?? "#fff"}
            stroke="#514337"
            strokeWidth={milestone ? 4 : 2}
          />
        );
      })}
    </>
  );
});

/** 队伍圆点层，只在 teams 变化时重渲染。 */
const MiniMapTeams = memo(function MiniMapTeams({
  teams,
  myTeamId,
}: {
  teams: Team[];
  myTeamId: string | null;
}) {
  return (
    <>
      {teams.map((team, index) => {
        const sample = TILE_SAMPLES[Math.max(1, team.position) - 1];
        const offset = (index % 5) - 2;
        return (
          <circle
            key={team.id}
            cx={sample.x + offset * 11}
            cy={sample.y - 18}
            r={team.id === myTeamId ? 17 : 12}
            fill={team.color}
            stroke={team.id === myTeamId ? "#ffd65a" : "#493d34"}
            strokeWidth={team.id === myTeamId ? 8 : 4}
          />
        );
      })}
    </>
  );
});

/** 与主地图完全共用 V2 曲线路径、格子坐标和点击命中。 */
export function MiniMap({
  tiles,
  teams,
  viewport,
  myTeamId,
  onJump,
}: {
  tiles: Tile[];
  teams: Team[];
  viewport: { x: number; y: number; w: number; h: number };
  myTeamId: string | null;
  onJump: (index: number) => void;
}) {
  const onClick = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * BOARD_W;
    const y = ((event.clientY - rect.top) / rect.height) * BOARD_H;
    onJump(trackIndexAt(x, y));
  };

  return (
    <svg
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full cursor-crosshair rounded-xl border-2 border-[#514337] bg-[#cde0d5] shadow-[0_6px_16px_rgba(53,45,38,0.25)]"
      role="img"
      aria-label="彩虹书岛棋盘缩略图，点击可跳转"
      onPointerDown={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      data-map-control
    >
      <MiniMapScene tiles={tiles} />
      <rect
        x={viewport.x}
        y={viewport.y}
        width={viewport.w}
        height={viewport.h}
        rx="12"
        fill="#fff"
        fillOpacity="0.08"
        stroke="#3f352d"
        strokeWidth="4"
        className="pointer-events-none"
      />
      <MiniMapTeams teams={teams} myTeamId={myTeamId} />
    </svg>
  );
}
