import { t } from '../i18n'
import { deleteGroup, pruneGroups } from '../model/groups'
import { useStore, type Selection } from '../state/store'

/** Entfernt die Auswahl; Teile einer Vorlage werden herausgelöst (lassen sich wieder erzeugen) */
export function deleteSelection(sel: Selection | null = useStore.getState().selection) {
  if (!sel) return
  const s = useStore.getState()
  // Mehrfachauswahl: alle gewählten freien Teile entfernen
  if (s.multi.length) {
    const ids = s.multi
    s.update((d) => {
      d.members = d.members.filter((m) => !ids.includes(m.id))
      d.panels = d.panels.filter((x) => !ids.includes(x.id))
      pruneGroups(d)
    })
    s.select(null)
    return
  }
  s.update((d) => {
    if (sel.kind === 'group') deleteGroup(d, sel.id)
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
    pruneGroups(d)
  })
  s.select(null)
}

export function deleteLabel(sel: Selection): string | null {
  const n = useStore.getState().multi.length
  if (n) return t('{n} Teile entfernen', { n })
  if (sel.kind === 'assembly' || sel.kind === 'group') return t('Bett löschen')
  if ((sel.kind === 'member' || sel.kind === 'panel') && sel.id.includes(':')) return t('Teil entfernen')
  if (sel.kind === 'member' || sel.kind === 'panel' || sel.kind === 'wallObject' || sel.kind === 'furniture') return t('Entfernen')
  return null
}
