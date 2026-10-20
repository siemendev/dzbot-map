import type { DzMap, Layer } from './DzMap'
import { tileUrl } from './maps'
import type { Frame } from './types'

const PREFETCH_DELAY_MS = 250
const PREFETCH_BORDER = 2

// Holding the images keeps their decoded data alive when a tile scrolls out and back in. Never evicted: the
// number of tiles across all levels is bounded and small.
const imageCache = new Map<string, HTMLImageElement>()

function prefetch(url: string): void {
  if (imageCache.has(url)) return
  const img = new Image()
  img.src = url
  imageCache.set(url, img)
}

export interface TileLayerOptions {
  /** URL template with `{z}`, `{x}`, `{y}` and optionally `{type}`. */
  url: string
  maxZoom: number
  type?: string
  /** Whether a tile exists; tiles it rejects are never requested. */
  has?: (z: number, x: number, y: number) => boolean
  /** Covers tiles still loading with the level below. Off for transparent overlays, where it would show twice. */
  backdrop?: boolean
}

interface Placement {
  left: number
  top: number
  width: number
  height: number
}

// Scaled tiles get soft edges, so each one overlaps its neighbour by a pixel to hide the seam
function place(col: number, row: number, size: number): Placement {
  const left = Math.round(col * size)
  const top = Math.round(row * size)
  const overlap = size === 256 ? 0 : 1
  return { left, top, width: Math.round((col + 1) * size) - left + overlap, height: Math.round((row + 1) * size) - top + overlap }
}

/** A pyramid of 256 px tiles in the map's tile projection. */
export class TileLayer implements Layer {
  private map: DzMap | null = null
  private world: HTMLDivElement | null = null
  private images = new Map<string, HTMLImageElement>()
  private prefetchTimer: ReturnType<typeof setTimeout> | undefined
  private prefetchKey = ''

  constructor(private options: TileLayerOptions) {}

  setOptions(options: Partial<TileLayerOptions>): void {
    this.options = { ...this.options, ...options }
    this.map?.requestRender()
  }

  onAdd(map: DzMap): void {
    this.map = map
    this.world = map.element('div', 'dzmap-world')
    map.getPane('tiles').append(this.world)
  }

  onRemove(): void {
    clearTimeout(this.prefetchTimer)
    this.world?.remove()
    this.world = null
    this.images.clear()
    this.map = null
  }

  private url(z: number, x: number, y: number): string | null {
    const { url, type = 'top', has } = this.options
    if (has && !has(z, x, y)) return null
    return tileUrl(url, type, z, x, y)
  }

  render(frame: Frame): void {
    const world = this.world
    if (!world) return
    const { maxZoom, backdrop = true } = this.options
    const tileZoom = Math.min(maxZoom, Math.max(1, Math.round(frame.zoom)))
    const tileSize = 256 * Math.pow(2, frame.zoom - tileZoom)
    const count = Math.pow(2, tileZoom)
    const worldSize = 256 * Math.pow(2, frame.zoom)
    const colMin = Math.max(0, Math.floor(frame.offsetX / tileSize) - 1)
    const colMax = Math.min(count - 1, Math.floor((frame.offsetX + frame.width) / tileSize) + 1)
    const rowMin = Math.max(0, Math.floor(frame.offsetY / tileSize) - 1)
    const rowMax = Math.min(count - 1, Math.floor((frame.offsetY + frame.height) / tileSize) + 1)

    // whole pixels: tiles at fractional positions get anti-aliased edges that show as seams
    world.style.left = `${-Math.round(frame.offsetX)}px`
    world.style.top = `${-Math.round(frame.offsetY)}px`
    world.style.width = `${worldSize}px`
    world.style.height = `${worldSize}px`

    const wanted = new Map<string, { box: Placement; layer: number }>()
    if (backdrop && tileZoom > 1) {
      const backCount = Math.pow(2, tileZoom - 1)
      for (let col = Math.max(0, Math.floor(colMin / 2)); col <= Math.min(backCount - 1, Math.floor(colMax / 2)); col++) {
        for (let row = Math.max(0, Math.floor(rowMin / 2)); row <= Math.min(backCount - 1, Math.floor(rowMax / 2)); row++) {
          const url = this.url(tileZoom - 1, col, row)
          if (url) wanted.set(url, { box: place(col, row, tileSize * 2), layer: 0 })
        }
      }
    }
    for (let col = colMin; col <= colMax; col++) {
      for (let row = rowMin; row <= rowMax; row++) {
        const url = this.url(tileZoom, col, row)
        if (!url) continue
        prefetch(url)
        wanted.set(url, { box: place(col, row, tileSize), layer: 1 })
      }
    }

    for (const [url, img] of this.images) {
      if (wanted.has(url)) continue
      img.remove()
      this.images.delete(url)
    }
    for (const [url, { box, layer }] of wanted) {
      let img = this.images.get(url)
      if (!img) {
        img = document.createElement('img')
        img.alt = ''
        img.draggable = false
        img.decoding = 'async'
        // A missing tile would otherwise show the browser's broken-image icon over the backdrop
        img.onerror = () => {
          img!.style.visibility = 'hidden'
          imageCache.delete(url)
        }
        img.src = url
        this.images.set(url, img)
        world.append(img)
      }
      const style = img.style
      style.left = `${box.left}px`
      style.top = `${box.top}px`
      style.width = `${box.width}px`
      style.height = `${box.height}px`
      style.zIndex = String(layer)
    }

    const key = `${this.options.url}|${this.options.type}|${tileZoom}|${colMin}|${colMax}|${rowMin}|${rowMax}`
    if (key !== this.prefetchKey) {
      this.prefetchKey = key
      clearTimeout(this.prefetchTimer)
      // Waits until the view settles: a fast pinch through several levels would request every level it passes
      this.prefetchTimer = setTimeout(() => this.prefetchAround(tileZoom, colMin, colMax, rowMin, rowMax), PREFETCH_DELAY_MS)
    }
  }

  private prefetchAround(level: number, colMin: number, colMax: number, rowMin: number, rowMax: number): void {
    const { maxZoom } = this.options
    const fetch = (z: number, x: number, y: number) => {
      const url = this.url(z, x, y)
      if (url) prefetch(url)
    }
    const count = Math.pow(2, level)
    const c0 = Math.max(0, colMin - PREFETCH_BORDER)
    const c1 = Math.min(count - 1, colMax + PREFETCH_BORDER)
    const r0 = Math.max(0, rowMin - PREFETCH_BORDER)
    const r1 = Math.min(count - 1, rowMax + PREFETCH_BORDER)
    for (let col = c0; col <= c1; col++) for (let row = r0; row <= r1; row++) fetch(level, col, row)
    if (level - 1 >= 1) {
      const outCount = Math.pow(2, level - 1)
      for (let col = Math.max(0, Math.floor(c0 / 2)); col <= Math.min(outCount - 1, Math.ceil(c1 / 2)); col++) {
        for (let row = Math.max(0, Math.floor(r0 / 2)); row <= Math.min(outCount - 1, Math.ceil(r1 / 2)); row++) fetch(level - 1, col, row)
      }
    }
    if (level + 1 <= maxZoom) {
      const inCount = Math.pow(2, level + 1)
      for (let col = Math.max(0, c0 * 2); col <= Math.min(inCount - 1, (c1 + 1) * 2 - 1); col++) {
        for (let row = Math.max(0, r0 * 2); row <= Math.min(inCount - 1, (r1 + 1) * 2 - 1); row++) fetch(level + 1, col, row)
      }
    }
  }
}
