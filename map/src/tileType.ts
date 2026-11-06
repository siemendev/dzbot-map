import type { DzMap } from './DzMap'
import { tileUrl } from './maps'

const TILE = 256
// The thumbnail shows a few zoom levels further out than the map, so it reads as the same area at a glance
const LEVELS_OUT = 3

/** A thumbnail of the next tile type around the view's centre; a click switches to it. */
export function tileTypeControl(map: DzMap, parent: HTMLElement): () => void {
  const t = map.strings
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'dzmap-tiletype'
  const preview = document.createElement('span')
  preview.className = 'dzmap-tiletype-preview'
  const images = Array.from({ length: 4 }, () => {
    const image = document.createElement('img')
    image.alt = ''
    image.draggable = false
    image.addEventListener('load', () => (image.style.visibility = ''))
    image.addEventListener('error', () => (image.style.visibility = 'hidden'))
    preview.append(image)
    return image
  })
  const label = document.createElement('span')
  label.className = 'dzmap-tiletype-label'
  button.append(preview, label)
  parent.append(button)

  const next = () => {
    const types = map.tileTypes()
    return types[(types.indexOf(map.tileType()) + 1) % types.length]
  }
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    map.setTileType(next())
  })

  let width = 0
  let drawn = ''
  return () => {
    const type = next()
    const name = type === 'sat' ? t.satellite : t.map
    if (label.textContent !== name) {
      label.textContent = name
      button.title = t.switchTileType
      button.setAttribute('aria-label', `${t.switchTileType}: ${name}`)
    }

    width ||= preview.clientWidth
    if (!width) return
    const source = map.getTileSource()
    const frame = map.getFrame()
    const level = Math.max(0, Math.min(source.maxZoom, Math.floor(frame.zoom) - LEVELS_OUT))
    const factor = Math.pow(2, level - frame.zoom)
    const left = Math.round((frame.offsetX + frame.width / 2) * factor - width / 2)
    const top = Math.round((frame.offsetY + frame.height / 2) * factor - width / 2)
    const key = `${source.url}|${type}|${level}|${left}|${top}`
    if (key === drawn) return
    drawn = key

    const count = Math.pow(2, level)
    const col = Math.floor(left / TILE)
    const row = Math.floor(top / TILE)
    images.forEach((image, index) => {
      const x = col + (index % 2)
      const y = row + (index >> 1)
      image.hidden = x < 0 || y < 0 || x >= count || y >= count
      if (image.hidden) return
      const src = tileUrl(source.url, type, level, x, y)
      if (image.getAttribute('src') !== src) image.src = src
      image.style.transform = `translate(${x * TILE - left}px,${y * TILE - top}px)`
    })
  }
}
