import { useCallback, useState } from 'react'

// Cap history so long editing sessions keep predictable memory use while still
// allowing practical multi-step undo/redo.
const HISTORY_LIMIT = 80

interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
}

export function useScenarioHistory<T>(initialState: T) {
  const [state, setState] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  })

  const setPresent = useCallback((updater: T | ((current: T) => T), trackHistory = true) => {
    setState((current) => {
      const next =
        typeof updater === 'function'
          ? (updater as (value: T) => T)(current.present)
          : updater

      if (Object.is(next, current.present)) return current
      if (!trackHistory) {
        return {
          past: current.past,
          present: next,
          future: current.future,
        }
      }

      return {
        past: [...current.past.slice(-(HISTORY_LIMIT - 1)), current.present],
        present: next,
        future: [],
      }
    })
  }, [])

  const undo = useCallback(() => {
    setState((current) => {
      const previous = current.past.at(-1)
      if (!previous) return current

      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      }
    })
  }, [])

  const redo = useCallback(() => {
    setState((current) => {
      const next = current.future[0]
      if (!next) return current

      return {
        past: [...current.past, current.present].slice(-HISTORY_LIMIT),
        present: next,
        future: current.future.slice(1),
      }
    })
  }, [])

  const reset = useCallback((next: T) => {
    setState({
      past: [],
      present: next,
      future: [],
    })
  }, [])

  return {
    state: state.present,
    setState: setPresent,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
