export class Emitter<Events extends object> {
  private handlers = new Map<keyof Events, Set<(data: never) => void>>()

  on<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): () => void {
    let set = this.handlers.get(event)
    if (!set) this.handlers.set(event, (set = new Set()))
    set.add(handler as (data: never) => void)
    return () => this.off(event, handler)
  }

  off<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): void {
    this.handlers.get(event)?.delete(handler as (data: never) => void)
  }

  has(event: keyof Events): boolean {
    return (this.handlers.get(event)?.size ?? 0) > 0
  }

  protected emit<K extends keyof Events>(event: K, data: Events[K]): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) (handler as (data: Events[K]) => void)(data)
  }
}
