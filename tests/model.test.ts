import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analysis/checks'
import { computeBom, packBars, parsePriceAnswer, pricePrompt } from '../src/analysis/bom'
import { testProject, defaultBedParams } from '../src/model/defaults'
import { memberBoxes, memberOBB, obbOverlap, v } from '../src/model/geometry'
import { generateLoftBed } from '../src/model/loftbed'
import { resolveProject } from '../src/model/resolve'
import { corniceIntrusion, sashBoxes, windowSashes } from '../src/model/room'
import type { Assembly, BedType, Member } from '../src/model/types'

const beam = (s: [number, number, number], e: [number, number, number], b = 60, h = 120): Member => ({
  id: 'x',
  role: 'zarge',
  start: v(...s),
  end: v(...e),
  catalogId: 'kvh-60x120',
  b,
  h,
  roll: 0,
})

describe('Geometrie', () => {
  it('erkennt Überlappung und Abstand zweier Quader', () => {
    const a = memberOBB(beam([0, 0, 0], [1000, 0, 0]))
    const b = memberOBB(beam([500, -500, 0], [500, 500, 0]))
    const c = memberOBB(beam([0, 200, 0], [1000, 200, 0]))
    expect(obbOverlap(a, b)).toBeGreaterThan(0)
    expect(obbOverlap(a, c)).toBeLessThan(0)
  })

  it('zerlegt einen ausgeklinkten Stab in Teilquader', () => {
    const m = { ...beam([0, 0, 0], [0, 0, 2000], 80, 80), notches: [{ along: 0, length: 65, depth: 20, side: '-h' as const, reason: 'Sockel' }] }
    const boxes = memberBoxes(m)
    expect(boxes).toHaveLength(2)
    expect(boxes[0].half[2]).toBeCloseTo(30)
  })
})

describe('Raum', () => {
  it('erkennt den Stuck in der Ecke Wand/Decke', () => {
    const room = testProject().room
    expect(corniceIntrusion(room, v(2000, 10, room.height - 10))?.depth).toBeGreaterThan(200)
    expect(corniceIntrusion(room, v(2000, 400, room.height - 10))).toBeUndefined()
    expect(corniceIntrusion(room, v(2000, 10, room.height - 300))).toBeUndefined()
  })

  it('schwenkt einen Fensterflügel in den Raum', () => {
    const p = testProject()
    const w = p.wallObjects.find((o) => o.kind === 'fenster')!
    if (w.kind !== 'fenster') throw new Error()
    const [g] = windowSashes(p.room, w)
    const closed = sashBoxes(g, 0)[0]
    const open = sashBoxes(g, 90)[0]
    // Wand A liegt bei y = 0, Laibung 280 mm: zu = in der Wand, offen = ragt in den Raum
    expect(closed.center.y).toBeLessThan(0)
    expect(open.center.y).toBeGreaterThan(closed.center.y + 200)
  })
})

describe('Hochbett-Generator', () => {
  const types: BedType[] = ['freistehend', 'deckenhoch', 'wandseitig', 'eck', 'nische', 'abgehaengt']
  for (const type of types) {
    it(`erzeugt ein plausibles Gestell: ${type}`, () => {
      const a: Assembly = { id: 'b', kind: 'hochbett', name: 'B', detached: [], params: defaultBedParams({ type, x: 500, y: 500 }) }
      const g = generateLoftBed(a, 2600)
      expect(g.members.length).toBeGreaterThan(10)
      expect(g.info.underside).toBeGreaterThan(1500)
      for (const m of g.members) {
        expect(Number.isFinite(m.start.x + m.end.z)).toBe(true)
        expect(m.start).not.toEqual(m.end)
      }
    })
  }

  it('dreht das Bett um 90°', () => {
    const a: Assembly = { id: 'b', kind: 'hochbett', name: 'B', detached: [], params: defaultBedParams({ x: 2000, y: 0, rotation: 90 }) }
    const g = generateLoftBed(a, 2600)
    const xs = g.info.footprint.map((q) => q.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(g.info.outerWidth)
  })
})

describe('Testzimmer', () => {
  const p = testProject()
  const r = resolveProject(p)
  const a = analyze(p, r)

  it('klinkt Pfosten an der Sockelleiste aus', () => {
    const post = r.members.find((m) => m.partKey === 'pfosten-BR')!
    expect(post.notches?.some((n) => n.reason.includes('Sockelleiste'))).toBe(true)
    expect(a.findings.some((f) => f.id.startsWith('hindernis:sockel'))).toBe(false)
  })

  it('erkennt, dass das linke Fenster durch das Bett blockiert wird', () => {
    const left = a.windows.filter((w) => w.windowId === 'fenster-links')
    expect(left.some((w) => w.maxAngle < 90)).toBe(true)
    const right = a.windows.filter((w) => w.windowId === 'fenster-rechts')
    expect(right.every((w) => w.maxAngle >= 90)).toBe(true)
  })

  it('findet Verbindungen und Freiraum', () => {
    expect(r.joints.length).toBeGreaterThan(10)
    expect(a.clearances[0].underside).toBeGreaterThan(1700)
  })

  it('erstellt eine Stückliste mit Handelslängen', () => {
    const bom = computeBom(p, r)
    expect(bom.total).toBeGreaterThan(100)
    for (const t of bom.timber) for (const b of t.bars) expect(t.item.lengths).toContain(b.stock)
    const prompt = pricePrompt(p, bom)
    expect(prompt).toContain('kvh-80x80')
  })
})

describe('Zuschnitt', () => {
  it('packt Teile auf möglichst kurze Handelslängen', () => {
    const { bars } = packBars([{ length: 1900, label: 'a' }, { length: 1900, label: 'b' }, { length: 900, label: 'c' }], [3000, 4000, 5000])
    expect(bars.reduce((s, b) => s + b.stock, 0)).toBeLessThanOrEqual(8000)
  })

  it('liest die Preisantwort zurück', () => {
    const rows = parsePriceAnswer('```\nid;preis_eur;einheit;produktname;url\nkvh-80x80;6,49;m;KVH 80x80;https://x\n```')
    expect(rows).toEqual([{ id: 'kvh-80x80', price: 6.49, name: 'KVH 80x80', url: 'https://x' }])
  })
})

describe('Wandbalken-Bauweise', () => {
  it('legt Querträger oben auf Wand- und Frontbalken', () => {
    const a: Assembly = { id: 'b', kind: 'hochbett', name: 'B', detached: [], params: defaultBedParams({ type: 'wandseitig', frameStyle: 'aufgelegt', deck: 'platte', deckCatalogId: 'osb-22', x: 500, y: 0 }) }
    const g = generateLoftBed(a, 2600)
    const back = g.members.find((m) => m.partKey === 'zarge-hinten')!
    const joists = g.members.filter((m) => m.role === 'quertraeger')
    expect(back.role).toBe('wandriegel')
    expect(joists.length).toBeGreaterThan(2)
    expect(g.members.some((m) => m.partKey === 'zarge-links')).toBe(false)
    for (const j of joists) expect(j.start.z - j.h / 2).toBeCloseTo(back.start.z + back.h / 2)
    const r = resolveProject({ ...testProject(), assemblies: [a] })
    expect(r.joints.some((j) => j.kind === 'auflage' && (j.a === back.id || j.b === back.id))).toBe(true)
  })

  it('hängt die freie Ecke ab und warnt bei nicht tragfähiger Decke', () => {
    const a: Assembly = { id: 'b', kind: 'hochbett', name: 'B', detached: [], params: defaultBedParams({ type: 'eck', frameStyle: 'aufgelegt', cornerSupport: 'decke', x: 2100, y: 0 }) }
    const g = generateLoftBed(a, 3500)
    expect(g.members.filter((m) => m.catalogId === 'gewindestange-m10')).toHaveLength(1)
    expect(g.members.some((m) => m.partKey === 'pfosten-FL' && m.start.z === 0)).toBe(false)
    // Testzimmer: Holzbalkendecke → Abhängung nur in einen Balken (Warnung)
    const p = { ...testProject(), assemblies: [a] }
    expect(analyze(p, resolveProject(p)).findings.some((f) => f.id.startsWith('decke-balken'))).toBe(true)
    // nicht tragfähige Decke → Fehler
    const weak = { ...p, room: { ...p.room, ceiling: 'schwach' as const } }
    expect(analyze(weak, resolveProject(weak)).findings.some((f) => f.id.startsWith('decke-haengen'))).toBe(true)
  })
})

describe('Bauplan und Montage', () => {
  it('nummeriert gleiche Teile gleich und ordnet jedes Teil einem Schritt zu', async () => {
    const { partTypes, buildSteps } = await import('../src/analysis/assembly')
    const p = testProject()
    const r = resolveProject(p)
    const { parts, byMember } = partTypes(r)
    expect(byMember.size).toBe(r.members.length)
    expect(parts.reduce((s, x) => s + x.count, 0)).toBe(r.members.length)
    const steps = buildSteps(p, r)
    const inSteps = new Set(steps.flatMap((s) => s.memberIds))
    expect(inSteps.size).toBe(r.members.length)
    expect(steps[0].title).toBe('Pfosten stellen')
  })
})

describe('CSV-Einkaufsliste', () => {
  it('eine Zeile pro Artikel, Dezimalkomma, Stück statt Packung bei Einzelteilen, Summe', async () => {
    const { bomCsv, computeBom } = await import('../src/analysis/bom')
    const p = testProject()
    const bom = computeBom(p, resolveProject(p))
    const csv = bomCsv(bom)
    const lines = csv.split('\r\n')
    expect(lines[0]).toContain('Einzelpreis EUR')
    expect(lines.at(-1)).toMatch(/^"Summe"/)
    expect(csv).not.toMatch(/"\d+\.\d\d"/)
    const bolt = lines.find((l) => l.includes('Schlossschraube'))
    if (bolt) expect(bolt).toContain('"Stück"')
  })
})
