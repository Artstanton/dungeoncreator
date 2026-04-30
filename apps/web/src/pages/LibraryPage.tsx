import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getDungeons, deleteDungeon } from '../api/client'
import type { DungeonListItem } from '@dungeon/shared'
import Navbar from '../components/Navbar'

const DIR_LABEL: Record<string, string> = { up: '↑ Ascending', down: '↓ Descending', both: '↕ Both' }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function LibraryPage() {
  const [dungeons, setDungeons] = useState<DungeonListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('__all__')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    getDungeons()
      .then(setDungeons)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Unique campaigns in display order (first-seen).
  const campaigns = Array.from(
    new Map(
      dungeons.flatMap((d) => (d.campaign ? [[d.campaign.name, d.campaign]] : []))
    ).values()
  )
  const hasUncampaigned = dungeons.some((d) => !d.campaign)

  const filtered =
    filter === '__all__'
      ? dungeons
      : filter === '__none__'
      ? dungeons.filter((d) => !d.campaign)
      : dungeons.filter((d) => d.campaign?.name === filter)

  async function handleDelete(d: DungeonListItem) {
    if (
      !confirm(
        `Delete "${d.name}"?\n\nAll levels and rooms will be permanently removed. This cannot be undone.`
      )
    )
      return
    setDeleting(d.id)
    try {
      await deleteDungeon(d.id)
      setDungeons((prev) => prev.filter((x) => x.id !== d.id))
      // If the active filter now has no results, fall back to All.
      const remaining = dungeons.filter((x) => x.id !== d.id)
      const stillVisible =
        filter === '__all__'
          ? remaining
          : filter === '__none__'
          ? remaining.filter((x) => !x.campaign)
          : remaining.filter((x) => x.campaign?.name === filter)
      if (stillVisible.length === 0 && filter !== '__all__') setFilter('__all__')
    } catch (e) {
      alert(`Could not delete: ${(e as Error).message}`)
    } finally {
      setDeleting(null)
    }
  }

  const showFilterTabs = campaigns.length > 0 || hasUncampaigned

  return (
    <div className="library-page">
      <Navbar />
      <main className="container">
        <h1>Library</h1>
        <p className="tagline">Your generated dungeons</p>

        {loading && <p className="page-loading">Loading…</p>}
        {error && <p className="page-error">Error: {error}</p>}

        {!loading && !error && (
          <>
            {showFilterTabs && (
              <div className="campaign-tabs">
                <button
                  className={`campaign-tab${filter === '__all__' ? ' campaign-tab--active' : ''}`}
                  onClick={() => setFilter('__all__')}
                >
                  All
                  <span className="campaign-tab__count">{dungeons.length}</span>
                </button>
                {campaigns.map((c) => (
                  <button
                    key={c.name}
                    className={`campaign-tab${filter === c.name ? ' campaign-tab--active' : ''}`}
                    onClick={() => setFilter(c.name)}
                  >
                    {c.name}
                    <span className="campaign-tab__count">
                      {dungeons.filter((d) => d.campaign?.name === c.name).length}
                    </span>
                  </button>
                ))}
                {hasUncampaigned && (
                  <button
                    className={`campaign-tab${filter === '__none__' ? ' campaign-tab--active' : ''}`}
                    onClick={() => setFilter('__none__')}
                  >
                    Uncampaigned
                    <span className="campaign-tab__count">
                      {dungeons.filter((d) => !d.campaign).length}
                    </span>
                  </button>
                )}
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="library-empty">
                {dungeons.length === 0 ? (
                  <>
                    <p>No dungeons yet.</p>
                    <Link to="/dungeons/new" className="submit-btn library-empty__cta">
                      Generate your first dungeon
                    </Link>
                  </>
                ) : (
                  <p>No dungeons in this group.</p>
                )}
              </div>
            ) : (
              <div className="dungeon-grid">
                {filtered.map((d) => (
                  <article key={d.id} className="dungeon-card">
                    <div className="dungeon-card__badges">
                      {d.campaign && (
                        <span className="campaign-badge">{d.campaign.name}</span>
                      )}
                    </div>

                    <Link to={`/dungeons/${d.id}`} className="dungeon-card__name">
                      {d.name}
                    </Link>

                    <div className="dungeon-card__meta">
                      <span className="dungeon-card__chip">
                        <span className="dungeon-card__chip-label">CR</span>{' '}
                        {d.crMin}–{d.crMax}
                      </span>
                      <span className="dungeon-card__chip">
                        <span className="dungeon-card__chip-label">
                          {d.levelCount === 1 ? 'floor' : 'floors'}
                        </span>{' '}
                        {d.levelCount}
                      </span>
                      <span className="dungeon-card__chip">
                        {DIR_LABEL[d.direction] ?? d.direction}
                      </span>
                    </div>

                    <div className="dungeon-card__footer">
                      <span className="dungeon-card__date">{formatDate(d.createdAt)}</span>
                      <button
                        className="dungeon-card__delete"
                        onClick={() => handleDelete(d)}
                        disabled={deleting === d.id}
                        title="Delete dungeon"
                        aria-label={`Delete ${d.name}`}
                      >
                        {deleting === d.id ? '…' : '✕'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
