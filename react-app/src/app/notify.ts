export type Toast = {
  id: string
  message: string
  tone?: 'danger' | 'neutral'
}

type Listener = (items: Toast[]) => void

let items: Toast[] = []
const listeners = new Set<Listener>()

function emit() {
  const snapshot = items
  for (const l of listeners) l(snapshot)
}

export const notify = {
  subscribe(listener: Listener) {
    listeners.add(listener)
    listener(items)
    return () => {
      listeners.delete(listener)
    }
  },

  push(input: Omit<Toast, 'id'> & { id?: string }) {
    const id = input.id ?? `t_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
    const toast: Toast = { id, message: input.message, tone: input.tone ?? 'neutral' }
    items = [...items, toast].slice(-3)
    emit()
    window.setTimeout(() => {
      if (!items.some((x) => x.id === id)) return
      items = items.filter((x) => x.id !== id)
      emit()
    }, 3200)
  },
}

