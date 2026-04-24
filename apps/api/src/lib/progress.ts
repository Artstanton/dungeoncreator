/**
 * In-memory progress store for background dungeon generation.
 *
 * Entries are cleaned up automatically 10 minutes after generation finishes.
 * This is intentionally simple — a local single-user app doesn't need a
 * persistent job queue.
 */

export interface ProgressState {
  /** How many floors have completed (success or error). */
  floorsComplete: number
  /** Total floors to generate; 0 = still resolving random fields. */
  floorsTotal: number
  done: boolean
  errors: string[]
}

const store = new Map<string, ProgressState>()

export function initProgress(dungeonId: string): void {
  store.set(dungeonId, { floorsComplete: 0, floorsTotal: 0, done: false, errors: [] })
}

export function updateProgress(
  dungeonId: string,
  floorsComplete: number,
  floorsTotal: number,
): void {
  const p = store.get(dungeonId)
  if (p) {
    p.floorsComplete = floorsComplete
    p.floorsTotal = floorsTotal
  }
}

export function finishProgress(dungeonId: string, errors: string[]): void {
  const p = store.get(dungeonId)
  if (!p) return
  p.done = true
  p.errors = errors
  // Auto-clean after 10 minutes so the store doesn't grow unbounded.
  setTimeout(() => store.delete(dungeonId), 10 * 60 * 1000)
}

export function getProgress(dungeonId: string): ProgressState | null {
  return store.get(dungeonId) ?? null
}
