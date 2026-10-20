const CHECK_INTERVAL_MS = 2000
const STRIKE_WINDOW_MS = 60_000
const STRIKES_BEFORE_LOCK = 3

// Inline !important wins over any stylesheet of the page, including its own !important rules
function inline(rules: string[]): string {
  return [
    'all:initial',
    'display:block',
    'position:absolute',
    'z-index:2147483647',
    'visibility:visible',
    'opacity:1',
    'transform:none',
    'filter:none',
    'clip-path:none',
    'mask:none',
    'pointer-events:auto',
    'margin:0',
    ...rules,
  ].map((rule) => `${rule} !important`).join(';')
}

const HOST_STYLE = inline(['right:0', 'bottom:0', 'left:auto', 'top:auto', 'width:auto', 'height:auto'])
const LOCK_STYLE = inline(['inset:0'])

const CSS = `
.credit{display:block;padding:2px 6px;border-top-left-radius:3px;background:rgba(9,9,11,.78);color:#f4f4f5;font:500 10px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.02em;white-space:nowrap;cursor:default}
.credit a{color:inherit;font:inherit;text-decoration:none;cursor:pointer}
.credit a:hover{text-decoration:underline}
.lock{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:24px;box-sizing:border-box;background:rgba(9,9,11,.94);color:#f4f4f5;font:500 14px/1.5 ui-sans-serif,system-ui,sans-serif;text-align:center}
.lock a{color:#f26522;font:inherit;text-decoration:underline;cursor:pointer}
`

function shadow(doc: Document, style: string, html: string): HTMLElement {
  const host = doc.createElement('dzmap-credit')
  host.setAttribute('style', style)
  host.setAttribute('aria-label', 'Map © dzbot.de')
  const root = host.attachShadow({ mode: 'closed' })
  root.innerHTML = `<style>${CSS}</style>${html}`
  return host
}

/**
 * The "© dzbot.de" credit every map carries. It lives in a closed shadow root with inline !important styles,
 * so page CSS cannot reach it, and a watchdog puts it back whenever it is removed, hidden or restyled. A page
 * that keeps removing it gets a notice instead of the map.
 */
export class Attribution {
  private host: HTMLElement
  private lock: HTMLElement | null = null
  private strikes: number[] = []
  private readonly observer: MutationObserver
  private readonly timer: ReturnType<typeof setInterval>

  constructor(private readonly container: HTMLElement) {
    this.host = this.create()
    container.append(this.host)
    this.observer = new MutationObserver(() => this.check())
    this.observe()
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS)
  }

  destroy(): void {
    clearInterval(this.timer)
    this.observer.disconnect()
    this.host.remove()
    this.lock?.remove()
  }

  private create(): HTMLElement {
    const year = new Date().getFullYear()
    return shadow(this.container.ownerDocument, HOST_STYLE, `<span class="credit">&copy; ${year} <a href="https://dzbot.de" target="_blank" rel="noopener">dzbot.de</a></span>`)
  }

  private observe(): void {
    this.observer.observe(this.container, { childList: true })
    this.observer.observe(this.host, { attributes: true })
    if (this.lock) this.observer.observe(this.lock, { attributes: true })
  }

  private intact(element: HTMLElement, style: string): boolean {
    if (!element.isConnected || element.parentElement !== this.container || element.getAttribute('style') !== style) return false
    const box = this.container.getBoundingClientRect()
    // A hidden or collapsed map is not tampering: nothing to check until it shows again
    if (box.width < 40 || box.height < 20) return true
    const computed = getComputedStyle(element)
    if (computed.display === 'none' || computed.visibility !== 'visible' || Number(computed.opacity) < 0.95) return false
    const rect = element.getBoundingClientRect()
    return rect.width >= 30 && rect.height >= 8 && rect.right <= box.right + 1 && rect.bottom <= box.bottom + 1 && rect.left >= box.left - 1 && rect.top >= box.top - 1
  }

  private check(): void {
    const creditOk = this.intact(this.host, HOST_STYLE)
    const lockOk = !this.lock || this.intact(this.lock, LOCK_STYLE)
    if (creditOk && lockOk) return
    this.observer.disconnect()
    this.host.remove()
    this.host = this.create()
    this.container.append(this.host)
    const now = Date.now()
    this.strikes = [...this.strikes.filter((at) => now - at < STRIKE_WINDOW_MS), now]
    if (this.lock || this.strikes.length >= STRIKES_BEFORE_LOCK) {
      this.lock?.remove()
      this.lock = shadow(
        this.container.ownerDocument,
        LOCK_STYLE,
        '<div class="lock"><span>This map is provided free by <a href="https://dzbot.de" target="_blank" rel="noopener">dzbot.de</a> on condition that its credit stays visible.</span></div>',
      )
      this.container.append(this.lock)
    }
    this.observe()
  }
}
