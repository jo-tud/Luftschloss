import { tk } from '../i18n'

/**
 * Was ein Arbeitsschritt im Verbindungsdetail bewegt: vorher = Beschläge bzw. Leiste an das
 * durchlaufende Holz, fuegen = das anzusetzende Teil kommt in seine Lage, befestigen = Schrauben,
 * Bolzen und Holznägel nach dem Fügen. Schritte ohne Bewegung zeigen die Teile auseinander.
 */
export type GuideAnim = 'vorher' | 'fuegen' | 'befestigen'
export interface GuideStep {
  t: string
  at: GuideAnim[]
}
const S = (t: string, ...at: GuideAnim[]): GuideStep => ({ t, at })

/**
 * Erklärung je Verbindungsart: wie sie wirkt und wie man sie Schritt für Schritt herstellt.
 * Angezeigt im Verbindungsdetail und im Bauplan (Texte mit tr()).
 */
export const JOINT_GUIDE: Record<string, { how: string; steps: GuideStep[] }> = {
  winkel: {
    how: tk('Zwei Stahlwinkel in den Innenecken nehmen die Last über die Schrauben auf. Sie halten senkrecht gut, verdrehen sich aber leicht – das Gestell braucht deshalb Kopfbänder, Platten oder die Wand zur Aussteifung.'),
    steps: [
      S(tk('Teile auf Länge sägen, Enden rechtwinklig.')),
      S(tk('Teil anhalten, Lage mit Bleistift anzeichnen, mit Zwinge fixieren.'), 'fuegen'),
      S(tk('Winkel in die Innenecke legen und alle Löcher mit Winkelschrauben 5 × 50 verschrauben.'), 'befestigen'),
      S(tk('Zweiten Winkel gegenüber setzen.'), 'befestigen'),
    ],
  },
  balkenschuh: {
    how: tk('Der Querträger liegt mit seinem Ende in einem Stahlschuh, der seitlich am Hauptträger verschraubt ist. Die Last geht über den Boden des Schuhs und viele kurze Schrauben in den Hauptträger.'),
    steps: [
      S(tk('Höhe des Querträgers am Hauptträger anzeichnen (Oberkanten bündig).')),
      S(tk('Balkenschuh anhalten und mit allen Löchern in den Hauptträger schrauben (5 × 50).'), 'vorher'),
      S(tk('Querträger von oben in den Schuh einlegen.'), 'fuegen'),
      S(tk('Seitliche Löcher in den Querträger verschrauben.'), 'befestigen'),
    ],
  },
  schlossschraube: {
    how: tk('Gewindebolzen M10 gehen ganz durch das Holz und werden mit Scheibe und Mutter angezogen. Liegen die Hölzer aneinander, wird quer durch beide gebolzt; bei einem stumpfen Stoß geht der Bolzen durch das durchlaufende Holz ins Hirnholz und greift in eine Quermutter in einer Tasche. Zerlegbar und kräftig.'),
    steps: [
      S(tk('Teile zusammenspannen (Zwingen), Lage prüfen.'), 'fuegen'),
      S(tk('Ø 11 mm rechtwinklig durchbohren – am besten mit Bohrständer oder Bohrhilfe, von beiden Seiten.')),
      S(tk('Beim stumpfen Stoß: Querbohrung Ø 25 mm für die Mutter von innen, 70 mm vom Ende.')),
      S(tk('Bolzen einschlagen (der Vierkant zieht sich ins Holz), Scheibe und Mutter aufsetzen, anziehen.'), 'befestigen'),
      S(tk('Nach einigen Wochen nachziehen – das Holz setzt sich.')),
    ],
  },
  holzbauschraube: {
    how: tk('Lange Tellerkopfschrauben 8 × 160 ziehen die Hölzer zusammen. Im Hirnholz halten Schrauben schlechter, deshalb mehrere Schrauben und nur für mittlere Lasten. Schnell und ohne Spezialwerkzeug.'),
    steps: [
      S(tk('Teile ausrichten und mit Zwinge fixieren.'), 'fuegen'),
      S(tk('Im durchlaufenden Holz Ø 5 mm vorbohren, damit nichts reißt.')),
      S(tk('Schrauben mit kräftigem Akkuschrauber eindrehen, bis der Kopf bündig sitzt.'), 'befestigen'),
    ],
  },
  bettschraube: {
    how: tk('Wie im Möbelbau: Eine Bettschraube geht durch das durchlaufende Holz ins Hirnholz und greift in eine Zylindermutter in einer Querbohrung. Von außen sieht man nur einen flachen Kopf, die Verbindung ist zerlegbar.'),
    steps: [
      S(tk('Bohrschablone anlegen und Ø 9 mm durch das durchlaufende Holz bohren.')),
      S(tk('Ins Hirnholz des anschließenden Teils genau in der Achse weiterbohren (Tiefe ca. 80 mm).')),
      S(tk('Von innen die Querbohrung für die Zylindermutter bohren (Ø 10 mm, 60–70 mm vom Ende).')),
      S(tk('Mutter einsetzen, Schraube eindrehen und mit Inbus anziehen.'), 'fuegen', 'befestigen'),
    ],
  },
  auflage: {
    how: tk('Das obere Holz liegt einfach auf dem unteren. Die Last geht über Druck Holz auf Holz – die tragfähigste einfache Lösung. Zwei Schrauben verhindern nur das Verrutschen.'),
    steps: [
      S(tk('Auflagepunkte anzeichnen, Oberkante prüfen.')),
      S(tk('Oberes Holz auflegen.'), 'fuegen'),
      S(tk('Ø 5 mm vorbohren und zwei Schrauben 8 × 160 von oben eindrehen.'), 'befestigen'),
    ],
  },
  auflagerleiste: {
    how: tk('Eine Leiste wird unter dem späteren Trägerende an das durchlaufende Holz geschraubt; der Träger liegt darauf. Die Schrauben der Leiste tragen auf Abscheren – einfach, aber nur für leichtere Lasten.'),
    steps: [
      S(tk('Unterkante des Trägers anzeichnen.')),
      S(tk('Leiste 40 × 60 bündig darunter anlegen und mit 3 Schrauben 5 × 50 befestigen (vorbohren).'), 'vorher'),
      S(tk('Träger auflegen und mit einer Schraube gegen Verrutschen sichern.'), 'fuegen', 'befestigen'),
    ],
  },
  ausklinkung: {
    how: tk('Das anschließende Holz sitzt 15 mm tief in einer flachen Einlassung im durchlaufenden Holz. Die Last geht über die Einlassung Holz auf Holz, die Schrauben halten nur zusammen. Ausklinkungen höchstens ein Viertel der Holzhöhe tief.'),
    steps: [
      S(tk('Umriss des anschließenden Holzes auf dem durchlaufenden anzeichnen, Tiefe 15 mm.')),
      S(tk('Ränder mit Säge auf Tiefe einsägen, dazwischen mehrere Schnitte.')),
      S(tk('Mit dem Stechbeitel ausräumen und den Grund glätten.')),
      S(tk('Teil einsetzen, Ø 5 mm vorbohren und verschrauben.'), 'fuegen', 'befestigen'),
    ],
  },
  ueberblattung: {
    how: tk('Beide Hölzer werden auf halbe Dicke ausgenommen und greifen ineinander, die Oberflächen bleiben bündig. Leim und zwei Schrauben halten das Blatt zusammen. Es bleibt nur etwa die Hälfte des Querschnitts – für geringere Lasten.'),
    steps: [
      S(tk('Breite des anderen Holzes auf beiden Teilen anzeichnen, Tiefe = halbe Dicke.')),
      S(tk('Ränder auf Tiefe einsägen, dazwischen mehrere Schnitte im Abstand von 1 cm.')),
      S(tk('Mit Stechbeitel ausräumen, Grund eben stemmen; Passung trocken prüfen.')),
      S(tk('Leimen, zusammenstecken (das Blatt wird quer eingelegt) und zwei Schrauben diagonal setzen.'), 'fuegen', 'befestigen'),
    ],
  },
  schwalbenschwanz: {
    how: tk('Wie eine Überblattung, aber das Blatt wird zum Ende hin breiter (Neigung 1:6). Dadurch hält es auch auf Zug ohne Metall. Das Blatt wird quer von der Seite eingelegt, nicht längs eingeschoben.'),
    steps: [
      S(tk('Schwalbenschwanz mit Schmiege (1:6) auf dem anschließenden Holz anreißen, Dicke = halbe Holzdicke.')),
      S(tk('Blatt aussägen und die Flanken sauber nacharbeiten.')),
      S(tk('Blatt auf das durchlaufende Holz legen und den Umriss übertragen.')),
      S(tk('Sitz auf halbe Tiefe einsägen und ausstemmen, schräge Flanken genau treffen.')),
      S(tk('Von der Seite einlegen, leimen und mit zwei Holznägeln sichern.'), 'fuegen', 'befestigen'),
    ],
  },
  zapfen: {
    how: tk('Ein Zapfen am Ende des einen Holzes steckt in einem passenden Zapfenloch des anderen. Ein Holznagel quer hindurch zieht die Verbindung zusammen. Klassisch, steif und ohne Metall – aber Handarbeit.'),
    steps: [
      S(tk('Zapfen anreißen: Dicke ein Drittel des Holzes, oben und unten Brüstung stehen lassen.')),
      S(tk('Wangen und Brüstungen mit der Feinsäge absägen.')),
      S(tk('Zapfenloch anreißen, mit dem Forstnerbohrer vorbohren und mit dem Stechbeitel sauber ausstemmen.')),
      S(tk('Trocken zusammenstecken, Holznagelloch Ø 16 mm quer durchbohren.'), 'fuegen'),
      S(tk('Leimen, zusammenstecken und den Holznagel einschlagen.'), 'befestigen'),
    ],
  },
  holzduebel: {
    how: tk('Zwei geleimte Holzdübel verbinden Stirnseite und Fläche, unsichtbar. Gut für Geländerteile und leichte Lasten, nicht für tragende Stöße.'),
    steps: [
      S(tk('Dübellöcher im Hirnholz bohren (Ø 10 mm, 40 mm tief, mit Dübelhilfe).')),
      S(tk('Dübelspitzen einsetzen, Teile zusammendrücken – die Spitzen markieren die Gegenlöcher.')),
      S(tk('Gegenlöcher bohren, Leim in die Löcher, Dübel einsetzen und zusammenspannen.'), 'fuegen'),
    ],
  },
  lose: {
    how: tk('Die Latten liegen einfach auf den Zargen und werden nur durch ihr Gewicht und die Matratze gehalten. Filz- oder Gummistreifen verhindern Quietschen; eine Schraube je Latte verhindert Verrutschen.'),
    steps: [
      S(tk('Filz- oder Gummistreifen auf die Zargen kleben.')),
      S(tk('Latten im gleichen Abstand auflegen (Abstandsklotz verwenden).'), 'fuegen'),
      S(tk('Optional je Latte eine Schraube 5 × 50 gegen Verrutschen.'), 'befestigen'),
    ],
  },
  stecken: {
    how: tk('Ein Rundstab steckt in einer passenden Bohrung im Holm und wird eingeleimt – die übliche Lösung für Leitersprossen und Geländerstäbe.'),
    steps: [
      S(tk('Bohrungen anzeichnen (gleiche Abstände, Schablone).')),
      S(tk('Mit Forstnerbohrer im Durchmesser des Stabs bohren, Tiefe zwei Drittel der Holzdicke (Tiefenanschlag).')),
      S(tk('Leim in die Bohrung, Stab einsetzen, Gegenseite aufsetzen und zusammenspannen.'), 'fuegen'),
    ],
  },
  gratnut: {
    how: tk('Die Stufe hat am Ende eine schwalbenschwanzförmige Feder, die in eine passende Nut quer in der Wange geschoben wird. Durch die schrägen Flanken kann sie nicht herausfallen. Eingeschoben wird von der Seite entlang der Nut.'),
    steps: [
      S(tk('Nutlage auf der Wange anreißen (Steigung der Leiter beachten).')),
      S(tk('Nut mit Oberfräse und Gratfräser an einer Führungsleiste fräsen, Tiefe ca. ein Drittel der Wangendicke.')),
      S(tk('Gratfeder an der Stufe mit demselben Fräser anfräsen, Passung an einem Reststück testen.')),
      S(tk('Stufe von der Seite einschieben, leimen und mit 2 Schrauben sichern.'), 'fuegen', 'befestigen'),
    ],
  },
  seilbefestigung: {
    how: tk('Das Seil wird durch eine Bohrung oder eine Augschraube geführt und verknotet. Kräfte gehen als Zug in das Holz bzw. die Schraube.'),
    steps: [
      S(tk('Bohrung Ø 14 mm setzen bzw. Augschraube eindrehen.')),
      S(tk('Kanten der Bohrung brechen, damit das Seil nicht scheuert.')),
      S(tk('Seil durchführen und mit Achtknoten sichern.'), 'fuegen'),
    ],
  },
  gewindestange: {
    how: tk('Eine Gewindestange M10 hängt das Holz an der Decke auf bzw. verspannt es. Große Unterlegscheiben verteilen die Kraft, Kontermuttern sichern.'),
    steps: [
      S(tk('Ø 11 mm durch das Holz bohren.')),
      S(tk('Gewindestange durchstecken, oben und unten große Scheiben und Muttern setzen.'), 'fuegen'),
      S(tk('Ausrichten, anziehen und mit Kontermutter sichern.'), 'befestigen'),
    ],
  },
  kopfband: {
    how: tk('Das schräge Kopfband steift die Ecke zwischen Pfosten und Zarge aus, damit das Bett nicht wackelt. Die 45°-Enden liegen satt an, Schrauben halten es in Position.'),
    steps: [
      S(tk('Kopfband auf Länge sägen, beide Enden auf 45° (Kapp- oder Gehrungssäge).')),
      S(tk('In die Ecke halten und die Lage anzeichnen.'), 'fuegen'),
      S(tk('Je Ende 2 Schrauben vom Rand des Kopfbands in Pfosten bzw. Zarge – Ø 5 mm vorbohren, sonst spaltet es.'), 'befestigen'),
    ],
  },
  versatz: {
    how: tk('Das Kopfbandende sitzt 15 mm tief in einer Einlassung in Pfosten und Zarge. So drückt das Kopfband Holz auf Holz, statt nur an Schrauben zu hängen, und trägt deutlich mehr. Je eine Schraube sichert nur.'),
    steps: [
      S(tk('Kopfband auf Länge sägen (inklusive 2 × 15 mm für die Einlassungen), Enden auf 45°.')),
      S(tk('Kopfband anhalten und den Umriss auf Pfosten und Zarge anreißen.')),
      S(tk('Einlassungen mit Japansäge auf 15 mm einsägen und mit dem Stechbeitel ausstemmen.')),
      S(tk('Kopfband einsetzen und je Ende eine Schraube setzen.'), 'fuegen', 'befestigen'),
    ],
  },
}
