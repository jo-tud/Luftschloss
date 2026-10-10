import type { Assembly, LoftBedParams, Project, Room } from './types'

export function defaultBedParams(over: Partial<LoftBedParams> = {}): LoftBedParams {
  return {
    type: 'freistehend',
    x: 0,
    y: 0,
    rotation: 0,
    mattressLength: 2000,
    mattressWidth: 1000,
    mattressThickness: 160,
    mattressGap: 10,
    deckHeight: 1800,
    postCatalogId: 'kvh-80x80',
    railCatalogId: 'kvh-60x120',
    joistCatalogId: 'geh-44x74',
    deck: 'latten',
    deckCatalogId: 'geh-24x94',
    joistSpacing: 500,
    slatGap: 60,
    guard: 'bretter',
    guardHeight: 400,
    guardSides: { vorne: true, hinten: true, links: true, rechts: true },
    guardCatalogId: 'geh-44x74',
    ladder: 'stufen',
    ladderSide: 'vorne',
    ladderOffset: 150,
    ladderWidth: 500,
    ladderCatalogId: 'geh-44x94',
    rungCatalogId: 'rund-buche-30',
    ladderAngle: 70,
    braces: true,
    wallFit: 'ausklinken',
    wallEnd: 'rechts',
    ceilingGap: 15,
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
      A: { material: 'vollziegel' },
      B: { material: 'vollziegel' },
      C: { material: 'vollziegel' },
      D: { material: 'vollziegel' },
    },
    floor: 'holzdielen',
    ceiling: 'holzbalken',
    cornice: { enabled: true, height: 200, projection: 280, shape: 'kehle' },
    corniceOverrides: {},
    skirting: { enabled: true, height: 60, depth: 18 },
    rosettes: [
      { id: 'rosette-1', x: 2150, y: 2975, diameter: 800, depth: 40, lampDrop: 1150, lampDiameter: 560 },
    ],
  }
}

/**
 * Das Zimmer, an dem die App zuerst getestet wird: 4,30 m Fensterseite (Wand A), 5,95 m Tiefe.
 * Zwei Fenster in Wand A, Tür in Wand C. Alle Maße außer Länge und Breite sind aus Fotos geschätzt.
 */
export function testProject(): Project {
  const room = testRoom()
  const bed: Assembly = {
    id: 'bett-1',
    kind: 'hochbett',
    name: 'Hochbett',
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
    name: 'Testzimmer',
    room,
    wallObjects: [
      {
        id: 'fenster-links',
        kind: 'fenster',
        name: 'Fenster links',
        wall: 'A',
        offset: 800,
        width: 1150,
        sillHeight: 850,
        height: 1900,
        revealDepth: 280,
        frameWidth: 60,
        niche: { below: false, belowDepth: 120 },
        sashes: [
          { opening: 'dreh', hinge: 'links' },
          { opening: 'drehkipp', hinge: 'rechts' },
        ],
        sashThickness: 75,
        handleProjection: 70,
        sill: { enabled: true, projection: 40, thickness: 30, sideOverhang: 30 },
        displayAngle: 0,
      },
      {
        id: 'fenster-rechts',
        kind: 'fenster',
        name: 'Fenster rechts',
        wall: 'A',
        offset: 2750,
        width: 1150,
        sillHeight: 850,
        height: 1900,
        revealDepth: 280,
        frameWidth: 60,
        niche: { below: false, belowDepth: 120 },
        sashes: [
          { opening: 'dreh', hinge: 'links' },
          { opening: 'drehkipp', hinge: 'rechts' },
        ],
        sashThickness: 75,
        handleProjection: 70,
        sill: { enabled: true, projection: 40, thickness: 30, sideOverhang: 30 },
        displayAngle: 0,
      },
      {
        id: 'heizung-links',
        kind: 'heizkoerper',
        name: 'Heizkörper links',
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
        id: 'heizung-rechts',
        kind: 'heizkoerper',
        name: 'Heizkörper rechts',
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
        name: 'Tür',
        wall: 'C',
        offset: 1000,
        width: 900,
        height: 2150,
        hinge: 'rechts',
        opensInward: false,
        displayAngle: 0,
      },
      { id: 'steckdose-1', kind: 'steckdose', name: 'Steckdose', wall: 'C', offset: 2150, width: 80, bottom: 300, height: 80 },
    ],
    furniture: [
      { id: 'tisch-1', kind: 'schreibtisch', name: 'Schreibtisch', x: room.length - 1500 - 150, y: 350, z: 0, sx: 1400, sy: 700, sz: 750, rotation: 0 },
      { id: 'person-1', kind: 'person-stehend', name: 'Person 1,75 m', x: 1800, y: 1900, z: 0, sx: 450, sy: 280, sz: 1750, rotation: 0 },
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
      priceOverrides: {},
    },
    estimated: [
      'room.height',
      'room.cornice',
      'room.rosettes',
      'room.skirting',
      'wallObjects.fenster-links',
      'wallObjects.fenster-rechts',
      'wallObjects.heizung-links',
      'wallObjects.heizung-rechts',
      'wallObjects.tuer',
    ],
  }
}

export function emptyProject(length = 4000, width = 3500, height = 2500): Project {
  const p = testProject()
  return {
    ...p,
    name: 'Neues Zimmer',
    room: { ...testRoom(), length, width, height, cornice: { enabled: false, height: 120, projection: 120, shape: 'kehle' }, rosettes: [] },
    wallObjects: [],
    furniture: [],
    assemblies: [],
    estimated: [],
  }
}
