import { useStore, type Selection } from '../state/store'

/** Entfernt die Auswahl; Teile einer Vorlage werden herausgelöst (lassen sich wieder erzeugen) */
export function deleteSelection(sel: Selection | null = useStore.getState().selection) {
  if (!sel) return
  const s = useStore.getState()
  s.update((d) => {
    const generated = sel.id.includes(':')
    if (sel.kind === 'assembly') d.assemblies = d.assemblies.filter((a) => a.id !== sel.id)
    else if ((sel.kind === 'member' || sel.kind === 'panel') && generated) {
      const [a, key] = sel.id.split(':')
      const asm = d.assemblies.find((x) => x.id === a)
      if (asm && !asm.detached.includes(key)) asm.detached.push(key)
    } else if (sel.kind === 'member') d.members = d.members.filter((m) => m.id !== sel.id)
    else if (sel.kind === 'panel') d.panels = d.panels.filter((x) => x.id !== sel.id)
    else if (sel.kind === 'wallObject') d.wallObjects = d.wallObjects.filter((o) => o.id !== sel.id)
    else if (sel.kind === 'furniture') d.furniture = d.furniture.filter((f) => f.id !== sel.id)
  })
  s.select(null)
}

export function deleteLabel(sel: Selection): string | null {
  if (sel.kind === 'assembly') return 'Bett löschen'
  if ((sel.kind === 'member' || sel.kind === 'panel') && sel.id.includes(':')) return 'Teil entfernen'
  if (sel.kind === 'member' || sel.kind === 'panel' || sel.kind === 'wallObject' || sel.kind === 'furniture') return 'Entfernen'
  return null
}
