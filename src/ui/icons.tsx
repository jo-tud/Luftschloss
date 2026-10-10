/**
 * Einheitlicher Symbolsatz (Lucide, als SVG ins Bundle übernommen – offline tauglich). Alle Symbole
 * in einer Größe und Strichstärke, damit Werkzeugleiste und Kopfzeilen ruhig wirken.
 */
import type { LucideIcon } from 'lucide-react'

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
