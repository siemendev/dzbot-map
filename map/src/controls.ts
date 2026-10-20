import { coordinatesControl } from './coordinates'
import type { DzMap } from './DzMap'
import { layersControl } from './layers'
import { MAPS } from './maps'
import { searchControl } from './search'
import type { ControlOptions, ControlPosition, ControlsOptions } from './types'

const ICONS = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
}

function icon(name: keyof typeof ICONS): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
}

function resolve<T extends ControlOptions>(option: boolean | T | undefined, fallback: ControlPosition): T | null {
  if (!option) return null
  if (option === true) return { position: fallback } as T
  return option.className && !option.position ? option : { ...option, position: option.position ?? fallback }
}

/** The built-in controls over the map. Each one only drives the map's public API. */
export class Controls {
  private elements: HTMLElement[] = []
  private groups = new Map<ControlPosition, HTMLElement>()
  private refreshers: Array<() => void> = []
  private cleanups: Array<() => void> = []

  constructor(private readonly map: DzMap, private readonly root: HTMLElement) {}

  setOptions(options: ControlsOptions): void {
    for (const cleanup of this.cleanups) cleanup()
    for (const element of this.elements) element.remove()
    this.elements = []
    this.groups.clear()
    this.refreshers = []
    this.cleanups = []
    const map = this.map
    const t = map.strings

    const search = resolve(options.search, 'top-left')
    if (search) {
      const element = map.element('div')
      this.group(search).append(element)
      this.cleanups.push(searchControl(map, element, search.providers ?? [], search.placeholder))
    }

    const tileType = resolve(options.tileType, 'top-left')
    if (tileType && map.tileTypes().length > 1) {
      const button = this.button(this.group(tileType), 'layers', t.switchTileType, () => {
        const types = map.tileTypes()
        map.setTileType(types[(types.indexOf(map.tileType()) + 1) % types.length])
      })
      button.dataset.label = ''
      button.append(document.createTextNode(''))
      this.refreshers.push(() => {
        button.lastChild!.textContent = map.tileType() === 'sat' ? t.satellite : t.map
      })
    }

    const placeNames = resolve(options.placeNames, 'top-left')
    if (placeNames) {
      const button = this.button(this.group(placeNames), 'type', t.names, () => map.setPlaceNamesVisible(!map.placeNamesVisible()))
      button.dataset.label = ''
      button.append(document.createTextNode(t.names))
      this.refreshers.push(() => {
        const visible = map.placeNamesVisible()
        button.setAttribute('aria-pressed', String(visible))
        button.title = visible ? t.hideNames : t.showNames
      })
    }

    const switcher = resolve(options.mapSwitcher, 'top-right')
    if (switcher) {
      const select = map.element('select', 'dzmap-select')
      select.setAttribute('aria-label', t.chooseMap)
      select.setAttribute('data-dzmap-ui', '')
      select.innerHTML = MAPS.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')
      select.addEventListener('change', () => {
        const next = MAPS.find((m) => m.id === select.value)
        if (!next) return
        map.setMap(next.id)
        map.setView(next.center, 'cover')
      })
      this.refreshers.push(() => {
        const id = map.getMap()?.id
        if (id && select.value !== id) select.value = id
      })
      this.group(switcher).append(select)
    }

    const fullscreen = resolve(options.fullscreen, 'top-right')
    if (fullscreen) {
      const button = this.button(this.group(fullscreen), 'maximize', t.fullscreen, () => map.setFullscreen(!map.isFullscreen()))
      this.refreshers.push(() => {
        const active = map.isFullscreen()
        const label = active ? t.exitFullscreen : t.fullscreen
        if (button.title === label) return
        button.title = label
        button.setAttribute('aria-label', label)
        button.innerHTML = icon(active ? 'minimize' : 'maximize')
      })
    }

    const layers = resolve(options.layers, 'top-right')
    if (layers) this.cleanups.push(layersControl(map, this.group(layers)))

    const zoom = resolve(options.zoom, 'right')
    const zoomGroup = zoom ? this.group(zoom) : null
    if (zoomGroup) {
      const zoomIn = this.button(zoomGroup, 'plus', t.zoomIn, () => map.zoomIn())
      const zoomOut = this.button(zoomGroup, 'minus', t.zoomOut, () => map.zoomOut())
      this.refreshers.push(() => {
        zoomIn.disabled = map.getZoom() >= map.getMaxZoom() - 1e-6
        zoomOut.disabled = map.getZoom() <= map.getMinZoom() + 1e-6
      })
    }

    const ruler = options.ruler ? (options.ruler === true ? {} : options.ruler) : null
    if (ruler) {
      const { position, className, ...rulerOptions } = ruler
      map.ruler.setOptions(rulerOptions)
      const group = position || className || !zoomGroup ? this.group(resolve({ position, className }, 'right')) : zoomGroup
      const button = this.button(group, 'ruler', t.measure, () => map.ruler.toggle())
      const refresh = () => {
        const active = map.ruler.isActive()
        button.setAttribute('aria-pressed', String(active))
        button.classList.toggle('dzmap-active', active)
        const label = active ? t.stopMeasuring : t.measure
        button.title = label
        button.setAttribute('aria-label', label)
      }
      this.refreshers.push(refresh)
      this.cleanups.push(map.on('tool', refresh))
    }

    const coordinates = resolve(options.coordinates, 'bottom-right')
    if (coordinates) {
      const element = map.element('div')
      this.group(coordinates, 'dzmap-coordinates-group').append(element)
      this.cleanups.push(coordinatesControl(map, element))
    }

    for (const element of this.elements) if (!element.childElementCount) element.remove()
    this.elements = this.elements.filter((element) => element.isConnected)
    this.refresh()
  }

  refresh(): void {
    for (const refresh of this.refreshers) refresh()
  }

  private group(options: ControlOptions | null, extraClass?: string): HTMLElement {
    const position = options?.position
    if (position && !options?.className && !extraClass) {
      const existing = this.groups.get(position)
      if (existing) return existing
    }
    const element = this.map.element('div', 'dzmap-control')
    if (position) element.classList.add(`dzmap-pos-${position}`)
    if (extraClass) element.classList.add(extraClass)
    if (options?.className) element.classList.add(...options.className.split(/\s+/).filter(Boolean))
    this.root.append(element)
    this.elements.push(element)
    if (position && !options?.className && !extraClass) this.groups.set(position, element)
    return element
  }

  private button(parent: HTMLElement, name: keyof typeof ICONS, label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'dzmap-button'
    button.title = label
    button.setAttribute('aria-label', label)
    button.innerHTML = icon(name)
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      onClick()
    })
    parent.append(button)
    return button
  }
}
