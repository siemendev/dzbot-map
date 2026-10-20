import type { MapDefinition } from './types'

const TILES = 'https://uploads.dzbot.de/map-tiles'

function tiles(path: string, size: number) {
  return { url: `${TILES}/${path}/{type}/{z}/{x}/{y}.webp`, size, maxZoom: 8, types: ['top'] }
}

export const MAPS: readonly MapDefinition[] = [
  { id: 'nasdara', name: 'Nasdara', mission: 'dayzOffline.nasdara', tiles: tiles('nasdara/dzbot-1.30-2', 16384), worldSize: 16384, center: [8192, 8192] },
  { id: 'chernarus', name: 'Chernarus', mission: 'dayzOffline.chernarusplus', tiles: tiles('chernarusplus/dzbot-1.29-3', 15926.73), worldSize: 15360, center: [7600, 7700] },
  { id: 'livonia', name: 'Livonia', mission: 'dayzOffline.enoch', tiles: tiles('enoch/dzbot-1.29-2', 12800), worldSize: 12800, center: [6400, 6400] },
  { id: 'sakhal', name: 'Sakhal', mission: 'dayzOffline.sakhal', tiles: tiles('sakhal/dzbot-1.29-2', 15360), worldSize: 15360, center: [7680, 7680] },
]

export function findMap(id: string): MapDefinition | undefined {
  return MAPS.find((map) => map.id === id || map.mission === id)
}

export function tileUrl(template: string, type: string, z: number, x: number, y: number): string {
  return template.replace('{type}', type).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
}
