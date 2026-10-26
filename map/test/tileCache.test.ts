import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedTile, resetTileCache, storeTile } from '../src/tileCache'

class FakeCache {
  entries = new Map<string, Response>()
  async match(url: string) {
    return this.entries.get(url)?.clone()
  }
  async put(url: string, response: Response) {
    this.entries.set(url, response)
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url))
  }
  async delete(request: Request) {
    return this.entries.delete(request.url)
  }
}

const SOURCE = 'https://tiles.test/{z}/{x}/{y}.webp'
const tile = (n: number) => `https://tiles.test/1/${n}/0.webp`

let cache: FakeCache
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetTileCache()
  cache = new FakeCache()
  vi.stubGlobal('caches', { open: async () => cache })
  fetchMock = vi.fn(async () => new Response('tile', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('tile cache', () => {
  it('fetches a tile once with CORS and serves it from the cache afterwards', async () => {
    expect(await (await cachedTile(SOURCE, tile(1)))?.text()).toBe('tile')
    expect(await (await cachedTile(SOURCE, tile(1)))?.text()).toBe('tile')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(tile(1), { mode: 'cors', credentials: 'omit' })
    expect(cache.entries.has(tile(1))).toBe(true)
  })

  it('shares one request between a prefetch and the tile shown at the same time', async () => {
    const [stored, blob] = await Promise.all([storeTile(SOURCE, tile(1)), cachedTile(SOURCE, tile(1))])
    expect(stored).toBe(true)
    expect(blob).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops fetching from a source whose first fetch fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('CORS'))
    expect(await cachedTile(SOURCE, tile(1))).toBeNull()
    expect(await cachedTile(SOURCE, tile(2))).toBeNull()
    expect(await storeTile(SOURCE, tile(3))).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stores nothing for a missing tile', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }))
    expect(await cachedTile(SOURCE, tile(1))).toBeNull()
    expect(cache.entries.size).toBe(0)
  })

  it('leaves tiles to their URL without Cache Storage', async () => {
    vi.stubGlobal('caches', undefined)
    expect(await cachedTile(SOURCE, tile(1))).toBeNull()
    expect(await storeTile(SOURCE, tile(1))).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
