import { memo } from "react";
import { BOARD_H, BOARD_W, flowingTrackPath, trackPoint, trackSampleAtPosition } from "../lib/track";
import { MapLandmarks } from "./map-landmarks";
import type { MapLod } from "./map-tile";

const ZONE_STROKES = [
  "#ed7168",
  "#dfb84c",
  "#4d9562",
  "#51adbd",
  "#4f8db8",
  "#8970bd",
  "#e26c58",
];

function Milestone({
  index,
  label,
  fill,
}: {
  index: number;
  label: string;
  fill: string;
}) {
  const point = trackPoint(index);
  return (
    <g transform={`translate(${point.x} ${point.y - 56})`} aria-hidden="true">
      <path
        d="M0 8v34"
        stroke="#59493c"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M2 8h47l-8-14 8-14H2z"
        fill={fill}
        stroke="#59493c"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <text
        x="24"
        y="-3"
        textAnchor="middle"
        fill="#3f352d"
        fontSize="12"
        fontWeight="900"
      >
        {label}
      </text>
    </g>
  );
}

/** 只负责地图美术，不包含任何可点击元素。 */
function MapSceneInner({ lod }: { lod: MapLod }) {
  const trackD = flowingTrackPath();
  const showDetails = lod !== "overview";
  return (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      width={BOARD_W}
      height={BOARD_H}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ocean-ground" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#cfe5df" />
          <stop offset="0.52" stopColor="#b8d6d2" />
          <stop offset="1" stopColor="#a7c8c8" />
        </linearGradient>
        <linearGradient id="island-ground" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#edf0c9" />
          <stop offset="0.5" stopColor="#dbe4bd" />
          <stop offset="1" stopColor="#c9d9b5" />
        </linearGradient>
        <linearGradient id="road-surface" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf4" />
          <stop offset="0.55" stopColor="#f5e8cb" />
          <stop offset="1" stopColor="#dfcda9" />
        </linearGradient>
        <pattern
          id="paper-grain"
          width="31"
          height="31"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="4" cy="6" r="1.3" fill="#5f6f54" opacity="0.08" />
          <circle cx="20" cy="17" r="0.9" fill="#5f6f54" opacity="0.07" />
          <path d="M8 27l8-3" stroke="#fff" strokeWidth="1" opacity="0.22" />
        </pattern>
        <filter id="track-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow
            dx="0"
            dy="12"
            stdDeviation="9"
            floodColor="#46392e"
            floodOpacity="0.28"
          />
        </filter>
        <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow
            dx="0"
            dy="5"
            stdDeviation="4"
            floodColor="#46392e"
            floodOpacity="0.2"
          />
        </filter>
        <radialGradient id="lake-glow" cx="50%" cy="40%" r="65%">
          <stop offset="0" stopColor="#caeff0" />
          <stop offset="1" stopColor="#91c8c8" />
        </radialGradient>
        <pattern
          id="shore-ripples"
          width="120"
          height="74"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M8 18c20-12 40-12 60 0s40 12 60 0M-18 52c20-12 40-12 60 0s40 12 60 0"
            fill="none"
            stroke="#f5ffff"
            strokeWidth="3"
            opacity="0.34"
          />
        </pattern>
        <filter id="island-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow
            dx="0"
            dy="10"
            stdDeviation="13"
            floodColor="#49675e"
            floodOpacity="0.2"
          />
        </filter>
      </defs>

      {/* 水面与岛屿 */}
      <rect width={BOARD_W} height={BOARD_H} rx="56" fill="url(#ocean-ground)" />
      <rect width={BOARD_W} height={BOARD_H} rx="56" fill="url(#shore-ripples)" opacity="0.42" />
      <path
        d="M35 706C-2 555 56 365 160 239 290 82 516 68 700 91c160 20 272-36 435-16 181 22 382 92 427 267 39 149-23 336-145 446-133 119-326 139-505 120-170-18-316 52-487 27C239 908 80 887 35 706z"
        fill="#718e77"
        opacity="0.25"
        transform="translate(0 14)"
        filter="url(#island-shadow)"
      />
      <path
        d="M35 690C-2 539 56 349 160 223 290 66 516 52 700 75c160 20 272-36 435-16 181 22 382 92 427 267 39 149-23 336-145 446-133 119-326 139-505 120-170-18-316 52-487 27C239 892 80 871 35 690z"
        fill="url(#island-ground)"
        stroke="#789276"
        strokeWidth="8"
      />
      <path
        d="M58 665C24 525 79 379 176 249 292 95 514 81 699 102c165 19 280-36 430-17 176 22 359 90 406 254"
        fill="none"
        stroke="#f8f2d4"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.64"
      />
      <path
        d="M35 690C-2 539 56 349 160 223 290 66 516 52 700 75c160 20 272-36 435-16 181 22 382 92 427 267 39 149-23 336-145 446-133 119-326 139-505 120-170-18-316 52-487 27C239 892 80 871 35 690z"
        fill="url(#paper-grain)"
      />

      {/* 主题区域柔和底色 */}
      <ellipse
        cx="254"
        cy="790"
        rx="250"
        ry="190"
        fill="#f4b39b"
        opacity="0.22"
      />
      <ellipse
        cx="275"
        cy="535"
        rx="245"
        ry="170"
        fill="#f0d472"
        opacity="0.2"
      />
      <ellipse
        cx="700"
        cy="760"
        rx="260"
        ry="170"
        fill="#75af79"
        opacity="0.2"
      />
      <ellipse
        cx="1190"
        cy="680"
        rx="255"
        ry="210"
        fill="#92d8db"
        opacity="0.22"
      />
      <ellipse
        cx="812"
        cy="505"
        rx="265"
        ry="160"
        fill="url(#lake-glow)"
        opacity="0.25"
      />
      <ellipse
        cx="270"
        cy="284"
        rx="245"
        ry="170"
        fill="#b19bd5"
        opacity="0.2"
      />
      <ellipse
        cx="1120"
        cy="230"
        rx="420"
        ry="175"
        fill="#f0ad90"
        opacity="0.16"
      />

      {/* 岛屿边缘的小沙洲与浅滩，让水岸不再是一条硬边 */}
      <g fill="#e6e4b8" opacity="0.72">
        <path d="M107 300c32-24 83-26 112-5-22 24-72 33-112 5z" />
        <path d="M1340 778c49-23 108-14 129 15-33 23-93 26-129-15z" />
        <path d="M626 132c35-18 77-12 94 8-25 20-67 21-94-8z" />
      </g>
      <g fill="none" stroke="#fff8d9" strokeWidth="3" strokeLinecap="round" opacity="0.58">
        <path d="M100 329c28-14 58-14 88-2" />
        <path d="M1358 803c34-13 66-11 96 2" />
        <path d="M639 157c24-9 45-7 66 2" />
      </g>

      {/* 等高线，近景才展示 */}
      {showDetails && (
        <g fill="none" stroke="#6b8068" strokeWidth="2" opacity="0.12">
          <path d="M70 470c70-125 205-190 335-173 93 12 136 61 225 47" />
          <path d="M90 493c78-112 205-165 323-145 84 14 128 58 214 51" />
          <path d="M1000 160c132-64 314-44 428 51" />
          <path d="M1022 185c119-50 274-34 382 46" />
          <path d="M946 862c154 12 328-14 442-105" />
        </g>
      )}

      {/* 跑道：接触阴影、厚底、主面、区域彩边、中央细节 */}
      <path
        d={trackD}
        fill="none"
        stroke="#493f35"
        strokeWidth="88"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.25"
        filter="url(#track-shadow)"
      />
      <path
        d={trackD}
        fill="none"
        stroke="#8b765d"
        strokeWidth="83"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={trackD}
        fill="none"
        stroke="url(#road-surface)"
        strokeWidth="74"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={trackD}
        pathLength="99"
        fill="none"
        stroke="#fffdf4"
        strokeWidth="62"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="0.9 3.2"
        opacity="0.42"
      />
      {ZONE_STROKES.map((color, zoneIndex) => (
        <path
          key={color}
          d={trackD}
          pathLength="99"
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="13.7 85.3"
          strokeDashoffset={-zoneIndex * 14.1}
          opacity="0.9"
        />
      ))}
      <path
        d={trackD}
        pathLength="99"
        fill="none"
        stroke="#fffdf4"
        strokeWidth="3"
        strokeDasharray="0.7 2.3"
        strokeLinecap="round"
        opacity="0.72"
      />

      {/* 方向箭头：每隔若干格画一个小三角，指向前进方向 */}
      <g fill="#8b765d" opacity="0.55">
        {[8, 20, 34, 48, 60, 74, 86, 94].map((idx) => {
          const s = trackSampleAtPosition(idx);
          return (
            <path
              key={`arrow-${idx}`}
              d="M0 -5 L7 5 L-7 5 Z"
              transform={`translate(${s.x} ${s.y}) rotate(${s.tangent})`}
            />
          );
        })}
      </g>

      {/* 地标压在最上层渲染，确保标签框不被跑道或路线盖住。 */}
      <Milestone index={1} label="GO" fill="#6fc18a" />
      <Milestone index={25} label="25" fill="#f4cf58" />
      <Milestone index={50} label="50" fill="#65c5ce" />
      <Milestone index={75} label="75" fill="#9d83d4" />
      <Milestone index={100} label="100" fill="#f17b65" />

      <MapLandmarks lod={lod} />
    </svg>
  );
}

/** 静态场景只随 LOD 变化，memo 避免拖拽/缩放/跟随动画时每帧重渲染巨型 SVG。 */
export const MapScene = memo(MapSceneInner, (a, b) => a.lod === b.lod);
