import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getDungeon, updateRoom } from '../api/client'
import DungeonMap from '../components/DungeonMap'
import { buildMapSvg } from '../lib/mapSvg'
import type { DungeonDetail, LevelDetail, Room, MapData } from '@dungeon/shared'
import { mapDataSchema } from '@dungeon/shared'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="meta-chip">
      <span className="meta-chip__label">{label}</span>
      <span className="meta-chip__value">{value}</span>
    </span>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportDungeon(dungeon: DungeonDetail) {
  const dirLabel =
    dungeon.direction === 'up' ? 'Ascending' :
    dungeon.direction === 'down' ? 'Descending' : 'Both directions'

  const levelHtml = dungeon.levels.map((level) => {
    // Build SVG map for this level
    let mapSvgHtml = ''
    try {
      const raw = JSON.parse(level.mapData ?? '{}') as unknown
      const result = mapDataSchema.safeParse(raw)
      if (result.success) {
        mapSvgHtml = `<div class="map-wrap">${buildMapSvg(result.data)}</div>`
      }
    } catch { /* no map */ }

    const roomsHtml = level.rooms.map((room) => `
      <div class="room">
        <h3>${room.index + 1}. ${escHtml(room.name)}</h3>
        <p class="description">${escHtml(room.description)}</p>
        ${room.encounters.length ? `<p><strong>Encounters:</strong> ${room.encounters.map(escHtml).join('; ')}</p>` : ''}
        ${room.treasure.length   ? `<p><strong>Treasure:</strong> ${room.treasure.map(escHtml).join('; ')}</p>` : ''}
        ${room.secrets ? `<p><strong>Secret:</strong> ${escHtml(room.secrets)}</p>` : ''}
        ${room.hooks   ? `<p><strong>Hook:</strong> ${escHtml(room.hooks)}</p>` : ''}
      </div>`).join('')

    return `
      <section class="level">
        <h2>${escHtml(level.name)}</h2>
        ${mapSvgHtml}
        ${roomsHtml}
      </section>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(dungeon.name)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 900px; margin: 2rem auto; padding: 0 1.5rem; color: #1a1a1a; }
  h1 { font-size: 2rem; margin-bottom: 0.25rem; }
  .meta { font-size: 0.9rem; color: #555; margin-bottom: 2rem; }
  h2 { font-size: 1.4rem; margin-top: 2rem; border-bottom: 2px solid #c8b890; padding-bottom: 0.3rem; }
  h3 { font-size: 1.05rem; margin: 1.2rem 0 0.3rem; }
  .description { font-style: italic; margin: 0.2rem 0 0.6rem; }
  .room { margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #e8e0cc; }
  p { margin: 0.2rem 0; font-size: 0.9rem; }
  .map-wrap { margin: 1.25rem 0 1.5rem; page-break-inside: avoid; }
  .map-wrap svg { max-width: 100%; height: auto; display: block; border: 1px solid #d8d0c0; border-radius: 4px; }
  @media print {
    body { margin: 1cm; }
    .map-wrap { page-break-after: always; }
  }
</style>
</head>
<body>
<h1>${escHtml(dungeon.name)}</h1>
<div class="meta">
  ${dungeon.campaign ? `Campaign: ${escHtml(dungeon.campaign.name)} &nbsp;·&nbsp; ` : ''}
  ${dungeon.theme ? `Theme: ${escHtml(dungeon.theme)} &nbsp;·&nbsp; ` : ''}
  CR ${dungeon.crMin}–${dungeon.crMax} &nbsp;·&nbsp; ${dirLabel}
</div>
${levelHtml}
</body>
</html>`

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
    win.focus()
    // Small delay so browser renders before print dialog
    setTimeout(() => win.print(), 400)
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ─── Room edit form ───────────────────────────────────────────────────────────

interface RoomPanelProps {
  room: Room
  onSaved: (updated: Room) => void
}

function RoomPanel({ room, onSaved }: RoomPanelProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Edit state — mirrors the room fields
  const [name, setName]               = useState(room.name)
  const [description, setDescription] = useState(room.description)
  const [encounters, setEncounters]   = useState(room.encounters.join('\n'))
  const [treasure, setTreasure]       = useState(room.treasure.join('\n'))
  const [secrets, setSecrets]         = useState(room.secrets ?? '')
  const [hooks, setHooks]             = useState(room.hooks ?? '')

  // Reset form if the selected room changes
  useEffect(() => {
    setEditing(false)
    setSaveError(null)
    setName(room.name)
    setDescription(room.description)
    setEncounters(room.encounters.join('\n'))
    setTreasure(room.treasure.join('\n'))
    setSecrets(room.secrets ?? '')
    setHooks(room.hooks ?? '')
  }, [room.id])

  function cancelEdit() {
    setEditing(false)
    setSaveError(null)
    setName(room.name)
    setDescription(room.description)
    setEncounters(room.encounters.join('\n'))
    setTreasure(room.treasure.join('\n'))
    setSecrets(room.secrets ?? '')
    setHooks(room.hooks ?? '')
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateRoom(room.id, {
        name: name.trim() || room.name,
        description: description.trim() || room.description,
        encounters: encounters.split('\n').map(s => s.trim()).filter(Boolean),
        treasure:   treasure.split('\n').map(s => s.trim()).filter(Boolean),
        secrets: secrets.trim() || null,
        hooks:   hooks.trim() || null,
      })
      onSaved(updated)
      setEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="room-panel room-panel--editing">
        <div className="room-edit-header">
          <span className="room-panel__num">{room.index + 1}.</span>
          <input
            className="room-edit-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Room name"
          />
        </div>

        <label className="room-edit-label">Description</label>
        <textarea
          className="room-edit-area"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          placeholder="What players see when they enter…"
        />

        <label className="room-edit-label">Encounters <span className="room-edit-hint">(one per line)</span></label>
        <textarea
          className="room-edit-area"
          value={encounters}
          onChange={e => setEncounters(e.target.value)}
          rows={3}
          placeholder="e.g. 2 Goblins"
        />

        <label className="room-edit-label">Treasure <span className="room-edit-hint">(one per line)</span></label>
        <textarea
          className="room-edit-area"
          value={treasure}
          onChange={e => setTreasure(e.target.value)}
          rows={3}
          placeholder="e.g. 50 gp in a chest"
        />

        <label className="room-edit-label">Secret</label>
        <textarea
          className="room-edit-area"
          value={secrets}
          onChange={e => setSecrets(e.target.value)}
          rows={2}
          placeholder="Hidden feature players might discover…"
        />

        <label className="room-edit-label">Hook</label>
        <textarea
          className="room-edit-area"
          value={hooks}
          onChange={e => setHooks(e.target.value)}
          rows={2}
          placeholder="Plot hook connecting to the wider dungeon…"
        />

        {saveError && <p className="room-edit-error">{saveError}</p>}

        <div className="room-edit-actions">
          <button className="room-edit-save" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="room-edit-cancel" onClick={cancelEdit} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Read view ──
  return (
    <div className="room-panel">
      <div className="room-panel__header">
        <h3 className="room-panel__name">
          <span className="room-panel__num">{room.index + 1}.</span> {room.name}
        </h3>
        <button className="room-edit-btn" onClick={() => setEditing(true)} title="Edit room">
          ✎
        </button>
      </div>

      <p className="room-panel__description">{room.description}</p>

      {room.encounters.length > 0 && (
        <section className="room-panel__section">
          <h4 className="room-panel__section-title">Encounters</h4>
          <ul className="room-panel__list">
            {room.encounters.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </section>
      )}

      {room.treasure.length > 0 && (
        <section className="room-panel__section">
          <h4 className="room-panel__section-title">Treasure</h4>
          <ul className="room-panel__list">
            {room.treasure.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </section>
      )}

      {room.secrets && (
        <section className="room-panel__section">
          <h4 className="room-panel__section-title">Secret</h4>
          <p className="room-panel__text">{room.secrets}</p>
        </section>
      )}

      {room.hooks && (
        <section className="room-panel__section">
          <h4 className="room-panel__section-title">Hook</h4>
          <p className="room-panel__text">{room.hooks}</p>
        </section>
      )}
    </div>
  )
}

// ─── Level view ───────────────────────────────────────────────────────────────

interface LevelViewProps {
  level: LevelDetail
  onRoomUpdate: (roomId: string, updated: Room) => void
}

function LevelView({ level, onRoomUpdate }: LevelViewProps) {
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null)

  let mapData: MapData | null = null
  try {
    const raw = JSON.parse(level.mapData ?? '{}')
    const result = mapDataSchema.safeParse(raw)
    if (result.success) mapData = result.data
  } catch { /* fall back */ }

  const selectedRoom = selectedRoomId !== null
    ? level.rooms.find((r) => r.index === selectedRoomId) ?? null
    : null

  return (
    <div className="level-view">
      <div className="level-view__map-area">
        {mapData ? (
          <div className="map-scroll">
            <DungeonMap
              mapData={mapData}
              selectedRoomId={selectedRoomId}
              onRoomClick={(id) => setSelectedRoomId(id === selectedRoomId ? null : id)}
            />
          </div>
        ) : (
          <div className="map-placeholder">Map data unavailable.</div>
        )}
      </div>

      <div className="level-view__sidebar">
        {selectedRoom ? (
          <RoomPanel
            room={selectedRoom}
            onSaved={(updated) => onRoomUpdate(updated.id, updated)}
          />
        ) : (
          <div className="room-panel room-panel--empty">
            <p>Click a room on the map to see its details.</p>
            <ul className="room-index-list">
              {level.rooms.map((r) => (
                <li key={r.id} className="room-index-item"
                  onClick={() => setSelectedRoomId(r.index)}>
                  <span className="room-index-num">{r.index + 1}</span>
                  <span className="room-index-name">{r.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DungeonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [dungeon, setDungeon] = useState<DungeonDetail | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [activeLevelId, setActiveLevelId] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getDungeon(id)
      .then((d) => {
        setDungeon(d)
        if (d.levels.length > 0) setActiveLevelId(d.levels[0]?.id ?? null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load dungeon.')
      })
  }, [id])

  function handleRoomUpdate(roomId: string, updated: Room) {
    setDungeon((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        levels: prev.levels.map((lvl) => ({
          ...lvl,
          rooms: lvl.rooms.map((r) => r.id === roomId ? updated : r),
        })),
      }
    })
  }

  if (error) {
    return (
      <div className="page-error">
        <p>{error}</p>
        <Link to="/dungeons/new">← New dungeon</Link>
      </div>
    )
  }

  if (!dungeon) return <div className="page-loading">Loading dungeon…</div>

  const activeLevel = dungeon.levels.find((l) => l.id === activeLevelId) ?? dungeon.levels[0] ?? null

  const dirLabel =
    dungeon.direction === 'up' ? 'Ascending' :
    dungeon.direction === 'down' ? 'Descending' : 'Both directions'

  function levelLabel(level: LevelDetail): string {
    if (level.index === 0) return 'Entry'
    if (level.index > 0)  return `+${level.index}`
    return `${level.index}`
  }

  return (
    <div className="detail-page">
      <header className="detail-header">
        <div className="detail-header__top">
          <Link to="/dungeons/new" className="detail-back">← New dungeon</Link>
          {dungeon.campaign && (
            <span className="campaign-badge">{dungeon.campaign.name}</span>
          )}
          <button
            className="export-btn"
            onClick={() => exportDungeon(dungeon)}
            title="Export / Print dungeon"
          >
            Print / Export
          </button>
        </div>
        <h1 className="detail-title">{dungeon.name}</h1>
        <div className="detail-meta">
          {dungeon.theme && <MetaChip label="Theme" value={dungeon.theme} />}
          <MetaChip label="CR" value={`${dungeon.crMin}–${dungeon.crMax}`} />
          <MetaChip label="Direction" value={dirLabel} />
          <MetaChip label="Floors" value={String(dungeon.levels.length)} />
        </div>
      </header>

      {dungeon.levels.length > 1 && (
        <nav className="level-tabs">
          {dungeon.levels.map((level) => (
            <button key={level.id}
              className={`level-tab${level.id === activeLevelId ? ' level-tab--active' : ''}`}
              onClick={() => setActiveLevelId(level.id)}
            >
              <span className="level-tab__label">{levelLabel(level)}</span>
              <span className="level-tab__name">{level.name}</span>
            </button>
          ))}
        </nav>
      )}

      {activeLevel ? (
        <LevelView
          key={activeLevel.id}
          level={activeLevel}
          onRoomUpdate={handleRoomUpdate}
        />
      ) : (
        <div className="map-placeholder">No levels generated.</div>
      )}
    </div>
  )
}
