import { test } from 'vitest'
import { testProject } from '../../src/model/defaults'
import { resolveProject } from '../../src/model/resolve'
test('x', () => {
  const p = testProject()
  Object.assign(p.assemblies[0].params, { deck: 'dielen', deckCatalogId: 'nf-kiefer-27', frameStyle: 'aufgelegt', braces: true })
  const r = resolveProject(p)
  for (const m of r.members.filter((m) => /pfosten|zarge|handlauf-(links|rechts)|brett-(links|rechts)-0|gelaenderst/.test(m.id))) console.log(m.partKey, m.name, JSON.stringify([m.start, m.end].map((q) => [q.x, q.y, q.z].map(Math.round))), m.b, m.h)
  for (const j of r.joints.filter((j) => /eckpfosten|pfosten-.*-g|gelaenderpfosten/.test(j.key))) console.log(j.key, j.kind, j.typeId)
})
