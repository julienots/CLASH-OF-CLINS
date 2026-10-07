// Bus d'événements minimaliste et typé faiblement (UI <-> systèmes).
type Handler = (payload?: any) => void;

export class EventBus {
  private map = new Map<string, Set<Handler>>();
  on(ev: string, h: Handler): () => void {
    let s = this.map.get(ev);
    if (!s) this.map.set(ev, (s = new Set()));
    s.add(h);
    return () => s!.delete(h);
  }
  emit(ev: string, payload?: any) {
    const s = this.map.get(ev);
    if (s) for (const h of [...s]) h(payload);
  }
  clear() { this.map.clear(); }
}

export const bus = new EventBus();
