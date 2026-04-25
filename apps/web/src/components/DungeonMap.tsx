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

function wallPaths(occupied: Set<string>, allTiles: Array<[number, number]>, roomTiles: Set<string>): string {
  const segs: string[] = []
  const dirs: Array<[number, number, 'h' | 'v', number, number]> = [
    [0, -1, 'h', 0, 0],
    [0,  1, 'h', 0, 1],
    [-1, 0, 'v', 0, 0],
    [ 1, 0, 'v', 1, 0],
  ]
  for (const [tx, ty] of allTiles) {
    const isRoom = roomTiles.has(`${tx},${ty}`)
    for (const [dx, dy, axis, ox, oy] of dirs) {
      const nx = tx + dx, ny = ty + dy
      const neighborOccupied = occupied.has(`${nx},${ny}`)
      const neighborIsRoom   = roomTiles.has(`${nx},${ny}`)
      // Draw a wall whenever the neighbour is empty OR whenever we cross a
      // room↔corridor boundary (so corridors running beside rooms get a wall).
      if (!neighborOccupied || isRoom !== neighborIsRoom) {
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
// A door belongs only at the exact point where a corridor enters or exits its
// connected room.  We find those points by scanning each corridor's tile list
// for the room→corridor and corridor→room transitions, then place one door at
// each transition.  This avoids spurious doors where a corridor runs alongside
// a room it isn't actually connected to.

interface DoorMarker {
  px: number   // pixel x of door centre (on the wall edge)
  py: number   // pixel y of door centre
  axis: 'v' | 'h'
}

function placeDoor(
  tx: number, ty: number,   // corridor tile just outside the room
  dx: number, dy: number,   // direction from corridor tile toward room tile
  doors: DoorMarker[],
  placed: Set<string>,
): void {
  const axis: 'v' | 'h' = dx !== 0 ? 'v' : 'h'
  const px = dx !== 0 ? (dx === 1 ? tx + 1 : tx) * TILE : tx * TILE + TILE / 2
  const py = dy !== 0 ? (dy === 1 ? ty + 1 : ty) * TILE : ty * TILE + TILE / 2
  const key = `${px},${py}`
  if (placed.has(key)) return
  placed.add(key)
  doors.push({ px, py, axis })
}

const DOOR_DIRS: Array<[number, number]> = [[1,0],[-1,0],[0,1],[0,-1]]

function computeDoors(corridors: MapData['corridors'], roomTiles: Set<string>): DoorMarker[] {
  const doors: DoorMarker[] = []
  const placed = new Set<string>()

  for (const corridor of corridors) {
    const tiles = corridor.tiles
    if (tiles.length === 0) continue

    // Find the first non-room tile (corridor exits fromRoom here).
    let s = 0
    while (s < tiles.length && roomTiles.has(`${tiles[s]![0]},${tiles[s]![1]}`)) s++

    // Find the last non-room tile (corridor enters toRoom here).
    let e = tiles.length - 1
    while (e >= 0 && roomTiles.has(`${tiles[e]![0]},${tiles[e]![1]}`)) e--

    if (s > e) continue

    // Door at the fromRoom exit.
    if (s > 0) {
      // Tile list includes room tiles — transition is at s-1 → s.
      const [tx, ty] = tiles[s]!
      const [rx, ry] = tiles[s - 1]!
      placeDoor(tx, ty, rx - tx, ry - ty, doors, placed)
    } else if (tiles.length >= 2) {
      // No room tiles at start. The room must be directly behind tile[0],
      // i.e. opposite to the direction of travel (tile[0] → tile[1]).
      const [tx, ty] = tiles[0]!
      const [nx, ny] = tiles[1]!
      const dx = tx - nx   // reverse travel direction
      const dy = ty - ny
      if (roomTiles.has(`${tx + dx},${ty + dy}`)) {
        placeDoor(tx, ty, dx, dy, doors, placed)
      } else {
        // Corner geometry — scan all 4 neighbours as fallback.
        for (const [fdx, fdy] of DOOR_DIRS) {
          if (roomTiles.has(`${tx + fdx},${ty + fdy}`)) {
            placeDoor(tx, ty, fdx, fdy, doors, placed)
            break
          }
        }
      }
    }

    // Door at the toRoom entry.
    if (e < tiles.length - 1) {
      // Tile list includes room tiles — transition is at e → e+1.
      const [tx, ty] = tiles[e]!
      const [rx, ry] = tiles[e + 1]!
      placeDoor(tx, ty, rx - tx, ry - ty, doors, placed)
    } else if (tiles.length >= 2) {
      // No room tiles at end. The room must be directly ahead of tile[e],
      // i.e. in the direction of travel (tile[e-1] → tile[e]).
      const [tx, ty] = tiles[e]!
      const [px, py] = tiles[e - 1]!
      const dx = tx - px   // forward travel direction
      const dy = ty - py
      if (roomTiles.has(`${tx + dx},${ty + dy}`)) {
        placeDoor(tx, ty, dx, dy, doors, placed)
      } else {
        for (const [fdx, fdy] of DOOR_DIRS) {
          if (roomTiles.has(`${tx + fdx},${ty + fdy}`)) {
            placeDoor(tx, ty, fdx, fdy, doors, placed)
            break
          }
        }
      }
    }
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

  const walls = wallPaths(occupied, allTiles, roomTiles)
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
