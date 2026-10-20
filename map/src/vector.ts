import type { DzMap, Layer } from './DzMap'
import { cssColor } from './style'
import type { Frame, ScreenPoint, WorldPoint } from './types'

interface FeatureBase {
  id?: string | number
  /** Hidden below this zoom level. */
  minZoom?: number
  /** Hidden above this zoom level. */
  maxZoom?: number
}

interface LabelStyle {
  label?: string
  labelColor?: string
  labelOpacity?: number
  subtitle?: string
  subtitleColor?: string
  subtitleIcon?: 'people'
}

/** A dot with an optional label and an optional area around it. */
export interface PointFeature extends FeatureBase, LabelStyle {
  type: 'point'
  at: WorldPoint
  color?: string
  /** Draws the dot; off for a bare area or label. */
  dot?: boolean
  area?: { radius: number; opacity?: number; soft?: boolean }
}

/** The name of a place, centred on it; hidden with the place names. */
export interface PlaceFeature extends FeatureBase {
  type: 'place'
  at: WorldPoint
  name: string
  /** Extent in metres; without `minZoom` the name shows once this covers 30 pixels. */
  radius?: number
  color?: string
  fontSize?: number
  opacity?: number
  /** Fades the name out once the radius covers this many pixels (the place itself is in view). */
  fadeOutRadiusPx?: number
}

export interface PolygonFeature extends FeatureBase, LabelStyle {
  type: 'polygon'
  points: WorldPoint[]
  fill?: string
  stroke?: string
  fillOpacity?: number
  strokeStyle?: 'solid' | 'dotted' | 'none'
  /** Fades the fill as the map zooms in so the ground stays readable. */
  fadeOnZoom?: boolean
}

export interface LineFeature extends FeatureBase {
  type: 'line'
  points: WorldPoint[]
  color?: string
  width?: number
  opacity?: number
  /** Marks the start green and the end red. */
  endpoints?: boolean
}

export interface CircleFeature extends FeatureBase {
  type: 'circle'
  at: WorldPoint
  /** Metres. */
  radius: number
  color?: string
  fillOpacity?: number
  strokeOpacity?: number
  /** Draws a resize handle on the edge; `active` while it is hovered or dragged. */
  handle?: 'idle' | 'active'
  /** Where the handle sits instead of the right edge, while it is dragged. */
  handleAt?: ScreenPoint
}

/** A highlighted spot: a ring around a dot. */
export interface PinFeature extends FeatureBase {
  type: 'pin'
  at: WorldPoint
  label?: string
  radius?: number
}

/** A grabbable corner, drawn on top of everything. */
export interface HandleFeature extends FeatureBase {
  type: 'handle'
  at: WorldPoint
  /** Pins the handle to a screen position, e.g. under the pointer while it is dragged. */
  screen?: ScreenPoint
  color?: string
  opacity?: number
}

export type Feature = PointFeature | PlaceFeature | PolygonFeature | LineFeature | CircleFeature | PinFeature | HandleFeature

const ROUTE = 'var(--dzmap-route,#f59e0b)'
const ROUTE_START = 'var(--dzmap-route-start,#22c55e)'
const ROUTE_END = 'var(--dzmap-route-end,#ef4444)'
const MARKER = 'var(--dzmap-marker,#ef4444)'
const MARKER_RING = 'var(--dzmap-marker-ring,#fbbf24)'
const WAYPOINT = 'var(--dzmap-waypoint,#f97316)'
const BLACK = 'var(--dzmap-black,#000)'
const WHITE = 'var(--dzmap-white,#fff)'
const HALO = 'rgba(0,0,0,0.85)'

const CHAR_W = 0.6
const LINE_H = 1.3
const LABEL_PAD = 2

interface PendingLabel {
  x: number
  y: number
  text: string
  subtitle?: string
  subtitleFill?: string
  subtitleIcon?: 'people'
  fill: string
  opacity: number
  fontSize: number
  fontWeight: number
  strokeWidth: number
  centered: boolean
}

let layerCount = 0

function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function n(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10) : '0'
}

function o(value: number): number {
  return Math.round(value * 1000) / 1000
}

function offscreen(x: number, y: number, frame: Frame, margin: number): boolean {
  return x < -margin || x > frame.width + margin || y < -margin || y > frame.height + margin
}

/**
 * Points, places, shapes and lines drawn as SVG. Labels never overlap: each one takes the first free spot
 * around its feature.
 */
export class VectorLayer implements Layer {
  private map: DzMap | null = null
  private svg: SVGSVGElement | null = null
  private readonly uid = `dzv${++layerCount}`

  readonly name?: string
  private readonly pane: 'underlay' | 'vector' | 'overlay'
  private visible = true

  /** `name` lists the layer in the layers control. */
  constructor(private features: Feature[] = [], options: 'underlay' | 'vector' | 'overlay' | { pane?: 'underlay' | 'vector' | 'overlay'; name?: string } = {}) {
    const resolved = typeof options === 'string' ? { pane: options } : options
    this.pane = resolved.pane ?? 'vector'
    this.name = resolved.name
  }

  isVisible(): boolean {
    return this.visible
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    if (this.svg) this.svg.style.display = visible ? '' : 'none'
  }

  setFeatures(features: Feature[]): void {
    this.features = features
    this.map?.requestRender()
  }

  getFeatures(): readonly Feature[] {
    return this.features
  }

  /** The features under a spot of the frame, topmost first. Place names are never hit. */
  featuresAt([px, py]: ScreenPoint, frame: Frame): Feature[] {
    const hits: Feature[] = []
    const near = (at: WorldPoint, reach: number) => {
      const [x, y] = frame.project(at)
      return Math.hypot(px - x, py - y) <= reach
    }
    if (!this.visible) return []
    for (const feature of this.features) {
      if (feature.minZoom !== undefined && frame.zoom < feature.minZoom) continue
      if (feature.maxZoom !== undefined && frame.zoom > feature.maxZoom) continue
      let hit = false
      switch (feature.type) {
        case 'point':
          hit = (feature.dot !== false && near(feature.at, 8)) || (!!feature.area && near(feature.at, feature.area.radius * frame.scale))
          break
        case 'pin':
          hit = near(feature.at, 12)
          break
        case 'handle':
          hit = near(feature.at, 9)
          break
        case 'circle':
          hit = near(feature.at, feature.radius * frame.scale)
          break
        case 'polygon':
          hit = insidePolygon([px, py], feature.points.map((p) => frame.project(p)))
          break
        case 'line': {
          const pts = feature.points.map((p) => frame.project(p))
          for (let i = 1; i < pts.length && !hit; i++) hit = segmentDistance([px, py], pts[i - 1], pts[i]) <= Math.max(6, (feature.width ?? 2.5) / 2 + 3)
          break
        }
      }
      if (hit) hits.push(feature)
    }
    return hits.reverse()
  }

  onAdd(map: DzMap): void {
    this.map = map
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.svg.setAttribute('class', 'dzmap-svg')
    map.getPane(this.pane).append(this.svg)
  }

  onRemove(): void {
    this.svg?.remove()
    this.svg = null
    this.map = null
  }

  render(frame: Frame): void {
    if (!this.svg || !this.map) return
    const showPlaces = this.map.placeNamesVisible()
    const defs: string[] = []
    const background: string[] = []
    const shapes: string[] = []
    const labels: PendingLabel[] = []
    const { zoom, scale } = frame

    this.features.forEach((feature, index) => {
      if (feature.minZoom !== undefined && feature.type !== 'place' && zoom < feature.minZoom) return
      if (feature.maxZoom !== undefined && zoom > feature.maxZoom) return
      switch (feature.type) {
        case 'polygon': {
          if (feature.points.length === 0) return
          const pts = feature.points.map((p) => frame.project(p))
          const xs = pts.map((p) => p[0])
          const ys = pts.map((p) => p[1])
          const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
          if (maxX < -20 || minX > frame.width + 20 || maxY < -20 || minY > frame.height + 20) return
          const fade = feature.fadeOnZoom === false ? 1 : Math.max(0.2, 1 - ((zoom - 1) / 5) * 0.8)
          const strokeOpacity = feature.fadeOnZoom === false ? 0.8 : Math.max(0.5, 0.8 - ((zoom - 1) / 5) * 0.3)
          const none = feature.strokeStyle === 'none'
          shapes.push(
            `<polygon points="${pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' ')}" style="fill:${esc(cssColor(feature.fill))};stroke:${esc(cssColor(feature.stroke ?? feature.fill))}"` +
              ` fill-opacity="${o((feature.fillOpacity ?? 0.3) * fade)}" stroke-width="${none ? 0 : 1.5}" stroke-opacity="${none ? 0 : o(strokeOpacity)}"` +
              `${feature.strokeStyle === 'dotted' ? ' stroke-dasharray="2 5"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`,
          )
          const opacity = feature.labelOpacity ?? 1
          if (feature.label && opacity > 0) {
            const raw = Math.sqrt((maxX - minX) * (maxY - minY)) * 0.12
            if (raw < 9) return
            labels.push({
              x: xs.reduce((s, v) => s + v, 0) / xs.length,
              y: ys.reduce((s, v) => s + v, 0) / ys.length,
              text: feature.label,
              subtitle: feature.subtitle,
              subtitleFill: feature.subtitleColor ? cssColor(feature.subtitleColor) : undefined,
              subtitleIcon: feature.subtitle ? feature.subtitleIcon : undefined,
              fill: cssColor(feature.labelColor ?? feature.stroke ?? feature.fill),
              opacity,
              fontSize: Math.min(24, raw),
              fontWeight: 600,
              strokeWidth: 3,
              centered: true,
            })
          }
          return
        }
        case 'point': {
          const [x, y] = frame.project(feature.at)
          if (offscreen(x, y, frame, 20)) return
          const color = cssColor(feature.color)
          if (feature.area) {
            const r = feature.area.radius * scale
            const base = feature.area.opacity ?? 0.15
            if (feature.area.soft) {
              const id = `${this.uid}-g${index}`
              const fuzzy = r * 1.16
              defs.push(
                `<radialGradient id="${id}" cx="${n(x)}" cy="${n(y)}" r="${n(fuzzy)}" gradientUnits="userSpaceOnUse">` +
                  `<stop offset="0%" style="stop-color:${esc(color)}" stop-opacity="${Math.min(0.4, base * 2.2)}"/>` +
                  `<stop offset="42%" style="stop-color:${esc(color)}" stop-opacity="${Math.min(0.24, base * 1.45)}"/>` +
                  `<stop offset="76%" style="stop-color:${esc(color)}" stop-opacity="${Math.min(0.1, base * 0.7)}"/>` +
                  `<stop offset="100%" style="stop-color:${esc(color)}" stop-opacity="0"/></radialGradient>`,
              )
              shapes.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(fuzzy)}" fill="url(#${id})"/>`)
            } else {
              shapes.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" style="fill:${esc(color)};stroke:${esc(color)}" fill-opacity="${base}" stroke-width="1.5" stroke-opacity="0.6"/>`)
            }
          }
          if (feature.dot !== false) {
            shapes.push(`<circle cx="${n(x)}" cy="${n(y)}" r="5" style="fill:${esc(color)};stroke:${BLACK}" stroke-width="1" fill-opacity="0.9"/>`)
          }
          const opacity = feature.labelOpacity ?? 1
          if (feature.label && opacity > 0) {
            labels.push({
              x, y,
              text: feature.label,
              subtitle: feature.subtitle,
              subtitleFill: feature.subtitleColor ? cssColor(feature.subtitleColor) : undefined,
              subtitleIcon: feature.subtitle ? feature.subtitleIcon : undefined,
              fill: cssColor(feature.labelColor ?? feature.color),
              opacity,
              fontSize: 11,
              fontWeight: 400,
              strokeWidth: 2.5,
              centered: false,
            })
          }
          return
        }
        case 'place': {
          if (!showPlaces) return
          const [x, y] = frame.project(feature.at)
          if (offscreen(x, y, frame, 20)) return
          const radiusPx = (feature.radius ?? 0) * scale
          const visible = feature.minZoom !== undefined ? zoom >= feature.minZoom : feature.radius ? radiusPx >= 30 : true
          let fade = 1
          if (feature.fadeOutRadiusPx && feature.radius) {
            fade = Math.max(0, Math.min(1, (feature.fadeOutRadiusPx * 1.5 - radiusPx) / (feature.fadeOutRadiusPx * 0.5)))
          }
          const opacity = (feature.opacity ?? 1) * fade
          if (!visible || opacity <= 0) return
          background.push(
            `<text x="${n(x)}" y="${n(y)}" font-size="${feature.fontSize ?? 11}" font-weight="600" opacity="${o(opacity)}" style="fill:${esc(cssColor(feature.color, 'white'))}"` +
              ` stroke="${HALO}" stroke-width="3" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">${esc(feature.name)}</text>`,
          )
          return
        }
        case 'line': {
          if (feature.points.length < 2) return
          const pts = feature.points.map((p) => frame.project(p))
          shapes.push(
            `<polyline points="${pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' ')}" fill="none" style="stroke:${esc(cssColor(feature.color ?? ROUTE))}"` +
              ` stroke-width="${feature.width ?? 2.5}" stroke-opacity="${feature.opacity ?? 0.85}" stroke-linejoin="round" stroke-linecap="round"/>`,
          )
          if (feature.endpoints) {
            const [first, last] = [pts[0], pts[pts.length - 1]]
            shapes.push(`<circle cx="${n(first[0])}" cy="${n(first[1])}" r="5" style="fill:${ROUTE_START};stroke:${BLACK}" stroke-width="1.5"/>`)
            shapes.push(`<circle cx="${n(last[0])}" cy="${n(last[1])}" r="5" style="fill:${ROUTE_END};stroke:${BLACK}" stroke-width="1.5"/>`)
          }
          return
        }
        case 'circle': {
          const [cx, cy] = frame.project(feature.at)
          const r = feature.radius * scale
          if (cx + r < -10 || cx - r > frame.width + 10 || cy + r < -10 || cy - r > frame.height + 10) return
          const color = esc(cssColor(feature.color))
          shapes.push(
            `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" style="fill:${color};stroke:${color}" fill-opacity="${feature.fillOpacity ?? 0.15}" stroke-width="1.5" stroke-opacity="${feature.strokeOpacity ?? 0.75}"/>`,
          )
          if (feature.handle && r > 15) {
            const active = feature.handle === 'active'
            const [hx, hy] = feature.handleAt ?? [cx + r, cy]
            shapes.push(`<circle cx="${n(hx)}" cy="${n(hy)}" r="${active ? 6 : 5}" style="fill:${WHITE};stroke:${color}" stroke-width="2" opacity="${active ? 1 : 0.85}"/>`)
          }
          return
        }
        case 'pin': {
          const [x, y] = frame.project(feature.at)
          if (offscreen(x, y, frame, 40)) return
          if (feature.radius) {
            shapes.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(feature.radius * scale)}" style="fill:${MARKER};stroke:${MARKER}" fill-opacity="0.12" stroke-width="1.5" stroke-opacity="0.6"/>`)
          }
          shapes.push(`<circle cx="${n(x)}" cy="${n(y)}" r="10" fill="none" style="stroke:${MARKER_RING}" stroke-width="3"/>`)
          shapes.push(`<circle cx="${n(x)}" cy="${n(y)}" r="4" style="fill:${MARKER};stroke:${BLACK}" stroke-width="1"/>`)
          if (feature.label) {
            labels.push({ x, y, text: feature.label, fill: MARKER_RING, opacity: 1, fontSize: 12, fontWeight: 700, strokeWidth: 2.5, centered: false })
          }
          return
        }
        case 'handle': {
          const [x, y] = feature.screen ?? frame.project(feature.at)
          if (!feature.screen && offscreen(x, y, frame, 20)) return
          shapes.push(
            `<circle cx="${n(x)}" cy="${n(y)}" r="7" style="fill:${esc(cssColor(feature.color ?? WAYPOINT))};stroke:${WHITE}" stroke-width="2" opacity="${feature.opacity ?? 1}"/>`,
          )
          return
        }
      }
    })

    this.svg.innerHTML =
      (defs.length ? `<defs>${defs.join('')}</defs>` : '') + background.join('') + shapes.join('') + placeLabels(labels).join('')
  }
}

function insidePolygon([x, y]: ScreenPoint, pts: ScreenPoint[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function segmentDistance([x, y]: ScreenPoint, [x1, y1]: ScreenPoint, [x2, y2]: ScreenPoint): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

// Greedy placement: every label takes the first candidate spot that overlaps no label placed before it
function placeLabels(labels: PendingLabel[]): string[] {
  const placed: Array<{ x: number; y: number; w: number; h: number }> = []
  const out: string[] = []
  for (const lbl of labels) {
    const subSize = lbl.fontSize * 0.92
    const iconW = lbl.subtitleIcon ? subSize * 0.95 : 0
    const gapW = lbl.subtitleIcon && lbl.subtitle ? subSize * 0.28 : 0
    const subW = lbl.subtitle ? lbl.subtitle.length * subSize * CHAR_W + iconW + gapW : 0
    const w = Math.max(lbl.text.length * lbl.fontSize * CHAR_W, subW)
    const h = lbl.fontSize * LINE_H + (lbl.subtitle ? subSize * LINE_H : 0)
    const candidates: [number, number][] = lbl.centered
      ? [[-w / 2, -h / 2], [-w / 2, -(h + 4)], [-w / 2, 4], [8, -h / 2], [-(w + 8), -h / 2]]
      : [[8, -h * 0.4], [8, -(h + 2)], [8, h * 0.3], [-(w + 8), -h * 0.4], [-(w + 8), -(h + 2)], [-(w + 8), h * 0.3], [-w / 2, -(h + 6)], [-w / 2, 8]]

    let bx = lbl.x + candidates[0][0]
    let by = lbl.y + candidates[0][1]
    for (const [dx, dy] of candidates) {
      const cx = lbl.x + dx
      const cy = lbl.y + dy
      const overlaps = placed.some((b) => cx - LABEL_PAD < b.x + b.w && cx + w + LABEL_PAD > b.x && cy - LABEL_PAD < b.y + b.h && cy + h + LABEL_PAD > b.y)
      if (!overlaps) {
        bx = cx
        by = cy
        break
      }
    }
    placed.push({ x: bx, y: by, w, h })

    const fill = esc(lbl.fill)
    out.push(
      `<text x="${n(bx + (lbl.centered ? w / 2 : 0))}" y="${n(by + lbl.fontSize)}" font-size="${n(lbl.fontSize)}" font-weight="${lbl.fontWeight}" opacity="${lbl.opacity}"` +
        ` style="fill:${fill}" stroke="${HALO}" stroke-width="${lbl.strokeWidth}" paint-order="stroke"${lbl.centered ? ' text-anchor="middle"' : ''}>${esc(lbl.text)}</text>`,
    )
    if (!lbl.subtitle) continue
    const subY = by + lbl.fontSize + subSize * 1.1
    const subFill = esc(lbl.subtitleFill ?? lbl.fill)
    const left = bx + (w - subW) / 2
    if (lbl.subtitleIcon === 'people') {
      const iconX = left + iconW * 0.42
      out.push(
        `<g opacity="${lbl.opacity}" style="fill:${subFill}" stroke="${HALO}" stroke-width="${n(Math.max(1, lbl.strokeWidth * 0.38))}" paint-order="stroke">` +
          `<circle cx="${n(iconX)}" cy="${n(subY - subSize * 0.56)}" r="${n(subSize * 0.14)}"/>` +
          `<ellipse cx="${n(iconX)}" cy="${n(subY - subSize * 0.21)}" rx="${n(subSize * 0.22)}" ry="${n(subSize * 0.17)}"/></g>`,
      )
    }
    out.push(
      `<text x="${n(left + iconW + gapW)}" y="${n(subY)}" font-size="${n(subSize)}" font-weight="${Math.max(600, lbl.fontWeight)}" opacity="${lbl.opacity}"` +
        ` style="fill:${subFill}" stroke="${HALO}" stroke-width="${n(Math.max(1.6, lbl.strokeWidth * 0.82))}" paint-order="stroke">${esc(lbl.subtitle)}</text>`,
    )
  }
  return out
}
