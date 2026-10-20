import { describe, expect, it } from 'vitest'
import { insertAtBestPosition } from '../src/draw'
import { embedUrl, parseEmbed, parsePin } from '../src/embed'
import { geoJsonFeatures } from '../src/geojson'
import { findMap, MAPS, tileUrl } from '../src/maps'
import { DEFAULT_THRESHOLDS, placeFeatures } from '../src/places'
import { builtInProvider, parseCoordinate } from '../src/search'
import { formatDistance, formatDuration, pathLength, sprintSeconds, VANILLA_STAMINA } from '../src/travel'
import type { WorldPoint } from '../src/types'

describe('maps', () => {
  it('finds a built-in map by id and by mission', () => {
    expect(findMap('chernarus')?.mission).toBe('dayzOffline.chernarusplus')
    expect(findMap('dayzOffline.enoch')?.id).toBe('livonia')
    expect(findMap('atlantis')).toBeUndefined()
    expect(MAPS.map((m) => m.id)).toEqual(['nasdara', 'chernarus', 'livonia', 'sakhal'])
  })

  it('fills a tile template', () => {
    expect(tileUrl('https://t/{type}/{z}/{x}/{y}.webp', 'top', 3, 4, 5)).toBe('https://t/top/3/4/5.webp')
  })
})

describe('travel', () => {
  it('sprints a short distance at full speed', () => {
    expect(sprintSeconds(66)).toBeCloseTo(10, 5)
  })

  it('takes longer per metre once stamina runs out', () => {
    const short = sprintSeconds(100) / 100
    const long = sprintSeconds(5000) / 5000
    expect(long).toBeGreaterThan(short)
  })

  it('never runs out without sprint drain', () => {
    expect(sprintSeconds(6600, { max: 100, sprintDrain: 0 })).toBeCloseTo(1000, 5)
    expect(sprintSeconds(6600, VANILLA_STAMINA)).toBeGreaterThan(1000)
  })

  it('measures and formats a route', () => {
    const route: WorldPoint[] = [[0, 0], [300, 400], [300, 1400]]
    expect(pathLength(route)).toBe(1500)
    expect(formatDistance(802.4, 'en')).toBe('802 m')
    expect(formatDistance(1500, 'en')).toBe('1.50 km')
    expect(formatDistance(1500, 'de')).toBe('1,50 km')
    expect(formatDuration(42)).toBe('42 s')
    expect(formatDuration(272)).toBe('4 min 32 s')
    expect(formatDuration(3720)).toBe('1 h 2 min')
  })
})

describe('parseCoordinate', () => {
  it.each([
    ['4512 10230', [4512, 10230]],
    ['4512, 10230', [4512, 10230]],
    ['4512 / 10230', [4512, 10230]],
    [' 4512,5;10230 ', [4512.5, 10230]],
  ])('reads %s', (query, expected) => {
    expect(parseCoordinate(query)).toEqual(expected)
  })

  it('finds places regardless of accents', () => {
    expect(builtInProvider({ searchables: () => [{ label: 'Žabinka', at: [1, 2] }] } as never).search('zab')).toEqual([{ label: 'Žabinka', at: [1, 2], detail: undefined }])
  })

  it('ignores text', () => {
    expect(parseCoordinate('chernogorsk')).toBeNull()
    expect(parseCoordinate('4512')).toBeNull()
  })
})

describe('insertAtBestPosition', () => {
  const square: WorldPoint[] = [[0, 0], [100, 0], [100, 100], [0, 100]]

  it('puts a point into the edge it is closest to', () => {
    expect(insertAtBestPosition(square, [50, -10])).toEqual([[0, 0], [50, -10], [100, 0], [100, 100], [0, 100]])
    expect(insertAtBestPosition(square, [-10, 50])).toEqual([[0, 0], [100, 0], [100, 100], [0, 100], [-10, 50]])
  })

  it('appends while there is no edge yet', () => {
    expect(insertAtBestPosition([], [1, 2])).toEqual([[1, 2]])
    expect(insertAtBestPosition([[0, 0]], [1, 2])).toEqual([[0, 0], [1, 2]])
  })
})

describe('embed', () => {
  it('reads pins with commas in their label', () => {
    expect(parsePin('4512,10230,Base, north gate')).toEqual({ at: [4512, 10230], label: 'Base, north gate' })
    expect(parsePin('4512,10230')).toEqual({ at: [4512, 10230], label: undefined })
    expect(parsePin('x,y')).toBeNull()
  })

  it('round-trips its URL', () => {
    const url = embedUrl({
      map: 'chernarus',
      center: [6700, 2600],
      zoom: 4.5,
      placeNames: false,
      controls: { zoom: true, fullscreen: false, placeNames: false, tileType: false },
      pins: [{ at: [6900, 2700], label: 'Our base' }, { at: [100, 200] }],
      fit: true,
      locale: 'de',
    })
    const parsed = parseEmbed(new URL(url).search)
    expect(parsed).toMatchObject({
      map: 'chernarus',
      center: [6700, 2600],
      zoom: 4.5,
      placeNames: false,
      controls: { zoom: true, fullscreen: false, placeNames: false, tileType: false },
      pins: [{ at: [6900, 2700], label: 'Our base' }, { at: [100, 200], label: undefined }],
      fit: true,
      locale: 'de',
    })
  })

  it('defaults to the whole of Nasdara with names and the usual controls', () => {
    expect(parseEmbed('')).toMatchObject({ map: 'nasdara', center: undefined, zoom: undefined, placeNames: true, controls: { zoom: true, fullscreen: true, placeNames: true } })
  })
})

describe('geoJsonFeatures', () => {
  it('turns geometries into features with simplestyle', () => {
    const features = geoJsonFeatures({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [10, 20] }, properties: { title: 'Spawn', 'marker-color': '#0f0', radius: 50 } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [10, 10]] }, properties: { stroke: '#f00' } },
        { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1]]], [[[5, 5], [6, 5], [6, 6]]]] }, properties: { fill: 'red', label: 'Zone' } },
        { type: 'Feature', geometry: null, properties: {} },
      ],
    })
    expect(features).toEqual([
      { type: 'point', at: [10, 20], color: '#0f0', label: 'Spawn', area: { radius: 50, opacity: undefined } },
      { type: 'line', points: [[0, 0], [10, 10]], color: '#f00', width: undefined, opacity: undefined },
      { type: 'polygon', points: [[0, 0], [1, 0], [1, 1]], fill: 'red', stroke: 'red', fillOpacity: undefined, fadeOnZoom: false, label: 'Zone' },
      { type: 'polygon', points: [[5, 5], [6, 5], [6, 6]], fill: 'red', stroke: 'red', fillOpacity: undefined, fadeOnZoom: false, label: 'Zone' },
    ])
  })
})

describe('placeFeatures', () => {
  it('shows bigger places from further out', () => {
    const [city, village] = placeFeatures([
      { name: 'Chernogorsk', x: 6700, z: 2500, radius: 1200, type: 'city' },
      { name: 'Pusta', x: 100, z: 200, radius: 150, type: 'poi' },
    ], DEFAULT_THRESHOLDS)
    expect(city).toMatchObject({ type: 'place', name: 'Chernogorsk', minZoom: 1 })
    expect(village).toMatchObject({ name: 'Pusta', minZoom: 4 })
    expect(city.fontSize).toBeGreaterThan(village.fontSize!)
  })

  it('leaves out other kinds of places', () => {
    expect(placeFeatures([{ name: 'Alarm', x: 0, z: 0, type: 'base' }])).toEqual([])
  })
})
