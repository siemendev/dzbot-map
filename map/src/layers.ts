import type { DzMap } from './DzMap'

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>'

/** A button that opens a list of the map's named layers (and the place names) to switch them on and off. */
export function layersControl(map: DzMap, group: HTMLElement): () => void {
  const t = map.strings
  const wrapper = map.element('div', 'dzmap-layers')
  wrapper.setAttribute('data-dzmap-ui', '')
  const button = map.element('button', 'dzmap-button')
  button.type = 'button'
  button.title = t.layers
  button.setAttribute('aria-label', t.layers)
  button.setAttribute('aria-expanded', 'false')
  button.innerHTML = ICON
  const popover = map.element('div', 'dzmap-panel dzmap-layers-list')
  popover.hidden = true
  wrapper.append(button, popover)
  group.append(wrapper)

  const draw = () => {
    const rows: string[] = []
    if (map.hasPlaceNames()) rows.push(`<label><input type="checkbox" data-layer="__places"${map.placeNamesVisible() ? ' checked' : ''}> ${esc(t.placeNames)}</label>`)
    map.namedLayers().forEach((layer, i) => {
      rows.push(`<label><input type="checkbox" data-layer="${i}"${layer.isVisible?.() !== false ? ' checked' : ''}> ${esc(layer.name ?? '')}</label>`)
    })
    popover.innerHTML = rows.length > 0 ? rows.join('') : `<p class="dzmap-dim">—</p>`
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation()
    popover.hidden = !popover.hidden
    button.setAttribute('aria-expanded', String(!popover.hidden))
    if (!popover.hidden) draw()
  })
  popover.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement
    const key = input.getAttribute('data-layer')
    if (key === '__places') map.setPlaceNamesVisible(input.checked)
    else map.namedLayers()[Number(key)]?.setVisible?.(input.checked)
  })
  const onOutside = (event: MouseEvent) => {
    if (!wrapper.contains(event.target as Node)) {
      popover.hidden = true
      button.setAttribute('aria-expanded', 'false')
    }
  }
  document.addEventListener('mousedown', onOutside)
  return () => document.removeEventListener('mousedown', onOutside)
}
