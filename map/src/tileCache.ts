// Tiles kept in the page's Cache Storage, where they outlive the browser's shared HTTP cache. Works on any site
// that embeds the map; without Cache Storage (plain http, private modes), CORS on the tile host or a CSP that
// allows the request, tiles load by their URL as before.

const CACHE_NAME = 'dzmap-tiles-v1'
const MAX_TILES = 30000
const TRIM_EVERY = 2000

let store: Promise<Cache | null> | undefined
// Per tile source: the first fetch finds out whether its tiles can be cached, so a host without CORS fails once
const sources = new Map<string, Promise<boolean>>()
const pending = new Map<string, Promise<Blob | null>>()
const stored = new Set<string>()
let putsSinceTrim = TRIM_EVERY

function open(): Promise<Cache | null> {
  store ??= typeof caches === 'undefined' ? Promise.resolve(null) : caches.open(CACHE_NAME).catch(() => null)
  return store
}

// Oldest first: keys() lists entries in insertion order
async function trim(cache: Cache): Promise<void> {
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_TILES)).map((key) => cache.delete(key)))
}

function scheduleTrim(cache: Cache): void {
  if (putsSinceTrim++ < TRIM_EVERY) return
  putsSinceTrim = 0
  const run = () => void trim(cache).catch(() => {})
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run)
  else setTimeout(run, 1000)
}

function fetchAndStore(url: string, cache: Cache): Promise<Blob | null> {
  let request = pending.get(url)
  if (!request) {
    request = (async () => {
      const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
      if (!response.ok) return null
      const blob = await response.clone().blob()
      await cache.put(url, response)
      stored.add(url)
      scheduleTrim(cache)
      return blob
    })().finally(() => pending.delete(url))
    pending.set(url, request)
  }
  return request
}

async function fetchFrom(source: string, url: string, cache: Cache): Promise<Blob | null> {
  const inFlight = pending.get(url)
  if (inFlight) return inFlight.catch(() => null)
  const probe = sources.get(source)
  if (!probe) {
    const first = fetchAndStore(url, cache)
    sources.set(
      source,
      first.then(
        () => true,
        () => false,
      ),
    )
    return first.catch(() => null)
  }
  if (!(await probe)) return null
  return fetchAndStore(url, cache).catch(() => null)
}

/** The tile's image data from the cache, fetched and stored on a miss; null when it must load by its URL. */
export async function cachedTile(source: string, url: string): Promise<Blob | null> {
  const cache = await open()
  if (!cache) return null
  try {
    const hit = await cache.match(url)
    if (hit) {
      stored.add(url)
      return await hit.blob()
    }
  } catch {
    return null
  }
  return fetchFrom(source, url, cache)
}

/** Stores a tile ahead of time; resolves false when it is not cached. */
export async function storeTile(source: string, url: string): Promise<boolean> {
  if (stored.has(url)) return true
  const cache = await open()
  if (!cache) return false
  try {
    if (await cache.match(url)) {
      stored.add(url)
      return true
    }
  } catch {
    return false
  }
  return (await fetchFrom(source, url, cache)) !== null
}

/** Test seam: forgets the opened cache and everything this page learned. */
export function resetTileCache(): void {
  store = undefined
  sources.clear()
  pending.clear()
  stored.clear()
  putsSinceTrim = TRIM_EVERY
}
