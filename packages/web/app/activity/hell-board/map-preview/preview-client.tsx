"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { BigEventsPanel } from "../components/big-events";
import { BoardMap } from "../components/board-map";
import { useActivityStore } from "../lib/store";
import type { BigEvent, Team, Tile, TileKind } from "../lib/types";

const KINDS: TileKind[] = [
  "blank",
  "forward",
  "blank",
  "special",
  "backward",
  "blank",
  "swap",
];

function previewTiles(): Tile[] {
  return Array.from({ length: 100 }, (_, offset) => {
    const index = offset + 1;
    const kind = index === 100 ? "special" : KINDS[offset % KINDS.length];
    return {
      index,
      kind,
      title:
        index === 100
          ? "冠军终点"
          : kind === "special"
            ? "特殊功能"
          : kind === "blank"
            ? "平安无事"
            : `测试${kind}格`,
      effect: kind === "special" ? "team-accel" : kind,
      param: kind === "forward" || kind === "backward" ? 2 : undefined,
    };
  });
}

function previewTeams(): Team[] {
  const positions = [7, 18, 33, 33, 33, 33, 33, 54, 76, 94];
  const colors = [
    "#e25555",
    "#eb8b36",
    "#d2aa30",
    "#55a367",
    "#3aa8a1",
    "#4188c9",
    "#7658b2",
    "#c65891",
    "#7b604b",
    "#49535e",
  ];
  return positions.map((position, index) => ({
    id: `preview-team-${index + 1}`,
    name: `${index + 1}队`,
    color: colors[index],
    emblem: `rainbow-crest-${index + 1}`,
    members: [],
    position,
    points: index * 3,
    universalDice: 0,
    rollChances: 0,
    rainbowCount: index,
    weekMinDelta: 0,
    colorBlocks: {},
    buffs: [],
    status: index === 9 ? "completed" : "collecting",
  }));
}

function previewEvents(teams: Team[]): BigEvent[] {
  const samples = [
    [2, 6, 33, 39, 39, "全队加速：接下来两次掷骰固定+2步数"],
    [4, 1, 18, 19, 19, ""],
    [0, 5, 7, 14, 14, ""],
    [6, 3, 76, 79, 79, ""],
    [1, 4, 54, 58, 51, "后退格：后退三格"],
    [3, 2, 33, 35, 88, "位置互换：与第八十八格互换位置"],
    [5, 6, 94, 100, 100, ""],
  ] as const;
  return samples.map(([teamIndex, diceValue, fromTile, landedTile, toTile, resultSummary], index) => ({
    id: `preview-event-${index + 1}`,
    teamId: teams[teamIndex].id,
    teamName: teams[teamIndex].name,
    teamColor: teams[teamIndex].color,
    teamEmblem: teams[teamIndex].emblem,
    diceValue,
    fromTile,
    landedTile,
    toTile,
    resultSummary: resultSummary || undefined,
    createdAt: new Date(Date.now() - index * 23 * 60_000).toISOString(),
  }));
}

export function MapPreviewClient() {
  const tiles = useMemo(previewTiles, []);
  const teams = useMemo(previewTeams, []);
  const events = useMemo(() => previewEvents(teams), [teams]);
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<"map" | "events">("map");

  useEffect(() => {
    useActivityStore.setState({
      tiles,
      teams,
      myTeamId: teams[2].id,
      loading: false,
    });
  }, [teams, tiles]);

  return (
    <main className="min-h-screen bg-[#f6f1e3] p-3 text-stone-900 md:p-6">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-amber-700">
              DEVELOPMENT PREVIEW
            </p>
            <h1 className="text-xl font-black">彩虹书岛 · 活动视觉验收</h1>
          </div>
          <div className="flex rounded-lg border-2 border-stone-800 bg-white p-1 shadow-[2px_2px_0_#292524]">
            {(
              [
                ["map", "地图"],
                ["events", "大事件"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-black",
                  view === key ? "bg-[#ffd166] text-stone-900" : "text-stone-500",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {view === "map" ? (
          <>
            <p className="mb-2 text-right text-xs font-bold text-stone-500">
              {selected ? `已选择第 ${selected} 格` : "拖拽、缩放或点击任意格子"}
            </p>
            <div className="h-[calc(100dvh-9rem)] min-h-[520px]">
              <BoardMap onSelectTile={setSelected} />
            </div>
          </>
        ) : (
          <div className="mx-auto max-w-6xl py-2">
            <BigEventsPanel events={events} />
          </div>
        )}
      </div>
    </main>
  );
}
