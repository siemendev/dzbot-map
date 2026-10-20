import type { DzMap } from './DzMap'
import type { MapObject } from './objects'
import type { SearchProvider, SearchResult, WorldPoint } from './types'
import type { PinFeature } from './vector'

const MAX_RESULTS = 8

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/** `4512 10230`, `4512, 10230` or `4512 / 10230` as a spot in world metres. */
export function parseCoordinate(query: string): WorldPoint | null {
  const match = /^\s*(-?\d+(?:[.,]\d+)?)\s*(?:[,/;]|\s)\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(query)
  if (!match) return null
  const [x, z] = [Number(match[1].replace(',', '.')), Number(match[2].replace(',', '.'))]
  return Number.isFinite(x) && Number.isFinite(z) ? [x, z] : null
}

/** Finds the map's place names and every labelled feature on its vector layers. */
export function builtInProvider(map: DzMap): SearchProvider {
  return {
    search(query) {
      const q = fold(query.trim())
      if (q.length < 2) return []
      const scored: Array<{ score: number; result: SearchResult }> = []
      for (const { label, at, detail } of map.searchables()) {
        const name = fold(label)
        const index = name.indexOf(q)
        if (index < 0) continue
        scored.push({ score: index === 0 ? 0 : 1, result: { label, at, detail } })
      }
      return scored.sort((a, b) => a.score - b.score || a.result.label.localeCompare(b.result.label)).map((s) => s.result)
    },
  }
}

/** A search box: place names, coordinates, labelled features, plus whatever your providers find. */
export function searchControl(map: DzMap, element: HTMLElement, providers: SearchProvider[], placeholder?: string): () => void {
  const t = map.strings
  element.classList.add('dzmap-search')
  element.setAttribute('data-dzmap-ui', '')
  const listId = `dzmap-search-${Math.random().toString(36).slice(2)}`
  element.innerHTML = `<input type="search" role="combobox" aria-expanded="false" aria-controls="${listId}" aria-autocomplete="list" autocomplete="off" spellcheck="false"><ul role="listbox" id="${listId}" hidden></ul>`
  const input = element.querySelector('input')!
  const list = element.querySelector('ul')!
  input.placeholder = placeholder ?? t.search
  input.setAttribute('aria-label', placeholder ?? t.search)
  const all = [builtInProvider(map), ...providers]
  let results: SearchResult[] = []
  let active = -1
  let pin: MapObject<PinFeature> | null = null
  let run = 0

  const close = () => {
    list.hidden = true
    input.setAttribute('aria-expanded', 'false')
  }

  const draw = () => {
    list.hidden = input.value.trim() === ''
    input.setAttribute('aria-expanded', String(!list.hidden))
    list.innerHTML = results.length === 0
      ? `<li class="dzmap-dim" aria-disabled="true">${esc(t.noResults)}</li>`
      : results.map((r, i) => `<li role="option" data-index="${i}" aria-selected="${i === active}">${esc(r.label)}${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</li>`).join('')
  }

  const pick = (result: SearchResult) => {
    close()
    input.value = result.label
    map.setView(result.at, result.zoom ?? Math.max(map.getZoom(), 5), { animate: true })
    pin?.remove()
    pin = map.addPin(result.at, { label: result.label })
    map.fire('search', result)
  }

  const onInput = async () => {
    const query = input.value
    const current = ++run
    const found: SearchResult[] = []
    const at = parseCoordinate(query)
    if (at) found.push({ label: `${Math.round(at[0])} / ${Math.round(at[1])}`, detail: t.coordinate, at })
    for (const provider of all) {
      try {
        found.push(...(await provider.search(query)))
      } catch (error) {
        console.warn('DzMap: search provider failed', error)
      }
      if (current !== run) return
    }
    results = found.slice(0, MAX_RESULTS)
    active = results.length > 0 ? 0 : -1
    draw()
  }

  input.addEventListener('input', () => void onInput())
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (results.length === 0) return
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
      draw()
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault()
      pick(results[active])
    } else if (event.key === 'Escape') {
      close()
    }
  })
  list.addEventListener('mousedown', (event) => {
    const item = (event.target as Element).closest('[data-index]')
    if (!item) return
    event.preventDefault()
    pick(results[Number(item.getAttribute('data-index'))])
  })
  input.addEventListener('blur', close)
  input.addEventListener('focus', () => {
    if (input.value.trim()) draw()
  })

  const offMapChange = map.on('mapchange', () => {
    pin?.remove()
    pin = null
    input.value = ''
    results = []
    close()
  })

  return () => {
    offMapChange()
    pin?.remove()
  }
}
