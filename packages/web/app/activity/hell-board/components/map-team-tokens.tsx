"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trackSampleAtPosition } from "../lib/track";
import type { Team } from "../lib/types";
import { TeamToken } from "./team-token";
import type { MapLod } from "./map-tile";

function markerLayout(lod: MapLod) {
  return {
    visibleCount: lod === "overview" ? 1 : 3,
    tangentGap: lod === "detail" ? 25 : 21,
    normalOffset: lod === "overview" ? -45 : -50,
    size: lod === "overview" ? 18 : lod === "detail" ? 24 : 21,
  };
}

function useAnimatedPosition(position: number) {
  const target = Math.max(1, position);
  const [displayed, setDisplayed] = useState(target);
  const displayedRef = useRef(target);

  useEffect(() => {
    const from = displayedRef.current;
    const delta = target - from;
    if (
      Math.abs(delta) < 0.001 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      displayedRef.current = target;
      setDisplayed(target);
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const duration = Math.min(1_050, 420 + Math.abs(delta) * 62);
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = from + delta * eased;
      displayedRef.current = next;
      setDisplayed(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return displayed;
}

function AnimatedTeamMarker({
  team,
  isSelf,
  slot,
  lod,
  onClick,
}: {
  team: Team;
  isSelf: boolean;
  slot: number;
  lod: MapLod;
  onClick: () => void;
}) {
  const position = useAnimatedPosition(team.position);
  const sample = trackSampleAtPosition(position);
  const radians = (sample.tangent * Math.PI) / 180;
  const tangentX = Math.cos(radians);
  const tangentY = Math.sin(radians);
  const layout = markerLayout(lod);
  const tangentOffset =
    (slot - (layout.visibleCount - 1) / 2) * layout.tangentGap;
  const normalOffset = layout.normalOffset;
  const x = sample.x + tangentX * tangentOffset + sample.normalX * normalOffset;
  const y = sample.y + tangentY * tangentOffset + sample.normalY * normalOffset;
  const showName = lod === "detail" && slot === 0;

  return (
    <span
      className="absolute z-30 flex cursor-pointer items-center gap-1 will-change-transform transition-transform hover:z-40 hover:scale-110"
      style={{ left: x, top: y, transform: "translate3d(-50%, -50%, 0)" }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      role="button"
      tabIndex={-1}
      aria-label={`${team.name}，第 ${team.position} 格`}
    >
      <TeamToken team={team} isSelf={isSelf} size={layout.size} />
      {showName && (
        <span className="ml-1 max-w-[74px] truncate rounded-full border border-[#5f5044]/60 bg-[#fffaf0]/95 px-1.5 py-0.5 text-[9px] font-black text-[#4d4035] shadow-sm">
          {team.name}
        </span>
      )}
    </span>
  );
}

function DockConnector({ position }: { position: number }) {
  const sample = trackSampleAtPosition(position);
  const normalAngle =
    Math.atan2(sample.normalY, sample.normalX) * (180 / Math.PI) + 180;
  const startOffset = -27;
  const startX = sample.x + sample.normalX * startOffset;
  const startY = sample.y + sample.normalY * startOffset;

  return (
    <span
      className="pointer-events-none absolute z-[25] h-7 w-[2px] origin-top bg-[#756354]/75"
      style={{
        left: startX,
        top: startY,
        transform: `rotate(${normalAngle}deg)`,
      }}
      aria-hidden
    />
  );
}

/** 队伍停在路线外侧；同格时只展示少量徽章，其余合并为 +N（可点击查看）。 */
export function MapTeamTokens({
  teams,
  myTeamId,
  lod,
  onSelectTile,
}: {
  teams: Team[];
  myTeamId: string | null;
  lod: MapLod;
  onSelectTile: (index: number) => void;
}) {
  const groups = useMemo(() => {
    const result = new Map<number, Team[]>();
    for (const team of teams) {
      const position = Math.max(1, team.position);
      const group = result.get(position) ?? [];
      group.push(team);
      result.set(position, group);
    }
    for (const group of result.values())
      group.sort(
        (a, b) => Number(b.id === myTeamId) - Number(a.id === myTeamId),
      );
    return result;
  }, [myTeamId, teams]);

  return (
    <>
      {[...groups.entries()].flatMap(([position, group]) => {
        const visible = group.slice(0, markerLayout(lod).visibleCount);
        const hidden = group.length - visible.length;
        const layout = markerLayout(lod);
        return [
          <DockConnector key={`connector-${position}`} position={position} />,
          ...visible.map((team, slot) => (
            <AnimatedTeamMarker
              key={team.id}
              team={team}
              isSelf={team.id === myTeamId}
              slot={slot}
              lod={lod}
              onClick={() => onSelectTile(position)}
            />
          )),
          hidden > 0 ? (
            <span
              key={`more-${position}`}
              title={`同格另有 ${hidden} 支队伍，点击查看`}
              className="absolute z-40 flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-full border-2 border-[#57483b] bg-[#fffaf0] px-1 text-[9px] font-black text-[#57483b] shadow-[0_4px_0_rgba(73,61,52,0.28)] transition-transform hover:scale-110"
              style={{
                ...(() => {
                  const sample = trackSampleAtPosition(position);
                  const radians = (sample.tangent * Math.PI) / 180;
                  const tangentX = Math.cos(radians);
                  const tangentY = Math.sin(radians);
                  const slot = visible.length;
                  const tangentOffset =
                    (slot - (layout.visibleCount - 1) / 2) * layout.tangentGap;
                  const normalOffset = layout.normalOffset;
                  return {
                    left:
                      sample.x +
                      tangentX * tangentOffset +
                      sample.normalX * normalOffset,
                    top:
                      sample.y +
                      tangentY * tangentOffset +
                      sample.normalY * normalOffset,
                    transform: "translate3d(-50%, -50%, 0)",
                  };
                })(),
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectTile(position);
              }}
              role="button"
              tabIndex={-1}
            >
              +{hidden}
            </span>
          ) : null,
        ];
      })}
    </>
  );
}
