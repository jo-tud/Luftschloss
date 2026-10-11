/**
 * Einheitlicher Symbolsatz (Lucide, als SVG ins Bundle übernommen – offline tauglich). Alle Symbole
 * in einer Größe und Strichstärke, damit Werkzeugleiste und Kopfzeilen ruhig wirken.
 */
import type { LucideIcon } from 'lucide-react'
import {
  Armchair,
  BedDouble,
  BrickWall,
  Box,
  Camera as CameraIcon,
  Check,
  ClipboardCopy,
  Compass as CompassIcon,
  DoorOpen,
  Grid2x2,
  Heater,
  Info as InfoIcon,
  Lightbulb,
  OctagonX,
  Package,
  Pencil,
  PersonStanding,
  Plug,
  Pointer,
  Printer,
  RectangleHorizontal as RectIcon,
  Search,
  Sofa,
  Square,
  Sun,
  ToyBrick,
  Trash2 as TrashIcon,
  TriangleAlert,
} from 'lucide-react'

export {
  Camera,
  Copy,
  Crosshair,
  DraftingCompass,
  Ellipsis,
  Eye,
  CircleHelp,
  Globe,
  House,
  Info,
  Layers,
  Menu,
  MousePointer2,
  Play,
  Plus,
  ReceiptEuro,
  Compass,
  RectangleHorizontal,
  RectangleVertical,
  Redo2,
  RotateCcw,
  RotateCw,
  Scale,
  Scissors,
  SquareDashed,
  TabletSmartphone,
  Trash2,
  Undo2,
  Ungroup,
} from 'lucide-react'

export function Ico({ i: I, size = 17 }: { i: LucideIcon; size?: number }) {
  return <I size={size} strokeWidth={1.8} aria-hidden className="ico" />
}

/** Symbole nach Bedeutung – statt Emojis, die je nach System anders aussehen */
export const SYM = {
  bett: BedDouble,
  assistent: CompassIcon,
  person: PersonStanding,
  fenster: Grid2x2,
  tuer: DoorOpen,
  heizkoerper: Heater,
  steckdose: Plug,
  vorsprung: BrickWall,
  wandobjekt: Square,
  lampe: Lightbulb,
  moebel: Box,
  flaeche: Square,
  teile: RectIcon,
  zeigen: Pointer,
  drucken: Printer,
  kopieren: ClipboardCopy,
  suchen: Search,
  loeschen: TrashIcon,
  stauraum: Package,
  spielen: ToyBrick,
  sitzen: Sofa,
  schreibtisch: Armchair,
  foto: CameraIcon,
  sonne: Sun,
  bearbeiten: Pencil,
  ok: Check,
  fehler: OctagonX,
  warnung: TriangleAlert,
  hinweis: InfoIcon,
} satisfies Record<string, LucideIcon>
export type SymKey = keyof typeof SYM

/** Symbol nach Bedeutung, dekorativ (Text daneben trägt die Aussage) */
export function Sym({ k, size = 15, className }: { k: SymKey; size?: number; className?: string }) {
  const I = SYM[k]
  return <I size={size} strokeWidth={1.8} aria-hidden className={`ico sym${className ? ` ${className}` : ''}`} />
}

/** Symbol je Wandobjekt (Liste und Kopf der Eigenschaften) */
export const WALL_OBJECT_SYM: Record<string, SymKey> = { fenster: 'fenster', tuer: 'tuer', heizkoerper: 'heizkoerper', steckdose: 'steckdose', vorsprung: 'vorsprung' }
