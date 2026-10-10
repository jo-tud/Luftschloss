# Luftschloss – Hochbettplaner

Ein Hochbett ins echte Zimmer planen, im Browser am Desktop:

- Raum mit Stuck, Fensternischen, Heizkörpern und Sockelleisten eintragen
- Bett aus einer Vorlage einsetzen oder Balken frei zeichnen
- in Draufsicht, Seitenansicht, 3D und Ich-Perspektive prüfen
- eine Einkaufsliste bekommen, die es im Baumarkt wirklich gibt

> **Status:** Prototyp. Spezifikation und Ausbaustufen stehen in [SPEZIFIKATION.md](SPEZIFIKATION.md), die Recherchen in [docs/recherche](docs/recherche/).

## Starten

Voraussetzung: Node.js 22 (oder neuer) und npm.

```sh
git clone https://github.com/jo-tud/Luftschloss.git
cd Luftschloss
npm install
npm run dev        # öffnet http://localhost:5173
```

Weitere Befehle:

```sh
npm test           # Tests (Vitest)
npm run build      # Typprüfung + Produktions-Build nach dist/
npm run preview    # Build ansehen: http://localhost:4173
```

### Auf dem Tablet (WLAN oder Tailscale)

```sh
npm run lan        # baut und startet im Netzwerk, z. B. http://192.168.1.20:4173
```

Im Laptop-Browser oben auf **📱 Tablet** klicken und den QR-Code mit dem Tablet scannen. Laptop und Tablet arbeiten dann am **selben Projekt**; Änderungen gleichen sich alle paar Sekunden ab. Gespeichert wird im Ordner `projekte/`.

- Bedienung mit Finger und Stift: antippen wählt aus, ein ausgewähltes Teil lässt sich ziehen. Mit einem Finger dreht bzw. verschiebt man die Ansicht, mit zwei Fingern zoomt (Pinch), verschiebt und dreht man. Doppeltipp zentriert. Die Seitenleisten klappen über ☰ und ⓘ auf.
- **Ohne gemeinsames WLAN, z. B. auf der Baustelle:** [Tailscale](https://tailscale.com) auf Laptop und Tablet installieren und `http://<Tailscale-IP des Laptops>:4173` öffnen. Mit `tailscale serve --bg 4173` gibt es eine HTTPS-Adresse. Darüber lässt sich Luftschloss auf dem Tablet als App installieren („Zum Home-Bildschirm“), und es läuft dann auch offline.
- Die Freigabe hat keine Anmeldung. Deshalb nur im eigenen Netz bzw. Tailnet nutzen und nicht ins Internet stellen.

Beim ersten Start lädt das **Testzimmer** (4,30 × 5,95 m, zwei Fenster, Stuck, Rosette, Hochbett vor dem linken Fenster). Gelb markierte Felder sind geschätzt und sollten nachgemessen werden. Der Stand wird automatisch im Browser gespeichert. Unter *Raum → Projekt* lässt er sich exportieren, importieren oder auf das Testzimmer bzw. ein leeres Zimmer zurücksetzen.

## Was der Prototyp kann

- **Raum:**
  - Maße, Wand- und Deckenart
  - **Stuckleiste** (Profil, je Wand abweichend)
  - **Deckenrosette mit Lampe**
  - **Sockel- bzw. Parkettleiste**
- **Fenster:** Laibungstiefe, Nische bis zum Boden, Flügel (Dreh, Kipp, fest), Fensterbank.
- **Weitere Ausstattung:** Tür, Heizkörper mit Konvektionsraum, Steckdosen, Möbel und Personen als Platzhalter.
- **Sechs Bauarten als Vorlagen:** freistehend, deckenhoch verspannt, wandseitig, Eckbett, Wand zu Wand, abgehängt.
  - Alle Parameter sind jederzeit änderbar.
  - Einzelteile lassen sich aus der Vorlage lösen, die ganze Baugruppe lässt sich auflösen.
- **Liegefläche:** lose Latten, Rollrost, Lattenrost, Platte oder Dielen.
- **Geländer:** Bretter, Rundstäbe, Vollfläche, Netz oder Seil.
- **Leitern:** Stufenleiter, senkrecht, schräg oder Treppe.
- **Wandanschluss:** Pfosten an Sockelleiste und Stuck **automatisch ausklinken**, oder das Bett **abrücken**.
- **Verbindungen:** werden automatisch erkannt (Eckstoß, T-Stoß, Auflage …). Den Typ wählt man je Verbindung: Schlossschraube, Winkel, Balkenschuh, Überblattung, Zapfen, Gratnut, Rundstab in Bohrung …
- **Ansichten aus einer Kamera:** animierte Übergänge zwischen Draufsicht, Seitenansicht (Wand A–D), 3D und Ich-Perspektive (an der Tür, unter dem Bett, auf der Matratze, liegend). Dazu:
  - Puppenhaus-Modus
  - Schnitthöhe in der Draufsicht
  - Übersichtskarte
  - zwei Live-Nebenansichten
- **Prüfung:**
  - Wie weit gehen die Fensterflügel noch auf (Schwenkbogen grün/rot), ist der Kippspalt frei?
  - Kollisionen, auch mit Stuck, Sockelleiste, Fensterbank, Heizkörper und Lampe
  - Lichte Höhe unter dem Bett und Kopfraum über der Matratze
  - Sicherheitsempfehlungen nach DIN EN 747
  - Stabilität, Material
  - Alles ist eine Empfehlung und lässt sich **quittieren**.
- **Foto-Abgleich:** ein Foto des Zimmers laden, 4–8 Raumecken und Fensterkanten antippen – das geplante Bett erscheint perspektivisch richtig im Foto. Fenster- und Türmaße werden dabei mitgeschätzt und lassen sich übernehmen. Das Foto verlässt den Browser nicht.
- **Material:**
  - Einkaufsliste in Hornbach-Handelslängen mit Richtpreisen
  - Zuschnittplan
  - Beschläge aus den Verbindungen
  - **Recherche-Prompt** für aktuelle Preise; die Antwort fügt man ein und übernimmt die Preise
  - CSV und Druck

## Bedienung in Kürze

| Aktion | Maus / Taste |
|---|---|
| Ansicht wechseln | Leiste oben links oder `1` Draufsicht, `2` Seitenansicht (nochmal = nächste Wand), `3` 3D, `4` Ich-Perspektive, `5` Abwicklung, `6` Foto |
| Drehen | Ziehen auf leerer Fläche (3D) oder rechte Maustaste – auch aus der Draufsicht heraus |
| Verschieben | Ziehen auf leerer Fläche (2D), mittlere Maustaste |
| Zoom | Mausrad, zum Zeiger hin |
| Auswählen / Fokus | Klick / Doppelklick |
| Bett verschieben | Ziehen in Draufsicht oder 3D; in der Seitenansicht hoch/runter = Liegehöhe |
| Zeichnen | `B` Balken (zwei Klicks, `Shift` gerade, `Strg` weiterzeichnen), `P` Pfosten, `Esc` abbrechen |
| Ich-Perspektive | Ziehen = umsehen, `W` `A` `S` `D` gehen, `Q`/`E` runter/hoch |
| Bearbeiten | `Strg+Z` / `Strg+Y`, `Entf`, `R` Querschnitt drehen |

## Aufbau

```
src/model      Datenmodell, Katalog, Geometrie, Raum, Hochbett-Generator, Auflöser
src/analysis   Prüfungen, Fenster-/Türschwenk, Stückliste, Zuschnitt, Preis-Prompt
src/state      Zustand, Undo/Redo, Speichern, abgeleitete Daten
src/views      three.js-Szene, Kamera mit Übergängen, Zeigersteuerung, Ansichten
src/ui         Oberfläche (Werkzeugleiste, Seitenleiste, Eigenschaften, Prüfung, Material)
tests          Vitest-Tests für Modell und Analysen
```

Hinweis: Luftschloss ersetzt keine Tragwerksplanung. Die Prüfungen sind Empfehlungen auf Basis von Normen-Richtwerten, Herstellerangaben und Heimwerker-Erfahrung.
