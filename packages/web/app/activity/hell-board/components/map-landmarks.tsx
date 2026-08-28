import type { MapLod } from "./map-tile";

function Tree({
  x,
  y,
  scale = 1,
  color = "#4f8a5b",
}: {
  x: number;
  y: number;
  scale?: number;
  color?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="18" rx="18" ry="6" fill="#37523c" opacity="0.16" />
      <path d="M-5 14h10l-1 22H-4z" fill="#8a5a3b" />
      <circle cx="0" cy="0" r="20" fill={color} />
      <circle cx="-12" cy="7" r="13" fill={color} />
      <circle cx="12" cy="8" r="14" fill={color} />
      <circle cx="-6" cy="-7" r="8" fill="#fff" opacity="0.12" />
    </g>
  );
}

function ReedPatch({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true">
      <ellipse cx="0" cy="8" rx="22" ry="7" fill="#4d7457" opacity="0.16" />
      {[-16, -8, 0, 8, 16].map((offset, index) => (
        <path
          key={offset}
          d={`M${offset} 8Q${offset - 4} -18 ${offset + (index % 2 ? 2 : -3)} -34`}
          fill="none"
          stroke={index % 2 ? "#6e9b62" : "#4f835a"}
          strokeWidth="5"
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

function Pebbles({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true">
      <ellipse cx="0" cy="7" rx="28" ry="8" fill="#52665b" opacity="0.12" />
      <ellipse cx="-16" cy="0" rx="11" ry="7" fill="#a8b59b" stroke="#73836f" strokeWidth="2" />
      <ellipse cx="2" cy="-5" rx="14" ry="8" fill="#c5c9a9" stroke="#73836f" strokeWidth="2" />
      <ellipse cx="18" cy="2" rx="9" ry="6" fill="#8fa18f" stroke="#73836f" strokeWidth="2" />
    </g>
  );
}

function Cloud({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity="0.9">
      <ellipse cx="0" cy="16" rx="42" ry="13" fill="#7f9eb1" opacity="0.12" />
      <path
        d="M-38 8c2-14 15-20 26-13 5-17 31-17 36 1 16-4 27 7 24 20h-84c-6-2-8-5-2-8z"
        fill="#fffdf4"
      />
    </g>
  );
}

function OpenBook({
  x,
  y,
  scale = 1,
  color = "#f8e7b5",
}: {
  x: number;
  y: number;
  scale?: number;
  color?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="22" rx="42" ry="10" fill="#4d382a" opacity="0.15" />
      <path
        d="M0 12C-15 2-34 2-45 9v38c14-7 31-5 45 5z"
        fill={color}
        stroke="#6f523c"
        strokeWidth="3"
      />
      <path
        d="M0 12C15 2 34 2 45 9v38c-14-7-31-5-45 5z"
        fill="#fff8dd"
        stroke="#6f523c"
        strokeWidth="3"
      />
      <path d="M0 13v38" stroke="#b99464" strokeWidth="2" />
      <path
        d="M-34 18c9-3 18-2 26 2M-34 27c9-3 18-2 26 2M9 19c9-3 18-2 27 1M9 28c9-3 18-2 27 1"
        stroke="#b99464"
        strokeWidth="2"
        opacity="0.65"
      />
    </g>
  );
}

function ZoneLabel({
  x,
  y,
  title,
  subtitle,
  fill,
}: {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  fill: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x="-70"
        y="-23"
        width="140"
        height="46"
        rx="15"
        fill="#fffaf0"
        stroke="#fffdf4"
        strokeWidth="5"
        opacity="0.98"
      />
      <rect
        x="-70"
        y="-23"
        width="140"
        height="46"
        rx="15"
        fill="none"
        stroke="#58493e"
        strokeWidth="2"
      />
      <rect x="-64" y="-17" width="6" height="34" rx="3" fill={fill} />
      <text x="-50" y="-3" fill="#3f352d" fontSize="15" fontWeight="800">
        {title}
      </text>
      <text
        x="-50"
        y="13"
        fill="#79695d"
        fontSize="10"
        fontWeight="600"
        letterSpacing="1"
      >
        {subtitle}
      </text>
    </g>
  );
}

/** 七区原创 SVG 地标。全部为装饰层，不接管任何指针事件。 */
export function MapLandmarks({ lod }: { lod: MapLod }) {
  const showDetails = lod !== "overview";
  return (
    <g aria-hidden="true" pointerEvents="none">
      {/* 1. 启程码头 */}
      <g transform="translate(92 790)">
        <path
          d="M-48 60h145v18H-48z"
          fill="#9e6947"
          stroke="#5e4333"
          strokeWidth="3"
        />
        {[-33, 0, 33, 66].map((x) => (
          <path
            key={x}
            d={`M${x} 58v34`}
            stroke="#5e4333"
            strokeWidth="7"
            strokeLinecap="round"
          />
        ))}
        <path
          d="M2 12l48 20-48 18z"
          fill="#ff8b6a"
          stroke="#5e4333"
          strokeWidth="3"
        />
        <path d="M0 4v56" stroke="#5e4333" strokeWidth="5" />
        <path
          d="M-15 58h76l-13 25h-51z"
          fill="#f7d17b"
          stroke="#5e4333"
          strokeWidth="3"
        />
        <path d="M-8 84h60l10 14H-18z" fill="#e7b968" opacity="0.9" />
      </g>
      <ZoneLabel
        x={116}
        y={734}
        title="启程码头"
        subtitle="1 — 14"
        fill="#ef6b62"
      />

      {/* 2. 金色书田 */}
      <g transform="translate(120 510)">
        <path d="M0 10v85" stroke="#815b3d" strokeWidth="8" />
        <circle
          cx="0"
          cy="3"
          r="12"
          fill="#fff4cf"
          stroke="#815b3d"
          strokeWidth="3"
        />
        {[0, 90, 180, 270].map((angle) => (
          <path
            key={angle}
            d="M0-4L17-62 1-75-8-14z"
            fill="#f5c85c"
            stroke="#815b3d"
            strokeWidth="3"
            transform={`rotate(${angle})`}
          />
        ))}
        <path d="M-25 94h50l-6 18h-38z" fill="#cf8f4a" />
      </g>
      {showDetails && <OpenBook x={520} y={460} scale={0.72} color="#ffe39a" />}
      <ZoneLabel
        x={250}
        y={452}
        title="金色书田"
        subtitle="15 — 28"
        fill="#e3b83f"
      />

      {/* 3. 青绿谜林 */}
      <Tree x={688} y={790} scale={1.2} color="#3f8156" />
      <Tree x={774} y={865} scale={0.8} color="#669a5d" />
      {showDetails && <Tree x={548} y={688} scale={0.72} color="#4f8a5b" />}
      <ReedPatch x={512} y={858} scale={0.72} />
      <Pebbles x={882} y={872} scale={0.72} />
      <g transform="translate(640 824) rotate(-18)">
        <circle
          cx="0"
          cy="0"
          r="25"
          fill="#d9f1e5"
          stroke="#435447"
          strokeWidth="6"
        />
        <circle cx="0" cy="0" r="15" fill="#89c8aa" opacity="0.65" />
        <path
          d="M18 19l34 36"
          stroke="#435447"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </g>
      <ZoneLabel
        x={838}
        y={920}
        title="青绿谜林"
        subtitle="29 — 42"
        fill="#4f9a66"
      />

      {/* 4. 云端书桥 */}
      <Cloud x={1200} y={775} scale={1.15} />
      <Cloud x={1074} y={615} scale={0.78} />
      {showDetails && <Cloud x={1296} y={558} scale={0.65} />}
      <g transform="translate(1280 662) rotate(-18)">
        <path
          d="M-68 0Q0-35 68 0"
          fill="none"
          stroke="#6d6259"
          strokeWidth="22"
        />
        <path
          d="M-68-4Q0-39 68-4"
          fill="none"
          stroke="#f2d18a"
          strokeWidth="13"
          strokeDasharray="10 5"
        />
      </g>
      <ZoneLabel
        x={1340}
        y={750}
        title="云端书桥"
        subtitle="43 — 56"
        fill="#57b8c9"
      />

      {/* 5. 蓝墨湖湾：湖面整体向右上偏移，避开 48–56 号跑道与格子。 */}
      <path
        d="M760 470c75-75 230-100 316-24 52 47 23 116-56 128-122 18-223 0-260-48-15-20-15-38 0-56z"
        fill="#8bd2da"
        opacity="0.55"
      />
      <path
        d="M808 513c58 22 134 24 207 4"
        fill="none"
        stroke="#e8ffff"
        strokeWidth="7"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M798 485c50-30 110-34 164-17M828 545c63 14 120 9 168-12"
        fill="none"
        stroke="#e8ffff"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.46"
      />
      <g transform="translate(1040 400)">
        <path
          d="M-24 4h48l13 67c3 20-13 34-37 34s-40-14-37-34z"
          fill="#315d8c"
          stroke="#344454"
          strokeWidth="4"
        />
        <path d="M-18 16h36" stroke="#9ad1e2" strokeWidth="7" opacity="0.8" />
        <path
          d="M-18-18h36v25h-36z"
          fill="#ebd6ad"
          stroke="#344454"
          strokeWidth="4"
        />
        <path
          d="M25 20c24-18 52-18 65-3"
          fill="none"
          stroke="#315d8c"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </g>
      <ZoneLabel
        x={944}
        y={452}
        title="蓝墨湖湾"
        subtitle="57 — 70"
        fill="#4d8fc0"
      />

      {/* 6. 紫晶夜谷：整组左上移，避开 71/72/75 号格子与里程碑。 */}
      <g transform="translate(150 180)">
        <path
          d="M0-54 27 18 0 47-28 18z"
          fill="#a88bd8"
          stroke="#5f4d78"
          strokeWidth="4"
        />
        <path
          d="M0-54v101M-28 18h55"
          stroke="#e6d5ff"
          strokeWidth="3"
          opacity="0.65"
        />
        <path
          d="M54-22 75 23 54 48 32 23z"
          fill="#7964b0"
          stroke="#5f4d78"
          strokeWidth="4"
        />
      </g>
      {showDetails && (
        <g transform="translate(420 255)">
          <path d="M0-25v64" stroke="#55485e" strokeWidth="5" />
          <rect
            x="-16"
            y="-18"
            width="32"
            height="35"
            rx="8"
            fill="#f4b963"
            stroke="#55485e"
            strokeWidth="4"
          />
          <circle cx="0" cy="-1" r="8" fill="#fff4c2" />
        </g>
      )}
      <ZoneLabel
        x={154}
        y={402}
        title="紫晶夜谷"
        subtitle="71 — 84"
        fill="#8b70c5"
      />

      {/* 7. 终章山城：山体左移、冠军小屋上移，避开 94 及 98–100 号终点格子。 */}
      <path
        d="M1010 230l155-177 156 177z"
        fill="#a6b38d"
        stroke="#64715a"
        strokeWidth="4"
      />
      <path d="M1108 119l57-66 54 62-43-13-20 18-18-20z" fill="#f5f0da" />
      <g transform="translate(1420 105)">
        <path
          d="M-50 67h100v74H-50z"
          fill="#f0c96e"
          stroke="#5e4a38"
          strokeWidth="5"
        />
        <path
          d="M-64 67L0 20l64 47z"
          fill="#ec745e"
          stroke="#5e4a38"
          strokeWidth="5"
        />
        <path
          d="M-18 141V90h36v51"
          fill="#8f6548"
          stroke="#5e4a38"
          strokeWidth="4"
        />
        <path d="M0 20v-48" stroke="#5e4a38" strokeWidth="5" />
        <path
          d="M2-27l52 14-52 19z"
          fill="#ffd55c"
          stroke="#5e4a38"
          strokeWidth="3"
        />
        <path d="M-24 75h48" stroke="#fff4c2" strokeWidth="7" />
        <path
          d="M-34 141h68l18 20h-104z"
          fill="#e7d19c"
          stroke="#5e4a38"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="M-26 151h52" stroke="#fff4c2" strokeWidth="4" opacity="0.8" />
      </g>
      <ZoneLabel
        x={1260}
        y={108}
        title="终章山城"
        subtitle="85 — 100"
        fill="#e66a58"
      />

      {showDetails && (
        <>
          <OpenBook x={1024} y={310} scale={0.6} color="#e9ddff" />
          <Tree x={1320} y={355} scale={0.72} color="#66835c" />
          <Tree x={1448} y={326} scale={0.56} color="#66835c" />
        </>
      )}
    </g>
  );
}
