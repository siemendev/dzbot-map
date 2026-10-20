import type { DzMap } from './DzMap'
import { format } from './i18n'
import type { WorldPoint } from './types'

const COPIED_MS = 1500

export function formatCoordinate([x, z]: WorldPoint): string {
  return `${Math.round(x)} / ${Math.round(z)}`
}

function editing(element: Element | null): boolean {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || (element instanceof HTMLElement && element.isContentEditable)
}

/** The coordinate under the mouse; Ctrl/Cmd+C copies it as long as no text is selected. Hidden on touch. */
export function coordinatesControl(map: DzMap, element: HTMLElement): () => void {
  const t = map.strings
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  let spot: WorldPoint | null = null
  let copiedUntil = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  element.classList.add('dzmap-coordinates')

  const draw = () => {
    const copied = Date.now() < copiedUntil
    element.hidden = !spot && !copied
    if (copied) {
      element.innerHTML = `<span class="dzmap-accent">${t.coordinateCopied}</span>`
    } else if (spot) {
      element.innerHTML = `<span>X ${Math.round(spot[0])} · Z ${Math.round(spot[1])}</span><span class="dzmap-dim">${format(t.copyHint, { keys: mac ? '⌘C' : t.ctrlC })}</span>`
    }
  }

  const offHover = map.on('hover', (event) => {
    spot = event ? event.world : null
    draw()
  })
  const onKey = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== 'c' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
    if (!spot || editing(document.activeElement) || window.getSelection()?.toString()) return
    event.preventDefault()
    void navigator.clipboard.writeText(formatCoordinate(spot)).then(() => {
      copiedUntil = Date.now() + COPIED_MS
      draw()
      clearTimeout(timer)
      timer = setTimeout(draw, COPIED_MS)
    })
  }
  document.addEventListener('keydown', onKey)
  draw()
  return () => {
    offHover()
    document.removeEventListener('keydown', onKey)
    clearTimeout(timer)
  }
}
