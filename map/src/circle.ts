import type { DzMap, Layer } from './DzMap'
import { format } from './i18n'
import { formatDistance } from './travel'
import type { Frame, PointerEventData, Tool, WorldPoint } from './types'

export interface CircleToolOptions {
  /** Classes for the result panel, e.g. to place it beside your own panels. */
  panelClassName?: string
}

export interface DrawnCircle {
  center: WorldPoint
  /** The point on the edge that set the radius. */
  edge: WorldPoint
  /** Metres. */
  radius: number
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

function circleOf(center: WorldPoint, edge: WorldPoint): DrawnCircle {
  return { center, edge, radius: Math.hypot(edge[0] - center[0], edge[1] - center[1]) }
}

/**
 * Draws circles: a click sets the centre, the next one the edge, and the radius shows along the way. Backspace or
 * a long press removes the last circle, Esc stops and clears them.
 */
export class CircleTool implements Tool, Layer {
  readonly name = 'circle'
  readonly cursor = 'crosshair'
  private circles: DrawnCircle[] = []
  private center: WorldPoint | null = null
  private pointer: WorldPoint | null = null
  private svg: SVGSVGElement | null = null
  private panel: HTMLDivElement | null = null
  private listeners = new Set<(circles: readonly DrawnCircle[]) => void>()

  constructor(private readonly map: DzMap, private options: CircleToolOptions = {}) {}

  setOptions(options: CircleToolOptions): void {
    this.options = { ...this.options, ...options }
    this.update()
  }

  isActive(): boolean {
    return this.map.getTool() === this
  }

  getCircles(): readonly DrawnCircle[] {
    return this.circles
  }

  start(): void {
    this.circles = []
    this.center = null
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

  /** Drops the centre being placed, or else the last circle. */
  undo(): void {
    if (this.center) this.center = null
    else this.circles = this.circles.slice(0, -1)
    this.update()
  }

  /** Called with the circles whenever one is added or removed. */
  onChange(listener: (circles: readonly DrawnCircle[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ── Tool

  click(event: PointerEventData): void {
    if (!this.center) {
      this.center = event.world
    } else {
      const circle = circleOf(this.center, event.world)
      this.center = null
      if (circle.radius > 0) this.circles = [...this.circles, circle]
    }
    this.update()
  }

  contextmenu(): void {
    this.undo()
  }

  hover(event: PointerEventData | null): void {
    this.pointer = event?.world ?? null
    this.map.requestRender()
    if (this.center) this.renderPanel()
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
    this.circles = []
    this.center = null
    this.pointer = null
    this.update()
  }

  // ── Layer

  onAdd(map: DzMap): void {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.svg.setAttribute('class', 'dzmap-svg')
    map.getPane('overlay').append(this.svg)
    this.panel = map.element('div', 'dzmap-panel dzmap-tool-panel')
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
    const live = this.liveCircle()
    if (!this.isActive() || (this.circles.length === 0 && !this.center)) {
      if (this.svg.innerHTML) this.svg.innerHTML = ''
      return
    }
    const locale = this.map.locale()
    const parts: string[] = []
    const draw = (circle: DrawnCircle, dashed: boolean) => {
      const [cx, cy] = frame.project(circle.center)
      const [ex, ey] = frame.project(circle.edge)
      const r = circle.radius * frame.scale
      const dash = dashed ? ' stroke-dasharray="6 5"' : ''
      parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" style="fill:${LINE}" fill-opacity="0.08" stroke="${HALO}" stroke-width="3"/>`)
      parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" style="stroke:${LINE}" stroke-width="1.5"${dash}/>`)
      parts.push(`<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(ex)}" y2="${n(ey)}" style="stroke:${LINE}" stroke-width="2" stroke-dasharray="6 5" opacity="0.8"/>`)
      parts.push(`<circle cx="${n(ex)}" cy="${n(ey)}" r="3.5" style="fill:${TEXT}" stroke="${HALO}" stroke-width="1.5"/>`)
      parts.push(`<text x="${n((cx + ex) / 2)}" y="${n((cy + ey) / 2)}" dy="-8" text-anchor="middle" font-family="var(--dzmap-mono,ui-monospace,monospace)" font-size="11" font-weight="600" style="fill:${TEXT}" stroke="${HALO}" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${esc(formatDistance(circle.radius, locale))}</text>`)
    }
    for (const circle of this.circles) draw(circle, false)
    // Right after a click the pointer still rests on the centre; a circle of nothing would only read "0 m"
    if (live && live.radius * frame.scale > 12) draw(live, true)
    for (const center of this.center ? [...this.circles.map((c) => c.center), this.center] : this.circles.map((c) => c.center)) {
      const [cx, cy] = frame.project(center)
      parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="5" style="fill:${LINE}" stroke="${HALO}" stroke-width="1.5"/>`)
    }
    this.svg.innerHTML = parts.join('')
  }

  private liveCircle(): DrawnCircle | null {
    return this.center && this.pointer ? circleOf(this.center, this.pointer) : null
  }

  private update(): void {
    this.map.requestRender()
    for (const listener of this.listeners) listener(this.circles)
    this.renderPanel()
  }

  private renderPanel(): void {
    const panel = this.panel
    if (!panel) return
    panel.hidden = !this.isActive()
    panel.className = `dzmap-panel dzmap-tool-panel${this.options.panelClassName ? ` ${this.options.panelClassName}` : ''}`
    if (panel.hidden) return
    const t = this.map.strings
    const locale = this.map.locale()
    const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
    const shown = this.liveCircle() ?? (this.center ? null : this.circles[this.circles.length - 1] ?? null)
    const body = shown
      ? `<div class="dzmap-tool-total"><span>${esc(format(t.radius, { distance: formatDistance(shown.radius, locale) }))}</span>` +
        `<span class="dzmap-muted">${esc(format(t.diameter, { distance: formatDistance(shown.radius * 2, locale) }))}</span></div>`
      : `<p class="dzmap-muted">${esc(this.center ? (touch ? t.tapCircleEdge : t.clickCircleEdge) : (touch ? t.tapCircleCenter : t.clickCircleCenter))}</p>`
    const undo = this.center || this.circles.length > 0
    panel.innerHTML =
      `<div class="dzmap-panel-head"><div class="dzmap-panel-body"><div class="dzmap-eyebrow">// ${esc(t.drawCircle)}</div>${body}</div>` +
      `<button type="button" class="dzmap-icon-button" data-action="close" aria-label="${esc(t.stopDrawingCircles)}" title="${esc(t.stopDrawingCircles)}">` +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>' +
      (undo ? `<div class="dzmap-panel-actions"><button type="button" class="dzmap-button" data-label data-action="undo">${esc(this.center ? t.cancelCircle : t.undoCircle)}</button></div>` : '')
    panel.querySelector('[data-action=close]')?.addEventListener('click', () => this.stop())
    panel.querySelector('[data-action=undo]')?.addEventListener('click', () => this.undo())
  }
}
