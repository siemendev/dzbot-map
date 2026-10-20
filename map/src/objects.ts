import type { DzMap } from './DzMap'
import { Emitter } from './emitter'
import type { DragEventData, DragTarget, PointerEventData, WorldPoint } from './types'
import { VectorLayer, type Feature } from './vector'

export interface MapObjectEvents {
  click: PointerEventData
  dragstart: DragEventData
  drag: DragEventData
  dragend: DragEventData
}

/** One shape on the map, added with `addMarker`, `addPolygon` and friends. */
export class MapObject<F extends Feature = Feature> extends Emitter<MapObjectEvents> {
  /** @internal */
  constructor(private readonly owner: ObjectLayer, public feature: F, public draggable: boolean) {
    super()
  }

  /** Changes the shape's properties, e.g. `marker.update({ at: [x, z], label: 'Moved' })`. */
  update(patch: Partial<F>): this {
    this.feature = { ...this.feature, ...patch }
    this.owner.changed()
    return this
  }

  remove(): void {
    this.owner.removeObject(this)
  }

  /** @internal */
  fire<K extends keyof MapObjectEvents>(event: K, data: MapObjectEvents[K]): void {
    this.emit(event, data)
  }
}

let objectIds = 0

/** The layer behind the map's `add…` helpers: tracks objects, makes them draggable and clickable. */
export class ObjectLayer extends VectorLayer {
  private objects: MapObject[] = []
  private ids = new Map<MapObject, string>()
  private cleanups: Array<() => void> = []

  add<F extends Feature>(feature: F, draggable = false): MapObject<F> {
    const object = new MapObject<F>(this, feature, draggable)
    this.objects.push(object as unknown as MapObject)
    this.ids.set(object as unknown as MapObject, `dzmap-object-${++objectIds}`)
    this.changed()
    return object
  }

  removeObject(object: MapObject): void {
    this.objects = this.objects.filter((o) => o !== object)
    this.ids.delete(object)
    this.changed()
  }

  changed(): void {
    this.setFeatures(this.objects.map((o) => o.feature))
  }

  override onAdd(map: DzMap): void {
    super.onAdd(map)
    const byId = (id: string | number) => this.objects.find((o) => this.ids.get(o) === id)
    this.cleanups = [
      map.addDragSource(() =>
        this.objects.flatMap((o): DragTarget[] => (o.draggable && 'at' in o.feature ? [{ id: this.ids.get(o)!, at: o.feature.at as WorldPoint, touch: true }] : [])),
      ),
      map.on('dragstart', (e) => byId(e.id)?.fire('dragstart', e)),
      map.on('drag', (e) => {
        const object = byId(e.id)
        if (!object) return
        object.update({ at: e.world } as Partial<Feature>)
        object.fire('drag', e)
      }),
      map.on('dragend', (e) => {
        const object = byId(e.id)
        if (!object) return
        object.update({ at: e.world } as Partial<Feature>)
        object.fire('dragend', e)
      }),
      map.on('click', (e) => {
        const [top] = this.featuresAt(e.screen, map.getFrame())
        if (top) this.objects.find((o) => o.feature === top)?.fire('click', e)
      }),
    ]
  }

  override onRemove(): void {
    for (const cleanup of this.cleanups) cleanup()
    this.cleanups = []
    super.onRemove()
  }
}
