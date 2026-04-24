import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createDungeonInput, type CampaignListItem } from '@dungeon/shared'
import { getCampaigns, createDungeon } from '../api/client'

type Direction = 'up' | 'down' | 'both'

interface FormValues {
  name: string
  campaignName: string
  theme: string
  crMin: number
  crMax: number
  direction: Direction
  floorCount: number
  roomsMin: number
  roomsMax: number
  specificEncounters: string[]
  specificTreasures: string[]
  notes: string
  seed: string
}

interface RandomFlags {
  theme: boolean
  cr: boolean
  floorCount: boolean
  roomsPerFloor: boolean
  specificEncounters: boolean
  specificTreasures: boolean
}

const DEFAULTS: FormValues = {
  name: '',
  campaignName: '',
  theme: '',
  crMin: 1,
  crMax: 5,
  direction: 'down',
  floorCount: 1,
  roomsMin: 4,
  roomsMax: 10,
  specificEncounters: [],
  specificTreasures: [],
  notes: '',
  seed: '',
}

const NO_RANDOM: RandomFlags = {
  theme: false,
  cr: false,
  floorCount: false,
  roomsPerFloor: false,
  specificEncounters: false,
  specificTreasures: false,
}

export function CreateDungeonPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormValues>(DEFAULTS)
  const [random, setRandom] = useState<RandomFlags>(NO_RANDOM)
  const [encounterInput, setEncounterInput] = useState('')
  const [treasureInput, setTreasureInput] = useState('')
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getCampaigns()
      .then(setCampaigns)
      .catch(() => {
        // Not fatal — datalist just won't have suggestions.
      })
  }, [])

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    // Clear the error for this field as the user edits it.
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function toggleRandom(field: keyof RandomFlags) {
    const enabling = !random[field]
    setRandom((prev) => ({ ...prev, [field]: enabling }))
    // Clear manual entries for tag fields when switching to random.
    if (enabling) {
      if (field === 'specificEncounters') {
        setField('specificEncounters', [])
        setEncounterInput('')
      }
      if (field === 'specificTreasures') {
        setField('specificTreasures', [])
        setTreasureInput('')
      }
    }
  }

  function addTag(field: 'specificEncounters' | 'specificTreasures', raw: string) {
    const value = raw.trim()
    if (!value) return
    setForm((prev) => ({ ...prev, [field]: [...prev[field], value] }))
  }

  function removeTag(field: 'specificEncounters' | 'specificTreasures', index: number) {
    setForm((prev) => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }))
  }

  function onTagKeyDown(
    e: KeyboardEvent<HTMLInputElement>,
    field: 'specificEncounters' | 'specificTreasures',
    value: string,
    clear: () => void,
  ) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag(field, value)
      clear()
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrors({})
    setSubmitError(null)

    // Build the payload — omit undefined fields so Zod defaults kick in.
    const payload = {
      name: form.name,
      ...(form.campaignName.trim() ? { campaignName: form.campaignName.trim() } : {}),
      ...(random.theme || !form.theme.trim() ? {} : { theme: form.theme.trim() }),
      ...(random.cr ? {} : { crMin: form.crMin, crMax: form.crMax }),
      direction: form.direction,
      ...(random.floorCount ? {} : { floorCount: form.floorCount }),
      ...(random.roomsPerFloor ? {} : { roomsMin: form.roomsMin, roomsMax: form.roomsMax }),
      specificEncounters: random.specificEncounters ? [] : form.specificEncounters,
      specificTreasures: random.specificTreasures ? [] : form.specificTreasures,
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      ...(form.seed.trim() ? { seed: form.seed.trim() } : {}),
      randomize: {
        theme: random.theme,
        cr: random.cr,
        floorCount: random.floorCount,
        roomsPerFloor: random.roomsPerFloor,
        specificEncounters: random.specificEncounters,
        specificTreasures: random.specificTreasures,
      },
    }

    // Client-side validation via the shared Zod schema.
    const result = createDungeonInput.safeParse(payload)
    if (!result.success) {
      const errs: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || 'general'
        errs[key] = issue.message
      }
      setErrors(errs)
      return
    }

    // Manual cross-field check Zod can't express.
    if (!random.cr && result.data.crMin > result.data.crMax) {
      setErrors({ crMin: 'CR Min must be ≤ CR Max' })
      return
    }

    setSubmitting(true)
    try {
      const dungeon = await createDungeon(result.data)
      if (dungeon.generationErrors.length > 0) {
        // Some floors failed — surface the errors but still navigate so the
        // user can see what was generated. Phase 7 will add a "regenerate failed
        // floors" action on the detail page.
        setSubmitError(
          `Dungeon saved, but some floors failed to generate: ${dungeon.generationErrors.join(' | ')}`,
        )
        setTimeout(() => navigate(`/dungeons/${dungeon.id}`), 4000)
      } else {
        navigate(`/dungeons/${dungeon.id}`)
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="container">
      <h1>Dungeon Creator</h1>
      <p className="tagline">Configure your dungeon. Toggle <strong>Random</strong> on any field to let the AI decide.</p>

      <form onSubmit={handleSubmit} noValidate>

        {/* ── Dungeon name ──────────────────────────────────────────────────── */}
        <div className="form-group">
          <label htmlFor="name">Dungeon name <span className="required">*</span></label>
          <input
            id="name"
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="e.g. Tomb of the Hollow King"
            autoComplete="off"
          />
          {errors['name'] && <span className="field-error">{errors['name']}</span>}
        </div>

        {/* ── Campaign ─────────────────────────────────────────────────────── */}
        <div className="form-group">
          <label htmlFor="campaign">Campaign</label>
          <input
            id="campaign"
            type="text"
            list="campaign-list"
            value={form.campaignName}
            onChange={(e) => setField('campaignName', e.target.value)}
            placeholder="Select existing or type a new name"
            autoComplete="off"
          />
          <datalist id="campaign-list">
            {campaigns.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <p className="hint">Leave blank for no campaign. Typing a new name creates it automatically.</p>
        </div>

        {/* ── Theme ────────────────────────────────────────────────────────── */}
        <div className="random-row">
          <div className="form-group">
            <label htmlFor="theme">Theme / mood</label>
            <textarea
              id="theme"
              rows={2}
              value={form.theme}
              onChange={(e) => setField('theme', e.target.value)}
              disabled={random.theme}
              placeholder={
                random.theme
                  ? 'AI will decide'
                  : 'e.g. Ancient undead crypt beneath a ruined keep'
              }
            />
          </div>
          <button
            type="button"
            className={`random-btn${random.theme ? ' active' : ''}`}
            onClick={() => toggleRandom('theme')}
            title="Let the AI choose the theme"
          >
            {random.theme ? '✦ Random' : 'Random'}
          </button>
        </div>

        {/* ── Challenge Rating ─────────────────────────────────────────────── */}
        <div className="random-row">
          <div className="form-group">
            <label>Challenge Rating</label>
            <div className="cr-row">
              <div className="cr-field">
                <label htmlFor="crMin" className="sub-label">Min</label>
                <input
                  id="crMin"
                  type="number"
                  min={0}
                  max={30}
                  value={form.crMin}
                  onChange={(e) => setField('crMin', Number(e.target.value))}
                  disabled={random.cr}
                />
              </div>
              <span className="range-sep">–</span>
              <div className="cr-field">
                <label htmlFor="crMax" className="sub-label">Max</label>
                <input
                  id="crMax"
                  type="number"
                  min={0}
                  max={30}
                  value={form.crMax}
                  onChange={(e) => setField('crMax', Number(e.target.value))}
                  disabled={random.cr}
                />
              </div>
            </div>
            {errors['crMin'] && <span className="field-error">{errors['crMin']}</span>}
          </div>
          <button
            type="button"
            className={`random-btn${random.cr ? ' active' : ''}`}
            onClick={() => toggleRandom('cr')}
            title="Let the AI choose the CR range"
          >
            {random.cr ? '✦ Random' : 'Random'}
          </button>
        </div>

        {/* ── Direction ────────────────────────────────────────────────────── */}
        <div className="form-group">
          <label htmlFor="direction">Floor direction</label>
          <select
            id="direction"
            value={form.direction}
            onChange={(e) => setField('direction', e.target.value as Direction)}
          >
            <option value="down">Down (deeper levels)</option>
            <option value="up">Up (ascending tower)</option>
            <option value="both">Both directions</option>
          </select>
        </div>

        {/* ── Floor count ──────────────────────────────────────────────────── */}
        <div className="random-row">
          <div className="form-group">
            <label htmlFor="floorCount">Number of floors</label>
            <input
              id="floorCount"
              type="number"
              min={1}
              max={10}
              value={form.floorCount}
              onChange={(e) => setField('floorCount', Number(e.target.value))}
              disabled={random.floorCount}
            />
          </div>
          <button
            type="button"
            className={`random-btn${random.floorCount ? ' active' : ''}`}
            onClick={() => toggleRandom('floorCount')}
            title="Let the AI choose the number of floors"
          >
            {random.floorCount ? '✦ Random' : 'Random'}
          </button>
        </div>

        {/* ── Rooms per floor ──────────────────────────────────────────────── */}
        <div className="random-row">
          <div className="form-group">
            <label>Rooms per floor</label>
            <div className="cr-row">
              <div className="cr-field">
                <label htmlFor="roomsMin" className="sub-label">Min</label>
                <input
                  id="roomsMin"
                  type="number"
                  min={1}
                  max={20}
                  value={form.roomsMin}
                  onChange={(e) => setField('roomsMin', Number(e.target.value))}
                  disabled={random.roomsPerFloor}
                />
              </div>
              <span className="range-sep">–</span>
              <div className="cr-field">
                <label htmlFor="roomsMax" className="sub-label">Max</label>
                <input
                  id="roomsMax"
                  type="number"
                  min={1}
                  max={20}
                  value={form.roomsMax}
                  onChange={(e) => setField('roomsMax', Number(e.target.value))}
                  disabled={random.roomsPerFloor}
                />
              </div>
            </div>
            <p className="hint">Grok picks a count in this range per floor based on its character.</p>
          </div>
          <button
            type="button"
            className={`random-btn${random.roomsPerFloor ? ' active' : ''}`}
            onClick={() => toggleRandom('roomsPerFloor')}
            title="Let the AI choose the room count range"
          >
            {random.roomsPerFloor ? '✦ Random' : 'Random'}
          </button>
        </div>

        {/* ── Specific Encounters ──────────────────────────────────────────── */}
        <div className="random-row">
          <div className="form-group">
            <label>Specific encounters</label>
            {random.specificEncounters ? (
              <p className="random-hint">AI will choose encounters for each room.</p>
            ) : (
              <>
                {form.specificEncounters.length > 0 && (
                  <div className="tag-list">
                    {form.specificEncounters.map((enc, i) => (
                      <span key={i} className="tag">
                        {enc}
                        <button
                          type="button"
                          className="tag-remove"
                          onClick={() => removeTag('specificEncounters', i)}
                          aria-label={`Remove ${enc}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="tag-input-row">
                  <input
                    type="text"
                    value={encounterInput}
                    onChange={(e) => setEncounterInput(e.target.value)}
                    onKeyDown={(e) =>
                      onTagKeyDown(e, 'specificEncounters', encounterInput, () =>
                        setEncounterInput(''),
                      )
                    }
                    placeholder="e.g. Lich (weakened) — Enter to add"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      addTag('specificEncounters', encounterInput)
                      setEncounterInput('')
                    }}
                  >
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            className={`random-btn${random.specificEncounters ? ' active' : ''}`}
            onClick={() => toggleRandom('specificEncounters')}
            title="Let the AI choose all encounters"
          >
            {random.specificEncounters ? '✦ Random' : 'Random'}
          </button>
        </div>

        {/* ── Specific Treasures ───────────────────────────────────────────── */}
        <div className="random-row">
          <div className="form-group">
            <label>Specific treasures</label>
            {random.specificTreasures ? (
              <p className="random-hint">AI will choose treasures for each room.</p>
            ) : (
              <>
                {form.specificTreasures.length > 0 && (
                  <div className="tag-list">
                    {form.specificTreasures.map((t, i) => (
                      <span key={i} className="tag">
                        {t}
                        <button
                          type="button"
                          className="tag-remove"
                          onClick={() => removeTag('specificTreasures', i)}
                          aria-label={`Remove ${t}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="tag-input-row">
                  <input
                    type="text"
                    value={treasureInput}
                    onChange={(e) => setTreasureInput(e.target.value)}
                    onKeyDown={(e) =>
                      onTagKeyDown(e, 'specificTreasures', treasureInput, () =>
                        setTreasureInput(''),
                      )
                    }
                    placeholder="e.g. Bag of holding — Enter to add"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      addTag('specificTreasures', treasureInput)
                      setTreasureInput('')
                    }}
                  >
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            className={`random-btn${random.specificTreasures ? ' active' : ''}`}
            onClick={() => toggleRandom('specificTreasures')}
            title="Let the AI choose all treasures"
          >
            {random.specificTreasures ? '✦ Random' : 'Random'}
          </button>
        </div>

        {/* ── Notes ────────────────────────────────────────────────────────── */}
        <div className="form-group">
          <label htmlFor="notes">DM notes</label>
          <textarea
            id="notes"
            rows={3}
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder="Optional private notes — not passed to the AI"
          />
        </div>

        {/* ── Advanced ─────────────────────────────────────────────────────── */}
        <details className="advanced">
          <summary>Advanced options</summary>
          <div className="form-group">
            <label htmlFor="seed">Seed</label>
            <input
              id="seed"
              type="text"
              value={form.seed}
              onChange={(e) => setField('seed', e.target.value)}
              placeholder="Leave blank to generate automatically"
              autoComplete="off"
            />
            <p className="hint">
              The seed drives deterministic map layout. Reuse the same seed to
              recreate an identical dungeon geometry.
            </p>
          </div>
        </details>

        {/* ── Errors & submit ──────────────────────────────────────────────── */}
        {errors['general'] && (
          <div className="submit-error">{errors['general']}</div>
        )}
        {submitError && <div className="submit-error">{submitError}</div>}

        <button type="submit" className="submit-btn" disabled={submitting}>
          {submitting ? 'Generating dungeon… (this may take a minute)' : 'Create dungeon'}
        </button>
      </form>
    </main>
  )
}
