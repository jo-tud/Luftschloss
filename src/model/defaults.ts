import { tk } from '../i18n'
import type { Assembly, LoftBedParams, Project, Room } from './types'

export function defaultBedParams(over: Partial<LoftBedParams> = {}): LoftBedParams {
  return {
    type: 'freistehend',
    x: 0,
    y: 0,
    rotation: 0,
    mirror: false,
    mattressLength: 2000,
    mattressWidth: 1000,
    mattressCount: 1,
    mattressLayout: 'nebeneinander',
    mattressThickness: 160,
    mattressGap: 10,
    deckHeight: 1800,
    postCatalogId: 'kvh-80x80',
    railCatalogId: 'kvh-60x120',
    joistCatalogId: 'geh-44x94',
    deck: 'latten',
    // 44×74 flach: trägt auch tobende Jugendliche auf ~1,1 m (Statik), Forenpraxis 40×80
    deckCatalogId: 'geh-44x74',
    joistSpacing: 500,
    slatGap: 60,
    guard: 'bretter',
    guardHeight: 400,
    guardSides: { vorne: true, hinten: true, links: true, rechts: true },
    guardCatalogId: 'geh-44x74',
    ladder: 'stufen',
    ladderSide: 'vorne', // i18n-ok
    ladderOffset: 150,
    ladderWidth: 500,
    ladderCatalogId: 'geh-44x94',
    rungCatalogId: 'rund-buche-30',
    ladderAngle: 70,
    braces: true,
    frameStyle: 'zargen',
    cornerSupport: 'pfosten',
    wallFit: 'ausklinken',
    wallEnd: 'rechts', // i18n-ok
    ceilingGap: 15,
    lowerBed: false,
    lowerDeckHeight: 300,
    midPosts: 0,
    ...over,
  }
}

export function testRoom(): Room {
  return {
    length: 4300,
    width: 5950,
    height: 3500,
    wallThickness: 450,
    walls: {
      // Nur die Fensterwand ist gemauert; die übrigen Wände sind Altbau-Leichtbauwände
      A: { material: 'vollziegel' },
      B: { material: 'leichtbau' },
      C: { material: 'leichtbau' },
      D: { material: 'leichtbau' },
    },
    floor: 'holzdielen',
    // Altbau: vermutlich Holzbalkendecke, nicht besonders tragfähig (Abhängung nur in einen Balken)
    ceiling: 'holzbalken',
    cornice: { enabled: true, height: 200, projection: 280, shape: 'kehle' },
    corniceOverrides: {},
    skirting: { enabled: true, height: 60, depth: 18 },
    rosettes: [
      { id: 'rosette-1', x: 2150, y: 2975, diameter: 800, depth: 40, lampDrop: 750, lampDiameter: 380 },
    ],
  }
}

/**
 * Beispielzimmer (öffentlich, Grundlage vieler Tests): 4,30 m Fensterseite (Wand A), 5,95 m Tiefe,
 * zwei Fenster in Wand A, Tür in Wand C. Nicht nebenbei ändern – Tests hängen an den Maßen.
 */
export function testProject(): Project {
  const room = testRoom()
  const bed: Assembly = {
    id: 'bett-1',
    kind: 'hochbett',
    name: tk('Hochbett'),
    detached: [],
    params: defaultBedParams({
      // Altbau-Praxis (siehe docs/recherche): freistehend auf vier KVH-Pfosten 80×80, an der
      // Sockelleiste ausgeklinkt, nur zur Kippsicherung an der Wand befestigt, Stuck bleibt frei.
      type: 'freistehend',
      deckHeight: 1900,
      braces: false,
      // Hintere linke Ecke von der Tür aus: Ecke zwischen Wand A (Fenster) und Wand D
      x: room.length - (2000 + 20 + 160),
      y: 0,
    }),
  }
  return {
    version: 1,
    name: tk('Beispielzimmer'),
    room,
    wallObjects: [
      {
        id: 'fenster-links', // i18n-ok
        kind: 'fenster',
        name: tk('Fenster links'),
        wall: 'A',
        offset: 800,
        width: 1150,
        sillHeight: 850,
        height: 1900,
        revealDepth: 280,
        frameWidth: 60,
        niche: { below: false, belowDepth: 120 },
        sashes: [
          { opening: 'dreh', hinge: 'links' }, // i18n-ok
          { opening: 'drehkipp', hinge: 'rechts' }, // i18n-ok
        ],
        sashThickness: 75,
        handleProjection: 70,
        sill: { enabled: true, projection: 40, thickness: 30, sideOverhang: 30 },
        displayAngle: 0,
      },
      {
        id: 'fenster-rechts', // i18n-ok
        kind: 'fenster',
        name: tk('Fenster rechts'),
        wall: 'A',
        offset: 2750,
        width: 1150,
        sillHeight: 850,
        height: 1900,
        revealDepth: 280,
        frameWidth: 60,
        niche: { below: false, belowDepth: 120 },
        sashes: [
          { opening: 'dreh', hinge: 'links' }, // i18n-ok
          { opening: 'drehkipp', hinge: 'rechts' }, // i18n-ok
        ],
        sashThickness: 75,
        handleProjection: 70,
        sill: { enabled: true, projection: 40, thickness: 30, sideOverhang: 30 },
        displayAngle: 0,
      },
      {
        id: 'heizung-links', // i18n-ok
        kind: 'heizkoerper',
        name: tk('Heizkörper links'),
        wall: 'A',
        offset: 900,
        width: 950,
        bottom: 150,
        height: 500,
        depth: 100,
        wallGap: 50,
        convectionClearance: 100,
      },
      {
        id: 'heizung-rechts', // i18n-ok
        kind: 'heizkoerper',
        name: tk('Heizkörper rechts'),
        wall: 'A',
        offset: 2850,
        width: 950,
        bottom: 150,
        height: 500,
        depth: 100,
        wallGap: 50,
        convectionClearance: 100,
      },
      {
        id: 'tuer',
        kind: 'tuer',
        name: tk('Tür'),
        wall: 'C',
        offset: 1000,
        width: 900,
        height: 2150,
        hinge: 'rechts', // i18n-ok
        opensInward: false,
        displayAngle: 0,
      },
      { id: 'steckdose-1', kind: 'steckdose', name: tk('Steckdose'), wall: 'C', offset: 2150, width: 80, bottom: 300, height: 80 },
    ],
    furniture: [
      { id: 'tisch-1', kind: 'schreibtisch', name: tk('Schreibtisch'), x: room.length - 1500 - 150, y: 350, z: 0, sx: 1400, sy: 700, sz: 750, rotation: 0 },
      { id: 'person-1', kind: 'person-stehend', name: tk('Person 1,75 m'), x: 1800, y: 1900, z: 0, sx: 450, sy: 280, sz: 1750, rotation: 0 },
    ],
    members: [],
    panels: [],
    assemblies: [bed],
    joints: [],
    settings: {
      safetyProfile: 'jugendliche',
      rentalMode: false,
      personHeight: 1750,
      acknowledged: [],
      jointPreference: 'zerlegbar',
      loadProfile: 'bett',
      priceOverrides: {},
    },
    estimated: [],
  }
}

export function emptyProject(length = 4000, width = 3500, height = 2500): Project {
  const p = testProject()
  return {
    ...p,
    name: tk('Neues Zimmer'),
    // neutrale, vorsichtige Annahmen statt der Wände und Decke des Beispielzimmers
    room: {
      ...testRoom(),
      length,
      width,
      height,
      wallThickness: 240,
      walls: { A: { material: 'leichtbau' }, B: { material: 'leichtbau' }, C: { material: 'leichtbau' }, D: { material: 'leichtbau' } },
      floor: 'estrich',
      ceiling: 'schwach',
      cornice: { enabled: false, height: 120, projection: 120, shape: 'kehle' },
      corniceOverrides: {},
      rosettes: [],
    },
    wallObjects: [],
    furniture: [],
    assemblies: [],
    estimated: [],
  }
}
