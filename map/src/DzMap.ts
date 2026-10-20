import { Attribution } from './attribution'
import { Controls } from './controls'
import { Emitter } from './emitter'
import { strings, type Strings } from './i18n'
import { geoJsonFeatures, type GeoJson } from './geojson'
import { findMap } from './maps'
import { MapObject, ObjectLayer } from './objects'
import { Draw } from './draw'
import { Ruler } from './ruler'
import { fetchPlaceNames, placeFeatures } from './places'
import { injectStyles } from './style'
import { TileLayer } from './tiles'
import type {
  ControlsOptions,
  DragTarget,
  DzMapOptions,
  Frame,
  MapDefinition,
  MapEvents,
  PointerEventData,
  ScreenPoint,
  TileSource,
  Tool,
  View,
  WorldPoint,
} from './types'
import { VectorLayer, type CircleFeature, type Feature, type LineFeature, type PinFeature, type PointFeature, type PolygonFeature } from './vector'

type Options<F extends Feature, Omitted extends keyof F> = Omit<F, 'type' | Omitted> & { draggable?: boolean }

/** Anything drawn on the map. `render` runs once per frame in which the view or the layer changed. */
export interface Layer {
  onAdd(map: DzMap): void
  onRemove?(map: DzMap): void
  render?(frame: Frame): void
  /** Lists the layer in the layers control, together with `isVisible` and `setVisible`. */
  name?: string
  isVisible?(): boolean
  setVisible?(visible: boolean): void
}

export type PaneName = 'tiles' | 'underlay' | 'vector' | 'overlay'

const DEFAULT_API_URL = 'https://api.dzbot.de'
const DRAG_REACH_PX = 20
const DRAG_SLOP_PX = 5
const PAN_SLOP_PX = 3
const WHEEL_ZOOM_PER_PIXEL = 0.0025
const PINCH_ZOOM_PER_PIXEL = 0.01
const WHEEL_GESTURE_GAP_MS = 200
const ZOOM_ANIMATION_MS = 220
const LONG_PRESS_MS = 500
const LONG_PRESS_SLOP_PX = 8
const DOUBLE_TAP_MS = 350
const DOUBLE_TAP_SLOP_PX = 30
const KEY_PAN_PX = 100

interface ViewState {
  zoom: number
  offsetX: number
  offsetY: number
}

interface TargetPress {
  target: DragTarget
  startX: number
  startY: number
  moved: boolean
}

/** Marks a map that lives inside another, like the drawing loupe: it carries no credit of its own. */
export const NESTED = Symbol('dzmap-nested')

/** Elements over the map that handle their own input; gestures that start on them never move the map. */
export const UI_ATTRIBUTE = 'data-dzmap-ui'

function isUi(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${UI_ATTRIBUTE}]`) !== null
}

/**
 * An interactive DayZ map: tiles, layers on top of them, and pan / zoom by mouse, touch and keyboard.
 *
 * ```ts
 * const map = new DzMap('#map', { map: 'chernarus', placeNames: true })
 * map.addLayer(new VectorLayer([{ type: 'point', at: [4500, 10200], label: 'Base' }]))
 * map.on('click', (e) => console.log(e.world))
 * ```
 */
export class DzMap extends Emitter<MapEvents> {
  readonly container: HTMLElement
  readonly strings: Strings
  private readonly viewport: HTMLDivElement
  private readonly panes: Record<PaneName, HTMLDivElement>
  private readonly controls: Controls
  private readonly attribution: Attribution | null
  private readonly ownsAttribute: boolean
  private options: DzMapOptions
  private source: TileSource
  private definition: MapDefinition | null
  private view: ViewState = { zoom: 2, offsetX: 0, offsetY: 0 }
  private size = { width: 0, height: 0 }
  private type: string
  private showPlaceNames = true
  private fullscreen = false
  private readonly baseTiles: TileLayer
  private readonly placeLayer = new VectorLayer([], 'vector')
  private layers: Layer[] = []
  private dragSources = new Set<() => readonly DragTarget[]>()
  private frameRequest: number | null = null
  private lastMove = ''
  private destroyed = false
  private cleanups: Array<() => void> = []
  private placeAbort: AbortController | null = null
  private objectLayer: ObjectLayer | null = null
  private tool: Tool | null = null
  private rulerTool: Ruler | null = null
  private drawTools: Draw | null = null

  private zoomAnimation: number | null = null
  private lastWheel = { time: 0, trackpad: false }
  private pan: { x: number; y: number; ox: number; oy: number } | null = null
  private panning = false
  private press: TargetPress | null = null
  private hovered: DragTarget | null = null
  private suppressClick = false
  private pinch: { dist: number; midX: number; midY: number; zoom: number; ox: number; oy: number } | null = null
  private longPress: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null
  private lastTouchAt = 0
  private lastTap: { time: number; x: number; y: number } | null = null

  constructor(container: HTMLElement | string, options: DzMapOptions = {}) {
    super()
    const element = typeof container === 'string' ? document.querySelector<HTMLElement>(container) : container
    if (!element) throw new Error(`DzMap: no element matches ${String(container)}`)
    this.container = element
    this.options = options
    this.strings = strings(options.locale)
    this.definition = options.tiles ? null : (findMap(options.map ?? 'nasdara') ?? null)
    if (!options.tiles && !this.definition) throw new Error(`DzMap: unknown map "${options.map}"`)
    this.source = options.tiles ?? this.definition!.tiles
    this.type = this.source.types?.[0] ?? 'top'

    injectStyles(element.ownerDocument)
    if (element.hasAttribute('data-dzmap-ready')) throw new Error('DzMap: this element already holds a map')
    this.ownsAttribute = !element.hasAttribute('data-dzmap')
    if (this.ownsAttribute) element.setAttribute('data-dzmap', '')
    element.setAttribute('data-dzmap-ready', '')
    this.viewport = this.element('div', 'dzmap-viewport')
    this.viewport.tabIndex = 0
    this.viewport.setAttribute('role', 'application')
    this.viewport.setAttribute('aria-roledescription', 'map')
    this.viewport.setAttribute('aria-label', this.definition ? `${this.strings.mapLabel}: ${this.definition.name}` : this.strings.mapLabel)
    this.panes = {
      tiles: this.pane(),
      underlay: this.pane(),
      vector: this.pane(),
      overlay: this.pane(),
    }
    const controlRoot = this.element('div', 'dzmap-controls')
    element.prepend(this.viewport, controlRoot)
    this.attribution = (options as { [NESTED]?: boolean })[NESTED] ? null : new Attribution(element)
    this.controls = new Controls(this, controlRoot)

    this.baseTiles = new TileLayer({ url: this.source.url, maxZoom: this.source.maxZoom, type: this.type })
    this.baseTiles.onAdd(this)
    this.placeLayer.onAdd(this)

    this.measure()
    const center = options.center ?? this.definition?.center ?? [this.source.size / 2, this.source.size / 2]
    this.view = this.viewOn(center, options.zoom ?? 2)
    this.controls.setOptions(options.controls ?? { zoom: true })
    this.setPlaceNames(options.placeNames ?? false)
    this.bindInput()
    this.requestRender()
  }

  // ── Public API ────────────────────────────────────────────────────────────

  getMap(): MapDefinition | null {
    return this.definition
  }

  /** Switches to another built-in map or tile source; the view stays where it is. */
  setMap(map: string | TileSource): void {
    const definition = typeof map === 'string' ? findMap(map) : null
    if (typeof map === 'string' && !definition) throw new Error(`DzMap: unknown map "${map}"`)
    const next = definition ? definition.tiles : (map as TileSource)
    if (next.url === this.source.url && next.size === this.source.size && next.maxZoom === this.source.maxZoom && next.types?.join() === this.source.types?.join()) return
    this.definition = definition ?? null
    this.source = next
    if (!this.tileTypes().includes(this.type)) this.type = this.tileTypes()[0]
    this.baseTiles.setOptions({ url: this.source.url, maxZoom: this.source.maxZoom, type: this.type })
    if (this.options.placeNames === true) this.setPlaceNames(true)
    this.setViewState(this.clamp(this.view))
    this.emit('mapchange', { map: definition?.id ?? next.url })
  }

  getSize(): number {
    return this.source.size
  }

  getView(): View {
    return { center: this.getCenter(), zoom: this.view.zoom }
  }

  getCenter(): WorldPoint {
    return this.unproject([this.size.width / 2, this.size.height / 2])
  }

  getZoom(): number {
    return this.view.zoom
  }

  getMinZoom(): number {
    return Math.max(1, this.options.minZoom ?? 1)
  }

  getMaxZoom(): number {
    return Math.min(this.source.maxZoom, this.options.maxZoom ?? this.source.maxZoom)
  }

  /** Centres the map on a spot; `cover` fills the frame with the map without showing anything beside it. */
  setView(center: WorldPoint, zoom: number | 'cover' = this.view.zoom, options: { animate?: boolean } = {}): void {
    this.cancelAnimation()
    const target = this.viewOn(center, zoom)
    if (!options.animate) {
      this.setViewState(target)
      return
    }
    const from = this.getView()
    const to = { center, zoom: target.zoom }
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / (ZOOM_ANIMATION_MS * 1.5))
      const eased = 1 - Math.pow(1 - t, 3)
      const c: WorldPoint = [from.center[0] + (to.center[0] - from.center[0]) * eased, from.center[1] + (to.center[1] - from.center[1]) * eased]
      this.setViewState(this.viewOn(c, from.zoom + (to.zoom - from.zoom) * eased))
      this.zoomAnimation = t < 1 ? requestAnimationFrame(step) : null
    }
    this.zoomAnimation = requestAnimationFrame(step)
  }

  /** Zooms to a (fractional) level, keeping the spot under `anchor` (default: the centre) in place. */
  setZoom(zoom: number, anchor?: ScreenPoint): void {
    this.cancelAnimation()
    this.setViewState(this.zoomed(this.view, zoom, anchor ?? [this.size.width / 2, this.size.height / 2]))
  }

  zoomIn(): void {
    this.animateZoom(Math.floor(this.view.zoom + 1e-6) + 1)
  }

  zoomOut(): void {
    this.animateZoom(Math.ceil(this.view.zoom - 1e-6) - 1)
  }

  panBy(dx: number, dy: number): void {
    this.setViewState({ ...this.view, offsetX: this.view.offsetX + dx, offsetY: this.view.offsetY + dy })
  }

  /** Fits a set of spots into the frame, leaving `padding` pixels around them. */
  fitBounds(points: readonly WorldPoint[], options: { padding?: number; maxZoom?: number; animate?: boolean } = {}): void {
    if (points.length === 0) return
    const padding = options.padding ?? 32
    const xs = points.map((p) => p[0])
    const zs = points.map((p) => p[1])
    const width = Math.max(1, Math.max(...xs) - Math.min(...xs))
    const height = Math.max(1, Math.max(...zs) - Math.min(...zs))
    const fit = Math.log2(Math.min((this.size.width - padding * 2) / width, (this.size.height - padding * 2) / height) * this.source.size / 256)
    const zoom = Math.min(options.maxZoom ?? this.getMaxZoom(), fit)
    const center: WorldPoint = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2]
    this.setView(center, zoom, { animate: options.animate })
  }

  project(point: WorldPoint): ScreenPoint {
    const scale = this.scale(this.view.zoom)
    return [point[0] * scale - this.view.offsetX, (this.source.size - point[1]) * scale - this.view.offsetY]
  }

  unproject(point: ScreenPoint): WorldPoint {
    const scale = this.scale(this.view.zoom)
    return [(point[0] + this.view.offsetX) / scale, this.source.size - (point[1] + this.view.offsetY) / scale]
  }

  getFrame(): Frame {
    const { zoom, offsetX, offsetY } = this.view
    const scale = this.scale(zoom)
    const size = this.source.size
    return {
      zoom,
      offsetX,
      offsetY,
      width: this.size.width,
      height: this.size.height,
      scale,
      size,
      project: ([x, z]) => [x * scale - offsetX, (size - z) * scale - offsetY],
      unproject: ([x, y]) => [(x + offsetX) / scale, size - (y + offsetY) / scale],
    }
  }

  addLayer<L extends Layer>(layer: L): L {
    this.layers.push(layer)
    layer.onAdd(this)
    this.requestRender()
    return layer
  }

  removeLayer(layer: Layer): void {
    const index = this.layers.indexOf(layer)
    if (index < 0) return
    this.layers.splice(index, 1)
    layer.onRemove?.(this)
    this.requestRender()
  }

  /** A dot with an optional label; `draggable` lets mouse and finger move it. */
  addMarker(at: WorldPoint, options: Options<PointFeature, 'at'> = {}): MapObject<PointFeature> {
    const { draggable, ...feature } = options
    return this.objects().add({ type: 'point', at, ...feature }, draggable)
  }

  /** A highlighted spot: a ring around a dot, with an optional label and area. */
  addPin(at: WorldPoint, options: Options<PinFeature, 'at'> = {}): MapObject<PinFeature> {
    const { draggable, ...feature } = options
    return this.objects().add({ type: 'pin', at, ...feature }, draggable)
  }

  addPolygon(points: WorldPoint[], options: Omit<PolygonFeature, 'type' | 'points'> = {}): MapObject<PolygonFeature> {
    return this.objects().add({ type: 'polygon', points, fadeOnZoom: false, ...options })
  }

  addLine(points: WorldPoint[], options: Omit<LineFeature, 'type' | 'points'> = {}): MapObject<LineFeature> {
    return this.objects().add({ type: 'line', points, ...options })
  }

  /** A circle of `radius` metres. */
  addCircle(at: WorldPoint, radius: number, options: Omit<CircleFeature, 'type' | 'at' | 'radius'> = {}): MapObject<CircleFeature> {
    return this.objects().add({ type: 'circle', at, radius, ...options })
  }

  /** GeoJSON in world metres, as an object or a URL to fetch it from. Resolves to the layer it draws into. */
  async addGeoJSON(data: GeoJson | string, options: { fit?: boolean } = {}): Promise<VectorLayer> {
    const json = typeof data === 'string' ? ((await (await fetch(data)).json()) as GeoJson) : data
    const features = geoJsonFeatures(json)
    const layer = this.addLayer(new VectorLayer(features))
    if (options.fit) {
      const points = features.flatMap((f) => ('points' in f ? f.points : 'at' in f ? [f.at] : []))
      this.fitBounds(points)
    }
    return layer
  }

  /** The features of all vector layers under a spot of the frame, topmost first. */
  featuresAt(point: ScreenPoint): Feature[] {
    const frame = this.getFrame()
    return this.layers
      .filter((layer): layer is VectorLayer => layer instanceof VectorLayer)
      .reverse()
      .flatMap((layer) => layer.featuresAt(point, frame))
  }

  getPane(name: PaneName): HTMLDivElement {
    return this.panes[name]
  }

  /** Registers spots that can be dragged; the provider is asked on every press and hover. */
  addDragSource(provider: () => readonly DragTarget[]): () => void {
    this.dragSources.add(provider)
    return () => this.dragSources.delete(provider)
  }

  tileTypes(): string[] {
    return this.source.types?.length ? this.source.types : ['top']
  }

  tileType(): string {
    return this.type
  }

  setTileType(type: string): void {
    if (type === this.type || !this.tileTypes().includes(type)) return
    this.type = type
    this.baseTiles.setOptions({ type })
    this.controls.refresh()
    this.emit('tiletype', { type })
  }

  placeNamesVisible(): boolean {
    return this.showPlaceNames
  }

  setPlaceNamesVisible(visible: boolean): void {
    if (visible === this.showPlaceNames) return
    this.showPlaceNames = visible
    this.controls.refresh()
    this.requestRender()
    this.emit('placenames', { visible })
  }

  /** `true` loads the map's place names from dzbot, an array shows your own, `false` shows none. */
  setPlaceNames(places: DzMapOptions['placeNames']): void {
    this.options = { ...this.options, placeNames: places }
    this.placeAbort?.abort()
    this.placeAbort = null
    if (Array.isArray(places)) {
      this.placeLayer.setFeatures(placeFeatures(places))
      return
    }
    this.placeLayer.setFeatures([])
    if (!places || !this.definition) return
    const abort = new AbortController()
    this.placeAbort = abort
    fetchPlaceNames(this.options.apiUrl ?? DEFAULT_API_URL, this.definition.id, abort.signal)
      .then((response) => {
        if (!abort.signal.aborted) this.placeLayer.setFeatures(placeFeatures(response.places, response.thresholds))
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) console.warn('DzMap: place names unavailable', error)
      })
  }

  /** The ruler, also without its control: `map.ruler.start()` from your own button. */
  get ruler(): Ruler {
    if (!this.rulerTool) this.rulerTool = this.addLayer(new Ruler(this))
    return this.rulerTool
  }

  /** Editing tools: `map.draw.polygon(points, { onChange })`. */
  get draw(): Draw {
    this.drawTools ??= new Draw(this)
    return this.drawTools
  }

  getTileSource(): TileSource {
    return this.source
  }

  locale(): string {
    return this.options.locale ?? 'en'
  }

  /** Whether the map has place names to show. */
  hasPlaceNames(): boolean {
    return this.placeLayer.getFeatures().length > 0
  }

  /** The layers that can be switched on and off by name. */
  namedLayers(): Layer[] {
    return this.layers.filter((layer) => layer.name && layer.setVisible)
  }

  /** Everything the search control finds by name: place names and labelled features. */
  searchables(): Array<{ label: string; at: WorldPoint; detail?: string }> {
    const out: Array<{ label: string; at: WorldPoint; detail?: string }> = []
    for (const feature of this.placeLayer.getFeatures()) {
      if (feature.type === 'place') out.push({ label: feature.name, at: feature.at })
    }
    for (const layer of this.layers) {
      if (!(layer instanceof VectorLayer) || layer.isVisible() === false) continue
      for (const feature of layer.getFeatures()) {
        if (feature.type === 'place') out.push({ label: feature.name, at: feature.at })
        else if ((feature.type === 'point' || feature.type === 'pin') && feature.label) out.push({ label: feature.label, at: feature.at, detail: layer.name })
        else if (feature.type === 'polygon' && feature.label && feature.points.length > 0) {
          const at: WorldPoint = [
            feature.points.reduce((sum, p) => sum + p[0], 0) / feature.points.length,
            feature.points.reduce((sum, p) => sum + p[1], 0) / feature.points.length,
          ]
          out.push({ label: feature.label, at, detail: layer.name })
        }
      }
    }
    return out
  }

  /** @internal Lets the built-in controls send map events. */
  fire<K extends keyof MapEvents>(event: K, data: MapEvents[K]): void {
    this.emit(event, data)
  }

  getTool(): Tool | null {
    return this.tool
  }

  /** Hands the pointer to a tool (the ruler, a drawing tool, your own) or back to the map with `null`. */
  setTool(tool: Tool | null): void {
    if (tool === this.tool) return
    const previous = this.tool
    this.tool = tool
    previous?.deactivate?.()
    this.press = null
    this.pan = null
    this.setHovered(null)
    this.updateCursor()
    this.emit('tool', { name: tool?.name ?? null })
  }

  isFullscreen(): boolean {
    return this.fullscreen
  }

  setFullscreen(active: boolean): void {
    if (active === this.fullscreen) return
    this.fullscreen = active
    this.container.toggleAttribute('data-dzmap-fullscreen', active)
    this.controls.refresh()
    this.emit('fullscreen', { active })
  }

  setControls(controls: ControlsOptions): void {
    this.options = { ...this.options, controls }
    this.controls.setOptions(controls)
  }

  /** Changes options that need no rebuild: cursor, zoom limits, double-click zoom, keyboard. */
  setOptions(options: Pick<DzMapOptions, 'cursor' | 'minZoom' | 'maxZoom' | 'doubleClickZoom' | 'keyboard'>): void {
    this.options = { ...this.options, ...options }
    this.updateCursor()
    this.setViewState(this.clamp(this.view))
  }

  /** Re-reads the container's size; only needed where a ResizeObserver is missing. */
  invalidateSize(): void {
    const before = this.size
    this.measure()
    if (before.width === this.size.width && before.height === this.size.height) return
    this.setViewState({
      ...this.view,
      offsetX: this.view.offsetX + (before.width - this.size.width) / 2,
      offsetY: this.view.offsetY + (before.height - this.size.height) / 2,
    })
  }

  requestRender(): void {
    if (this.frameRequest !== null || this.destroyed) return
    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = null
      this.renderNow()
    })
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.cancelAnimation()
    this.placeAbort?.abort()
    if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest)
    if (this.longPress) clearTimeout(this.longPress.timer)
    for (const cleanup of this.cleanups) cleanup()
    this.setTool(null)
    for (const layer of [...this.layers]) this.removeLayer(layer)
    this.objectLayer = null
    this.rulerTool = null
    this.placeLayer.onRemove()
    this.baseTiles.onRemove()
    this.viewport.remove()
    this.controls.setOptions({})
    this.container.querySelector(':scope > .dzmap-controls')?.remove()
    this.attribution?.destroy()
    if (this.ownsAttribute) this.container.removeAttribute('data-dzmap')
    this.container.removeAttribute('data-dzmap-ready')
    this.container.removeAttribute('data-dzmap-fullscreen')
  }

  /** Creates an element in the map's document, for layers and controls. */
  element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
    const element = this.container.ownerDocument.createElement(tag)
    if (className) element.className = className
    return element
  }

  // ── View ──────────────────────────────────────────────────────────────────

  private scale(zoom: number): number {
    return (256 * Math.pow(2, zoom)) / this.source.size
  }

  private clampZoom(zoom: number): number {
    return Math.min(this.getMaxZoom(), Math.max(this.getMinZoom(), zoom))
  }

  private clamp(view: ViewState): ViewState {
    const zoom = this.clampZoom(view.zoom)
    return zoom === view.zoom ? view : this.zoomed(view, zoom, [this.size.width / 2, this.size.height / 2])
  }

  private viewOn(center: WorldPoint, target: number | 'cover'): ViewState {
    const { width, height } = this.size
    const zoom = this.clampZoom(target === 'cover' ? Math.log2(Math.max(width, height, 1) / 256) : target)
    const scale = this.scale(zoom)
    const offsetX = center[0] * scale - width / 2
    const offsetY = (this.source.size - center[1]) * scale - height / 2
    if (target !== 'cover') return { zoom, offsetX, offsetY }
    const world = 256 * Math.pow(2, zoom)
    return { zoom, offsetX: Math.min(Math.max(0, offsetX), world - width), offsetY: Math.min(Math.max(0, offsetY), world - height) }
  }

  private zoomed(view: ViewState, target: number, [ax, ay]: ScreenPoint): ViewState {
    const zoom = this.clampZoom(target)
    if (zoom === view.zoom) return view
    const factor = Math.pow(2, zoom - view.zoom)
    return { zoom, offsetX: (view.offsetX + ax) * factor - ax, offsetY: (view.offsetY + ay) * factor - ay }
  }

  private setViewState(view: ViewState): void {
    if (view.zoom === this.view.zoom && view.offsetX === this.view.offsetX && view.offsetY === this.view.offsetY) return
    this.view = view
    this.requestRender()
  }

  private animateZoom(target: number, anchor?: ScreenPoint): void {
    this.cancelAnimation()
    const from = this.view.zoom
    const to = this.clampZoom(target)
    if (Math.abs(to - from) < 0.001) return
    const at = anchor ?? [this.size.width / 2, this.size.height / 2]
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ZOOM_ANIMATION_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      this.setViewState(this.zoomed(this.view, from + (to - from) * eased, at))
      this.zoomAnimation = t < 1 ? requestAnimationFrame(step) : null
    }
    this.zoomAnimation = requestAnimationFrame(step)
  }

  private cancelAnimation(): void {
    if (this.zoomAnimation !== null) cancelAnimationFrame(this.zoomAnimation)
    this.zoomAnimation = null
  }

  private measure(): void {
    this.size = { width: this.container.clientWidth, height: this.container.clientHeight }
  }

  private renderNow(): void {
    if (this.destroyed) return
    const frame = this.getFrame()
    this.baseTiles.render(frame)
    this.placeLayer.render(frame)
    for (const layer of this.layers) layer.render?.(frame)
    this.controls.refresh()
    this.emit('render', frame)
    const view = this.getView()
    const key = `${view.center[0]}|${view.center[1]}|${view.zoom}`
    if (key !== this.lastMove) {
      this.lastMove = key
      this.emit('move', view)
    }
  }

  private pane(): HTMLDivElement {
    const pane = this.element('div', 'dzmap-pane')
    this.viewport.append(pane)
    return pane
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window | Document,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): void {
    target.addEventListener(type, handler as EventListener, options)
    this.cleanups.push(() => target.removeEventListener(type, handler as EventListener, options))
  }

  private local(clientX: number, clientY: number): ScreenPoint {
    const rect = this.viewport.getBoundingClientRect()
    return [clientX - rect.left, clientY - rect.top]
  }

  private objects(): ObjectLayer {
    this.objectLayer ??= this.addLayer(new ObjectLayer())
    return this.objectLayer
  }

  private pointerData(screen: ScreenPoint, originalEvent: Event, onPrevent?: () => void): PointerEventData {
    let features: Feature[] | undefined
    const featuresAt = () => (features ??= this.featuresAt(screen))
    return {
      world: this.unproject(screen),
      screen,
      originalEvent,
      get features() {
        return featuresAt()
      },
      preventDefault: onPrevent ?? (() => {}),
    }
  }

  private findTarget([x, y]: ScreenPoint, touch: boolean): DragTarget | null {
    if (this.tool) return null
    let best: DragTarget | null = null
    let bestDistance = Infinity
    for (const provider of this.dragSources) {
      for (const target of provider()) {
        if (touch && !target.touch) continue
        const [tx, ty] = this.project(target.at)
        const distance = Math.hypot(x - tx, y - ty)
        if (distance <= (target.reach ?? DRAG_REACH_PX) && distance < bestDistance) {
          best = target
          bestDistance = distance
        }
      }
    }
    return best
  }

  private updateCursor(): void {
    const cursor = this.press?.moved
      ? 'grabbing'
      : this.press
        ? (this.press.target.cursor ?? 'grabbing')
        : this.hovered
          ? (this.hovered.cursor ?? 'grab')
          : this.panning
            ? 'grabbing'
            : this.tool
              ? (this.tool.cursor ?? 'crosshair')
              : (this.options.cursor ?? 'grab')
    if (this.viewport.style.cursor !== cursor) this.viewport.style.cursor = cursor
  }

  private setHovered(target: DragTarget | null): void {
    if (target?.id === this.hovered?.id && (target === null) === (this.hovered === null)) {
      this.hovered = target
      return
    }
    this.hovered = target
    this.updateCursor()
    this.emit('targethover', { id: target?.id ?? null })
  }

  private moveTarget(press: TargetPress, clientX: number, clientY: number): void {
    if (!press.moved && Math.hypot(clientX - press.startX, clientY - press.startY) < DRAG_SLOP_PX) return
    const screen = this.local(clientX, clientY)
    const data = { id: press.target.id, world: this.unproject(screen), screen }
    if (!press.moved) {
      press.moved = true
      this.suppressClick = true
      this.updateCursor()
      this.emit('dragstart', data)
    }
    this.emit('drag', data)
  }

  private endTarget(press: TargetPress, clientX: number, clientY: number): void {
    this.press = null
    this.updateCursor()
    if (!press.moved) return
    const screen = this.local(clientX, clientY)
    this.emit('dragend', { id: press.target.id, world: this.unproject(screen), screen })
  }

  private contextmenu(data: PointerEventData): void {
    if (this.tool) this.tool.contextmenu?.(data)
    else this.emit('contextmenu', data)
  }

  private dblclick(screen: ScreenPoint, event: Event): void {
    if (this.tool) return
    let prevented = false
    this.emit('dblclick', this.pointerData(screen, event, () => (prevented = true)))
    if (!prevented && this.options.doubleClickZoom !== false) this.animateZoom(Math.floor(this.view.zoom + 1e-6) + 1, screen)
  }

  private bindInput(): void {
    const el = this.viewport
    const win = this.container.ownerDocument.defaultView ?? window

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.invalidateSize())
      observer.observe(this.container)
      this.cleanups.push(() => observer.disconnect())
    }

    this.listen(win.document, 'keydown', (event) => {
      const active = win.document.activeElement
      const editing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement || (active instanceof HTMLElement && active.isContentEditable)
      if (this.tool?.keydown && !editing && this.tool.keydown(event)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if (this.fullscreen && event.key === 'Escape') {
        event.stopImmediatePropagation()
        this.setFullscreen(false)
      }
    }, true)

    this.listen(el, 'wheel', (event) => {
      if (isUi(event.target)) return
      event.preventDefault()
      this.cancelAnimation()
      const anchor = this.local(event.clientX, event.clientY)
      // Trackpad pinch arrives as a wheel event with ctrlKey set
      if (event.ctrlKey) {
        this.setViewState(this.zoomed(this.view, this.view.zoom - event.deltaY * PINCH_ZOOM_PER_PIXEL, anchor))
        return
      }
      // A gesture keeps the device it started with, so a slow trackpad swipe never flips into zooming
      const now = performance.now()
      if (now - this.lastWheel.time > WHEEL_GESTURE_GAP_MS) {
        this.lastWheel.trackpad = event.deltaMode === 0 && (event.deltaX !== 0 || !Number.isInteger(event.deltaY) || Math.abs(event.deltaY) < 50)
      }
      this.lastWheel.time = now
      if (this.lastWheel.trackpad) {
        this.panBy(event.deltaX, event.deltaY)
        return
      }
      // Line-based deltas (classic mouse wheels in Firefox) are ~3 lines per notch
      const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY
      this.setViewState(this.zoomed(this.view, this.view.zoom - delta * WHEEL_ZOOM_PER_PIXEL, anchor))
    }, { passive: false })

    // ── Mouse
    const onMouseMove = (event: MouseEvent) => {
      if (this.press) {
        this.moveTarget(this.press, event.clientX, event.clientY)
        return
      }
      const pan = this.pan
      if (!pan) return
      const dx = event.clientX - pan.x
      const dy = event.clientY - pan.y
      if (!this.panning && Math.abs(dx) <= PAN_SLOP_PX && Math.abs(dy) <= PAN_SLOP_PX) return
      if (!this.panning) {
        this.panning = true
        this.suppressClick = true
        this.updateCursor()
      }
      this.setViewState({ ...this.view, offsetX: pan.ox - dx, offsetY: pan.oy - dy })
    }
    const onMouseUp = (event: MouseEvent) => {
      win.removeEventListener('mousemove', onMouseMove)
      win.removeEventListener('mouseup', onMouseUp)
      if (this.press) {
        this.endTarget(this.press, event.clientX, event.clientY)
        return
      }
      this.pan = null
      this.panning = false
      this.updateCursor()
    }
    this.cleanups.push(() => {
      win.removeEventListener('mousemove', onMouseMove)
      win.removeEventListener('mouseup', onMouseUp)
    })

    this.listen(el, 'mousedown', (event) => {
      if (event.button !== 0 || isUi(event.target)) return
      this.suppressClick = false
      this.cancelAnimation()
      win.addEventListener('mousemove', onMouseMove)
      win.addEventListener('mouseup', onMouseUp)
      // Synthetic mouse events follow every touch; touch already decided what this press does
      const target = Date.now() - this.lastTouchAt < 800 ? null : this.findTarget(this.local(event.clientX, event.clientY), false)
      if (target) {
        this.press = { target, startX: event.clientX, startY: event.clientY, moved: false }
        if (target.swallowClick) this.suppressClick = true
        this.updateCursor()
        return
      }
      this.pan = { x: event.clientX, y: event.clientY, ox: this.view.offsetX, oy: this.view.offsetY }
    })

    this.listen(el, 'mousemove', (event) => {
      if (this.press || this.pan) return
      const screen = this.local(event.clientX, event.clientY)
      this.setHovered(isUi(event.target) ? null : this.findTarget(screen, false))
      this.tool?.hover?.(this.pointerData(screen, event))
      if (this.has('hover')) this.emit('hover', this.pointerData(screen, event))
    })

    this.listen(el, 'mouseleave', () => {
      this.setHovered(null)
      this.tool?.hover?.(null)
      if (this.has('hover')) this.emit('hover', null)
    })

    this.listen(el, 'click', (event) => {
      if (isUi(event.target) || this.suppressClick) return
      const screen = this.local(event.clientX, event.clientY)
      if (screen[0] < 0 || screen[1] < 0 || screen[0] > this.size.width || screen[1] > this.size.height) return
      if (this.tool) this.tool.click?.(this.pointerData(screen, event))
      else this.emit('click', this.pointerData(screen, event))
    })

    this.listen(el, 'dblclick', (event) => {
      if (isUi(event.target) || Date.now() - this.lastTouchAt < 800) return
      this.dblclick(this.local(event.clientX, event.clientY), event)
    })

    this.listen(el, 'contextmenu', (event) => {
      if (isUi(event.target) || !(this.has('contextmenu') || this.tool)) return
      event.preventDefault()
      // Android follows a long press with a contextmenu event, which must not count twice
      if (Date.now() - this.lastTouchAt < 1500) return
      this.contextmenu(this.pointerData(this.local(event.clientX, event.clientY), event))
    })

    this.listen(el, 'keydown', (event) => {
      if (this.options.keyboard === false || event.target !== el || event.altKey || event.metaKey || event.ctrlKey) return
      const moves: Record<string, [number, number]> = { ArrowLeft: [-KEY_PAN_PX, 0], ArrowRight: [KEY_PAN_PX, 0], ArrowUp: [0, -KEY_PAN_PX], ArrowDown: [0, KEY_PAN_PX] }
      const move = moves[event.key]
      if (move) {
        event.preventDefault()
        this.panBy(move[0], move[1])
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        this.zoomIn()
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        this.zoomOut()
      }
    })

    // ── Touch
    const cancelLongPress = () => {
      if (this.longPress) clearTimeout(this.longPress.timer)
      this.longPress = null
    }
    this.cleanups.push(cancelLongPress)

    this.listen(el, 'touchstart', (event) => {
      if (isUi(event.target)) return
      this.lastTouchAt = Date.now()
      cancelLongPress()
      this.cancelAnimation()
      const touches = event.touches
      if (touches.length === 1) {
        const t = touches[0]
        const target = this.findTarget(this.local(t.clientX, t.clientY), true)
        this.press = target ? { target, startX: t.clientX, startY: t.clientY, moved: false } : null
        this.suppressClick = false
        if (target) {
          this.pan = null
          this.pinch = null
          return
        }
        if (this.has('contextmenu') || this.tool?.contextmenu) {
          const timer = setTimeout(() => {
            this.longPress = null
            this.suppressClick = true
            this.pan = null
            navigator.vibrate?.(10)
            this.contextmenu(this.pointerData(this.local(t.clientX, t.clientY), event))
          }, LONG_PRESS_MS)
          this.longPress = { timer, x: t.clientX, y: t.clientY }
        }
        this.pan = { x: t.clientX, y: t.clientY, ox: this.view.offsetX, oy: this.view.offsetY }
        this.panning = false
        this.pinch = null
      } else if (touches.length === 2) {
        this.press = null
        this.pan = null
        const [t0, t1] = [touches[0], touches[1]]
        const [midX, midY] = this.local((t0.clientX + t1.clientX) / 2, (t0.clientY + t1.clientY) / 2)
        this.suppressClick = true
        this.pinch = {
          dist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
          midX,
          midY,
          zoom: this.view.zoom,
          ox: this.view.offsetX,
          oy: this.view.offsetY,
        }
      }
    }, { passive: false })

    this.listen(el, 'touchmove', (event) => {
      if (isUi(event.target)) return
      event.preventDefault()
      const touches = event.touches
      if (this.press && touches.length === 1) {
        this.moveTarget(this.press, touches[0].clientX, touches[0].clientY)
        return
      }
      const press = this.longPress
      if (press && (touches.length !== 1 || Math.hypot(touches[0].clientX - press.x, touches[0].clientY - press.y) > LONG_PRESS_SLOP_PX)) cancelLongPress()
      if (touches.length === 1 && this.pan) {
        const dx = touches[0].clientX - this.pan.x
        const dy = touches[0].clientY - this.pan.y
        if (Math.abs(dx) > PAN_SLOP_PX || Math.abs(dy) > PAN_SLOP_PX) {
          this.panning = true
          this.suppressClick = true
        }
        this.setViewState({ ...this.view, offsetX: this.pan.ox - dx, offsetY: this.pan.oy - dy })
      } else if (touches.length === 2 && this.pinch) {
        const p = this.pinch
        const dist = Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY)
        const zoom = this.clampZoom(p.zoom + Math.log2(dist / p.dist))
        const factor = Math.pow(2, zoom - p.zoom)
        this.setViewState({ zoom, offsetX: (p.ox + p.midX) * factor - p.midX, offsetY: (p.oy + p.midY) * factor - p.midY })
      }
    }, { passive: false })

    this.listen(el, 'touchend', (event) => {
      cancelLongPress()
      if (isUi(event.target)) return
      const t = event.changedTouches[0]
      if (this.press) {
        this.endTarget(this.press, t?.clientX ?? 0, t?.clientY ?? 0)
        return
      }
      const tapped = !this.suppressClick && event.touches.length === 0 && t !== undefined
      this.pan = null
      this.pinch = null
      this.panning = false
      if (!tapped) return
      const screen = this.local(t.clientX, t.clientY)
      const now = Date.now()
      const last = this.lastTap
      if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(screen[0] - last.x, screen[1] - last.y) < DOUBLE_TAP_SLOP_PX) {
        this.lastTap = null
        this.dblclick(screen, event)
      } else {
        this.lastTap = { time: now, x: screen[0], y: screen[1] }
      }
    })

    this.listen(el, 'touchcancel', () => {
      cancelLongPress()
      this.press = null
      this.pan = null
      this.pinch = null
      this.panning = false
    })
  }
}
