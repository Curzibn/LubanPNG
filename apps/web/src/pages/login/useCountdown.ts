import { useEffect, useState } from "react"

const secondsUntil = (target: number | null): number => {
  if (target === null) return 0
  return Math.max(0, Math.ceil((target - Date.now()) / 1000))
}

export const useCountdown = (target: number | null): number => {
  const [seconds, setSeconds] = useState(() => secondsUntil(target))
  useEffect(() => {
    setSeconds(secondsUntil(target))
    if (target === null) return
    const timer = window.setInterval(() => {
      const left = secondsUntil(target)
      setSeconds(left)
      if (left === 0) window.clearInterval(timer)
    }, 250)
    return () => window.clearInterval(timer)
  }, [target])
  return seconds
}
