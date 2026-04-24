/**
 * DungeonMap — SVG renderer for a single dungeon level.
 */

import type { ReactNode } from 'react'
import type { MapData, MapRoom, StairMarker } from '@dungeon/shared'

const TILE = 22
const WALL = 3

interface Props {
  mapData: MapData
  selectedRoomId: number | null
  onRoomClick: (roomId: number) => void
}

// ─── Wall edge computation ────────────────────────────────────────────────────

function wallPaths(occupied: Set<string>, allTiles: Array<[number, number]>): string {
  const segs: string[] = []
  const dirs: Array<[number, number, 'h' | 'v', number, number]> = [
    [0, -1, 'h', 0, 0],
    [0,  1, 'h', 0, 1],
    [-1, 0, 'v', 0, 0],
    [ 1, 0, 'v', 1, 0],
  ]
  for (const [tx, ty] of allTiles) {
    for (const [dx, dy, axis, ox, oy] of dirs) {
      if (!occupied.has(`${tx + dx},${ty + dy}`)) {
        const px = (tx + ox) * TILE
        const py = (ty + oy) * TILE
        segs.push(axis === 'h'
          ? `M ${px} ${py} L ${px + TILE} ${py}`
          : `M ${px} ${py} L ${px} ${py + TILE}`)
      }
    }
  }
  return segs.join(' ')
}

// ─── Grid lines inside a room ─────────────────────────────────────────────────

function roomGridLines(room: MapRoom): ReactNode {
  const lines: ReactNode[] = []
  for (let dx = 1; dx < room.w; dx++) {
    const x = (room.x + dx) * TILE
    lines.push(
      <line key={`rv-${room.id}-${dx}`}
        x1={x} y1={room.y * TILE}
        x2={x} y2={(room.y + room.h) * TILE}
        stroke="#e4e4e4" strokeWidth={0.8}
      />
    )
  }
  for (let dy = 1; dy < room.h; dy++) {
    const y = (room.y + dy) * TILE
    lines.push(
      <line key={`rh-${room.id}-${dy}`}
        x1={room.x * TILE} y1={y}
        x2={(room.x + room.w) * TILE} y2={y}
        stroke="#e4e4e4" strokeWidth={0.8}
      />
    )
  }
  return lines
}

// ─── Door detection ───────────────────────────────────────────────────────────
//
// For each contiguous run of corridor tiles that share the same wall with a
// room, place exactly ONE door at the midpoint of the run.  This prevents
// multiple doors appearing where a hallway runs alongside a room wall.

interface DoorMarker {
  px: number   // pixel x of door centre (on the wall edge)
  py: number   // pixel y of door centre
  axis: 'v' | 'h'
}

type Adj = { tx: number; ty: number; dx: number; dy: number }

function computeDoors(corridors: MapData['corridors'], roomTiles: Set<string>): DoorMarker[] {
  // Collect every unique (corridor tile, direction-to-room) pair.
  const adjMap = new Map<string, Adj>()

  for (const corridor of corridors) {
    for (const [tx, ty] of corridor.tiles) {
      if (roomTiles.has(`${tx},${ty}`)) continue
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
        if (!roomTiles.has(`${tx + dx},${ty + dy}`)) continue
        const key = `${tx},${ty},${dx},${dy}`
        if (!adjMap.has(key)) adjMap.set(key, { tx, ty, dx, dy })
      }
    }
  }

  // BFS-group adjacencies that are contiguous along the same wall.
  // "Contiguous" means: same (dx,dy) direction and adjacent in the perpendicular axis.
  const processed = new Set<string>()
  const doors: DoorMarker[] = []

  for (const [startKey, startAdj] of adjMap) {
    if (processed.has(startKey)) continue

    const group: Adj[] = []
    const queue: Adj[] = [startAdj]
    processed.add(startKey)

    while (queue.length > 0) {
      const cur = queue.shift()!
      group.push(cur)
      // Walk along the wall (perpendicular to the door axis)
      const perps: [number, number][] = cur.dx !== 0 ? [[0,1],[0,-1]] : [[1,0],[-1,0]]
      for (const [px, py] of perps) {
        const nKey = `${cur.tx + px},${cur.ty + py},${cur.dx},${cur.dy}`
        if (!processed.has(nKey) && adjMap.has(nKey)) {
          processed.add(nKey)
          queue.push(adjMap.get(nKey)!)
        }
      }
    }

    // Sort along the wall axis; pick the midpoint tile for the door.
    const { dx, dy } = startAdj
    if (dx !== 0) {
      group.sort((a, b) => a.ty - b.ty)
    } else {
      group.sort((a, b) => a.tx - b.tx)
    }
    const mid = group[Math.floor(group.length / 2)]!

    const axis: 'v' | 'h' = mid.dx !== 0 ? 'v' : 'h'
    const px = mid.dx !== 0
      ? (mid.dx === 1 ? mid.tx + 1 : mid.tx) * TILE
      : mid.tx * TILE + TILE / 2
    const py = mid.dy !== 0
      ? (mid.dy === 1 ? mid.ty + 1 : mid.ty) * TILE
      : mid.ty * TILE + TILE / 2

    doors.push({ px, py, axis })
  }

  return doors
}

// ─── Door glyph ──────────────────────────────────────────────────────────────

function DoorGlyph({ door }: { door: DoorMarker }) {
  const gap    = TILE * 0.58   // length of wall to erase
  const slabW  = 2.5           // door thickness (px)
  const slabLen = TILE * 0.52  // door length

  if (door.axis === 'v') {
    return (
      <g>
        <rect x={door.px - WALL} y={door.py - gap / 2}
          width={WALL * 2} height={gap} fill="white" />
        <rect x={door.px - slabW / 2} y={door.py - slabLen / 2}
          width={slabW} height={slabLen} fill="#2a2a2a" />
      </g>
    )
  }
  return (
    <g>
      <rect x={door.px - gap / 2} y={door.py - WALL}
        width={gap} height={WALL * 2} fill="white" />
      <rect x={door.px - slabLen / 2} y={door.py - slabW / 2}
        width={slabLen} height={slabW} fill="#2a2a2a" />
    </g>
  )
}

// ─── Stair glyph ─────────────────────────────────────────────────────────────

function StairGlyph({ stair }: { stair: StairMarker }) {
  const cx = stair.x * TILE + TILE / 2
  const cy = stair.y * TILE + TILE / 2
  const up = stair.direction === 'up'

  const rw = TILE * 0.8
  const rh = TILE * 0.55
  const rx = cx - rw / 2
  const ry = cy - rh / 2

  const numLines = 3
  const stepLines: ReactNode[] = []
  for (let i = 1; i <= numLines; i++) {
    const lineY = ry + (rh / (numLines + 1)) * i
    stepLines.push(
      <line key={i}
        x1={rx + 1} y1={lineY} x2={rx + rw - 1} y2={lineY}
        stroke="#2a2a2a" strokeWidth={0.8}
      />
    )
  }

  const arrowOffset = rh / 2 + 5
  const arrowY = up ? cy - arrowOffset : cy + arrowOffset
  const arrowSize = 3.5
  const arrowPath = up
    ? `M ${cx} ${arrowY - arrowSize} L ${cx - arrowSize} ${arrowY + arrowSize} L ${cx + arrowSize} ${arrowY + arrowSize} Z`
    : `M ${cx} ${arrowY + arrowSize} L ${cx - arrowSize} ${arrowY - arrowSize} L ${cx + arrowSize} ${arrowY - arrowSize} Z`

  return (
    <g className="stair-glyph" pointerEvents="none">
      <rect x={rx} y={ry} width={rw} height={rh}
        fill="white" stroke="#2a2a2a" strokeWidth={1.2} />
      {stepLines}
      <text x={cx} y={ry + rh + 7}
        textAnchor="middle" dominantBaseline="central"
        fontSize={5.5} fontFamily="sans-serif" fontWeight="700"
        fill="#2a2a2a" letterSpacing={0.5}>
        {up ? 'UP' : 'DN'}
      </text>
      <path d={arrowPath} fill="#2a2a2a" />
    </g>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DungeonMap({ mapData, selectedRoomId, onRoomClick }: Props) {
  const { width, height, rooms, corridors, stairs } = mapData

  const allTiles: Array<[number, number]> = []
  const occupied = new Set<string>()
  const roomTiles = new Set<string>()

  for (const room of rooms) {
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) {
        const tx = room.x + dx
        const ty = room.y + dy
        allTiles.push([tx, ty])
        occupied.add(`${tx},${ty}`)
        roomTiles.add(`${tx},${ty}`)
      }
    }
  }

  for (const corridor of corridors) {
    for (const [cx, cy] of corridor.tiles) {
      if (!occupied.has(`${cx},${cy}`)) {
        allTiles.push([cx, cy])
        occupied.add(`${cx},${cy}`)
      }
    }
  }

  const walls = wallPaths(occupied, allTiles)
  const doors = computeDoors(corridors, roomTiles)

  const svgW = width * TILE
  const svgH = height * TILE

  return (
    <svg
      className="dungeon-map"
      viewBox={`0 0 ${svgW} ${svgH}`}
      width={svgW}
      height={svgH}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Rock background */}
      <rect x={0} y={0} width={svgW} height={svgH} fill="#c8c8c8" />

      {/* Corridor fills */}
      {corridors.map((c, ci) =>
        c.tiles
          .filter(([tx, ty]) => !roomTiles.has(`${tx},${ty}`))
          .map(([tx, ty], ti) => (
            <rect key={`ct-${ci}-${ti}`}
              x={tx * TILE} y={ty * TILE}
              width={TILE} height={TILE}
              fill="white"
            />
          ))
      )}

      {/* Room fills */}
      {rooms.map((room) => (
        <rect key={`rf-${room.id}`}
          x={room.x * TILE} y={room.y * TILE}
          width={room.w * TILE} height={room.h * TILE}
          fill="white"
        />
      ))}

      {/* Room interior grid lines */}
      {rooms.map((room) => roomGridLines(room))}

      {/* Walls */}
      <path d={walls} stroke="black" strokeWidth={WALL} strokeLinecap="square" fill="none" />

      {/* Doors — punched through the walls */}
      {doors.map((door, i) => <DoorGlyph key={`door-${i}`} door={door} />)}

      {/* Room selection highlight */}
      {rooms.map((room) =>
        selectedRoomId === room.id ? (
          <rect key={`sel-${room.id}`}
            x={room.x * TILE + 2} y={room.y * TILE + 2}
            width={room.w * TILE - 4} height={room.h * TILE - 4}
            fill="none" stroke="#c0861a" strokeWidth={2.5} rx={1}
          />
        ) : null
      )}

      {/* Clickable room overlays + labels */}
      {rooms.map((room) => {
        const cx = room.x * TILE + (room.w * TILE) / 2
        const cy = room.y * TILE + (room.h * TILE) / 2
        const isSelected = selectedRoomId === room.id
        return (
          <g key={`r-${room.id}`}
            className={`map-room${isSelected ? ' map-room--selected' : ''}`}
            onClick={() => onRoomClick(room.id)}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={room.x * TILE} y={room.y * TILE}
              width={room.w * TILE} height={room.h * TILE}
              fill="transparent" className="map-room-hit"
            />
            <text
              x={cx} y={cy}
              textAnchor="middle" dominantBaseline="central"
              fontSize={Math.min(12, (room.w * TILE) / 3)}
              fontFamily="serif" fontWeight="bold"
              fill={isSelected ? '#c0861a' : '#222'}
              pointerEvents="none"
            >
              {room.id + 1}
            </text>
          </g>
        )
      })}

      {/* Stair markers */}
      {stairs.map((s, i) => <StairGlyph key={`stair-${i}`} stair={s} />)}
    </svg>
  )
}
