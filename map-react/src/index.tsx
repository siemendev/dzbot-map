import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { DzMap, type DzMapOptions, type Frame, type Layer, type MapEvents, type PaneName } from '@dzbot/map'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const MapContext = createContext<DzMap | null>(null)

/** The map of the nearest `<DzMapView>`; `null` until it is mounted. */
export function useDzMap(): DzMap | null {
  return useContext(MapContext)
}

export interface DzMapViewProps extends DzMapOptions {
  className?: string
  style?: CSSProperties
  /** Rendered over the map once it exists; mark panels with `data-dzmap-ui` so gestures on them stay theirs. */
  children?: ReactNode
  onReady?: (map: DzMap) => void
}

/**
 * Mounts a `DzMap` into a div. Options given at mount build the map; later changes to `map`, `tiles`,
 * `controls`, `placeNames`, `cursor` and the zoom limits are applied to it, the rest is read once.
 */
export function DzMapView({ className, style, children, onReady, ...options }: DzMapViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<DzMap | null>(null)
  const initial = useRef(options)
  const onReadyRef = useRef(onReady)

  useIsomorphicLayoutEffect(() => {
    onReadyRef.current = onReady
  })

  useIsomorphicLayoutEffect(() => {
    const instance = new DzMap(ref.current!, initial.current)
    setMap(instance)
    onReadyRef.current?.(instance)
    return () => {
      instance.destroy()
      setMap(null)
    }
  }, [])

  const source = options.tiles ?? options.map
  const sourceKey = typeof source === 'object' ? `${source.url}|${source.size}|${source.maxZoom}|${source.types?.join(',')}` : source
  useIsomorphicLayoutEffect(() => {
    if (map && source) map.setMap(source)
  }, [map, sourceKey])

  const controlsKey = JSON.stringify(options.controls ?? null)
  useIsomorphicLayoutEffect(() => {
    if (map && options.controls) map.setControls(options.controls)
  }, [map, controlsKey])

  useIsomorphicLayoutEffect(() => {
    if (map && options.placeNames !== undefined && options.placeNames !== initial.current.placeNames) map.setPlaceNames(options.placeNames)
  }, [map, options.placeNames])

  const { cursor, minZoom, maxZoom, doubleClickZoom, keyboard } = options
  useIsomorphicLayoutEffect(() => {
    map?.setOptions({ cursor, minZoom, maxZoom, doubleClickZoom, keyboard })
  }, [map, cursor, minZoom, maxZoom, doubleClickZoom, keyboard])

  return (
    <div ref={ref} className={className} style={style}>
      {map && <MapContext.Provider value={map}>{children}</MapContext.Provider>}
    </div>
  )
}

/** Calls the latest `handler` on every `event` of the map, without resubscribing on each render. */
export function useMapEvent<K extends keyof MapEvents>(map: DzMap | null, event: K, handler: ((data: MapEvents[K]) => void) | undefined): void {
  const ref = useRef(handler)
  useIsomorphicLayoutEffect(() => {
    ref.current = handler
  })
  const active = handler !== undefined
  useIsomorphicLayoutEffect(() => {
    if (!map || !active) return
    return map.on(event, (data) => ref.current?.(data))
  }, [map, event, active])
}

/** The frame the map drew last; re-renders the component on every frame. */
export function useMapFrame(map: DzMap | null): Frame | null {
  const [frame, setFrame] = useState<Frame | null>(() => map?.getFrame() ?? null)
  useIsomorphicLayoutEffect(() => {
    if (!map) return
    setFrame(map.getFrame())
    // Commits inside the map's animation frame: a scheduled update would paint a frame after the tiles moved
    return map.on('render', (next) => flushSync(() => setFrame(next)))
  }, [map])
  return frame
}

/** Adds a layer for as long as the component is mounted. */
export function useLayer(map: DzMap | null, layer: Layer | null): void {
  useIsomorphicLayoutEffect(() => {
    if (!map || !layer) return
    map.addLayer(layer)
    return () => map.removeLayer(layer)
  }, [map, layer])
}

/** Renders React content into one of the map's panes, between the map's own layers. */
export function MapPane({ pane, children }: { pane: PaneName; children: ReactNode }) {
  const map = useDzMap()
  if (!map) return null
  return createPortal(children, map.getPane(pane))
}
