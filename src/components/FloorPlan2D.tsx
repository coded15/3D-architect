"use client";

import { ROOM_COLORS } from "@/lib/plan";
import type { HousePlan, Opening, Room } from "@/lib/types";

type Props = {
  plan: HousePlan;
  floor: number;
  highlightRoomId?: string | null;
  onRoomClick?: (roomId: string) => void;
};

const PAD = 4;

export function FloorPlan2D({ plan, floor, highlightRoomId, onRoomClick }: Props) {
  const { width, depth, facing } = plan.plot;
  const rooms = plan.rooms.filter((r) => r.floor === floor);
  const roomIds = new Set(rooms.map((r) => r.id));
  const openings = plan.openings.filter((o) => roomIds.has(o.roomId));
  const byId = new Map(rooms.map((r) => [r.id, r]));

  return (
    <svg
      viewBox={`${-PAD} ${-PAD} ${width + PAD * 2} ${depth + PAD * 2}`}
      className="h-full w-full"
      role="img"
      aria-label="Floor plan"
    >
      <rect x={0} y={0} width={width} height={depth} fill="#fafaf7" stroke="#999" strokeWidth={0.15} strokeDasharray="0.6 0.4" />
      {rooms.map((room) => (
        <g key={room.id} onClick={() => onRoomClick?.(room.id)} className={onRoomClick ? "cursor-pointer" : undefined}>
          <rect
            x={room.x}
            y={room.y}
            width={room.width}
            height={room.depth}
            fill={ROOM_COLORS[room.type] ?? ROOM_COLORS.other}
            fillOpacity={highlightRoomId && highlightRoomId !== room.id ? 0.35 : 0.85}
            stroke="#333"
            strokeWidth={0.35}
          />
          <text x={room.x + room.width / 2} y={room.y + room.depth / 2 - 0.4} textAnchor="middle" fontSize={Math.min(1.6, room.width / 6)} fontWeight={600} fill="#222">
            {room.name}
          </text>
          <text x={room.x + room.width / 2} y={room.y + room.depth / 2 + 1.4} textAnchor="middle" fontSize={Math.min(1.1, room.width / 8)} fill="#444">
            {fmt(room.width)}′ × {fmt(room.depth)}′
          </text>
        </g>
      ))}
      {openings.map((o) => {
        const room = byId.get(o.roomId);
        return room ? <OpeningMark key={o.id} opening={o} room={room} /> : null;
      })}
      <g transform={`translate(${width + PAD / 2}, ${-PAD / 2})`} fontSize={1.4} textAnchor="middle">
        <line x1={0} y1={2.4} x2={0} y2={0.4} stroke="#333" strokeWidth={0.2} />
        <polygon points="0,-0.2 -0.6,1 0.6,1" fill="#333" />
        <text x={0} y={3.8} fill="#333">N</text>
      </g>
      <text x={width / 2} y={depth + PAD * 0.7} textAnchor="middle" fontSize={1.3} fill="#555">
        Plot {fmt(width)}′ × {fmt(depth)}′ · {facingLabel(facing)} facing
      </text>
    </svg>
  );
}

function OpeningMark({ opening, room }: { opening: Opening; room: Room }) {
  const horizontal = opening.side === "N" || opening.side === "S";
  const x1 = horizontal ? room.x + opening.offset : opening.side === "W" ? room.x : room.x + room.width;
  const y1 = horizontal ? (opening.side === "N" ? room.y : room.y + room.depth) : room.y + opening.offset;
  const x2 = horizontal ? x1 + opening.width : x1;
  const y2 = horizontal ? y1 : y1 + opening.width;
  const isDoor = opening.kind === "door";
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fafaf7" strokeWidth={0.6} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={isDoor ? "#8b5a2b" : "#3b82f6"} strokeWidth={isDoor ? 0.25 : 0.35} strokeDasharray={isDoor ? "0.4 0.3" : undefined} />
    </g>
  );
}

function fmt(n: number) {
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
}

export function facingLabel(f: string) {
  return { N: "North", E: "East", S: "South", W: "West" }[f] ?? f;
}
