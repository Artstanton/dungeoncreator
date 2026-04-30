/**
 * DungeonMap — SVG renderer for a single dungeon or building level.
 */

import type { ReactNode } from 'react'
import type { MapData, MapRoom, StairMarker, BuildingDoor } from '@dungeon/shared'

const TILE = 22
const WALL = 3

interface Props {
  mapData: MapData
  selectedRoomId: number | null
  onRoomClick: (roomId: number) => void
}

// ─── Unified wall edge computation ───────────────────────────────────────────
//
// roomOf maps "x,y" → roomId for every occupied tile.
// Corridor tiles use id -1; building tiles use their room id.
// A wall is drawn on any edge where the neighbour is absent from the map
// OR belongs to a different room/type.

function wallPaths(allTiles: Array<[number, number]>, roomOf: Map<string, number>): string {
  const dirs: Array<[number, number, 'h' | 'v', number, number]> = [
    [0, -1, 'h', 0, 0],
    [0,  1, 'h', 0, 1],
    [-1, 0, 'v', 0, 0],
    [ 1, 0, 'v', 1, 0],
  ]
  const segs: string[] = []
  for (const [tx, ty] of allTiles) {
    const myId = roomOf.get(`${tx},${ty}`) ?? -1
    for (const [dx, dy, axis, ox, oy] of dirs) {
      const nk = `${tx + dx},${ty + dy}`
      const neighborMissing = !roomOf.has(nk)
      const neighborId      = roomOf.get(nk) ?? -1
      if (neighborMissing || myId !== neighborId) {
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

// ─── Door detection (dungeon corridors) ──────────────────────────────────────

interface DoorMarker {
  px: number
  py: number
  axis: 'v' | 'h'
}

function placeDoor(
  tx: number, ty: number,
  dx: number, dy: number,
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

    let s = 0
    while (s < tiles.length && roomTiles.has(`${tiles[s]![0]},${tiles[s]![1]}`)) s++
    let e = tiles.length - 1
    while (e >= 0 && roomTiles.has(`${tiles[e]![0]},${tiles[e]![1]}`)) e--
    if (s > e) continue

    if (s > 0) {
      const [tx, ty] = tiles[s]!
      const [rx, ry] = tiles[s - 1]!
      placeDoor(tx, ty, rx - tx, ry - ty, doors, placed)
    } else if (tiles.length >= 2) {
      const [tx, ty] = tiles[0]!
      const [nx, ny] = tiles[1]!
      const dx = tx - nx, dy = ty - ny
      if (roomTiles.has(`${tx + dx},${ty + dy}`)) {
        placeDoor(tx, ty, dx, dy, doors, placed)
      } else {
        for (const [fdx, fdy] of DOOR_DIRS) {
          if (roomTiles.has(`${tx + fdx},${ty + fdy}`)) { placeDoor(tx, ty, fdx, fdy, doors, placed); break }
        }
      }
    }

    if (e < tiles.length - 1) {
      const [tx, ty] = tiles[e]!
      const [rx, ry] = tiles[e + 1]!
      placeDoor(tx, ty, rx - tx, ry - ty, doors, placed)
    } else if (tiles.length >= 2) {
      const [tx, ty] = tiles[e]!
      const [px, py] = tiles[e - 1]!
      const dx = tx - px, dy = ty - py
      if (roomTiles.has(`${tx + dx},${ty + dy}`)) {
        placeDoor(tx, ty, dx, dy, doors, placed)
      } else {
        for (const [fdx, fdy] of DOOR_DIRS) {
          if (roomTiles.has(`${tx + fdx},${ty + fdy}`)) { placeDoor(tx, ty, fdx, fdy, doors, placed); break }
        }
      }
    }
  }
  return doors
}

// ─── Building door markers ────────────────────────────────────────────────────

function buildingDoorMarkers(buildingDoors: BuildingDoor[]): DoorMarker[] {
  return buildingDoors.map((d) => ({
    axis: d.axis,
    px: d.axis === 'v' ? d.wallX * TILE            : d.wallX * TILE + TILE / 2,
    py: d.axis === 'h' ? d.wallY * TILE            : d.wallY * TILE + TILE / 2,
  }))
}

// ─── Door glyph ──────────────────────────────────────────────────────────────

function DoorGlyph({ door }: { door: DoorMarker }) {
  const gap     = TILE * 0.58
  const slabW   = 2.5
  const slabLen = TILE * 0.52

  if (door.axis === 'v') {
    return (
      <g>
        <rect x={door.px - WALL} y={door.py - gap / 2} width={WALL * 2} height={gap} fill="white" />
        <rect x={door.px - slabW / 2} y={door.py - slabLen / 2} width={slabW} height={slabLen} fill="#2a2a2a" />
      </g>
    )
  }
  return (
    <g>
      <rect x={door.px - gap / 2} y={door.py - WALL} width={gap} height={WALL * 2} fill="white" />
      <rect x={door.px - slabLen / 2} y={door.py - slabW / 2} width={slabLen} height={slabW} fill="#2a2a2a" />
    </g>
  )
}

// ─── Stair glyph ─────────────────────────────────────────────────────────────

function StairGlyph({ stair }: { stair: StairMarker }) {
  const cx = stair.x * TILE + TILE / 2
  const cy = stair.y * TILE + TILE / 2
  const up = stair.direction === 'up'

  const rw = TILE * 0.8, rh = TILE * 0.55
  const rx = cx - rw / 2, ry = cy - rh / 2
  const numLines = 3
  const stepLines: ReactNode[] = []
  for (let i = 1; i <= numLines; i++) {
    const lineY = ry + (rh / (numLines + 1)) * i
    stepLines.push(
      <line key={i} x1={rx + 1} y1={lineY} x2={rx + rw - 1} y2={lineY} stroke="#2a2a2a" strokeWidth={0.8} />
    )
  }

  const arrowOffset = rh / 2 + 5
  const arrowY    = up ? cy - arrowOffset : cy + arrowOffset
  const arrowSize = 3.5
  const arrowPath = up
    ? `M ${cx} ${arrowY - arrowSize} L ${cx - arrowSize} ${arrowY + arrowSize} L ${cx + arrowSize} ${arrowY + arrowSize} Z`
    : `M ${cx} ${arrowY + arrowSize} L ${cx - arrowSize} ${arrowY - arrowSize} L ${cx + arrowSize} ${arrowY - arrowSize} Z`

  return (
    <g className="stair-glyph" pointerEvents="none">
      <rect x={rx} y={ry} width={rw} height={rh} fill="white" stroke="#2a2a2a" strokeWidth={1.2} />
      {stepLines}
      <text x={cx} y={ry + rh + 7} textAnchor="middle" dominantBaseline="central"
        fontSize={5.5} fontFamily="sans-serif" fontWeight="700" fill="#2a2a2a" letterSpacing={0.5}>
        {up ? 'UP' : 'DN'}
      </text>
      <path d={arrowPath} fill="#2a2a2a" />
    </g>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DungeonMap({ mapData, selectedRoomId, onRoomClick }: Props) {
  const { width, height, rooms, corridors, stairs } = mapData
  const isBuilding = mapData.mapType === 'building'

  // Build roomOf map: tile coord → roomId (rooms get their id; corridor tiles get -1).
  const roomOf   = new Map<string, number>()
  const allTiles: Array<[number, number]> = []

  for (const room of rooms) {
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) {
        const k = `${room.x + dx},${room.y + dy}`
        roomOf.set(k, room.id)
        allTiles.push([room.x + dx, room.y + dy])
      }
    }
  }

  // In dungeon mode, also add corridor tiles (tagged -1).
  const roomTiles = new Set<string>(roomOf.keys())
  if (!isBuilding) {
    for (const corridor of corridors) {
      for (const [cx, cy] of corridor.tiles) {
        const k = `${cx},${cy}`
        if (!roomOf.has(k)) {
          roomOf.set(k, -1)
          allTiles.push([cx, cy])
        }
      }
    }
  }

  const walls = wallPaths(allTiles, roomOf)
  const doors = isBuilding
    ? buildingDoorMarkers(mapData.buildingDoors ?? [])
    : computeDoors(corridors, roomTiles)

  const svgW = width  * TILE
  const svgH = height * TILE

  return (
    <svg
      className="dungeon-map"
      viewBox={`0 0 ${svgW} ${svgH}`}
      width={svgW}
      height={svgH}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background: rock for dungeons, white for buildings */}
      <rect x={0} y={0} width={svgW} height={svgH} fill={isBuilding ? 'white' : '#c8c8c8'} />

      {/* Dungeon-only: corridor fills */}
      {!isBuilding && corridors.map((c, ci) =>
        c.tiles
          .filter(([tx, ty]) => !roomTiles.has(`${tx},${ty}`))
          .map(([tx, ty], ti) => (
            <rect key={`ct-${ci}-${ti}`}
              x={tx * TILE} y={ty * TILE} width={TILE} height={TILE} fill="white" />
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

      {/* Doors */}
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
            <rect x={room.x * TILE} y={room.y * TILE}
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
