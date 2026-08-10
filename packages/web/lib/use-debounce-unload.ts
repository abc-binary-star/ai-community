import { useEffect, useRef, useCallback } from 'react'

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delayMs: number,
  leading = false,
): (...args: Parameters<T>) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  const leadingFired = useRef(false)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [delayMs])

  return useCallback(
    (...args: Parameters<T>) => {
      if (timer.current) {
        clearTimeout(timer.current)
      }
      if (leading && !leadingFired.current) {
        leadingFired.current = true
        fnRef.current(...args)
      }
      timer.current = setTimeout(() => {
        timer.current = null
        leadingFired.current = false
        if (!leading) {
          fnRef.current(...args)
        }
      }, delayMs)
    },
    [delayMs, leading],
  )
}

export function useBeforeUnload(shouldBlock: boolean | (() => boolean), message?: string) {
  const shouldBlockRef = useRef(shouldBlock)

  useEffect(() => {
    shouldBlockRef.current = shouldBlock
  }, [shouldBlock])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const active =
        typeof shouldBlockRef.current === 'function'
          ? shouldBlockRef.current()
          : shouldBlockRef.current
      if (!active) return
      e.preventDefault()
      const msg = message ?? '您有未保存的更改，确定要离开吗？'
      e.returnValue = msg
      return msg
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [message])
}
