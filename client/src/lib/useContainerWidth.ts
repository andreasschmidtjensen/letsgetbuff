import { useEffect, useRef, useState } from 'react'

/** Measured width of a container element, for viewBox-based SVG charts.
    Never reports below `min` so chart math keeps a sane floor. */
export function useContainerWidth<T extends HTMLElement>(min = 320) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(min)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(Math.max(min, Math.round(el.clientWidth)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [min])

  return { ref, width }
}
