import type { CampaignListItem, CreateDungeonInput, CreateDungeonStartResponse, DungeonProgress, DungeonDetail, Room, UpdateRoomInput } from '@dungeon/shared'

const BASE = '/api'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    // Try to parse a Fastify error body; fall back to status text.
    const text = await res.text().catch(() => `HTTP ${res.status}`)
    let message = text
    try {
      const json = JSON.parse(text) as { message?: string }
      if (json.message) message = json.message
    } catch {
      // keep raw text
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export function getCampaigns(): Promise<CampaignListItem[]> {
  return apiFetch('/campaigns')
}

export function createDungeon(body: CreateDungeonInput): Promise<CreateDungeonStartResponse> {
  return apiFetch('/dungeons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function getDungeonProgress(id: string): Promise<DungeonProgress> {
  return apiFetch(`/dungeons/${id}/progress`)
}

export function getDungeon(id: string): Promise<DungeonDetail> {
  return apiFetch(`/dungeons/${id}`)
}

export function updateRoom(id: string, body: UpdateRoomInput): Promise<Room> {
  return apiFetch(`/rooms/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
