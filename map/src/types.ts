import type { Feature } from './vector'

/** A spot in the world in metres: `[x, z]` — x grows east, z grows north, origin in the south-west corner. */
export type WorldPoint = [x: number, z: number]

/** A spot in the map's frame in CSS pixels from its top-left corner. */
export type ScreenPoint = [x: number, y: number]

export type Locale = 'en' | 'de'

export interface TileSource {
  /**
   * URL template of a 256 px tile. `{z}` is the zoom level, `{x}` the column, `{y}` the row (row 0 at the
   * north edge) and `{type}` the tile type (`top` or `sat`).
   */
  url: string
  /** Edge length in metres that the whole tile pyramid covers. */
  size: number
  /** Deepest zoom level that has tiles. */
  maxZoom: number
  /** Tile types the source offers; the first is the default. */
  types?: string[]
}

export interface MapDefinition {
  id: string
  name: string
  /** The DayZ mission of this map, as servers report it. */
  mission: string
  tiles: TileSource
  /** Edge length in metres of the terrain itself. */
  worldSize: number
  center: WorldPoint
}

/** Everything a layer needs to draw one frame. */
export interface Frame {
  zoom: number
  /** Pixel position of the frame's top-left corner in the world at this zoom. */
  offsetX: number
  offsetY: number
  width: number
  height: number
  /** CSS pixels per metre at this zoom. */
  scale: number
  /** Edge length in metres of the tile pyramid. */
  size: number
  project(point: WorldPoint): ScreenPoint
  unproject(point: ScreenPoint): WorldPoint
}

export interface View {
  center: WorldPoint
  zoom: number
}

export type ControlPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'right' | 'left'

export interface ControlOptions {
  position?: ControlPosition
  /** Extra classes on the control's element, e.g. to move it out from under your own panels. */
  className?: string
}

export interface SearchResult {
  label: string
  /** A second line, e.g. what kind of thing it is. */
  detail?: string
  at: WorldPoint
  /** Zoom to show it at; default: at least 5. */
  zoom?: number
}

/** Adds your own results to the search control, e.g. from your server's data. May be async. */
export interface SearchProvider {
  search(query: string): SearchResult[] | Promise<SearchResult[]>
}

export interface Stamina {
  max: number
  /** `sprintStaminaModifierErc`: 1 drains like vanilla, 0 never drains. */
  sprintDrain: number
}

export interface ControlsOptions {
  zoom?: boolean | ControlOptions
  fullscreen?: boolean | ControlOptions
  /** Toggles place names; shown only while the map has place names. */
  placeNames?: boolean | ControlOptions
  /** Switches between tile types (map / satellite); shown only when the source has more than one. */
  tileType?: boolean | ControlOptions
  /** Measures routes with distance and sprint time; sits with the zoom buttons unless placed. */
  ruler?: boolean | (ControlOptions & { stamina?: Stamina; staminaSource?: string; panelClassName?: string })
  /** The coordinate under the mouse, Ctrl/Cmd+C copies it; hidden on touch screens. */
  coordinates?: boolean | ControlOptions
  /** Searches place names, coordinates, labelled features and your providers. */
  search?: boolean | (ControlOptions & { providers?: SearchProvider[]; placeholder?: string })
  /** Switches named layers and the place names on and off. */
  layers?: boolean | ControlOptions
  /** Switches between the built-in maps. */
  mapSwitcher?: boolean | ControlOptions
}

export interface PlaceName {
  name: string
  x: number
  z: number
  /** Extent of the place in metres; bigger places show their names from further out. */
  radius?: number
  type?: string | null
}

export interface DzMapOptions {
  /** A built-in map (`nasdara`, `chernarus`, `livonia`, `sakhal`). */
  map?: string
  /** Your own tiles instead of a built-in map. */
  tiles?: TileSource
  center?: WorldPoint
  /** A zoom level, or `cover` to fill the frame edge to edge with the map. */
  zoom?: number | 'cover'
  minZoom?: number
  maxZoom?: number
  controls?: ControlsOptions
  /** `true` loads the map's place names from dzbot; an array shows your own. */
  placeNames?: boolean | PlaceName[]
  locale?: Locale
  /** Cursor over the map while nothing is under the pointer. */
  cursor?: string
  doubleClickZoom?: boolean
  keyboard?: boolean
  /** Base URL of the dzbot API that serves place names. */
  apiUrl?: string
}

export interface PointerEventData {
  world: WorldPoint
  screen: ScreenPoint
  /** The features of all vector layers under the pointer, topmost first. */
  readonly features: Feature[]
  originalEvent: Event
  /** Stops the map's own reaction (double-click zoom). */
  preventDefault(): void
}

/** Something under the pointer that can be picked up and moved. The map draws nothing for it. */
export interface DragTarget {
  id: string | number
  at: WorldPoint
  /** Touch can drag it too; otherwise a finger pans the map over it and only the mouse drags. */
  touch?: boolean
  /** How close the pointer must come, in pixels. */
  reach?: number
  cursor?: string
  /** A press on it is never a click on the map, even when it does not move. */
  swallowClick?: boolean
}

export interface DragEventData {
  id: string | number
  world: WorldPoint
  screen: ScreenPoint
}

/**
 * A mode that takes over the pointer, like the ruler: while it is active, clicks, long presses and keys go to
 * it instead of the map's listeners, and nothing can be dragged.
 */
export interface Tool {
  name: string
  cursor?: string
  click?(event: PointerEventData): void
  /** Right click, or a long press on touch. */
  contextmenu?(event: PointerEventData): void
  hover?(event: PointerEventData | null): void
  /** Return true when the key was handled. */
  keydown?(event: KeyboardEvent): boolean
  /** Another tool took over, or the tool was switched off. */
  deactivate?(): void
}

export interface MapEvents {
  click: PointerEventData
  dblclick: PointerEventData
  /** Right click with a mouse, long press on touch. */
  contextmenu: PointerEventData
  /** Where the pointer rests, `null` once it leaves. Not sent while dragging. */
  hover: PointerEventData | null
  move: View
  render: Frame
  dragstart: DragEventData
  drag: DragEventData
  dragend: DragEventData
  /** The drag target under the pointer changed. */
  targethover: { id: string | number | null }
  fullscreen: { active: boolean }
  placenames: { visible: boolean }
  tiletype: { type: string }
  /** The active tool changed; `null` when none is active. */
  tool: { name: string | null }
  /** A search result was picked. */
  search: SearchResult
  /** `setMap` or the map switcher changed the map; `map` is the built-in map's id or the tile URL. */
  mapchange: { map: string }
}
