import { useEffect, useState } from 'react'

/**
 * Returns a copy of `value` that only updates after `delayMs` has passed
 * without `value` changing. Use this to avoid firing a server request (search,
 * filter) on every keystroke — pass the debounced value into a query key /
 * queryFn instead of the raw input state.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
