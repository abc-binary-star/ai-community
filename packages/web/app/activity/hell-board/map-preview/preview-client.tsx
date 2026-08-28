"use client";

import { useEffect, useMemo, useState } from "react";
import { BoardMap } from "../components/board-map";
import { useActivityStore } from "../lib/store";
import type { Team, Tile, TileKind } from "../lib/types";

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
          : kind === "blank"
            ? "平安无事"
            : `测试${kind}格`,
      effect: kind,
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

export function MapPreviewClient() {
  const tiles = useMemo(previewTiles, []);
  const teams = useMemo(previewTeams, []);
  const [selected, setSelected] = useState<number | null>(null);

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
            <h1 className="text-xl font-black">彩虹书岛 · 地图视觉验收</h1>
          </div>
          <p className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold shadow-sm">
            {selected ? `已选择第 ${selected} 格` : "拖拽、缩放或点击任意格子"}
          </p>
        </div>
        <div className="h-[calc(100dvh-7.5rem)] min-h-[520px]">
          <BoardMap onSelectTile={setSelected} />
        </div>
      </div>
    </main>
  );
}
