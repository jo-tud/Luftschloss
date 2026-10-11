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

export interface GuideEntry {
  how: string
  steps: GuideStep[]
  /** typische Fehler und wie man sie vermeidet */
  mistakes: string[]
}

/**
 * Erklärung je Verbindungsart: wie sie wirkt, wie man sie Schritt für Schritt herstellt und was
 * dabei oft schiefgeht. Platzhalter in geschweiften Klammern füllt jointPlan() mit den Maßen der
 * jeweiligen Verbindung ({E} = anzusetzendes, {T} = durchlaufendes Teil). Quellen:
 * docs/recherche/verbindungen-anleitungen.md. Varianten „-stoss“ gelten für stumpfe Stöße, bei
 * denen Bolzen bzw. Schrauben durch das durchlaufende Holz ins Hirnholz gehen.
 */
export const JOINT_GUIDE: Record<string, GuideEntry> = {
  winkel: {
    how: tk('Zwei Stahlwinkel in den Innenecken nehmen die Last über die Schrauben auf. Sie halten senkrecht gut, verdrehen sich aber leicht – das Gestell braucht deshalb Kopfbänder, Platten oder die Wand zur Aussteifung.'),
    steps: [
      S(tk('Lage von {E} an {T} mit dem Anschlagwinkel anreißen.')),
      S(tk('{E} ansetzen, mit Zwingen spaltfrei festspannen und den rechten Winkel prüfen.'), 'fuegen'),
      S(tk('Ersten Winkel fest in die Innenecke drücken und alle {n} Löcher mit Schrauben 5 × 50 belegen: erst je eine Schraube pro Schenkel, Lage prüfen, dann den Rest.'), 'befestigen'),
      S(tk('Zweiten Winkel gegenüber genauso setzen.'), 'befestigen'),
    ],
    mistakes: [tk('Nur ein paar Löcher belegt: Der Winkel trägt nur mit allen Schrauben.'), tk('Spalt zwischen den Hölzern: Ein Winkel zieht ihn nicht zu – erst spannen, dann schrauben.')],
  },
  balkenschuh: {
    how: tk('Der Querträger liegt mit seinem Ende in einem Stahlschuh, der seitlich am Hauptträger verschraubt ist. Die Last geht über den Boden des Schuhs und viele kurze Schrauben in den Hauptträger.'),
    steps: [
      S(tk('Oberkante von {E} an {T} anreißen.')),
      S(tk('Balkenschuh an den Riss halten (Boden waagrecht, Seiten lotrecht) und jede Lasche mit 3 Schrauben 5 × 50 in {T} schrauben.'), 'vorher'),
      S(tk('{E} von oben in den Schuh einlegen.'), 'fuegen'),
      S(tk('Seitlich je 3 Schrauben 5 × 50 in {E} – alle Löcher belegen.'), 'befestigen'),
    ],
    mistakes: [tk('Schuh schief angeschraubt: Ein kurzes Reststück des Trägers in den Schuh legen und damit ausrichten.'), tk('Nicht alle Löcher belegt: Der Schuh trägt dann deutlich weniger.')],
  },
  schlossschraube: {
    how: tk('Zwei Gewindebolzen M10 gehen quer durch beide Hölzer und werden mit großer Scheibe und Mutter angezogen. Zerlegbar und kräftig; die Bohrung im Verbund verzeiht kleine Schieflagen.'),
    steps: [
      S(tk('Bolzenmitten anreißen: {abstand} mm auseinander, mindestens {rand} mm vom Rand. Die Kreuze mit dem Anschlagwinkel auf die Gegenseite übertragen.')),
      S(tk('Teile mit Zwingen spaltfrei zusammenspannen und den rechten Winkel prüfen.'), 'fuegen'),
      S(tk('Im Verbund Ø {bohr} mm durch beide Hölzer bohren ({tiefe} mm): von jeder Seite bis zur Mitte, dann treffen sich die Bohrungen auch bei leichter Schieflage.')),
      S(tk('Schlossschraube M10 × {laenge} von außen einschlagen, bis der Vierkant im Holz sitzt. Innen Scheibe Ø 34 mm und Mutter aufsetzen und anziehen, bis die Scheibe gerade nicht einsinkt.'), 'befestigen'),
      S(tk('Nach 4–6 Wochen und zu Beginn der Heizperiode nachziehen – das Holz schwindet.')),
    ],
    mistakes: [tk('Zu nah am Holzende: Mindestens 80 mm zum belasteten Ende, sonst kann das Holz aufreißen.'), tk('Zu fest angezogen: Die Scheibe drückt sich ins Holz – große Scheiben verwenden, mit Gefühl anziehen.'), tk('Kein Leim in die Bohrungen: Die Verbindung soll zerlegbar bleiben.')],
  },
  'schlossschraube-stoss': {
    how: tk('Zwei Bolzen M10 gehen durch das durchlaufende Holz in das Hirnholz des anschließenden und greifen dort in eine Mutter in einer Querbohrung – das Prinzip der Bettschraube. Zerlegbar und unsichtbar von innen.'),
    steps: [
      S(tk('Bohrlage anreißen: zwei Bohrungen in der Mitte von {E}, {abstand} mm auseinander; auf die Außenseite von {T} übertragen.')),
      S(tk('Zuerst die Querbohrungen: auf der Innenseite von {E} {nut} mm vom Ende mit Forstnerbohrer Ø 25 mm bis knapp über die Mitte bohren ({tasche} mm tief).')),
      S(tk('{E} an {T} ansetzen und spaltfrei festspannen.'), 'fuegen'),
      S(tk('Im Verbund Ø {bohr} mm durch {T} in das Hirnholz von {E} bohren, bis der Bohrer in der Querbohrung erscheint ({tiefe} mm). Die große Querbohrung verzeiht schiefes Bohren.')),
      S(tk('Mutter mit Scheibe in die Querbohrung legen, Schlossschraube M10 × {laenge} von außen durchstecken, eindrehen und anziehen.'), 'befestigen'),
      S(tk('Nach einigen Wochen nachziehen.')),
    ],
    mistakes: [tk('Querbohrung zu nah am Ende: Unter 80 mm kann das Hirnholz ausreißen.'), tk('Längsbohrung verfehlt die Querbohrung: Querbohrung zuerst und groß (Ø 25) bohren – dann muss die Längsbohrung nur dieses Loch treffen.'), tk('Bolzen zweier Stöße am selben Pfosten kreuzen sich: in der Höhe gegeneinander versetzen.')],
  },
  holzbauschraube: {
    how: tk('Lange Tellerkopfschrauben ziehen die Hölzer zusammen. Das Gewinde muss tief genug im tragenden Holz sitzen. Schnell und ohne Spezialwerkzeug, aber nicht zerlegbar.'),
    steps: [
      S(tk('Schraubenpunkte auf {E} anreißen ({n} Stück, mittig, mit Abstand zum Rand).')),
      S(tk('{E} ansetzen, mit Zwingen festspannen, Lage prüfen.'), 'fuegen'),
      S(tk('Nur im aufliegenden Holz Ø 6 mm vorbohren, dann Tellerkopfschrauben {size} eindrehen, bis der Kopf bündig sitzt. Das Gewinde greift {grip} mm im tragenden Holz.'), 'befestigen'),
    ],
    mistakes: [tk('Schraube zu kurz: Das Gewinde muss mindestens 72 mm im tragenden Holz sitzen.'), tk('Holz spaltet am Ende: vorbohren und genug Abstand zum Ende halten.')],
  },
  'holzbauschraube-stoss': {
    how: tk('Lange Tellerkopfschrauben gehen durch das durchlaufende Holz in das Hirnholz des anschließenden. Im Hirnholz halten Schrauben schlechter – deshalb drei Stück und nur für mittlere Lasten.'),
    steps: [
      S(tk('Schraubenpunkte auf der Außenseite von {T} anreißen ({n} Stück in der Mitte von {E}).')),
      S(tk('{E} ansetzen, mit Zwingen festspannen, Winkel prüfen.'), 'fuegen'),
      S(tk('In {T} Ø 6 mm vorbohren – nicht ins Hirnholz.')),
      S(tk('{n} Tellerkopfschrauben {size} mit kräftigem Akkuschrauber eindrehen, bis der Kopf bündig sitzt ({grip} mm im Hirnholz).'), 'befestigen'),
    ],
    mistakes: [tk('Nur für mittlere Lasten: Im Hirnholz reißt die Schraube eher aus – tragende Stöße besser mit Bolzen oder Balkenschuh.'), tk('Schraube nicht in der Mitte des Hirnholzes: Sie tritt seitlich aus oder spaltet das Holz.')],
  },
  bettschraube: {
    how: tk('Wie im Möbelbau: Eine Bettschraube geht durch das durchlaufende Holz ins Hirnholz und greift in eine Zylindermutter in einer Querbohrung. Von außen sieht man nur einen flachen Kopf, die Verbindung ist zerlegbar.'),
    steps: [
      S(tk('Bohrlage anreißen: zwei Bohrungen in der Mitte von {E}, {abstand} mm auseinander; auf die Außenseite von {T} übertragen.')),
      S(tk('{E} ansetzen und festspannen.'), 'fuegen'),
      S(tk('Im Verbund Ø {bohr} mm durch {T} rund {tiefe} mm in das Hirnholz bohren – am besten mit Bohrschablone für Bettbeschläge.')),
      S(tk('Lösen. Auf der Innenseite {nut} mm vom Ende die Querbohrung Ø 10 mm bis über die Längsbohrung bohren. Tipp: einen Holzstab in die Längsbohrung stecken – er zeigt, wohin die Querbohrung muss.')),
      S(tk('Zylindermutter einsetzen (Schlitz zur Längsbohrung), Teile ansetzen, Bettschraube eindrehen und mit dem Inbusschlüssel anziehen.'), 'befestigen'),
    ],
    mistakes: [tk('Querbohrung trifft nicht: Längsbohrung zuerst bohren und mit einem Stab sichtbar machen.'), tk('Muttern nicht einkleben – sonst lässt sich das Bett nicht mehr zerlegen.')],
  },
  auflage: {
    how: tk('Das obere Holz liegt einfach auf dem unteren. Die Last geht über Druck Holz auf Holz – die tragfähigste einfache Lösung. Die Schrauben verhindern nur das Verrutschen.'),
    steps: [
      S(tk('Auflagefläche anreißen und die Höhe prüfen.')),
      S(tk('{E} auflegen und ausrichten.'), 'fuegen'),
      S(tk('Im aufliegenden Holz Ø 6 mm vorbohren und {n} Tellerkopfschrauben {size} von oben eindrehen ({grip} mm im unteren Holz).'), 'befestigen'),
    ],
    mistakes: [tk('Schraube zu kurz: Bei 120 mm hohem Holz greift eine 160er nur 40 mm – mindestens 200 mm verwenden.')],
  },
  auflagerleiste: {
    how: tk('Eine Leiste wird unter dem späteren Trägerende an das durchlaufende Holz geschraubt; der Träger liegt darauf. Die Schrauben der Leiste tragen auf Abscheren – einfach, aber nur für leichtere Lasten.'),
    steps: [
      S(tk('Unterkante von {E} an {T} anreißen; Leiste 40 × 60 auf {leiste} mm Länge sägen.')),
      S(tk('Leiste bündig unter den Riss halten, Ø 4 mm vorbohren und mit 3 Schrauben 6 × 100 festschrauben (60 mm im tragenden Holz).'), 'vorher'),
      S(tk('{E} auflegen und mit einer Schraube gegen Verrutschen sichern.'), 'fuegen'),
    ],
    mistakes: [tk('Kurze Schrauben 5 × 50 greifen nur 10 mm im tragenden Holz – die Leiste reißt ab.'), tk('Schrauben zu nah an der Leistenkante: mindestens 15 mm Abstand zur Unterkante.')],
  },
  ausklinkung: {
    how: tk('Das anschließende Holz sitzt in einer flachen Einlassung im durchlaufenden Holz. Die Last geht über die Einlassung Holz auf Holz, die Schrauben halten nur zusammen.'),
    steps: [
      S(tk('{E} an {T} anhalten und den Umriss anreißen; Tiefe {tiefe} mm mit dem Streichmaß auf beiden Seiten.')),
      S(tk('Ränder mit der Japansäge auf Tiefe einsägen, dazwischen alle 10 mm einen Schnitt.')),
      S(tk('Mit dem Stechbeitel ausräumen und den Grund eben stemmen; mit dem Winkel prüfen.')),
      S(tk('Trocken probieren: {E} soll stramm, aber ohne Hammer passen. Dann einsetzen.'), 'fuegen'),
      S(tk('Im aufliegenden Holz vorbohren und mit {n} Schrauben {size} sichern.'), 'befestigen'),
    ],
    mistakes: [tk('Zu tief eingelassen: höchstens ein Viertel der Holzstärke, sonst wird der Querschnitt zu schwach.'), tk('Grund nicht eben: Das Teil kippelt – mit einem Grundhobel oder breiten Beitel nacharbeiten.')],
  },
  ueberblattung: {
    how: tk('Beide Hölzer werden auf halbe Dicke ausgenommen und greifen ineinander, die Oberflächen bleiben bündig. Leim und zwei Schrauben halten das Blatt zusammen. Es bleibt nur etwa die Hälfte des Querschnitts – für geringere Lasten.'),
    steps: [
      S(tk('Hölzer übereinanderlegen und die Breite des jeweils anderen Holzes auf beiden anreißen.')),
      S(tk('Blatttiefe {blatt} mm (halbe Dicke) mit dem Streichmaß von der Sichtseite anreißen, Abfall schraffieren.')),
      S(tk('Ränder auf Tiefe einsägen, dazwischen alle 10 mm einschneiden; ausstemmen und den Grund eben machen.')),
      S(tk('Trocken probieren; Leim auftragen und die Hölzer ineinanderlegen.'), 'fuegen'),
      S(tk('Vorbohren und 2 Schrauben {size} diagonal versetzt eindrehen.'), 'befestigen'),
    ],
    mistakes: [tk('Ungleiche Tiefe: Beide Blätter von derselben Seite (Sichtseite) aus anreißen, sonst steht eine Fläche über.'), tk('Zu weit ausgestemmt: Lieber etwas stehen lassen und mit dem Beitel nacharbeiten.')],
  },
  schwalbenschwanz: {
    how: tk('Wie eine Überblattung, aber das Blatt wird zum Ende hin breiter (Neigung 1:6). Dadurch hält es auch auf Zug ohne Metall. Das Blatt wird von der Seite eingelegt, nicht längs eingeschoben.'),
    steps: [
      S(tk('Blatt am Ende von {E} anreißen: {dicke} mm dick, {tiefe} mm lang, am Hals {schmal} mm, am Ende {breit} mm breit (Schmiege 1:6).')),
      S(tk('Blatt auf der Abfallseite des Risses aussägen und die Flanken mit dem Beitel nachstechen.')),
      S(tk('Blatt auf {T} legen und den Umriss mit spitzem Bleistift oder Messer übertragen.')),
      S(tk('Sitz {dicke} mm tief einsägen und ausstemmen; die schrägen Flanken genau treffen, trocken probieren.')),
      S(tk('Leimen und das Blatt von der Seite einlegen.'), 'fuegen'),
      S(tk('Zwei Holzdübel Ø 10 durch das Blatt bohren und einschlagen.'), 'befestigen'),
    ],
    mistakes: [tk('Umriss nicht vom fertigen Blatt übertragen: Nie beide Teile nach Maß getrennt anreißen.'), tk('Flanken zu locker: Ein Schwalbenschwanz hält nur, wenn die Flanken satt anliegen.')],
  },
  zapfen: {
    how: tk('Ein Zapfen am Ende des einen Holzes steckt in einem passenden Zapfenloch des anderen. Zwei Holzdübel quer hindurch halten ihn. Klassisch, steif und ohne Metall – aber Handarbeit.'),
    steps: [
      S(tk('Bezugsfläche markieren. Zapfen am Ende von {E} anreißen: {dicke} mm dick, {hoehe} mm hoch, {laenge} mm lang – mit dem Streichmaß von der Bezugsfläche.')),
      S(tk('Wangen und Brüstungen mit der Feinsäge auf der Abfallseite absägen.')),
      S(tk('Zapfenloch in {T} anreißen, mit dem Forstnerbohrer Ø {dicke} mm Loch an Loch {lochtiefe} mm tief vorbohren, dann mit dem Stechbeitel senkrecht ausstemmen.')),
      S(tk('Trocken zusammenstecken: stramm, ohne Hammer. Zu stramm? Zapfen mit dem Beitel nacharbeiten.'), 'fuegen'),
      S(tk('Im Verbund {nagel} mm vor der Brust Ø 10 mm durch Zapfenloch und Zapfen bohren, von beiden Seiten.')),
      S(tk('Zerlegen, Leim an die Brust und auf zwei Drittel des Zapfens, zusammenstecken und die Holzdübel von beiden Seiten einschlagen.'), 'befestigen'),
    ],
    mistakes: [tk('Zapfenloch schief gestemmt: Den Beitel immer am Winkel ausrichten, erst vorbohren.'), tk('Zapfen zu stramm: Das Holz kann reißen – vor dem Leimen trocken probieren.'), tk('Zapfenloch nicht tiefer als der Zapfen: 5 mm Luft lassen, sonst sitzt die Brust nicht an.')],
  },
  holzduebel: {
    how: tk('Zwei geleimte Holzdübel verbinden Stirnseite und Fläche, unsichtbar. Gut für Geländerteile und leichte Lasten, nicht für tragende Stöße.'),
    steps: [
      S(tk('Dübelpositionen auf der Stirnseite von {E} anzeichnen ({abstand} mm auseinander, mittig).')),
      S(tk('Mit Dübelhilfe Ø 10 mm 21 mm tief bohren; Tiefenstopp oder Klebeband am Bohrer.')),
      S(tk('Dübelspitzen einsetzen und {E} in seiner Lage gegen {T} drücken – die Spitzen markieren die Gegenlöcher; dort ebenso bohren.')),
      S(tk('Leim in die Löcher, Dübel einschlagen, Teile zusammenspannen und 24 h trocknen lassen.'), 'fuegen'),
    ],
    mistakes: [tk('Gegenlöcher versetzt: Immer mit Dübelspitzen übertragen, nie getrennt messen.'), tk('Zu tief gebohrt: Der Dübel verschwindet, die Teile ziehen nicht zusammen – Tiefenstopp verwenden.')],
  },
  lose: {
    how: tk('Die Latten liegen einfach auf den Zargen und werden nur durch ihr Gewicht und die Matratze gehalten. Filz- oder Gummistreifen verhindern Quietschen; eine Schraube je Latte verhindert Verrutschen.'),
    steps: [
      S(tk('Filz- oder Gummistreifen auf die Zargen kleben.')),
      S(tk('Latten im gleichen Abstand auflegen (Abstandsklotz verwenden).'), 'fuegen'),
      S(tk('Optional je Latte eine Schraube 5 × 50 gegen Verrutschen.'), 'befestigen'),
    ],
    mistakes: [tk('Ungleiche Abstände: Einen Abstandsklotz zuschneiden und jede Latte daran anlegen.')],
  },
  stecken: {
    how: tk('Ein Rundstab steckt in einer passenden Bohrung im Holm und wird eingeleimt – die übliche Lösung für Leitersprossen und Geländerstäbe.'),
    steps: [
      S(tk('Beide Holme nebeneinanderspannen und die Bohrungen gemeinsam anreißen.')),
      S(tk('Mit Forstnerbohrer Ø {durchmesser} mm {tiefe} mm tief bohren (zwei Drittel der Holzdicke, Tiefenstopp); senkrecht mit Bohrführung.')),
      S(tk('Leim in die Bohrungen, Stäbe einsetzen, zweiten Holm aufsetzen und zusammenspannen; Diagonalen prüfen.'), 'fuegen'),
    ],
    mistakes: [tk('Bohrungen schief: Die Stäbe stehen dann nicht parallel – mit Bohrführung oder Führungsklotz bohren.')],
  },
  gratnut: {
    how: tk('Die Stufe hat am Ende eine schwalbenschwanzförmige Feder, die in eine passende Nut quer in der Wange geschoben wird. Durch die schrägen Flanken kann sie nicht herausfallen. Eingeschoben wird von der Seite entlang der Nut.'),
    steps: [
      S(tk('Nutlage auf beiden Wangen gemeinsam anreißen (Steigung der Leiter beachten).')),
      S(tk('Nut {tiefe} mm tief herstellen: mit Oberfräse und Gratfräser an einer Führungsleiste in einem Zug – ohne Oberfräse mit Gratsäge an einer schrägen Führungsleiste einsägen und mit Beitel und Grundhobel ausräumen.')),
      S(tk('Erst die Nut fertig machen, dann die Feder an der Stufe passend anarbeiten; an einem Reststück probieren.')),
      S(tk('Stufe von der Seite einschieben (nur vorne leimen) und mit 2 Schrauben 5 × 50 sichern.'), 'fuegen', 'befestigen'),
    ],
    mistakes: [tk('Feder klemmt: Erst die Nut, dann die Feder anpassen – nie umgekehrt.'), tk('Nut zu tief: höchstens ein Drittel der Wangendicke.')],
  },
  seilbefestigung: {
    how: tk('Das Seil wird durch eine Bohrung oder eine Augschraube geführt und verknotet. Kräfte gehen als Zug in das Holz bzw. die Schraube.'),
    steps: [
      S(tk('Bohrung Ø 14 mm setzen bzw. Augschraube eindrehen.')),
      S(tk('Kanten der Bohrung brechen, damit das Seil nicht scheuert.')),
      S(tk('Seil durchführen und mit Achtknoten sichern.'), 'fuegen'),
    ],
    mistakes: [tk('Nicht nachgespannt: Seile dehnen sich in den ersten Tagen – nachspannen einplanen.')],
  },
  gewindestange: {
    how: tk('Eine Gewindestange M10 hängt das Holz an der Decke auf bzw. verspannt es. Große Unterlegscheiben verteilen die Kraft, Kontermuttern sichern.'),
    steps: [
      S(tk('Ø 11 mm durch das Holz bohren.')),
      S(tk('Gewindestange durchstecken.'), 'fuegen'),
      S(tk('Oben und unten große Scheiben und Muttern aufsetzen, ausrichten, anziehen und mit Kontermutter sichern.'), 'befestigen'),
    ],
    mistakes: [tk('Nur in tragfähige Decken (Beton oder Holzbalken) – nie in Stuck oder abgehängte Decken.')],
  },
  kopfband: {
    how: tk('Das schräge Kopfband steift die Ecke zwischen Pfosten und Zarge aus, damit das Bett nicht wackelt. Die 45°-Enden liegen satt an, Schrauben halten es in Position.'),
    steps: [
      S(tk('Kopfband auf {laenge} mm sägen, beide Enden 45° (Kapp- oder Gehrungssäge). Bei mehreren Kopfbändern einen Anschlag verwenden, damit alle gleich lang werden.')),
      S(tk('Ausstellmaß an Pfosten und Zarge anreißen und das Kopfband anhalten.'), 'fuegen'),
      S(tk('Vom Rand des Kopfbands Ø 4 mm vorbohren (sonst spaltet es) und je Ende Schrauben {size} setzen.'), 'befestigen'),
    ],
    mistakes: [tk('Ungleich lange Kopfbänder: Das Gestell wird schief – alle an einem Anschlag sägen.'), tk('Nur in einer Richtung: Kopfbänder möglichst paarweise und in beiden Richtungen.')],
  },
  versatz: {
    how: tk('Das Kopfbandende sitzt in einer Einlassung in Pfosten und Zarge. So drückt das Kopfband Holz auf Holz, statt nur an Schrauben zu hängen, und trägt deutlich mehr. Je eine Schraube sichert nur.'),
    steps: [
      S(tk('Kopfband auf Länge sägen (einschließlich 2 × {tiefe} mm für die Einlassungen), Enden 45°.')),
      S(tk('Kopfband anhalten und den Umriss auf Pfosten und Zarge anreißen.')),
      S(tk('Einlassungen {tiefe} mm tief mit der Japansäge einsägen und mit dem Stechbeitel ausstemmen.')),
      S(tk('Kopfband einsetzen und je Ende eine Schraube {size} setzen (vorbohren).'), 'fuegen', 'befestigen'),
    ],
    mistakes: [tk('Einlassung zu tief: höchstens ein Viertel der Holzstärke.')],
  },
}

/** Schlüssel der Anleitung: bei stumpfen Stößen die eigene Variante, sofern es eine gibt */
export function guideKey(typeId: string, stoss: boolean): string {
  return stoss && JOINT_GUIDE[`${typeId}-stoss`] ? `${typeId}-stoss` : typeId
}

/**
 * Bohren und Anreißen ohne Bohrständer. Die meisten Heimwerker haben keinen – und an einem langen
 * Pfosten passt ohnehin keiner. Ehrliche Tipps, die mit Akkuschrauber und Reststücken funktionieren.
 */
export const DRILL_HELP: string[] = [
  tk('Anreißen vom Nullpunkt: Alle Maße vom Bezugsende und von der Bezugskante aus messen, nicht von Loch zu Loch – sonst summieren sich Fehler.'),
  tk('Lochmitte als Kreuz anreißen und mit einem Nagel ankörnen, damit der Bohrer nicht wegläuft. Die Linien mit dem Anschlagwinkel um das Holz herum auf die Gegenseite führen.'),
  tk('Im Verbund bohren: Wo ein Bolzen durch zwei Hölzer geht, beide zusammenspannen und in einem Zug durchbohren. Dann fluchten die Löcher, auch wenn die Bohrung etwas schief ist.'),
  tk('Von beiden Seiten bohren: Von jeder Seite bis zur Mitte bohren. Ein schiefer Bohrer trifft so höchstens halb so weit daneben.'),
  tk('Führungswinkel bauen: Zwei gerade Leistenreste rechtwinklig zu einem L verleimen und hochkant neben die Bohrstelle stellen. Der Bohrer läuft in der Innenecke und steht so in beiden Richtungen senkrecht.'),
  tk('Peilen: Zwei Anschlagwinkel im rechten Winkel zueinander neben die Bohrstelle stellen und den Bohrer an beiden ausrichten – oder eine zweite Person schaut von der Seite.'),
  tk('Bohrtiefe mit einem Streifen Klebeband am Bohrer markieren. Bei langen Bohrungen oft herausziehen und die Späne entfernen.'),
  tk('Wo eine Mutter in einer Querbohrung sitzt: die große Querbohrung zuerst bohren. Die Längsbohrung muss dann nur noch dieses große Loch treffen.'),
]
