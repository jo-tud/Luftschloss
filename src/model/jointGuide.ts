import { tk } from '../i18n'

/**
 * Erklärung je Verbindungsart: wie sie wirkt und wie man sie Schritt für Schritt herstellt.
 * Angezeigt im Verbindungsdetail und im Bauplan (Texte mit tr()).
 */
export const JOINT_GUIDE: Record<string, { how: string; steps: string[] }> = {
  winkel: {
    how: tk('Zwei Stahlwinkel in den Innenecken nehmen die Last über die Schrauben auf. Sie halten senkrecht gut, verdrehen sich aber leicht – das Gestell braucht deshalb Kopfbänder, Platten oder die Wand zur Aussteifung.'),
    steps: [
      tk('Teile auf Länge sägen, Enden rechtwinklig.'),
      tk('Teil anhalten, Lage mit Bleistift anzeichnen, mit Zwinge fixieren.'),
      tk('Winkel in die Innenecke legen und alle Löcher mit Winkelschrauben 5 × 50 verschrauben.'),
      tk('Zweiten Winkel gegenüber setzen.'),
    ],
  },
  balkenschuh: {
    how: tk('Der Querträger liegt mit seinem Ende in einem Stahlschuh, der seitlich am Hauptträger verschraubt ist. Die Last geht über den Boden des Schuhs und viele kurze Schrauben in den Hauptträger.'),
    steps: [
      tk('Höhe des Querträgers am Hauptträger anzeichnen (Oberkanten bündig).'),
      tk('Balkenschuh anhalten und mit allen Löchern in den Hauptträger schrauben (5 × 50).'),
      tk('Querträger von oben in den Schuh einlegen.'),
      tk('Seitliche Löcher in den Querträger verschrauben.'),
    ],
  },
  schlossschraube: {
    how: tk('Gewindebolzen M10 gehen ganz durch das Holz und werden mit Scheibe und Mutter angezogen. Liegen die Hölzer aneinander, wird quer durch beide gebolzt; bei einem stumpfen Stoß geht der Bolzen durch das durchlaufende Holz ins Hirnholz und greift in eine Quermutter in einer Tasche. Zerlegbar und kräftig.'),
    steps: [
      tk('Teile zusammenspannen (Zwingen), Lage prüfen.'),
      tk('Ø 11 mm rechtwinklig durchbohren – am besten mit Bohrständer oder Bohrhilfe, von beiden Seiten.'),
      tk('Beim stumpfen Stoß: Querbohrung Ø 25 mm für die Mutter von innen, 70 mm vom Ende.'),
      tk('Bolzen einschlagen (der Vierkant zieht sich ins Holz), Scheibe und Mutter aufsetzen, anziehen.'),
      tk('Nach einigen Wochen nachziehen – das Holz setzt sich.'),
    ],
  },
  holzbauschraube: {
    how: tk('Lange Tellerkopfschrauben 8 × 160 ziehen die Hölzer zusammen. Im Hirnholz halten Schrauben schlechter, deshalb mehrere Schrauben und nur für mittlere Lasten. Schnell und ohne Spezialwerkzeug.'),
    steps: [
      tk('Teile ausrichten und mit Zwinge fixieren.'),
      tk('Im durchlaufenden Holz Ø 5 mm vorbohren, damit nichts reißt.'),
      tk('Schrauben mit kräftigem Akkuschrauber eindrehen, bis der Kopf bündig sitzt.'),
    ],
  },
  bettschraube: {
    how: tk('Wie im Möbelbau: Eine Bettschraube geht durch das durchlaufende Holz ins Hirnholz und greift in eine Zylindermutter in einer Querbohrung. Von außen sieht man nur einen flachen Kopf, die Verbindung ist zerlegbar.'),
    steps: [
      tk('Bohrschablone anlegen und Ø 9 mm durch das durchlaufende Holz bohren.'),
      tk('Ins Hirnholz des anschließenden Teils genau in der Achse weiterbohren (Tiefe ca. 80 mm).'),
      tk('Von innen die Querbohrung für die Zylindermutter bohren (Ø 10 mm, 60–70 mm vom Ende).'),
      tk('Mutter einsetzen, Schraube eindrehen und mit Inbus anziehen.'),
    ],
  },
  auflage: {
    how: tk('Das obere Holz liegt einfach auf dem unteren. Die Last geht über Druck Holz auf Holz – die tragfähigste einfache Lösung. Zwei Schrauben verhindern nur das Verrutschen.'),
    steps: [
      tk('Auflagepunkte anzeichnen, Oberkante prüfen.'),
      tk('Oberes Holz auflegen.'),
      tk('Ø 5 mm vorbohren und zwei Schrauben 8 × 160 von oben eindrehen.'),
    ],
  },
  auflagerleiste: {
    how: tk('Eine Leiste wird unter dem späteren Trägerende an das durchlaufende Holz geschraubt; der Träger liegt darauf. Die Schrauben der Leiste tragen auf Abscheren – einfach, aber nur für leichtere Lasten.'),
    steps: [
      tk('Unterkante des Trägers anzeichnen.'),
      tk('Leiste 40 × 60 bündig darunter anlegen und mit 3 Schrauben 5 × 50 befestigen (vorbohren).'),
      tk('Träger auflegen und mit einer Schraube gegen Verrutschen sichern.'),
    ],
  },
  ausklinkung: {
    how: tk('Das anschließende Holz sitzt 15 mm tief in einer flachen Einlassung im durchlaufenden Holz. Die Last geht über die Einlassung Holz auf Holz, die Schrauben halten nur zusammen. Ausklinkungen höchstens ein Viertel der Holzhöhe tief.'),
    steps: [
      tk('Umriss des anschließenden Holzes auf dem durchlaufenden anzeichnen, Tiefe 15 mm.'),
      tk('Ränder mit Säge auf Tiefe einsägen, dazwischen mehrere Schnitte.'),
      tk('Mit dem Stechbeitel ausräumen und den Grund glätten.'),
      tk('Teil einsetzen, Ø 5 mm vorbohren und verschrauben.'),
    ],
  },
  ueberblattung: {
    how: tk('Beide Hölzer werden auf halbe Dicke ausgenommen und greifen ineinander, die Oberflächen bleiben bündig. Leim und zwei Schrauben halten das Blatt zusammen. Es bleibt nur etwa die Hälfte des Querschnitts – für geringere Lasten.'),
    steps: [
      tk('Breite des anderen Holzes auf beiden Teilen anzeichnen, Tiefe = halbe Dicke.'),
      tk('Ränder auf Tiefe einsägen, dazwischen mehrere Schnitte im Abstand von 1 cm.'),
      tk('Mit Stechbeitel ausräumen, Grund eben stemmen; Passung trocken prüfen.'),
      tk('Leimen, zusammenstecken (das Blatt wird quer eingelegt) und zwei Schrauben diagonal setzen.'),
    ],
  },
  schwalbenschwanz: {
    how: tk('Wie eine Überblattung, aber das Blatt wird zum Ende hin breiter (Neigung 1:6). Dadurch hält es auch auf Zug ohne Metall. Das Blatt wird quer von der Seite eingelegt, nicht längs eingeschoben.'),
    steps: [
      tk('Schwalbenschwanz mit Schmiege (1:6) auf dem anschließenden Holz anreißen, Dicke = halbe Holzdicke.'),
      tk('Blatt aussägen und die Flanken sauber nacharbeiten.'),
      tk('Blatt auf das durchlaufende Holz legen und den Umriss übertragen.'),
      tk('Sitz auf halbe Tiefe einsägen und ausstemmen, schräge Flanken genau treffen.'),
      tk('Von der Seite einlegen, leimen und mit zwei Holznägeln sichern.'),
    ],
  },
  zapfen: {
    how: tk('Ein Zapfen am Ende des einen Holzes steckt in einem passenden Zapfenloch des anderen. Ein Holznagel quer hindurch zieht die Verbindung zusammen. Klassisch, steif und ohne Metall – aber Handarbeit.'),
    steps: [
      tk('Zapfen anreißen: Dicke ein Drittel des Holzes, oben und unten Brüstung stehen lassen.'),
      tk('Wangen und Brüstungen mit der Feinsäge absägen.'),
      tk('Zapfenloch anreißen, mit dem Forstnerbohrer vorbohren und mit dem Stechbeitel sauber ausstemmen.'),
      tk('Trocken zusammenstecken, Holznagelloch Ø 16 mm quer durchbohren.'),
      tk('Leimen, zusammenstecken und den Holznagel einschlagen.'),
    ],
  },
  holzduebel: {
    how: tk('Zwei geleimte Holzdübel verbinden Stirnseite und Fläche, unsichtbar. Gut für Geländerteile und leichte Lasten, nicht für tragende Stöße.'),
    steps: [
      tk('Dübellöcher im Hirnholz bohren (Ø 10 mm, 40 mm tief, mit Dübelhilfe).'),
      tk('Dübelspitzen einsetzen, Teile zusammendrücken – die Spitzen markieren die Gegenlöcher.'),
      tk('Gegenlöcher bohren, Leim in die Löcher, Dübel einsetzen und zusammenspannen.'),
    ],
  },
  lose: {
    how: tk('Die Latten liegen einfach auf den Zargen und werden nur durch ihr Gewicht und die Matratze gehalten. Filz- oder Gummistreifen verhindern Quietschen; eine Schraube je Latte verhindert Verrutschen.'),
    steps: [
      tk('Filz- oder Gummistreifen auf die Zargen kleben.'),
      tk('Latten im gleichen Abstand auflegen (Abstandsklotz verwenden).'),
      tk('Optional je Latte eine Schraube 5 × 50 gegen Verrutschen.'),
    ],
  },
  stecken: {
    how: tk('Ein Rundstab steckt in einer passenden Bohrung im Holm und wird eingeleimt – die übliche Lösung für Leitersprossen und Geländerstäbe.'),
    steps: [
      tk('Bohrungen anzeichnen (gleiche Abstände, Schablone).'),
      tk('Mit Forstnerbohrer im Durchmesser des Stabs bohren, Tiefe zwei Drittel der Holzdicke (Tiefenanschlag).'),
      tk('Leim in die Bohrung, Stab einsetzen, Gegenseite aufsetzen und zusammenspannen.'),
    ],
  },
  gratnut: {
    how: tk('Die Stufe hat am Ende eine schwalbenschwanzförmige Feder, die in eine passende Nut quer in der Wange geschoben wird. Durch die schrägen Flanken kann sie nicht herausfallen. Eingeschoben wird von der Seite entlang der Nut.'),
    steps: [
      tk('Nutlage auf der Wange anreißen (Steigung der Leiter beachten).'),
      tk('Nut mit Oberfräse und Gratfräser an einer Führungsleiste fräsen, Tiefe ca. ein Drittel der Wangendicke.'),
      tk('Gratfeder an der Stufe mit demselben Fräser anfräsen, Passung an einem Reststück testen.'),
      tk('Stufe von der Seite einschieben, leimen und mit 2 Schrauben sichern.'),
    ],
  },
  seilbefestigung: {
    how: tk('Das Seil wird durch eine Bohrung oder eine Augschraube geführt und verknotet. Kräfte gehen als Zug in das Holz bzw. die Schraube.'),
    steps: [
      tk('Bohrung Ø 14 mm setzen bzw. Augschraube eindrehen.'),
      tk('Kanten der Bohrung brechen, damit das Seil nicht scheuert.'),
      tk('Seil durchführen und mit Achtknoten sichern.'),
    ],
  },
  gewindestange: {
    how: tk('Eine Gewindestange M10 hängt das Holz an der Decke auf bzw. verspannt es. Große Unterlegscheiben verteilen die Kraft, Kontermuttern sichern.'),
    steps: [
      tk('Ø 11 mm durch das Holz bohren.'),
      tk('Gewindestange durchstecken, oben und unten große Scheiben und Muttern setzen.'),
      tk('Ausrichten, anziehen und mit Kontermutter sichern.'),
    ],
  },
  kopfband: {
    how: tk('Das schräge Kopfband steift die Ecke zwischen Pfosten und Zarge aus, damit das Bett nicht wackelt. Die 45°-Enden liegen satt an, Schrauben halten es in Position.'),
    steps: [
      tk('Kopfband auf Länge sägen, beide Enden auf 45° (Kapp- oder Gehrungssäge).'),
      tk('In die Ecke halten und die Lage anzeichnen.'),
      tk('Je Ende 2 Schrauben vom Rand des Kopfbands in Pfosten bzw. Zarge – Ø 5 mm vorbohren, sonst spaltet es.'),
    ],
  },
  versatz: {
    how: tk('Das Kopfbandende sitzt 15 mm tief in einer Einlassung in Pfosten und Zarge. So drückt das Kopfband Holz auf Holz, statt nur an Schrauben zu hängen, und trägt deutlich mehr. Je eine Schraube sichert nur.'),
    steps: [
      tk('Kopfband auf Länge sägen (inklusive 2 × 15 mm für die Einlassungen), Enden auf 45°.'),
      tk('Kopfband anhalten und den Umriss auf Pfosten und Zarge anreißen.'),
      tk('Einlassungen mit Japansäge auf 15 mm einsägen und mit dem Stechbeitel ausstemmen.'),
      tk('Kopfband einsetzen und je Ende eine Schraube setzen.'),
    ],
  },
}
