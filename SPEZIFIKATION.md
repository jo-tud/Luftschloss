# Luftschloss – Hochbettplaner · Spezifikation v0.2

Stand 10.10.2026. In v0.1 waren 16 Fragen offen; die Antworten stehen in Kapitel 2.

- Rechercheergebnisse mit Quellen: [`docs/recherche/`](docs/recherche/).
- Markierungen: ✅ steht im Prototyp, ◐ teilweise, ◻ geplant.

Luftschloss ist ein Planungswerkzeug im Desktop-Browser. Heimwerker passen damit ein Hochbett in ein konkretes Zimmer ein:
1. Raum vermessen.
2. Fenster, Heizkörper, Stuck und Sockelleisten eintragen.
3. Ein Bett aus einer Vorlage einsetzen oder frei zeichnen und anpassen.
4. Laufend sehen, ob das Fenster noch aufgeht, wie viel Platz unter und über dem Bett bleibt und was das Material kostet. Das Material ist genau so geplant, wie es im Baumarkt erhältlich ist.

---

## 1. Ziele und Grundsätze

### 1.1 Ziele (nach Priorität)

1. **Einpassen in den Raum** – mit guter Usability am Desktop.
2. **Konstruieren** – Vorlagen sind immer anpassbar, alternativ wird frei gezeichnet.
3. **Prüfen** – Freiraum, Fenster und Tür, Kollisionen (auch mit Stuck und Sockelleiste), Sicherheitsempfehlungen und die Statik des ganzen Gestells.
4. **Material** – eine Einkaufsliste, die man im Baumarkt (Hornbach) tatsächlich bekommt, mit Zuschnitt und Kosten.
5. **Preise** – recherchieren lassen über einen Prompt zum Kopieren.

### 1.2 Grundsätze

- **Empfehlungen statt Verbote.** Sicherheitsregeln (DIN EN 747), Foren-Konsens und Faustregeln erscheinen als Hinweise, Warnungen oder Fehler. Die Erwachsenen entscheiden: Jeder Befund lässt sich quittieren und bleibt dann ausgegraut sichtbar.
- **Kreativität zulassen.** Auch riskante Bauarten werden angeboten, zum Beispiel abgehängte Betten, Seilgeländer und begehbare Netze. Sie bekommen einen dezenten Warnhinweis.
- **Vom Foren-Konsens abweichen können.** Die Recherche bestimmt nur die *Vorschlagswerte* (Latten statt Platte, Stufen statt Rundsprossen, Schlossschrauben). Jede Alternative bleibt wählbar.
- **Baumarkt-Realität.** Querschnitte und Längen kommen aus dem Katalog; Überlängen werden gemeldet. Tragendes Holz ist bei Hornbach **Fichte** (KVH C24); Kiefer gibt es nur bei Leimholz, Dielen, Leisten und Rundstäben.
- **Immer ein Wow-Feature mitdenken.** An irgendeiner Stelle soll man denken: „Boah, das kann die App?!“ Bei jeder Ausbaustufe fragen, was über das Erwartbare hinausgeht (siehe Kapitel 12).
- **Auf der Baustelle mit dem Tablet.** Beim Bauen ist eher ein Tablet zur Hand als ein Laptop. Deshalb gibt es Finger- und Stiftbedienung, ein Layout für Tablets, die Freigabe im WLAN bzw. über Tailscale und Offline-Betrieb.
- **Lokal und privat.** Die App läuft im Browser ohne Konto. Das Projekt wird lokal gespeichert und lässt sich als Datei exportieren.

### 1.3 Nicht-Ziele

- Keine Tragwerksplanung im rechtlichen Sinn.
- Keine Bedienung auf dem Smartphone.
- Kein Warenwirtschaftssystem.
- Kein fotorealistisches Rendering.

---

## 2. Entscheidungen aus der Abstimmung

| # | Thema | Entscheidung |
|---|---|---|
| F1 | Ort | Repository **Luftschloss** |
| F2 | Raumform | **Rechteck**, dazu **Stuckleisten** (an allen Wänden gleich, je Wand abweichend möglich), **Deckenrosette mit Lampe**, **Sockel- bzw. Parkettleisten**, **tiefe Fensternischen**, **Dachschrägen** (je Wand Kniestock und Neigung; Decke ist die tiefste der Ebenen, auch Grate in der Ecke). **Mauervorsprünge** (Kamin, Pfeiler, Schacht; Wandobjekt „Vorsprung“ mit Tiefe, Boden bis Decke) und **L-förmige Räume** (Vorsprung in der Ecke = ausgesparte Raumecke). Freies Vieleck mit schrägen Wänden und Unterzug kommen später. |
| F3 | Zielgruppe | Kinder, Jugendliche, Erwachsene; das Testbett ist für Jugendliche. Das Sicherheitsprofil ist umschaltbar, und alles ist quittierbar. |
| F4 | Sprache | Englisch als Standard, Deutsch umschaltbar, automatisch nach Browsersprache (🌐 in der Werkzeugleiste); Anzeige in cm, intern ganzzahlige mm |
| F5 | Technik | React, TypeScript, Vite, three.js über react-three-fiber |
| F6 | Preise | Recherche-Prompt zum Kopieren und Antwort zurückfügen (umgesetzt). Optional ein Agent mit eigenem API-Schlüssel (umgesetzt, M7). |
| F7 | Vorlagen | **Immer anpassbar** (parametrisch). Einzelne Teile lassen sich herauslösen, ganze Baugruppen auflösen. |
| F8 | Statik | Später, aber als **Prüfung des ganzen Gestells**, nicht je Balken. Das Datenmodell ist vorbereitet. (umgesetzt, M5) |
| F9/F10 | Bauplan, Holzverbindungen | Vorerst auswählen und anzeigen. Später Bauanleitungen mit Maßzeichnung; die Bearbeitungen werden schon jetzt gespeichert. (umgesetzt: Bauplan M6, Holzverbindungen als Geometrie M8) |
| F11 | Normen | Gekennzeichnete Richtwerte (EN 747 Stand 2015, 2024 ungeprüft) |
| F12 | Riskante Bauarten | Anbieten, mit dezenter Warnung |
| F13–F16 | Mehrere Betten, Speichern, Montage | Mehrere Betten gehen; Speichern lokal und als Datei; Montageanleitung umgesetzt (Montageschritte im Bauplan, Aufbau-Animation) |

---

## 3. Arbeitsablauf

0. **Planungsassistent (optional)** – Raum und Decke, Wände, Fenster/Türen/Heizkörper, wer oben schläft, Nutzung darunter, Befestigung an der Wand → bis zu drei geprüfte, gewichtete Vorschläge. Aufruf über das Projektmenü, das Banner im Beispielzimmer, den leeren Bett-Reiter und Raum → Projekt. ✅
1. **Raum** – Maße, Stuck, Sockelleiste, Rosette und Lampe, Wand-, Boden- und Deckenart. ✅
2. **Ausstattung** – Fenster (Flügel, Laibung, Nische, Fensterbank), Tür, Heizkörper, Steckdosen. ✅
3. **Bett** – Vorlage einsetzen (die App wählt die günstigste Raumecke: keine Fehler, kein verbautes Fenster, keine verstellte Tür; Ecke danach unter „Lage im Raum“ änderbar) oder Balken und Pfosten frei zeichnen. ✅
4. **Anpassen** – Parameter rechts, Ziehen in der Ansicht. ✅
5. **Prüfen** – laufende Prüfliste mit Fokus auf das betroffene Teil. ✅
6. **Material** – Einkaufsliste, Zuschnittplan, Kosten, Preis-Prompt, CSV und Druck. ✅

Beim ersten Start lädt das **Beispielzimmer** (`testProject()` in `src/model/defaults.ts`): Altbau 4,30 × 5,95 m, 3,50 m hoch, zwei Fenster mit Heizkörpern an Wand A (gemauert), Wände B–D Leichtbau, Tür in Wand C, Holzbalkendecke, Dielenboden, Stuck, Rosette mit Lampe, Sockelleisten, Schreibtisch; freistehendes Hochbett in der hinteren linken Ecke (von der Tür aus). Ein Banner bietet den Planungsassistenten an („Eigenes Zimmer planen“). Das Beispielzimmer hat keine „geschätzt“-Markierungen.

---

## 4. Raummodell ✅

- **Koordinaten:** Ursprung in der Ecke Wand A/B; x entlang Wand A, y in den Raum, z nach oben.
- **Wände:** A (Fensterwand), B, C, D im Umlauf. „Links“ bei Wandobjekten heißt immer: vom Raum aus auf die Wand gesehen.
- **Wand-, Boden-, Deckenart:**
  - Wand: Beton, KS, Vollziegel, Lochziegel, Porenbeton, Trockenbau, Holzständer, Leichtbau/Altbau-Innenwand (nicht tragend). Steuert die Warnungen zu Befestigungen.
  - Boden: Estrich, Fußbodenheizung, Dielen. Bei Dielen gibt es einen Hinweis auf Lastverteilplatten.
  - Decke: Beton, Holzbalken, abgehängt, nicht tragfähig.
- **Stuckleiste:** Höhe an der Wand, Ausladung an der Decke, Profil Hohlkehle, Schräge oder Rechteck; je Wand abweichend möglich.
  - Kollision wird mit dem echten Profil geprüft.
  - Wandnahe Pfosten, die in den Stuck ragen, werden ausgeklinkt, höchstens bis zum halben Querschnitt.
  - Hinweis: Stuck nicht berühren.
- **Deckenrosette und Lampe:** Position, Durchmesser, Abhängung. Sie gehen in den Kopfraum über der Matratze und in die Kollisionsprüfung ein.
- **Sockel- bzw. Parkettleiste:** Höhe und Tiefe; Türen sind ausgespart.
  - Am Bett wählbar: **Pfosten ausklinken** oder **Bett abrücken**. Das Abrücken passiert automatisch um die Leistentiefe.
- **Fenster:**
  - Breite, Brüstung, Höhe, **Laibungstiefe**, Blendrahmen.
  - **Nische bis zum Boden** (Heizkörpernische) mit eigener Tiefe.
  - 1–3 Flügel, je Flügel Dreh, Kipp, Dreh-Kipp oder fest, Band links/rechts.
  - Flügelstärke, Griffüberstand, innere Fensterbank (Überstand, Dicke).
- **Tür:** Breite, Höhe, Band, öffnet nach innen oder außen.
- **Heizkörper:** Maße, Wandabstand (auch negativ für Nischen), **Konvektionsraum** darüber.
- **Steckdosen.** ✅
- **Möbel und Personen:** Schreibtisch, Stuhl, Sofa, Schrank, Regal, Kommode, freier Körper; Person stehend oder sitzend mit Körpergröße. ✅
- ✅ Dachschräge: Bauteile, die in die Schräge ragen, sind eine Kollision; der Kopfraum zählt an der höchsten Stelle über der Liegefläche, dazu ein Hinweis, wenn es an der niedrigen Seite eng wird (`kopf-schraege`). Stuck nur unter der flachen Decke.
- ✅ Vorsprung/Raumecke: Hindernis wie eine Wand (Kollision, Fensterflügel, Eckwahl beim Einsetzen). Wandbalken am Vorsprung trägt die Statik noch nicht. ◻
- Später: Unterzug, freies Vieleck, Rollladenkasten, Thermostatkopf. ◻

---

## 5. Konstruktionsmodell ✅

- **Stab** (Member): Achse Start/Ende, Querschnitt b × h, rund oder eckig, Drehung, Katalogartikel, Rolle, **Ausklinkungen** (Notches mit Grund). Die Ausklinkungen sind die Grundlage für die Maßzeichnungen im Bauplan.
  - Optional eine abweichende **Körperform** (`Member.shape`), z. B. Kopfband mit Gehrungsschnitten. Statik und Kollision rechnen weiter mit dem Quader.
- **Fläche** (Panel): waagrecht (Umriss) oder senkrecht (Geländerfüllung, Netz). Arten: Platte, Dielen, Rollrost, Lattenrost, Netz, Matratze.
- **Baugruppe „Hochbett“:** parametrisch, erzeugt alle Stäbe und Flächen neu. Teile lassen sich **herauslösen** (werden frei) oder die ganze Baugruppe **auflösen**.
- **Verbindungen:** werden automatisch erkannt. Arten: Eckstoß, T-Stoß, Kreuzung, Auflage, Längsstoß, Strebe, Beischlag. Der Typ ist je Verbindung wählbar und wird gespeichert.
  - Zimmermannsmäßige Verbindungen verändern die Geometrie (Zapfen, Blatt, Nut, Einlassung). Gerechnet wird das an einer Stelle, `src/model/joinery.ts`; 3D-Ansicht, Verbindungsdetail, Bauplan-Skizze und Zuschnittlängen nutzen dieselbe Rechnung.
- **Befestigungen:** Wandriegel mit Dübeln, Kippsicherung (Winkel 90 × 90 und Rahmendübel 10 × 115 knapp unter der Liegefläche; bei Zargen außen durch die Zarge mit 10 × 140), Stellfüße für die Deckenverspannung, Deckenanker für abgehängte Betten.

### 5.1 Bauarten (Vorlagen)

| Bauart | Stand | Hinweis |
|---|---|---|
| Freistehend, 4 Pfosten | ✅ Standard | Kopfbänder wählbar. Kippsicherung wird automatisch vorgeschlagen, wenn ein Pfosten an der Wand steht. |
| Deckenhoch verspannt | ✅ | Pfosten bis zur Decke mit Stellfuß. Stuck wird ausgeklinkt. Hinweis bei Holzbalkendecke. |
| Wandseitig, 2 Pfosten | ✅ | Wandriegel hinten |
| Eckhochbett, 1 Pfosten | ✅ | Wandriegel an zwei Seiten |
| Hochebene Wand zu Wand | ✅ | Wandriegel an beiden Enden |
| Abgehängt | ✅ mit Warnung | Wandriegel und Gewindestangen |
| **Wandbalken, Latten drauf** | ✅ | Bei massiven Wänden (Ziegel, Beton) sehr effizient: Balken direkt an die Wand, vorne ein Balken auf Pfosten, Querträger bzw. Latten oben **aufgelegt** (Bauweise „aufgelegt“). Warnung, wenn die Wand nicht tragfähig ist. |
| **Zargen außen, durchgebolzt** | ✅ | Häufig gebaut (freistehend oder deckenhoch, vier Pfosten): Pfosten um eine Zargendicke eingerückt, Längszargen laufen außen durch und sind mit Schlossschrauben durch die Pfosten gebolzt, Querzargen eine Zargenhöhe tiefer (die Bolzen kreuzen sich nicht, an den Ecken liegen die Längszargen auf). Das Geländer hält eigene Pfosten außen an den Zargen; keine Kopfbänder, deshalb Kippsicherung an der Wand. |
| **Eckbett, Ecke abgehängt** | ✅ | Zwei Wandbalken, die freie Ecke an einer Gewindestange von der Decke. Fehler bei nicht tragfähiger Decke, Warnung bei Holzbalkendecke (nur in einen Balken). |
| Halbhoch, 1,20 m | ✅ | Für jüngere Kinder |
| Etagenbett | ✅ | Zweite Liegefläche zwischen den Pfosten, Sitzhöhe unten geprüft |
| Galerie mit Mittelstütze | ✅ | Lange Hochebene, eine Stütze in der Mitte jeder Längsseite |
| Zwei Kinder oben | ✅ | Zwei Matratzen nebeneinander, Mittelträger unter der Fuge |
| Netz-Hochebene | ✅ mit Warnung | Begehbares Netz, kräftige Zargen |
| Bett auf Regal/Schrank | ✅ | Pfosten entfallen, der Rahmen liegt auf den Möbeln (Statik: Oberseiten als Auflager). Podest ◻ |

Parameter sind:
- **Bauweise:** Querträger zwischen Zargen, **aufgelegt** oder **Zargen außen am Pfosten, durchgebolzt** (nur mit vier Pfosten, `outsideRails()` in `src/model/loftbed.ts`); freie Ecke auf Pfosten oder **von der Decke abgehängt**
- Matratzenmaß und -dicke, Spiel, Liegehöhe, Lage und Drehung, Spiegeln, Wandanschluss
- Mehrere Matratzen: Anzahl, nebeneinander oder hintereinander, Abstand
- Etagenbett (untere Liegefläche mit Höhe), Mittelstützen
- Hölzer für Pfosten, Zargen und Querträger
- **Einzelne Teile der Vorlage abweichend** (Eigenschaften des Teils: Holz und Länge, `Assembly.overrides`), ohne es herauszulösen; bleibt bei Änderungen am Bett erhalten, „Zurücksetzen“ stellt die Vorlage wieder her. Geländer „Bretter“: Brett oder Latte wählbar, Anzahl der Reihen aus Höhe und höchstens 6 cm Spalt.
- Liegefläche: **Latten lose aufgelegt** (Standard), Rollrost, Lattenrost, Platte, Dielen, begehbares Netz. **Breite Leimholzbretter** (Platte aus Leimholz, Bauweise mit Zargen): Bretter quer von Zarge zu Zarge, Mischung der Handelsbreiten 60/40 cm mit möglichst wenig Brettern und Verschnitt (`src/model/deckBoards.ts`), unter jedem Stoß ein Querträger, Zuschnitt aus 1200er Platten.
- Geländer: **Bretter** (Standard), Rundstäbe, Vollfläche, Netz, Seil oder keins; Höhe und Seiten
- Ecken ohne Pfosten (an der Wand oder abgehängt) schließt der Rahmen selbst, Zarge an Zarge. Endet dort ein Geländer, hält es ein Geländerpfosten, der wie eine Zwischenstütze außen an die Zarge gebolzt ist (an einer Wandseite innen auf der Zarge). Kein kurzes Pfostenstück zwischen den Zargen.
- Leiter: **Stufenleiter** (Standard), senkrecht, schräg oder Treppe; Seite, Position, Breite, Neigung, Hölzer. Schräge Wangen sind oben **lotrecht** und unten **waagrecht** geschnitten (`Member.ends`): Der Kopfschnitt liegt an der Zarge an (Verbindung „Wange mit Kopfschnitt angelehnt“), seitlich ist die Wange mit dem Haltegriff verbolzt, der an der Zarge sitzt; die Achse trifft die Zarge so hoch, dass auch die oberste Stufe ganz auf der Wange liegt. Stufen standardmäßig in einer **geraden Nut** (Gratnut wählbar, nur geleimt), eine Nut je Stufe auch bei zwei Trittbrettern; die Treppe bekommt eine Wange 60 × 160, sonst warnt die Prüfung „Treppenwange zu schmal“.

### 5.2 Verbindungstypen ✅

| Gruppe | Typen |
|---|---|
| Stahl | Winkel mit Sicke, Balkenschuh, Seilbefestigung, Gewindestange |
| Schrauben | Schlossschrauben M10 durchgebolzt; als stumpfer Stoß Sechskantschraube M10 mit Mutter in einer Tasche (Forstner Ø 35), Tellerkopfschrauben 8 mm (Länge nach Holzdicke), Bettschraube mit Zylindermutter |
| Holz | Stumpfe Auflage, Auflagerleiste, Knagge (stehender Klotz unter dem Träger), lose aufgelegt, Ausklinkung/Einlassung, Überblattung, Schwalbenschwanzblatt, Zapfen mit Holznagel, Holzdübel, Rundstab in Bohrung, Stufe in Gratnut, Stufe in gerader Nut, Wange mit Kopfschnitt angelehnt, Kopfband auf Gehrung (verschraubt), Kopfband eingelassen (Versatz) |

Jeder Typ trägt:
- Schwierigkeit in drei Stufen wie in Heimwerker-Anleitungen (leicht, mittel, schwer), Zeit je Verbindung für Anfänger und Geübte, Anspruch beim Bohren (kaum Bohrungen, rechtwinklig bohren, Bohrungen müssen sich treffen) und was es schwer macht. Werkzeug als Mindestausstattung, dazu „komfortabler mit“ (z. B. Oberfräse). Quelle: `docs/recherche/verbindungen-anleitungen.md`.
- Je Verbindungsart: Wirkprinzip, Herstellungsschritte und typische Fehler (`src/model/jointGuide.ts`). Die Schritte enthalten die Maße der konkreten Verbindung (Bohrdurchmesser, Bohrtiefe, Abstände, Schraubenlänge, Zapfenmaße), gerechnet in `src/model/jointPlan.ts`. Stumpfe Stöße mit Bolzen bzw. Schrauben ins Hirnholz haben eigene Abläufe; beim Bolzenstoß wird die große Tasche (Ø 35, 12 mm über die Mitte der Dicke, zwei Taschen zu einer Langtasche verbunden) zuerst gebohrt, damit die Längsbohrung nur sie treffen muss. Bolzen werden im Verbund in einem Zug gebohrt, nicht von beiden Seiten; Holz unter 50 mm (Geländer, Haltegriff) bekommt M8 statt M10, damit der Randabstand von 3 · d stimmt. Haltegriffe (und Holme der senkrechten Leiter) sitzen mit ihrer Bolzenachse mindestens 130 mm neben der Pfosteninnenkante, frei von der Mutterntasche des Eckstoßes; die Wange wird vom dünneren Holz aus angeschraubt. Die Prüfung meldet Schrauben, die durch Luft laufen oder weniger als 6 · d greifen (`fastenerGrip`), und Befestiger, die sich kreuzen – auch nicht vorgebohrte Schrauben, Sackbohrungen gesteckter Stäbe und die Mutterntaschen (`fastenerClashes`, getestet über 14 Standardbetten in `tests/praxis.test.ts`). Wandriegel werden nie von der Wandseite verschraubt: an Ecken ohne Pfosten läuft die freie Zarge durch und der Wandriegel stößt stumpf dagegen; zwei Wandriegel in der Raumecke stoßen lose. Bauweise „aufgelegt“ mit Latten: Latten an beiden Enden verschraubt, Querzarge überall, wo ein Geländer an ihr hängt. Zapfen zweier Richtungen im Eckpfosten werden so weit gekürzt, dass sie sich nicht treffen; die Holznägel sitzen höhenversetzt. Sprossen- und Stabbohrungen stehen in Bohrtabelle und Anleitung (erste Bohrung ab Fuß, Teilung); Geländerstäbe sitzen 20 mm tief. Knagge: Klotz aus einem Rest Geländerholz (44 × 74, mittig auf dem Pfosten, höchstens so breit wie er), 2 × 2 Schrauben 6 × 100, am Eckpfosten 25 mm versetzt, dazu eine Zugschraube 8 × 160 durch den Pfosten ins Trägerende. Einkauf: je Bolzen eine große Scheibe DIN 440, Balkenschuh mit Innenmaß. Tragen die Querzargen nichts (Latten, Roste), sitzen sie 6 mm tiefer, damit die Bolzen beider Richtungen im Eckpfosten 30 mm Randabstand behalten. Eine Schlossschraube taugt dort nicht (ihr Vierkant dreht im Hirnholz mit), deshalb Sechskantschraube.
- Sicherheitshinweise passend zu Werkzeug und Arbeitsschritten (Oberfräse, Beitel, lange Bohrer, Säge).
- Bohrhilfe ohne Bohrständer: Anreißen vom Nullpunkt, im Verbund und von beiden Seiten bohren, Führungswinkel aus Leistenresten, Peilen mit zwei Winkeln, Tiefenmarke.
- Befestigungsmittel als Modell (`src/model/fasteners.ts`): Lage, Einbaurichtung und Zeitpunkt (vor dem Fügen, mit dem Teil, danach). Schraubenlängen so, dass das Gewinde mindestens 72 mm (9·d) im tragenden Holz sitzt; Mutter 80 mm vom Hirnholzende; Bolzen nach DIN EN 1995 mit 4·d zur belasteten Oberkante, 3·d zur Unterkante und 4·d untereinander; an Eckpfosten sitzen die Bolzen der Querrichtung 16 mm tiefer, damit sie sich im Pfosten nicht kreuzen. Zapfen, Dübel und Schrauben stehen hochkant entlang der breiten Seite. Auflagerleiste mit 6 × 100, nie unter dem tragenden Holz heraus. Überblattung zur bündigen Seite offen, beide Hölzer gleich tief (kein Hohlraum am dickeren), Schrauben von außen durch das Blatt. Bettschraube: Zylindermutter 60 mm vom Ende, Länge M8 × 120/140/160 nach Holzdicke. Ein Test prüft für alle wählbaren Kombinationen des Beispielzimmers, dass Bleche und Schrauben an der Verbindung sitzen und Schraubenspitzen im Holz enden. Einkaufsliste, 3D-Beschläge und Ablauf im Verbindungsdetail lesen dieselbe Liste.
- Ablauf im Verbindungsdetail: Die Schritte laufen nacheinander ab, der aktuelle ist hervorgehoben, jeder lässt sich anklicken. Schrauben und Bolzen kommen erst, wenn das Teil sitzt.
- Werkstattzeichnung je Werkstück (`src/model/drawing.ts`, im Verbindungsdetail und im Bauplan): zwei Ansichten aus der gemeinsamen Geometrie, gezeichnet von der Seite, an der die Bearbeitung liegt („Seite zu Längszarge“). Steigende Bemaßung: alle Längen vom benannten Bezug (oberes bzw. unteres Ende, „Ende an Pfosten“), alle Querlagen von der Bezugskante; Abfall schraffiert, verdeckte Kanten gestrichelt. Bohrtabelle mit Lage, Seite, Ø, Tiefe bzw. „durch“, „von beiden Seiten“ und „im Verbund mit Teil … bohren“.
- Eckpfosten: Überschneiden sich Ausnehmungen zweier Verbindungen im selben Holz (Zapfenlöcher, Blätter aus zwei Richtungen) oder kreuzen sich Schrauben bzw. Bolzen, gibt es einen Prüfbefund (`ueberschneidung:…`, `befestiger-kreuzung:…`). Schrauben und Winkel der zweiten Richtung sitzen versetzt.
- Seiten heißen nach ihrer Lage im Bett: Innenseite (zur Bettmitte), Außenseite, Ober- und Unterseite, jeweils „zu“ bzw. „gegenüber“ dem anderen Teil. Die Bohrtabelle nennt die Seite, durch die gebohrt wird.
- Schablone 1:1 zum Ausdrucken für die Fläche mit den Bohrungen: Lochmitten mit Fadenkreuz, Maße, Anlegelinie, Kontrollstrecke 100 mm; lange Ausschnitte auf mehrere Blätter.
- Zur Auswahl stehen nur Arten, die für die beiden Bauteile praktisch taugen (z. B. Gratnut nur für Bretter und Stufen, Rundstab in Bohrung nur für Rundstäbe, Zapfen und Blatt erst ab 40 mm Holzstärke). Eine schon gewählte, unpassende Art bleibt sichtbar und wird begründet.
- Fügerichtung je Art: Blatt und Schwalbenschwanz von der Seite eingelegt, Gratnut entlang der Nut eingeschoben, Balkenschuh und Auflagerleiste von oben, sonst in Stabrichtung. Animation im Verbindungsdetail und Explosionsskizze im Bauplan folgen dieser Richtung.
- Beschläge für die Stückliste
- **Steifigkeitsklasse** (gelenkig, halbsteif, steif) und **Restquerschnitt** für die Statik

Die Vorschläge richten sich nach der Rolle des Teils und der Projektvorgabe: *einfach*, *zerlegbar* (Standard) oder *wenig Metall*.

---

## 6. Ansichten und Navigation ✅

Die Antwort auf „der Übergang zwischen Draufsicht, Seitenansicht und 3D ist immer schlecht“:

1. **Eine Kamera für alles.** Draufsicht und Seitenansicht sind dieselbe perspektivische Kamera mit sehr kleinem Blickfeld aus großer Entfernung. Beim Wechsel **fliegt** die Kamera animiert und blendet das Blickfeld stufenlos über (Dolly-Zoom); man sieht, wie sich der Raum dreht. ✅
2. **Hauptansicht und Nebenansichten.** Zwei kleine Live-Ansichten am rechten Rand tauschen per Klick animiert mit der großen. ✅
3. **Aus 2D direkt in 3D kippen.** Mit der rechten Maustaste in der Draufsicht oder Seitenansicht ziehen: Die Ansicht wird weich perspektivisch und dreht. ✅
4. **Puppenhaus.** Wände zwischen Kamera und Bett samt Stuck, Fenstern und Beschriftung blenden sich automatisch aus; die Decke ist in 3D ausgeblendet. ✅
5. **Draufsicht mit Schnitthöhe.** Alles oberhalb wird abgeschnitten (Regler); geschnittene Wände erscheinen dunkel. ✅
6. **Ich-Perspektive mit Standpunkten:** „An der Tür stehen“, „Unter dem Bett sitzen“, „Auf der Matratze sitzen“, „Im Bett liegen“.
   - Die Augenhöhe kommt aus der Körpergröße, die Kamera fliegt hin. ✅
   - Umsehen per Ziehen, Gehen mit WASD oder den Pfeiltasten, Q/E für hoch/runter, Mausrad für den Blickwinkel. ✅
7. **Übersichtskarte** mit Kamerastandort und Blickkegel; ein Klick setzt das Blickziel. ✅
8. **Zoom zum Mauszeiger, Doppelklick fliegt schrittweise näher heran, Fokus aus der Prüfliste;** „⌂ Zurück“ (Taste `0`) zeigt wieder das ganze Zimmer. ✅
9. **Maus:** links ziehen dreht in 3D bzw. verschiebt in 2D, Alt + links dreht, rechte und mittlere Taste verschieben immer (nicht jede Maus hat eine nutzbare mittlere Taste). Mausprofil „CAD“ (Raum → Einstellungen): links verschiebt, Shift + mittlere Taste dreht. ✅
10. Abwicklung (Taste `5`), Schnittbox ✂ in 3D, Mausprofil CAD. ✅ Statt Ansichtswürfel: Übersichtskarte und Ansichtsleiste.
11. Geplant ◻:
   - verzerrungsarme Weitwinkelprojektion (Panini) für die Ich-Perspektive (zurückgestellt)
   - Tiefenstaffelung in der Seitenansicht
   - weitere Mausprofile (SketchUp, Blender)

**Bearbeiten:**
- Bett in Draufsicht oder 3D ziehen; es rastet an Wänden ein. In der Seitenansicht hoch und runter ziehen ändert die **Liegehöhe**. ✅
- Fenster, Heizkörper und Steckdosen in der Seitenansicht entlang der Wand und in der Höhe ziehen. ✅
- **Balken zeichnen:** zwei Klicks auf Arbeitshöhe (Oberkante) bzw. in der Seitenansicht auf einer Ebene im wählbaren Wandabstand. Shift zeichnet gerade, Strg zeichnet weiter. Fang auf Bauteilenden, Wände und Raster. ✅
- **Pfosten setzen:** ein Klick. ✅
- Rückgängig und Wiederholen (200 Schritte; Ziehen zählt als ein Schritt). Tastenkürzel: 1–6, 0, V, B, P, R, F, Entf/Rücktaste, Esc, ?, Strg/Cmd+Z, Strg+Y/Strg+Shift+Z. ✅
- Griffe an den Stabenden, Länge im Etikett eintippen, Reihe erzeugen, Spiegeln. ✅
- Seitenleisten in der Breite veränderbar (Rand ziehen, Doppelklick setzt zurück). ✅
- Einheitlicher Symbolsatz (Lucide, ins Bundle übernommen) in Werkzeugleiste, Ansichtsleiste und Kopfzeilen; Werkzeugleiste ab 1361 px beschriftet. Beispielzimmer-Hinweis als schmale, schließbare Leiste über der Ansicht. Ausgewählte Teile behalten Holzfarbe und Maserung und werden mit Tönung und Umriss markiert. ✅
- **Rechte Seitenleiste:** Reiter „Eigenschaften“ und „Prüfung“ (mit Zählern). Die Eigenschaften beginnen mit einer Kopfzeile des gewählten Objekts (Heranholen, Duplizieren, seltene Aktionen im ⋯-Menü, Löschen) und einem Hinweis auf Befunde dazu. Die Abschnitte sind zuklappbar, zeigen zugeklappt ihre wichtigsten Werte und merken sich ihren Zustand. Ein angeklicktes Einzelteil zeigt nur den passenden Bett-Abschnitt (z. B. Absturzsicherung beim Geländerbrett). In der Prüfung sind Hinweise zusammengeklappt, Fehler und Warnungen stehen oben. ✅
- Ein angeklicktes Bauteil zeigt oben den Pfad „Bett › Bauteil“; ein Klick auf das Bett oder `Esc` wählt das ganze Bett. ✅
- **Eigenes Bett aus freien Teilen:** Shift-Klick bzw. Shift + Ziehen (Rahmen) wählt mehrere freie Teile (gemeinsam verschieben oder entfernen), „Als Bett zusammenfassen“ macht daraus ein Bett mit Namen. Es steht in der Bettliste, wird als Ganzes ausgewählt und verschoben (Pfad und `Esc` wie bei Vorlagen) und lässt sich wieder auflösen. „Freie Teile (n)“ in der Bettliste wählt alle freien Teile. ✅
- **Liegefläche eines eigenen Betts:** beim Zusammenfassen übernommen (mitgewählte Matratze) bzw. erkannt (größte Platte, sonst die Ebene mit den meisten waagrechten Hölzern), Maße und Lage anpassbar. Daraus entstehen die Matratzenlast für die Statik und die Prüfungen für Freiraum unter und über dem Bett und offene Seiten (Geländer mind. 16 cm über der Matratze auf mind. 60 % der Seite, sonst Wandspalt bzw. fehlende Absturzsicherung). ✅
- Geplant ◻: Maßketten mit direkter Eingabe in der Ansicht.

---

## 7. Analysen und Prüfungen ✅

| Prüfung | Stand |
|---|---|
| Kollision Bauteile ↔ Wände, Decke, Stuck (Profil), Sockelleiste, Fensterbank, Laibung, Heizkörper, Lampe, Rosette, Möbel | ✅ |
| Konvektionsraum über Heizkörper, verdeckte Steckdosen | ✅ Hinweis |
| **Fensterflügel:** Schwenk 0–180°, freier Winkel, blockierendes Teil, Kippspalt (125 mm), Griff | ✅ |
| Darstellung: Schwenkbogen grün bis zum freien Winkel, rot bis 90°; Regler „Flügel öffnen“ | ✅ |
| Tür, die nach innen schwenkt | ✅ |
| **Freiraum:** lichte Höhe darunter, Kopfraum über der Matratze (Decke, Lampe, Rosette); Stehen, Sitzen am Schreibtisch und Sitzen im Bett nach Körpergröße; Maßlinien in der Ansicht | ✅ |
| Sicherheit: Geländer ≥ 16 cm über der Matratze, Lücken ≤ 75 mm, Einstieg 30–40 cm, Stufenabstand 25 ± 5 cm, Wandspalt 75–230 mm, offene Seiten, Altershinweis | ✅ (Profil Kinder/Jugendliche/Erwachsene) |
| Stabilität: freistehend ohne Aussteifung, Wandbaustoff bei Befestigung, Holzbalkendecke, abgehängt, Mietwohnung (Zahl der Bohrungen) | ✅ |
| Material: Überlänge, unsortiertes Holz für tragende Teile, sich durchdringende Teile | ✅ |
| Ausklinkung zu tief | ✅ |
| Hinweis auf geschätzte Maße (nur bei älteren Projekten), Rauchmelder | ✅ |
| **Statik des Gestells** (Stabwerk, Lastfälle, Durchbiegung und Ausnutzung, Seitensteifigkeit) | ✅ |
| Einbringen durch die Tür, Montagereihenfolge mit Hinweis auf das Aufrichten deckenhoher Pfosten | ✅ |
| Begehbares Netz mit Durchhang und Randkräften: Randzug und Sprung als Seilkraft in der Rahmenstatik, Warnhinweis | ✅ (M7) |

### 7.1 Statik (umgesetzt)

Grundlagen und Werte stehen in [`docs/recherche/statik-grundlagen.md`](docs/recherche/statik-grundlagen.md).

- **Modell:** 3D-Stabwerk aus den Stäben; Knoten an den erkannten Verbindungen, deren Steifigkeit aus dem Verbindungstyp kommt; Auflager aus Boden, Wand- und Deckenbefestigungen.
- **Lastfälle:**
  - Eigengewicht, dazu Matratze und Bettzeug 0,3 kN
  - Nutzlast nach Lastprofil: Bett 1,0 kN/m², Hochebene 2,0 kN/m² (A3)
  - „Toben“: 2 kN Stoß, über die Matratze auf ca. 50 × 50 cm verteilt, kurze Lasteinwirkung
  - Geländer 0,5 kN horizontal
  - Seitenlast 0,5 kN längs bzw. quer für Standsicherheit und Wackeln
- **Nachweise (vereinfachter EC5):**
  - Biegung, Schub mit k_cr nach NA (2,0 / f_v,k, bei BSH 2,5 / f_v,k), Restquerschnitt aus dem Verbindungstyp; Ausklinkungen mit k_v noch nicht
  - Knicken der Pfosten
  - Durchbiegung L/300 bzw. L/200 mit k_def
  - Verbindungsmittel mit den belegten charakteristischen Werten
  - Unsortiertes Holz wird mit C16 gerechnet.
- **Darstellung:** Einfärbung nach Ausnutzung, überhöhte Biegelinie, Vergleich der Querschnitte mit Tausch per Klick, Wackel-Animation bei fehlender Aussteifung.

---

## 8. Material und Kosten ✅

- **Katalog** am Hornbach-Sortiment ausgerichtet ([Recherche](docs/recherche/hornbach-sortiment.md)):
  - KVH C24 in 3–6 m (500er-Schritte)
  - BSH
  - Kantholz sägerau und gehobelt (Raster 24/34/44/54/74/94, meist 2,5 m)
  - Leimholz, OSB, 3-Schicht, Multiplex, Dielen, Latten, Rundstäbe
  - Beschläge
  - Jede Position hat einen Richtpreis mit „geschätzt“-Markierung.
- **Einkaufsliste:**
  - Holz als Anzahl × Handelslänge
  - Platten bzw. Dielen nach Format
  - Beschläge aus den gewählten Verbindungen und Befestigungen, auf Packungen gerundet
  - Summe und Anteil geschätzter Preise
- **Zuschnittplan:** First-Fit-Decreasing auf die Handelslängen, Sägeschnitt 3 mm, jede Stange auf die kürzeste passende Länge verkleinert; Verschnitt und Zahl der Schnitte (Baumarkt-Zuschnitt 0,10–0,50 €/Schnitt).
- **Preisrecherche:**
  - Die App erzeugt einen Prompt mit Artikel-IDs, Mengen und Preiseinheit für einen KI-Chat mit Websuche (z. B. Claude).
  - Die Antwort wird als `id;preis;einheit;name;url` zurückgefügt.
  - Die Preise ersetzen die Richtpreise und erscheinen mit Datum.
- **Export:** CSV, Druckansicht.
- Umgesetzt ✅:
  - Bauplan (PDF über Drucken) mit Maßketten, Teilenummern und **Skizzen der Verbindungen** (M6)
  - Montageschritte im Bauplan und Aufbau-Animation (M6)
  - Ablauf nach Heimwerker-Praxis (`docs/recherche/verbindungen-anleitungen.md`): Zuschneiden, kennzeichnen, bearbeiten → Seitenrahmen am Boden vormontieren (Diagonalen mit Sollmaß, Bolzenlöcher im Verbund) → aufrichten und verbinden (Sollmaß der Diagonale in der Draufsicht) → Aussteifung, Querträger, Liegefläche, Geländer, Leiter → Nachziehen. Wandbetten beginnen mit dem Wandbalken.
  - Teilenummern berücksichtigen das Bohrbild: gespiegelte Teile (Pfosten links/rechts, Wangen) bekommen eigene Nummern und Zeichnungen
  - **Teile-Arbeitsplan** im Bauplan: je Teilenummer alle Bearbeitungen und Bohrungen aus allen Verbindungen, gezeichnet in den Bereichen mit Bearbeitung, mit Bohrtabelle und Schablone 1:1
  - optional ein Preis-Agent mit eigenem API-Schlüssel (M7)
- Geplant ◻: 2D-Zuschnittplan für Platten

---

## 9. Technik

- React 19, TypeScript, Vite, three.js 0.186 über react-three-fiber 9 und drei; Zustand mit immer; Tests mit Vitest.
- **Kern ohne DOM** (`src/model`, `src/analysis`), mit Vitest getestet:
  - Geometrie (orientierte Quader, Trennachsen-Test, Ausklinkungen)
  - Raum (Stuckprofil, Flügel-Schwenk, Kippspalt, Hindernisse)
  - Hochbett-Generator, Auflöser (Abrücken, Ausklinken, Verbindungserkennung)
  - Holzverbindungen als Geometrie (`joinery.ts`)
  - Planungsassistent und Platzierung (`wizard.ts`, `placement.ts`)
  - Statik (`frame.ts`, `statics.ts`)
  - Prüfungen, Stückliste und Zuschnitt, Foto-Abgleich (`photo.ts`), Montagereihenfolge (`assembly.ts`), Öffnungen (`openings.ts`)
- **Ansichten:** `src/views` mit einer gemeinsamen Szene, einer Kamera-Steuerung mit Animation und eigener Zeigerlogik (Auswahl, Ziehen, Zeichnen, Navigation).
- **UI:** `src/ui` mit Werkzeugleiste (inkl. Sprachwahl), in der Größe veränderbaren Seitenleisten, Eigenschaften, Prüfliste, Material-Dialog, Bauplan mit Skizzen, Planungsassistent, Statik, Aufbau-Animation, Tablet-Abgleich und Hilfe.
- **Sprachen:** `src/i18n` (Deutsch im Quelltext, Englisch in `src/i18n/en/*`); `tests/i18n.test.ts` prüft auf fehlende Übersetzungen.
- **PWA und Abgleich:** `vite-plugin-pwa` (installierbar, offline), `vite/sync-plugin.ts` für den Projekt-Abgleich mit dem Tablet (`npm run lan`).
- **Speichern:** automatisch in `localStorage`; Export und Import als `.hochbett.json`. Ältere Stände werden beim Laden ergänzt.

---

## 10. Ausbaustufen

| Stufe | Inhalt | Stand |
|---|---|---|
| M1 Raum & Zeichnen | Raum, Hindernisse, Ansichten mit Übergängen, Zeichnen, Fang, Undo, Speichern | ✅ Prototyp |
| M2 Vorlagen & Freiraum | 6 Bauarten, Geländer, Leitern, Freiraum, Fenster- und Tür-Schwenk, Prüfliste | ✅ Prototyp |
| M3 Verbindungen & Material | Verbindungskatalog, automatische Erkennung, Einkaufsliste, Zuschnitt, Preis-Prompt | ✅ Prototyp |
| M4 Bedienung verfeinern | Griffe an Stabenden, Länge im Etikett eintippen, Reihe erzeugen, Bett spiegeln, Abwicklung (Wandobjekte ziehen), Schnittbox, „Ansicht zurücksetzen“, Kamera nicht unter den Boden, Mausprofil CAD, 3D-Detail je Verbindung (Explosion mit Beschlägen). Statt Ansichtswürfel: Übersichtskarte und Ansichtsleiste. Panini-Projektion zurückgestellt. | ✅ |
| M5 Statik des Gestells | 3D-Stabwerk (Skyline-Löser) mit Verbindungsfedern je Verbindungsart, Lastfälle Eigengewicht/Nutzlast (Lastprofil Bett 1,0 bzw. Hochebene 2,0 kN/m²), Toben 2 kN auf 50 × 50 cm, Seitenlast längs/quer, Geländer; EC5-Nachweise (Biegung + Normalkraft mit Knicken, Schub mit k_cr, Durchbiegung L/300 bzw. L/200 mit Kriechen, Restquerschnitt an Verbindungen), Verbindungskräfte, Wackeln; Einfärbung, Verformungsfigur, Wackel-Animation, Querschnittsvergleich, Befunde in der Prüfliste | ✅ |
| M6 Bauplan | Druckbarer Bauplan (PDF über Drucken): Kopfdaten, 3D-Bild, Ansichten vorne/seitlich/oben aus dem Modell mit Maßketten und Teilenummern, Teileliste mit Ausklinkungen, Skizzen je Verbindungsart als Explosions-Isometrie, aus der Modellgeometrie erzeugt, Montageschritte mit Teilen und Werkzeug, Zuschnitt, offene Punkte. **Aufbau-Animation** (Teile fliegen Schritt für Schritt ein). Prüfung „passt durch die Tür“. **Plattenzuschnitt 2D** (`src/analysis/sheetcut.ts`): alle Teile eines Plattenwerkstoffs gemeinsam auf die Handelsformate, Guillotine-Schnitte, Sägefuge 4 mm, Drehen erlaubt; zu große Teile werden geteilt (Stoß über einem Querträger), danach jede Platte aufs günstigste passende Format verkleinert; maßstäbliche Zeichnung je Platte im Zuschnitt und im Bauplan. | ✅ |
| M6b Tablet | Finger/Stift (antippen = auswählen, ausgewählt ziehen = verschieben, Pinch-Zoom, zwei Finger verschieben/drehen, Doppeltipp = Fokus), Seitenleisten als Schubladen unter 1280 px, große Bedienflächen bei Fingerbedienung, `npm run lan` mit Projekt-Abgleich über /api/projekt und QR-Code, Tailscale-Anleitung, PWA (installierbar, offline über HTTPS/localhost) | ✅ |
| M7 Erweiterungen | Vorlagen Halbhoch, **mehrere Matratzen** (Anzahl, nebeneinander oder hintereinander, Abstand; „Zwei Kinder oben“), **Etagenbett** (zweite Liegefläche zwischen den Pfosten, Sitzhöhe unten geprüft), **Galerie mit Mittelstützen**, **begehbares Netz** (Randzug n = q·w²/8f und Sprung als Seilkraft in der Rahmenstatik), Geländerstützen für lange Felder (an der Wand innen), **Preis-Agent** mit eigenem API-Schlüssel (Websuche, Antwort wird direkt übernommen). **Dachschräge** (Raum → Dachschräge, `src/model/ceiling.ts`). **Vorsprünge und L-Form** (Ausstattung → + Vorsprung / + Raumecke). **Bett auf Regal/Schrank** (Vorlage mit zwei Regalen; „Freie Ecken getragen von: Regal oder Schrank“ für jede Bauart außer deckenhoch/abgehängt, Pfosten entfallen, der Rahmen schließt sich selbst; Oberseiten von Schrank, Regal und Kommode sind Auflager in der Statik; „Auf Möbel setzen“ passt die Liegehöhe an; Prüfung `moebel-traeger` je Möbel und `moebel-auflage`, wenn nichts darunter steht). **Plattenzuschnitt 2D** (siehe M6). Später: freies Vieleck mit schrägen Wänden, Unterzug. | ✅ |
| M8 Visuelle Qualität | Erster Durchgang: prozedurale Holzmaserung (Faser, Jahresringe, Hirnholz, OSB-Späne), Dielenboden, Putz, weiches Fensterlicht ohne Download, Außenansicht durch die Fenster (Stencil-Maske), Schlossschrauben als Modelle, Doppelklick-Heranfliegen, Qualitätsstufen. Zweiter Durchgang: Winkel und Balkenschuhe, Stuckprofil und Rosette, Sonnenlicht nach Uhrzeit. Dritter Durchgang: Holzverbindungen als Geometrie (Zapfen, Blätter, Nuten, Einlassungen), Kopfbänder auf Gehrung und eingelassen, Holzbauschrauben, Holznägel, Holzdübel, Bettschrauben mit Quermutter, Skizzen als Isometrie, Verschieben mit der mittleren Maustaste, Seitenleisten in der Größe veränderbar. Offen siehe Kapitel 13 | ✅ |
| M9 Sprachen & Einstieg | Englisch als Standard, Deutsch umschaltbar (automatisch nach Browsersprache), alle Texte über `t()` mit Test auf fehlende Übersetzungen; **Planungsassistent** für Einsteiger (Raum, Wände, Öffnungen, Schläfer, Nutzung darunter, Befestigung → geprüfte, gewichtete Vorschläge) | ✅ |

---

## 11. Offene Punkte

1. ~~Testzimmer nachmessen~~ Entfällt: Das Beispielzimmer ist öffentlich und ohne „geschätzt“-Markierungen; das eigene Zimmer wird in der App bzw. mit dem Planungsassistenten angepasst.
2. **Wandbaustoff und Deckenart** im Beispielzimmer: Fensterwand A gemauert, B–D Leichtbau, Holzbalkendecke (nicht für Abhängung).
3. **DIN EN 747:2024:** Werte gegen den Normtext prüfen, sobald er vorliegt.
4. ~~Soll der **Preis-Agent** später direkt in der App laufen?~~ Beides: Prompt zum Kopieren und optional direkt mit eigenem API-Schlüssel (M7).

---

## 12. Wow-Features

Gesammelt und laufend ergänzt:

1. **Dein Hochbett im Foto deines Zimmers.** Ein Foto vom Zimmer laden und ein paar Raumecken anklicken. Die App errechnet daraus Standort und Brennweite der Kamera und blendet das geplante Bett perspektivisch richtig ins Foto ein. ✅ umgesetzt (Ansicht **📷 Foto**, Taste `6`): Kamera per Levenberg-Marquardt aus 4–8 Punkten; auf Wunsch werden Lage und Größe der angeklickten Fenster und Türen mitgeschätzt und zum Übernehmen vorgeschlagen. Das Foto bleibt im Browser (IndexedDB).
2. **Aufbau-Animation.** Die Teile fliegen in Montagereihenfolge an ihren Platz, so wie man sie später aufbaut. Jeder Schritt kann einzeln angesehen werden. ✅ umgesetzt Beschläge einer Verbindung erscheinen erst, wenn beide Teile stehen; jeder Schritt nennt die Verbindungen, die dabei entstehen, und öffnet per Klick deren Anleitung und Werkstattzeichnung.
3. **Wackel-Vorschau.** Die Statik zeigt nicht nur Zahlen: Ein Gestell ohne Aussteifung wackelt sichtbar, mit Kopfbändern steht es still. ✅ umgesetzt (M5)
4. **Fenster-Durchschwenk.** Schon umgesetzt: Der Flügel schwenkt in 3D auf, und der Schwenkbogen zeigt grün/rot, wo er anstößt.
5. **Vom leeren Zimmer zum geprüften Entwurf.** Der Planungsassistent fragt in wenigen Schritten Raum und Decke, Wände, Öffnungen, Schläfer, Nutzung darunter und Befestigung ab und schlägt bis zu drei geprüfte, gewichtete Entwürfe vor, die direkt weiter anpassbar sind. ✅ umgesetzt (M9)
6. **Kopfraum-Karte unter der Schräge.** Die Matratze färbt sich nach der Höhe bis zur Decke, die beste Stelle zum Aufsetzen ist markiert; so sieht man sofort, wo das Kopfende hingehört. ◻ Idee
7. **Bauweisen im Vergleich.** Zargen zwischen den Pfosten, aufgelegt oder außen durchgebolzt: dasselbe Bett in allen Bauweisen nebeneinander in 3D, mit Preis, Wackeln, Bohrlöchern und Aufbauzeit; ein Klick übernimmt die gewählte. Umgesetzt als Dialog „Bauweisen vergleichen“ (Eigenschaften → Hölzer): je Bauweise eine kleine 3D-Ansicht (alle drehen gemeinsam), Preis, Wackeln, Bohrungen, Teile, Arbeitszeit der Verbindungen, Durchgang unter dem Bett und höchste Ausnutzung; Rechnung in `src/analysis/compare.ts`. ✅

---

## 13. Visuelle Qualität (M8)

Recherche: [docs/recherche/visuelle-qualitaet.md](docs/recherche/visuelle-qualitaet.md). Umgesetzt (✅) bzw. offen (◻):

1. ✅ **Holz:** Maserung richtig darstellen – entlang der Stabachse ausgerichtet, Hirnholz an den Stirnseiten mit Jahresringen, leichte Farbvariation je Bauteil, Fasen/gebrochene Kanten. KVH, Leimholz, OSB, Dielen und Latten unterscheidbar.
2. ✅ **Verbindungen:** Beschläge als Instanzen – Schlossschrauben (Kopf, Scheibe, Mutter), Bettschrauben mit Quermutter in sichtbarer Tasche, Bleche für Winkel (L-Blech in der Innenecke) und Balkenschuhe (Boden, Seiten, Laschen), Schraubenköpfe der Holzbauschrauben, Holznägel, Holzdübel, Gewindestangen mit Mutter und Scheibe. Holzverbindungen (Überblattung, Zapfen mit Holznagel, Schwalbenschwanzblatt, Gratnut, Einlassung, Rundstab in Bohrung, Auflagerleiste, Kopfband auf Gehrung bzw. eingelassen) als echte Geometrie in 3D, Verbindungsdetail und Bauplan-Skizze aus einer gemeinsamen Rechnung (`src/model/joinery.ts`); Zuschnittlängen enthalten Zapfen und Blätter. Offen ◻: Sicken und Löcher an den Winkeln.
3. ✅ **Zoom auf interessante Stellen per Klick** (Doppelklick, schrittweise): Verbindung, Ausklinkung am Stuck, Fensterflügel-Anschlag usw. anklicken → Kamera fährt weich heran (mit Rücksprung).
4. ✅ **Zimmer** (Dielen, Putz, weiches Licht, Stuckprofil mit Rundstäben und Hohlkehle, Rosette als Drehkörper; Umgebungsverdeckung getestet und wegen Stencil-Konflikt und iPad-Kosten verworfen): Wände mit Putzstruktur, Dielenboden mit Maserung, Stuckprofil und Rosette plastisch, Sockelleisten, Heizkörperrippen, Steckdosen, Fensterrahmen mit Profil; weiches Licht. Offen ◻: Kontaktschatten.
5. ✅ **Blick durch die Fenster** (prozedurale Kulisse, nur in der Fensteröffnung sichtbar) und **Sonnenlicht nach Uhrzeit** (Ebenen ▾ → ☀, Lichtfleck mit Fensterkreuz, morgens/abends wärmer): Außenansicht statt leerem Hintergrund (Himmel, Bäume/Straße als Panorama oder HDRI), Tageslicht durch die Fenster, Tageszeit wählbar.
6. ◐ **Allgemein** (Qualitätsstufen hoch/normal/einfach unter Raum → Einstellungen): Kantenglättung, ruhige Materialpalette, ggf. Umgebungslicht aus HDRI; Leistung auf dem Tablet im Blick behalten (Qualitätsstufen).

