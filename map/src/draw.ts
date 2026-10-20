import { DzMap, NESTED, type Layer } from './DzMap'
import { format } from './i18n'
import type { Frame, PointerEventData, Tool, WorldPoint } from './types'
import { VectorLayer } from './vector'

const SLOP_PX = 4
const MIN_EDGE_FOR_INSERT_PX = 56
const LOUPE_PX = 128
const LOUPE_LIFT_PX = 100
const LOUPE_ZOOM_STEP = 1.5

export interface PolygonEditorOptions {
  /** Colour of the corners and, with `shape`, of the outline. */
  color?: string
  /** Called with the new corners whenever an edit is done: a corner dropped, inserted, added or deleted. */
  onChange?: (points: WorldPoint[]) => void
  /** The outline while a corner moves; `null` once it is let go. */
  onPreview?: (points: WorldPoint[] | null) => void
  /** The selected corner (tap a corner to select it, tap again to let go). */
  onSelect?: (index: number | null) => void
  /** A click on the map adds a corner where it fits the outline best. Default true. */
  addOnClick?: boolean
  /** Draws the polygon itself; off when you draw it in your own style. Default true. */
  shape?: boolean
}

interface Drag {
  kind: 'corner' | 'edge'
  index: number
  pointerId: number
  pointerType: string
  startX: number
  startY: number
  moved: boolean
  x: number
  y: number
}

function distanceToSegment([px, pz]: WorldPoint, [ax, az]: WorldPoint, [bx, bz]: WorldPoint): number {
  const dx = bx - ax
  const dz = bz - az
  const t = dx === 0 && dz === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

/** Inserts a corner into the edge it lies closest to, so a click on the map never twists the outline. */
export function insertAtBestPosition(points: readonly WorldPoint[], point: WorldPoint): WorldPoint[] {
  if (points.length <= 1) return [...points, point]
  let best = points.length
  let bestDistance = Infinity
  for (let i = 0; i < points.length; i++) {
    const distance = distanceToSegment(point, points[i], points[(i + 1) % points.length])
    if (distance < bestDistance) {
      bestDistance = distance
      best = i + 1
    }
  }
  const result = [...points]
  result.splice(best % (points.length + 1), 0, point)
  return result
}

/**
 * Edits a polygon on the map: drag a corner, drag the "+" on an edge to insert one, click the map to add one,
 * tap a corner and delete it (or press Delete). Under a finger, a loupe above it shows what the finger covers.
 * While it runs it is the map's tool, so clicks go to it rather than to your click listeners.
 */
export class PolygonEditor implements Tool, Layer {
  readonly name = 'draw-polygon'
  readonly cursor = 'crosshair'
  private points: WorldPoint[]
  private selected: number | null = null
  private drag: Drag | null = null
  private root: HTMLDivElement | null = null
  private loupe: { element: HTMLDivElement; map: DzMap; shape: VectorLayer } | null = null
  private shape: VectorLayer | null = null
  private stopped = false

  constructor(private readonly map: DzMap, points: readonly WorldPoint[], private options: PolygonEditorOptions = {}) {
    this.points = [...points]
  }

  getPoints(): WorldPoint[] {
    return [...this.points]
  }

  /** Replaces the corners, e.g. after an undo in your own history; does not call `onChange`. */
  setPoints(points: readonly WorldPoint[]): void {
    this.points = [...points]
    if (this.selected !== null && this.selected >= this.points.length) this.select(null)
    this.redraw()
  }

  setOptions(options: PolygonEditorOptions): void {
    this.options = { ...this.options, ...options }
    this.redraw()
  }

  select(index: number | null): void {
    if (index === this.selected) return
    this.selected = index
    this.options.onSelect?.(index)
    this.redraw()
  }

  /** Ends editing and removes the handles. */
  stop(): void {
    if (this.stopped) return
    this.stopped = true
    if (this.map.getTool() === this) this.map.setTool(null)
    this.map.removeLayer(this)
  }

  // ── Tool

  click(event: PointerEventData): void {
    if (this.options.addOnClick === false) return
    this.select(null)
    this.commit(insertAtBestPosition(this.points, event.world))
  }

  keydown(event: KeyboardEvent): boolean {
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selected !== null) {
      this.deleteSelected()
      return true
    }
    if (event.key === 'Escape' && this.selected !== null) {
      this.select(null)
      return true
    }
    return false
  }

  deactivate(): void {
    if (!this.stopped) this.stop()
  }

  // ── Layer

  onAdd(map: DzMap): void {
    this.root = map.element('div', 'dzmap-draw')
    map.getPane('overlay').append(this.root)
    if (this.options.shape !== false) {
      this.shape = new VectorLayer()
      map.addLayer(this.shape)
    }
    this.redraw()
  }

  onRemove(map: DzMap): void {
    this.listen(false)
    this.root?.remove()
    this.root = null
    if (this.shape) map.removeLayer(this.shape)
    this.shape = null
    this.closeLoupe()
    this.options.onPreview?.(null)
  }

  render(frame: Frame): void {
    const root = this.root
    if (!root) return
    const t = this.map.strings
    const color = this.options.color ?? 'var(--dzmap-accent,#f26522)'
    const dragging = this.drag?.moved ? this.drag : null
    const shown = dragging ? this.pointsFor(dragging) : this.points
    const corners = shown.map((p) => frame.project(p))
    const html: string[] = []

    if (!dragging && shown.length >= 2) {
      shown.forEach((_, i) => {
        if (shown.length === 2 && i === 1) return
        const a = corners[i]
        const b = corners[(i + 1) % corners.length]
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_EDGE_FOR_INSERT_PX) return
        html.push(
          `<div class="dzmap-draw-edge" data-dzmap-ui data-kind="edge" data-index="${i}" role="button" aria-label="${t.insertPoint}" style="left:${(a[0] + b[0]) / 2}px;top:${(a[1] + b[1]) / 2}px">` +
            '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg></span></div>',
        )
      })
    }
    corners.forEach(([x, y], i) => {
      const active = i === this.selected || (dragging?.kind === 'corner' && dragging.index === i)
      html.push(
        `<div class="dzmap-draw-corner${active ? ' dzmap-draw-active' : ''}${dragging ? ' dzmap-draw-grabbing' : ''}" data-dzmap-ui data-kind="corner" data-index="${i}" role="button"` +
          ` aria-label="${format(t.cornerLabel, { number: i + 1 })}" aria-pressed="${i === this.selected}" style="left:${x}px;top:${y}px">` +
          `<span style="${active ? `border-color:${color}` : `background-color:${color}`}"></span></div>`,
      )
    })
    if (dragging && dragging.pointerType !== 'mouse') {
      html.push(`<div class="dzmap-draw-finger" aria-hidden="true" style="left:${dragging.x}px;top:${dragging.y}px"></div>`)
    }
    const selected = this.selected !== null && !dragging ? corners[this.selected] : null
    if (selected) {
      const left = Math.min(frame.width - 90, Math.max(90, selected[0]))
      const top = selected[1] > 64 ? selected[1] - 56 : selected[1] + 28
      html.push(
        `<div class="dzmap-draw-menu" data-dzmap-ui style="left:${left}px;top:${top}px"><button type="button" data-action="delete">` +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
          `${t.deletePoint}</button></div>`,
      )
    }
    root.innerHTML = html.join('')
    for (const handle of root.querySelectorAll<HTMLElement>('[data-kind]')) {
      handle.addEventListener('pointerdown', (event) => this.start(handle.dataset.kind as Drag['kind'], Number(handle.dataset.index), event))
    }
    root.querySelector('[data-action=delete]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      this.deleteSelected()
    })

    if (this.shape) {
      this.shape.setFeatures(shown.length >= 2 ? [{ type: 'polygon', points: shown, fill: color, stroke: color, fillOpacity: 0.25, fadeOnZoom: false }] : [])
    }
    this.updateLoupe(frame, dragging, shown)
  }

  // ── Dragging

  private local(event: PointerEvent): [number, number] {
    const rect = this.root!.getBoundingClientRect()
    return [event.clientX - rect.left, event.clientY - rect.top]
  }

  private pointsFor(drag: Drag): WorldPoint[] {
    const moved = this.map.unproject([drag.x, drag.y])
    if (drag.kind === 'corner') return this.points.map((p, i) => (i === drag.index ? moved : p))
    const next = [...this.points]
    next.splice(drag.index + 1, 0, moved)
    return next
  }

  // Handles are redrawn every frame, so a drag listens on the window rather than on the handle it started on
  private readonly onMove = (event: PointerEvent) => this.move(event)
  private readonly onUp = (event: PointerEvent) => this.end(event)
  private readonly onCancel = () => this.cancel()

  private listen(on: boolean): void {
    if (on) {
      window.addEventListener('pointermove', this.onMove)
      window.addEventListener('pointerup', this.onUp)
      window.addEventListener('pointercancel', this.onCancel)
    } else {
      window.removeEventListener('pointermove', this.onMove)
      window.removeEventListener('pointerup', this.onUp)
      window.removeEventListener('pointercancel', this.onCancel)
    }
  }

  private start(kind: Drag['kind'], index: number, event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    this.listen(true)
    const [x, y] = this.local(event)
    const drag: Drag = { kind, index, pointerId: event.pointerId, pointerType: event.pointerType, startX: x, startY: y, moved: false, x, y }
    if (kind === 'edge') {
      const [ax, ay] = this.map.project(this.points[index])
      const [bx, by] = this.map.project(this.points[(index + 1) % this.points.length])
      drag.x = (ax + bx) / 2
      drag.y = (ay + by) / 2
    }
    this.drag = drag
  }

  private move(event: PointerEvent): void {
    const drag = this.drag
    if (!drag || drag.pointerId !== event.pointerId) return
    const [x, y] = this.local(event)
    if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) < SLOP_PX) return
    this.drag = { ...drag, moved: true, x, y }
    this.options.onPreview?.(this.pointsFor(this.drag))
    this.map.requestRender()
  }

  private end(event: PointerEvent): void {
    const drag = this.drag
    if (!drag || drag.pointerId !== event.pointerId) return
    this.listen(false)
    this.drag = null
    this.options.onPreview?.(null)
    if (drag.kind === 'edge') {
      this.select(null)
      this.commit(this.pointsFor(drag))
    } else if (drag.moved) {
      this.commit(this.pointsFor(drag))
    } else {
      this.select(this.selected === drag.index ? null : drag.index)
    }
    this.map.requestRender()
  }

  private cancel(): void {
    this.listen(false)
    this.drag = null
    this.options.onPreview?.(null)
    this.map.requestRender()
  }

  private deleteSelected(): void {
    if (this.selected === null) return
    const index = this.selected
    this.select(null)
    this.commit(this.points.filter((_, i) => i !== index))
  }

  private commit(points: WorldPoint[]): void {
    this.points = points
    this.options.onChange?.(points)
    this.redraw()
  }

  private redraw(): void {
    this.map.requestRender()
  }

  // ── Loupe

  private updateLoupe(frame: Frame, dragging: Drag | null, shown: WorldPoint[]): void {
    if (!dragging || dragging.pointerType === 'mouse') {
      this.closeLoupe()
      return
    }
    if (!this.loupe) {
      const element = this.map.element('div', 'dzmap-draw-loupe')
      element.setAttribute('aria-hidden', 'true')
      this.map.container.append(element)
      const map = new DzMap(element, { tiles: this.map.getTileSource(), controls: {}, keyboard: false, [NESTED]: true } as never)
      const shape = map.addLayer(new VectorLayer())
      this.loupe = { element, map, shape }
    }
    const left = Math.min(frame.width - LOUPE_PX - 8, Math.max(8, dragging.x - LOUPE_PX / 2))
    const above = dragging.y - LOUPE_PX / 2 - LOUPE_LIFT_PX
    const top = above >= 8 ? above : Math.min(frame.height - LOUPE_PX - 8, dragging.y + 48)
    this.loupe.element.style.left = `${left}px`
    this.loupe.element.style.top = `${top}px`
    const color = this.options.color ?? 'var(--dzmap-accent,#f26522)'
    this.loupe.shape.setFeatures([{ type: 'polygon', points: shown, fill: color, stroke: color, fillOpacity: 0.25, fadeOnZoom: false }])
    this.loupe.map.setView(this.map.unproject([dragging.x, dragging.y]), Math.min(this.map.getMaxZoom(), frame.zoom + LOUPE_ZOOM_STEP))
  }

  private closeLoupe(): void {
    if (!this.loupe) return
    this.loupe.map.destroy()
    this.loupe.element.remove()
    this.loupe = null
  }
}

/** Editing tools: `map.draw.polygon(points, options)`. */
export class Draw {
  constructor(private readonly map: DzMap) {}

  /** Starts editing a polygon; pass `[]` to draw a new one by clicking. */
  polygon(points: readonly WorldPoint[], options: PolygonEditorOptions = {}): PolygonEditor {
    const editor = new PolygonEditor(this.map, points, options)
    this.map.addLayer(editor)
    this.map.setTool(editor)
    return editor
  }
}
