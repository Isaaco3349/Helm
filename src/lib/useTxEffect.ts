/**
 * useTxEffect — fires a callback exactly once when a wagmi transaction
 * receipt transitions to success. Prevents the React crash caused by calling
 * setState or toast() directly in a component's render body.
 *
 * Usage:
 *   useTxEffect(isSuccess, () => { toast.success('Done!'); setInput('') })
 */
import { useEffect, useRef } from 'react'

export function useTxEffect(isSuccess: boolean, fn: () => void) {
  const firedRef = useRef(false)
  const firedForRef = useRef(false)

  // Reset the guard whenever success goes back to false (new tx started)
  useEffect(() => {
    if (!isSuccess) {
      firedRef.current = false
      firedForRef.current = false
    }
  }, [isSuccess])

  useEffect(() => {
    if (isSuccess && !firedRef.current) {
      firedRef.current = true
      firedForRef.current = true
      fn()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])
}
