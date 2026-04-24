/**
 * buildMapSvg — generates a self-contained SVG string for a dungeon level.
 *
 * Used by the print/export feature.  Mirrors the visual logic of DungeonMap.tsx
 * but outputs a plain string instead of React JSX, so it can be embedded in
 * an arbitrary HTML document without needing the React runtime.
 */

import type { MapData } from '@dungeon/shared'

const TILE = 22
const WALL = 3

// ─── Wall edge computation ────────────────────────────────────────────────────

function wallPathD(occupied: Set<string>, allTiles: Array<[number, number]>): string {
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

// ─── Door detection (same BFS-group logic as DungeonMap.tsx) ──────────────────

interface Door { px: number; py: number; axis: 'v' | 'h' }
type Adj = { tx: number; ty: number; dx: number; dy: number }

function computeDoors(corridors: MapData['corridors'], roomTiles: Set<string>): Door[] {
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

  const processed = new Set<string>()
  const doors: Door[] = []

  for (const [startKey, startAdj] of adjMap) {
    if (processed.has(startKey)) continue
    const group: Adj[] = []
    const queue: Adj[] = [startAdj]
    processed.add(startKey)
    while (queue.length > 0) {
      const cur = queue.shift()!
      group.push(cur)
      const perps: [number, number][] = cur.dx !== 0 ? [[0,1],[0,-1]] : [[1,0],[-1,0]]
      for (const [px, py] of perps) {
        const nKey = `${cur.tx + px},${cur.ty + py},${cur.dx},${cur.dy}`
        if (!processed.has(nKey) && adjMap.has(nKey)) {
          processed.add(nKey)
          queue.push(adjMap.get(nKey)!)
        }
      }
    }
    const { dx, dy } = startAdj
    if (dx !== 0) group.sort((a, b) => a.ty - b.ty)
    else          group.sort((a, b) => a.tx - b.tx)
    const mid = group[Math.floor(group.length / 2)]!
    const axis: 'v' | 'h' = mid.dx !== 0 ? 'v' : 'h'
    const px = mid.dx !== 0 ? (mid.dx === 1 ? mid.tx + 1 : mid.tx) * TILE : mid.tx * TILE + TILE / 2
    const py = mid.dy !== 0 ? (mid.dy === 1 ? mid.ty + 1 : mid.ty) * TILE : mid.ty * TILE + TILE / 2
    doors.push({ px, py, axis })
  }
  return doors
}

// ─── SVG string builder ───────────────────────────────────────────────────────

export function buildMapSvg(mapData: MapData): string {
  const { width, height, rooms, corridors, stairs } = mapData

  const allTiles: Array<[number, number]> = []
  const occupied  = new Set<string>()
  const roomTiles = new Set<string>()

  for (const room of rooms) {
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) {
        const tx = room.x + dx, ty = room.y + dy
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

  const svgW = width  * TILE
  const svgH = height * TILE

  // Corridor fills
  const corridorRects = corridors.flatMap((c) =>
    c.tiles
      .filter(([tx, ty]) => !roomTiles.has(`${tx},${ty}`))
      .map(([tx, ty]) =>
        `<rect x="${tx * TILE}" y="${ty * TILE}" width="${TILE}" height="${TILE}" fill="white"/>`)
  ).join('')

  // Room fills + grid lines
  const roomElems = rooms.map((r) => {
    const fill = `<rect x="${r.x * TILE}" y="${r.y * TILE}" width="${r.w * TILE}" height="${r.h * TILE}" fill="white"/>`
    const vLines = Array.from({ length: r.w - 1 }, (_, i) => {
      const x = (r.x + i + 1) * TILE
      return `<line x1="${x}" y1="${r.y * TILE}" x2="${x}" y2="${(r.y + r.h) * TILE}" stroke="#e4e4e4" stroke-width="0.8"/>`
    }).join('')
    const hLines = Array.from({ length: r.h - 1 }, (_, i) => {
      const y = (r.y + i + 1) * TILE
      return `<line x1="${r.x * TILE}" y1="${y}" x2="${(r.x + r.w) * TILE}" y2="${y}" stroke="#e4e4e4" stroke-width="0.8"/>`
    }).join('')
    return fill + vLines + hLines
  }).join('')

  // Walls
  const wallD = wallPathD(occupied, allTiles)
  const wallEl = `<path d="${wallD}" stroke="black" stroke-width="${WALL}" stroke-linecap="square" fill="none"/>`

  // Doors
  const gap = TILE * 0.58, slabW = 2.5, slabLen = TILE * 0.52
  const doorElems = computeDoors(corridors, roomTiles).map((d) => {
    if (d.axis === 'v') return [
      `<rect x="${d.px - WALL}" y="${d.py - gap / 2}" width="${WALL * 2}" height="${gap}" fill="white"/>`,
      `<rect x="${d.px - slabW / 2}" y="${d.py - slabLen / 2}" width="${slabW}" height="${slabLen}" fill="#2a2a2a"/>`,
    ].join('')
    return [
      `<rect x="${d.px - gap / 2}" y="${d.py - WALL}" width="${gap}" height="${WALL * 2}" fill="white"/>`,
      `<rect x="${d.px - slabLen / 2}" y="${d.py - slabW / 2}" width="${slabLen}" height="${slabW}" fill="#2a2a2a"/>`,
    ].join('')
  }).join('')

  // Room number labels
  const labelElems = rooms.map((r) => {
    const cx = r.x * TILE + (r.w * TILE) / 2
    const cy = r.y * TILE + (r.h * TILE) / 2
    const fs = Math.min(12, (r.w * TILE) / 3)
    return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-family="serif" font-weight="bold" fill="#222">${r.id + 1}</text>`
  }).join('')

  // Stair glyphs
  const stairElems = stairs.map((s) => {
    const cx = s.x * TILE + TILE / 2
    const cy = s.y * TILE + TILE / 2
    const up = s.direction === 'up'
    const rw = TILE * 0.8, rh = TILE * 0.55
    const rx = cx - rw / 2, ry = cy - rh / 2
    const numLines = 3
    const stepLines = Array.from({ length: numLines }, (_, i) => {
      const lineY = ry + (rh / (numLines + 1)) * (i + 1)
      return `<line x1="${rx + 1}" y1="${lineY}" x2="${rx + rw - 1}" y2="${lineY}" stroke="#2a2a2a" stroke-width="0.8"/>`
    }).join('')
    const arrowOffset = rh / 2 + 5
    const arrowY = up ? cy - arrowOffset : cy + arrowOffset
    const arrowSize = 3.5
    const arrowPts = up
      ? `${cx},${arrowY - arrowSize} ${cx - arrowSize},${arrowY + arrowSize} ${cx + arrowSize},${arrowY + arrowSize}`
      : `${cx},${arrowY + arrowSize} ${cx - arrowSize},${arrowY - arrowSize} ${cx + arrowSize},${arrowY - arrowSize}`
    return [
      `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="white" stroke="#2a2a2a" stroke-width="1.2"/>`,
      stepLines,
      `<text x="${cx}" y="${ry + rh + 7}" text-anchor="middle" dominant-baseline="central" font-size="5.5" font-family="sans-serif" font-weight="700" fill="#2a2a2a">${up ? 'UP' : 'DN'}</text>`,
      `<polygon points="${arrowPts}" fill="#2a2a2a"/>`,
    ].join('')
  }).join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="max-width:100%;height:auto">`,
    `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#c8c8c8"/>`,
    corridorRects,
    roomElems,
    wallEl,
    doorElems,
    labelElems,
    stairElems,
    `</svg>`,
  ].join('\n')
}
