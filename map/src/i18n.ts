import type { Locale } from './types'

const STRINGS = {
  en: {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    names: 'Names',
    showNames: 'Show place names',
    hideNames: 'Hide place names',
    map: 'Map',
    satellite: 'Satellite',
    switchTileType: 'Switch between map and satellite',
    mapLabel: 'DayZ map',
    measure: 'Measure distance',
    stopMeasuring: 'Stop measuring',
    clickToMeasure: 'Click on the map to set points along your route. Backspace removes the last one, Esc stops.',
    tapToMeasure: 'Tap the map to set points along your route.',
    sprintTime: '≈ {time} sprinting',
    staminaBasis: 'Holding sprint, no load · stamina {max} · sprint drain {drain}× ({source})',
    vanilla: 'vanilla',
    undoPoint: 'Remove last point',
    copyHint: '{keys} copies',
    ctrlC: 'Ctrl+C',
    coordinateCopied: 'Coordinate copied',
    search: 'Search places or coordinates',
    noResults: 'Nothing found',
    coordinate: 'Coordinate',
    layers: 'Layers',
    placeNames: 'Place names',
    chooseMap: 'Map',
    insertPoint: 'Insert point',
    cornerLabel: 'Corner {number}',
    deletePoint: 'Delete point',
  },
  de: {
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    fullscreen: 'Vollbild',
    exitFullscreen: 'Vollbild beenden',
    names: 'Namen',
    showNames: 'Ortsnamen anzeigen',
    hideNames: 'Ortsnamen ausblenden',
    map: 'Karte',
    satellite: 'Satellit',
    switchTileType: 'Zwischen Karte und Satellit wechseln',
    mapLabel: 'DayZ-Karte',
    measure: 'Entfernung messen',
    stopMeasuring: 'Messen beenden',
    clickToMeasure: 'Klick auf die Karte, um Punkte entlang deiner Route zu setzen. Rücktaste entfernt den letzten, Esc beendet.',
    tapToMeasure: 'Tipp auf die Karte, um Punkte entlang deiner Route zu setzen.',
    sprintTime: '≈ {time} im Sprint',
    staminaBasis: 'Sprint gehalten, ohne Gepäck · Ausdauer {max} · Sprint-Verbrauch {drain}× ({source})',
    vanilla: 'Vanilla',
    undoPoint: 'Letzten Punkt entfernen',
    copyHint: '{keys} kopiert',
    ctrlC: 'Strg+C',
    coordinateCopied: 'Koordinate kopiert',
    search: 'Orte oder Koordinaten suchen',
    noResults: 'Nichts gefunden',
    coordinate: 'Koordinate',
    layers: 'Ebenen',
    placeNames: 'Ortsnamen',
    chooseMap: 'Karte',
    insertPoint: 'Punkt einfügen',
    cornerLabel: 'Eckpunkt {number}',
    deletePoint: 'Punkt löschen',
  },
} satisfies Record<Locale, Record<string, string>>

export type Strings = (typeof STRINGS)['en']

export function strings(locale: Locale | undefined): Strings {
  return STRINGS[locale ?? 'en'] ?? STRINGS.en
}

/** Fills `{name}` placeholders. */
export function format(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))
}
