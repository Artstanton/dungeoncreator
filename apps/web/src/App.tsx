import { useEffect, useState } from 'react'
import { pingResponse, type PingResponse } from '@dungeon/shared'

export function App() {
  const [ping, setPing] = useState<PingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/ping')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        // Validate the response shape against the shared schema.
        const parsed = pingResponse.parse(data)
        setPing(parsed)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="container">
      <h1>Dungeon Creator</h1>
      <p className="tagline">Phase 1 scaffolding — verifying API reachability.</p>

      {ping && (
        <section className="status ok">
          <strong>API connected.</strong>
          <pre>{JSON.stringify(ping, null, 2)}</pre>
        </section>
      )}

      {error && (
        <section className="status err">
          <strong>API unreachable.</strong>
          <p>
            Is the API running? Try <code>pnpm dev</code> from the repo root.
          </p>
          <pre>{error}</pre>
        </section>
      )}

      {!ping && !error && <p>Pinging API…</p>}
    </main>
  )
}
