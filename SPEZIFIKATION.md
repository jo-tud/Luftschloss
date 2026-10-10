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
3. **Prüfen** – Freiraum, Fenster und Tür, Kollisionen (auch mit Stuck und Sockelleiste), Sicherheitsempfehlungen; später die Statik des ganzen Gestells.
4. **Material** – eine Einkaufsliste, die man im Baumarkt (Hornbach) tatsächlich bekommt, mit Zuschnitt und Kosten.
5. **Preise** – recherchieren lassen über einen Prompt zum Kopieren.

### 1.2 Grundsätze

- **Empfehlungen statt Verbote.** Sicherheitsregeln (DIN EN 747), Foren-Konsens und Faustregeln erscheinen als Hinweise, Warnungen oder Fehler. Die Erwachsenen entscheiden: Jeder Befund lässt sich quittieren und bleibt dann ausgegraut sichtbar.
- **Kreativität zulassen.** Auch riskante Bauarten werden angeboten, zum Beispiel abgehängte Betten, Seilgeländer und später begehbare Netze. Sie bekommen einen dezenten Warnhinweis.
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
| F2 | Raumform | **Rechteck**, dazu **Stuckleisten** (an allen Wänden gleich, je Wand abweichend möglich), **Deckenrosette mit Lampe**, **Sockel- bzw. Parkettleisten**, **tiefe Fensternischen**. L-Form, Unterzug und Dachschräge kommen später. |
| F3 | Zielgruppe | Kinder, Jugendliche, Erwachsene; das Testbett ist für Jugendliche. Das Sicherheitsprofil ist umschaltbar, und alles ist quittierbar. |
| F4 | Sprache | Deutsch, Anzeige in cm, intern ganzzahlige mm |
| F5 | Technik | React, TypeScript, Vite, three.js über react-three-fiber |
| F6 | Preise | Recherche-Prompt zum Kopieren und Antwort zurückfügen (umgesetzt). Ein Agent mit API-Schlüssel ist optional für später. |
| F7 | Vorlagen | **Immer anpassbar** (parametrisch). Einzelne Teile lassen sich herauslösen, ganze Baugruppen auflösen. |
| F8 | Statik | Später, aber als **Prüfung des ganzen Gestells**, nicht je Balken. Das Datenmodell ist vorbereitet. |
| F9/F10 | Bauplan, Holzverbindungen | Vorerst auswählen und anzeigen. Später Bauanleitungen mit Maßzeichnung; die Bearbeitungen werden schon jetzt gespeichert. |
| F11 | Normen | Gekennzeichnete Richtwerte (EN 747 Stand 2015, 2024 ungeprüft) |
| F12 | Riskante Bauarten | Anbieten, mit dezenter Warnung |
| F13–F16 | Mehrere Betten, Speichern, Montage | Mehrere Betten gehen; Speichern lokal und als Datei; Montageanleitung kommt später |

---

## 3. Arbeitsablauf

1. **Raum** – Maße, Stuck, Sockelleiste, Rosette und Lampe, Wand-, Boden- und Deckenart. ✅
2. **Ausstattung** – Fenster (Flügel, Laibung, Nische, Fensterbank), Tür, Heizkörper, Steckdosen. ✅
3. **Bett** – Vorlage in eine Raumecke einsetzen oder Balken und Pfosten frei zeichnen. ✅
4. **Anpassen** – Parameter rechts, Ziehen in der Ansicht. ✅
5. **Prüfen** – laufende Prüfliste mit Fokus auf das betroffene Teil. ✅
6. **Material** – Einkaufsliste, Zuschnittplan, Kosten, Preis-Prompt, CSV und Druck. ✅

Beim ersten Start lädt das **Testzimmer**: 4,30 × 5,95 m, zwei Fenster an Wand A, Tür in Wand C, Stuck, Rosette, Parkettleisten, Bett in der hinteren linken Ecke vor dem linken Fenster. Geschätzte Maße sind gelb markiert und erscheinen als Hinweis „bitte nachmessen“.

---

## 4. Raummodell ✅

- **Koordinaten:** Ursprung in der Ecke Wand A/B; x entlang Wand A, y in den Raum, z nach oben.
- **Wände:** A (Fensterwand), B, C, D im Umlauf. „Links“ bei Wandobjekten heißt immer: vom Raum aus auf die Wand gesehen.
- **Wand-, Boden-, Deckenart:**
  - Wand: Beton, KS, Vollziegel, Lochziegel, Porenbeton, Trockenbau, Holzständer. Steuert die Warnungen zu Befestigungen.
  - Boden: Estrich, Fußbodenheizung, Dielen. Bei Dielen gibt es einen Hinweis auf Lastverteilplatten.
  - Decke: Beton, Holzbalken, abgehängt.
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
- Später: L-Form, Unterzug, Dachschräge, Rollladenkasten, Thermostatkopf. ◻

---

## 5. Konstruktionsmodell ✅

- **Stab** (Member): Achse Start/Ende, Querschnitt b × h, rund oder eckig, Drehung, Katalogartikel, Rolle, **Ausklinkungen** (Notches mit Grund). Die Ausklinkungen sind die Grundlage für spätere Maßzeichnungen.
- **Fläche** (Panel): waagrecht (Umriss) oder senkrecht (Geländerfüllung, Netz). Arten: Platte, Dielen, Rollrost, Lattenrost, Netz, Matratze.
- **Baugruppe „Hochbett“:** parametrisch, erzeugt alle Stäbe und Flächen neu. Teile lassen sich **herauslösen** (werden frei) oder die ganze Baugruppe **auflösen**.
- **Verbindungen:** werden automatisch erkannt. Arten: Eckstoß, T-Stoß, Kreuzung, Auflage, Längsstoß, Strebe, Beischlag. Der Typ ist je Verbindung wählbar und wird gespeichert.
- **Befestigungen:** Wandriegel mit Dübeln, Kippsicherung, Stellfüße für die Deckenverspannung, Deckenanker für abgehängte Betten.

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
| **Eckbett, Ecke abgehängt** | ✅ | Zwei Wandbalken, die freie Ecke an einer Gewindestange von der Decke. Fehler bei nicht tragfähiger Decke, Warnung bei Holzbalkendecke (nur in einen Balken). |
| Halbhochbett, Etagenbett, Bett auf Regal, Podest, Galerie mit Mittelpfosten | ◻ | |

Parameter sind:
- **Bauweise:** Querträger zwischen Zargen oder **aufgelegt**; freie Ecke auf Pfosten oder **von der Decke abgehängt**
- Matratzenmaß und -dicke, Spiel, Liegehöhe, Lage und Drehung, Wandanschluss
- Hölzer für Pfosten, Zargen und Querträger
- Liegefläche: **Latten lose aufgelegt** (Standard), Rollrost, Lattenrost, Platte, Dielen
- Geländer: **Bretter** (Standard), Rundstäbe, Vollfläche, Netz, Seil oder keins; Höhe und Seiten
- Leiter: **Stufenleiter** (Standard), senkrecht, schräg oder Treppe; Seite, Position, Breite, Neigung, Hölzer

### 5.2 Verbindungstypen ✅

| Gruppe | Typen |
|---|---|
| Stahl | Winkel mit Sicke, Balkenschuh, Seilbefestigung, Gewindestange |
| Schrauben | Schlossschrauben M10, Holzbauschrauben 8×160, Bettschraube mit Quermutter |
| Holz | Stumpfe Auflage, Auflagerleiste, lose aufgelegt, Ausklinkung, Überblattung, Schwalbenschwanzblatt, Zapfen, Holzdübel, Rundstab in Bohrung, Stufe in Gratnut, Kopfband |

Jeder Typ trägt:
- Schwierigkeit, Werkzeuge, ob zerlegbar, Hinweistext mit belegten Werten
- Beschläge für die Stückliste
- **Steifigkeitsklasse** (gelenkig, halbsteif, steif) und **Restquerschnitt** für die spätere Statik

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
   - Umsehen per Ziehen, Gehen mit WASD, Q/E für hoch/runter, Mausrad für den Blickwinkel. ✅
7. **Übersichtskarte** mit Kamerastandort und Blickkegel; ein Klick setzt das Blickziel. ✅
8. **Zoom zum Mauszeiger, Doppelklick zentriert, Fokus aus der Prüfliste.** ✅
9. Geplant ◻:
   - aufklappbarer Raum (Abwicklung) zum Eintragen von Wandobjekten
   - verzerrungsarme Weitwinkelprojektion (Panini) für die Ich-Perspektive
   - Schnittbox in 3D
   - Ansichtswürfel
   - Tiefenstaffelung in der Seitenansicht
   - wählbare Mausbelegung (SketchUp, Blender)

**Bearbeiten:**
- Bett in Draufsicht oder 3D ziehen; es rastet an Wänden ein. In der Seitenansicht hoch und runter ziehen ändert die **Liegehöhe**. ✅
- Fenster, Heizkörper und Steckdosen in der Seitenansicht entlang der Wand und in der Höhe ziehen. ✅
- **Balken zeichnen:** zwei Klicks auf Arbeitshöhe (Oberkante) bzw. in der Seitenansicht auf einer Ebene im wählbaren Wandabstand. Shift zeichnet gerade, Strg zeichnet weiter. Fang auf Bauteilenden, Wände und Raster. ✅
- **Pfosten setzen:** ein Klick. ✅
- Rückgängig und Wiederholen (200 Schritte; Ziehen zählt als ein Schritt). Tastenkürzel: 1–4, V, B, P, R, F, Entf, Esc. ✅
- Geplant ◻: Griffe an den Stabenden, „gleichmäßig verteilen“, Spiegeln, Maßketten mit direkter Eingabe in der Ansicht.

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
| Hinweis auf geschätzte Maße, Rauchmelder | ✅ |
| **Statik des Gestells** (Stabwerk, Lastfälle, Durchbiegung und Ausnutzung, Seitensteifigkeit) | ✅ |
| Einbringen durch die Tür, Montagereihenfolge mit Hinweis auf das Aufrichten deckenhoher Pfosten | ✅ |
| Begehbares Netz mit Durchhang und Randkräften | ◻ (Expertenmodus) |

### 7.1 Statik (umgesetzt)

Grundlagen und Werte stehen in [`docs/recherche/statik-grundlagen.md`](docs/recherche/statik-grundlagen.md).

- **Modell:** 3D-Stabwerk aus den Stäben; Knoten an den erkannten Verbindungen, deren Steifigkeit aus dem Verbindungstyp kommt; Auflager aus Boden, Wand- und Deckenbefestigungen.
- **Lastfälle:**
  - Eigengewicht
  - Nutzlast 2,0 kN/m² (A3)
  - Einzellast 1,0 kN
  - „Toben“ als 3 × Körpergewicht, kurz
  - Geländer 0,5 kN horizontal
  - Seitenlast für die Standsicherheit
- **Nachweise (vereinfachter EC5):**
  - Biegung, Schub mit k_cr = 0,5 (NA), Ausklinkungen mit k_v
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
- Geplant ◻:
  - 2D-Zuschnittplan für Platten
  - Bauplan-PDF mit Maßketten, Teilenummern und **Detailzeichnungen der Verbindungen** (aus den gespeicherten Ausklinkungen und Bearbeitungen)
  - Montageanleitung
  - optional ein Preis-Agent mit eigenem API-Schlüssel

---

## 9. Technik

- React 19, TypeScript, Vite, three.js 0.186 über react-three-fiber 9 und drei; Zustand mit immer; Tests mit Vitest.
- **Kern ohne DOM** (`src/model`, `src/analysis`), vollständig getestet:
  - Geometrie (orientierte Quader, Trennachsen-Test, Ausklinkungen)
  - Raum (Stuckprofil, Flügel-Schwenk, Kippspalt, Hindernisse)
  - Hochbett-Generator, Auflöser (Abrücken, Ausklinken, Verbindungserkennung)
  - Prüfungen, Stückliste und Zuschnitt
- **Ansichten:** `src/views` mit einer gemeinsamen Szene, einer Kamera-Steuerung mit Animation und eigener Zeigerlogik (Auswahl, Ziehen, Zeichnen, Navigation).
- **UI:** `src/ui` mit Werkzeugleiste, Seitenleiste, Eigenschaften, Prüfliste, Material-Dialog und Hilfe.
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
| M6 Bauplan | Druckbarer Bauplan (PDF über Drucken): Kopfdaten, 3D-Bild, Ansichten vorne/seitlich/oben aus dem Modell mit Maßketten und Teilenummern, Teileliste mit Ausklinkungen, Werkstattskizzen je Verbindungsart, Montageschritte mit Teilen und Werkzeug, Zuschnitt, offene Punkte. **Aufbau-Animation** (Teile fliegen Schritt für Schritt ein). Prüfung „passt durch die Tür“. Plattenzuschnitt 2D noch offen. | ✅ |
| M6b Tablet | Finger/Stift (antippen = auswählen, ausgewählt ziehen = verschieben, Pinch-Zoom, zwei Finger verschieben/drehen, Doppeltipp = Fokus), Seitenleisten als Schubladen unter 1280 px, große Bedienflächen bei Fingerbedienung, `npm run lan` mit Projekt-Abgleich über /api/projekt und QR-Code, Tailscale-Anleitung, PWA (installierbar, offline über HTTPS/localhost) | ✅ |
| M7 Erweiterungen | Vorlagen Halbhoch, **Etagenbett** (zweite Liegefläche zwischen den Pfosten, Sitzhöhe unten geprüft), **Galerie mit Mittelstützen**, **begehbares Netz** (Randzug n = q·w²/8f und Sprung als Seilkraft in der Rahmenstatik), Geländerstützen für lange Felder (an der Wand innen), **Preis-Agent** mit eigenem API-Schlüssel (Websuche, Antwort wird direkt übernommen). Offen: auf Regal, Raum als Polygon, Dachschräge, Plattenzuschnitt 2D. | ◐ |
| M8 Visuelle Qualität | Erster Durchgang: prozedurale Holzmaserung (Faser, Jahresringe, Hirnholz, OSB-Späne), Dielenboden, Putz, weiches Fensterlicht ohne Download, Außenansicht durch die Fenster (Stencil-Maske), Schlossschrauben als Modelle, Doppelklick-Heranfliegen, Qualitätsstufen. Zweiter Durchgang: Winkel und Balkenschuhe, Stuckprofil und Rosette, Sonnenlicht nach Uhrzeit. Offen siehe Kapitel 13 | ✅ |

---

## 11. Offene Punkte

1. **Testzimmer nachmessen.** Geschätzt sind:
   - Raumhöhe (3,50 m)
   - Fensterlage und -maße
   - Laibungstiefe (28 cm)
   - Brüstung (85 cm)
   - Stuck (20 cm Höhe, 28 cm Ausladung)
   - Rosette und Lampe
   - Heizkörper
   - Tür
   - Sockelleiste (6 × 1,8 cm)
2. **Wandbaustoff und Deckenart** im Testzimmer: Nur die Fensterwand A ist gemauert; B, C und D sind als Leichtbau eingetragen. Die Decke ist als nicht tragfähig eingetragen, also keine Abhängung.
3. **DIN EN 747:2024:** Werte gegen den Normtext prüfen, sobald er vorliegt.
4. ~~Soll der **Preis-Agent** später direkt in der App laufen?~~ Beides: Prompt zum Kopieren und optional direkt mit eigenem API-Schlüssel (M7).

---

## 12. Wow-Features

Gesammelt und laufend ergänzt:

1. **Dein Hochbett im Foto deines Zimmers.** Ein Foto vom Zimmer laden und ein paar Raumecken anklicken. Die App errechnet daraus Standort und Brennweite der Kamera und blendet das geplante Bett perspektivisch richtig ins Foto ein. ✅ umgesetzt (Ansicht **📷 Foto**, Taste `6`): Kamera per Levenberg-Marquardt aus 4–8 Punkten; auf Wunsch werden Lage und Größe der angeklickten Fenster und Türen mitgeschätzt und zum Übernehmen vorgeschlagen. Das Foto bleibt im Browser (IndexedDB).
2. **Aufbau-Animation.** Die Teile fliegen in Montagereihenfolge an ihren Platz, so wie man sie später aufbaut. Jeder Schritt kann einzeln angesehen werden. ✅ umgesetzt
3. **Wackel-Vorschau.** Die Statik zeigt nicht nur Zahlen: Ein Gestell ohne Aussteifung wackelt sichtbar, mit Kopfbändern steht es still.
4. **Fenster-Durchschwenk.** Schon umgesetzt: Der Flügel schwenkt in 3D auf, und der Schwenkbogen zeigt grün/rot, wo er anstößt.

---

## 13. Visuelle Qualität (später, als letzter Schritt)

Recherche: [docs/recherche/visuelle-qualitaet.md](docs/recherche/visuelle-qualitaet.md). Umgesetzt (✅) bzw. offen (◻):

1. ✅ **Holz:** Maserung richtig darstellen – entlang der Stabachse ausgerichtet, Hirnholz an den Stirnseiten mit Jahresringen, leichte Farbvariation je Bauteil, Fasen/gebrochene Kanten. KVH, Leimholz, OSB, Dielen und Latten unterscheidbar.
2. ✅ **Verbindungen:** Schlossschrauben (Kopf, Scheibe, Mutter), Winkel (L-Blech in der Innenecke) und Balkenschuhe (Boden, Seiten, Laschen) als Instanzen; Überblattung/Zapfen in der Geometrie offen. Beschläge sichtbar und plausibel modellieren (Schlossschrauben mit Kopf und Mutter, Winkel mit Sicke und Löchern, Balkenschuhe, Bettschrauben), Ausklinkungen, Überblattungen und Zapfen in der Geometrie zeigen.
3. ✅ **Zoom auf interessante Stellen per Klick** (Doppelklick, schrittweise): Verbindung, Ausklinkung am Stuck, Fensterflügel-Anschlag usw. anklicken → Kamera fährt weich heran (mit Rücksprung).
4. ✅ **Zimmer** (Dielen, Putz, weiches Licht, Stuckprofil mit Rundstäben und Hohlkehle, Rosette als Drehkörper; Umgebungsverdeckung getestet und wegen Stencil-Konflikt und iPad-Kosten verworfen): Wände mit Putzstruktur, Dielenboden mit Maserung, Stuckprofil und Rosette plastisch, Sockelleisten, Heizkörperrippen, Steckdosen, Fensterrahmen mit Profil; weiches Licht, Umgebungsverdeckung (SSAO/AO), Kontaktschatten.
5. ✅ **Blick durch die Fenster** (prozedurale Kulisse, nur in der Fensteröffnung sichtbar) und **Sonnenlicht nach Uhrzeit** (Ebenen ▾ → ☀, Lichtfleck mit Fensterkreuz, morgens/abends wärmer): Außenansicht statt leerem Hintergrund (Himmel, Bäume/Straße als Panorama oder HDRI), Tageslicht durch die Fenster, Tageszeit wählbar.
6. ◐ **Allgemein** (Qualitätsstufen hoch/normal/einfach unter Raum → Einstellungen): Kantenglättung, ruhige Materialpalette, ggf. Umgebungslicht aus HDRI; Leistung auf dem Tablet im Blick behalten (Qualitätsstufen).

