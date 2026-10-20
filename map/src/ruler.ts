import type { DzMap, Layer } from './DzMap'
import { format } from './i18n'
import { formatDistance, formatDuration, pathLength, sprintSeconds, VANILLA_STAMINA } from './travel'
import type { Frame, PointerEventData, Stamina, Tool, WorldPoint } from './types'

export interface RulerOptions {
  /** The server's stamina; vanilla when not given. */
  stamina?: Stamina
  /** Where the stamina comes from, e.g. the server's name; "vanilla" when not given. */
  staminaSource?: string
  /** Classes for the result panel, e.g. to place it beside your own panels. */
  panelClassName?: string
}

const LINE = 'var(--dzmap-accent,#f26522)'
const TEXT = 'var(--dzmap-text,#e7e7ea)'
const HALO = 'rgba(0,0,0,0.7)'

function n(value: number): string {
  return String(Math.round(value * 10) / 10)
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/**
 * Measures a route: every click sets a point, each leg shows its length, and a panel shows the total and how
 * long it takes to sprint. Backspace or a long press removes the last point, Esc stops.
 */
export class Ruler implements Tool, Layer {
  readonly name = 'ruler'
  readonly cursor = 'crosshair'
  private points: WorldPoint[] = []
  private pointer: WorldPoint | null = null
  private svg: SVGSVGElement | null = null
  private panel: HTMLDivElement | null = null
  private listeners = new Set<(points: readonly WorldPoint[]) => void>()

  constructor(private readonly map: DzMap, private options: RulerOptions = {}) {}

  setOptions(options: RulerOptions): void {
    this.options = { ...this.options, ...options }
    this.update()
  }

  isActive(): boolean {
    return this.map.getTool() === this
  }

  getPoints(): readonly WorldPoint[] {
    return this.points
  }

  start(): void {
    this.points = []
    this.map.setTool(this)
    this.update()
  }

  stop(): void {
    if (this.isActive()) this.map.setTool(null)
  }

  toggle(): void {
    if (this.isActive()) this.stop()
    else this.start()
  }

  undo(): void {
    this.points = this.points.slice(0, -1)
    this.update()
  }

  /** Called with the points whenever the route changes. */
  onChange(listener: (points: readonly WorldPoint[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ── Tool

  click(event: PointerEventData): void {
    this.points = [...this.points, event.world]
    this.update()
  }

  contextmenu(): void {
    this.undo()
  }

  hover(event: PointerEventData | null): void {
    this.pointer = event?.world ?? null
    this.map.requestRender()
  }

  keydown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape') {
      this.stop()
      return true
    }
    if (event.key === 'Backspace') {
      this.undo()
      return true
    }
    return false
  }

  deactivate(): void {
    this.points = []
    this.pointer = null
    this.update()
  }

  // ── Layer

  onAdd(map: DzMap): void {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.svg.setAttribute('class', 'dzmap-svg')
    map.getPane('overlay').append(this.svg)
    this.panel = map.element('div', 'dzmap-panel dzmap-ruler-panel')
    this.panel.setAttribute('data-dzmap-ui', '')
    this.panel.hidden = true
    map.container.append(this.panel)
    this.update()
  }

  onRemove(): void {
    this.svg?.remove()
    this.panel?.remove()
    this.svg = null
    this.panel = null
  }

  render(frame: Frame): void {
    if (!this.svg) return
    if (!this.isActive() || this.points.length === 0) {
      if (this.svg.innerHTML) this.svg.innerHTML = ''
      return
    }
    const locale = this.map.locale()
    const vp = this.points.map((p) => frame.project(p))
    const last = vp[vp.length - 1]
    const ahead = this.pointer ? frame.project(this.pointer) : null
    // Right after a click the pointer still rests on the new point; a leg of nothing would only read "0 m"
    const next = ahead && Math.hypot(ahead[0] - last[0], ahead[1] - last[1]) > 12 ? ahead : null
    const label = (x: number, y: number, text: string) =>
      `<text x="${n(x)}" y="${n(y)}" dy="-8" text-anchor="middle" font-family="var(--dzmap-mono,ui-monospace,monospace)" font-size="11" font-weight="600" style="fill:${TEXT}" stroke="${HALO}" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${esc(text)}</text>`
    const parts: string[] = []
    if (vp.length > 1) {
      const line = vp.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')
      parts.push(`<polyline points="${line}" fill="none" stroke="${HALO}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`)
      parts.push(`<polyline points="${line}" fill="none" style="stroke:${LINE}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`)
    }
    if (next) parts.push(`<line x1="${n(last[0])}" y1="${n(last[1])}" x2="${n(next[0])}" y2="${n(next[1])}" style="stroke:${LINE}" stroke-width="2" stroke-dasharray="6 5" opacity="0.8"/>`)
    vp.forEach(([x, y], i) => parts.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${i === 0 ? 5 : 4}" style="fill:${i === 0 ? LINE : TEXT}" stroke="${HALO}" stroke-width="1.5"/>`))
    if (vp.length > 2) {
      for (let i = 1; i < vp.length; i++) {
        parts.push(label((vp[i][0] + vp[i - 1][0]) / 2, (vp[i][1] + vp[i - 1][1]) / 2, formatDistance(pathLength([this.points[i - 1], this.points[i]]), locale)))
      }
    }
    if (next && this.pointer) parts.push(label(next[0], next[1], formatDistance(pathLength([this.points[this.points.length - 1], this.pointer]), locale)))
    this.svg.innerHTML = parts.join('')
  }

  private update(): void {
    this.map.requestRender()
    for (const listener of this.listeners) listener(this.points)
    const panel = this.panel
    if (!panel) return
    panel.hidden = !this.isActive()
    panel.className = `dzmap-panel dzmap-ruler-panel${this.options.panelClassName ? ` ${this.options.panelClassName}` : ''}`
    if (panel.hidden) return
    const t = this.map.strings
    const locale = this.map.locale()
    const meters = pathLength(this.points)
    const stamina = this.options.stamina ?? VANILLA_STAMINA
    const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
    const body = this.points.length < 2
      ? `<p class="dzmap-muted">${esc(touch ? t.tapToMeasure : t.clickToMeasure)}</p>`
      : `<div class="dzmap-ruler-total"><span>${esc(formatDistance(meters, locale))}</span><span class="dzmap-muted">${esc(format(t.sprintTime, { time: formatDuration(sprintSeconds(meters, stamina)) }))}</span></div>` +
        `<p class="dzmap-dim">${esc(format(t.staminaBasis, {
          max: Math.round(stamina.max),
          drain: stamina.sprintDrain.toLocaleString(locale, { maximumFractionDigits: 2 }),
          source: this.options.staminaSource ?? t.vanilla,
        }))}</p>`
    panel.innerHTML =
      `<div class="dzmap-panel-head"><div class="dzmap-panel-body"><div class="dzmap-eyebrow">// ${esc(t.measure)}</div>${body}</div>` +
      `<button type="button" class="dzmap-icon-button" data-action="close" aria-label="${esc(t.stopMeasuring)}" title="${esc(t.stopMeasuring)}">` +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>' +
      (this.points.length > 0 ? `<div class="dzmap-panel-actions"><button type="button" class="dzmap-button" data-label data-action="undo">${esc(t.undoPoint)}</button></div>` : '')
    panel.querySelector('[data-action=close]')?.addEventListener('click', () => this.stop())
    panel.querySelector('[data-action=undo]')?.addEventListener('click', () => this.undo())
  }
}
