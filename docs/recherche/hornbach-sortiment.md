# Hornbach-Holzsortiment für den Hochbett-Selbstbau

Recherche vom Oktober 2026. Grundlage für den Materialkatalog in `src/model/catalog.ts`.

## Erhebungsweise (bitte zuerst lesen)

- **hornbach.de ist nicht direkt abrufbar.** Automatische Abrufe bekommen nur eine „Client Challenge“ (Botschutz). Abrufbar sind nur PDF-Datenblätter unter `media.hornbach.de`.
- Alle Hornbach-Angaben stammen deshalb aus **Suchmaschinen-Snapshots** von hornbach.de-Seiten: Produkttitel, Artikelnummer in der URL und Preis-Snippets. Die Snapshots können Monate alt sein, und für denselben Artikel tauchen teils leicht abweichende Preise auf.
- Kennzeichnung:
  - **B** = belegt durch eine Hornbach-URL mit Maß bzw. Preis
  - **B\*** = belegt, aber Preis uneinheitlich oder Artikel evtl. nicht mehr verfügbar
  - **S** = geschätzt bzw. typisch
- Alle Preise inkl. MwSt. Die App führt sie als **Richtpreis, Stand 2025/26**.

## Wichtigstes Ergebnis

**Tragende Kanthölzer gibt es bei Hornbach nur in Fichte, nicht in Kiefer.** Das gilt für KVH, Bauholz sägerau und gehobelt; die Eigenmarke heißt Konsta.

Kiefer gibt es nur bei:
- Leimholzplatten
- Nut-und-Feder-Brettern bzw. Bodendielen
- Leisten
- Rundstäben

Die App rechnet daher standardmäßig mit Fichte.

## KVH Fichte (Konsta), C24 / S10, gehobelt, gefast

- Keilgezinkt, kammergetrocknet (ca. 15 %), S10 nach DIN 4074 (entspricht C24).
- Qualitäten: SI (sichtbarer Einbau) und NSI (nicht sichtbar).
- **Längen 3000–6000 mm in 500er-Schritten.**
- Datenblatt: https://media.hornbach.de/hb/document/as.46871194.pdf

| Querschnitt | Längen | Preisbeispiel | ≈ €/lfm | Status |
|---|---|---|---|---|
| 60×80 | 3000–6000 | 3 m 13,39 €; 6 m 26,78 € | 4,46 | B |
| 60×100 | 3000, 3500, 6000 | 3 m 16,75 € | 5,58 | B |
| 60×120 | 3000, 5000, 6000 | – | (6,7 S) | B |
| 60×140 | 4000, 6000 | – | (7,8 S) | B |
| 60×200, 60×240 | 3000–6000 | 60×240×3000 40,18 € | 13,39 | B |
| 80×80 (SI) | 4000 | 24,58 € | 6,15 | B |
| 80×100 | 3000–4500 | 3 m 22,30 € | 7,43 | B |
| 80×120, 80×140, 80×160 | 3500–6000 | 80×140×3500 35,08 € | 10,02 | B |
| 100×100 | 3000 | – | (9,3 S) | B |
| 100×120 | 3000–5500 | 3 m 34,56 € | 11,5 | B |
| 120×120 | 4000–5500 | 4 m 51,84 € | 12,9 | B |

Hinweise:
- **KVH 60×60 wurde nicht gefunden.** 80×80 ist das kleinste quadratische KVH.
- Ist ein Artikel im Markt nicht vorrätig, gibt es ihn oft nur palettenweise. Mengenstaffeln sind üblich.

## Kantholz Fichte sägerau (ohne Festigkeitsangabe)

| Querschnitt | Längen | €/lfm |
|---|---|---|
| 40×60 | 2000 | 1,79 |
| 60×80 | 2000/3000/4000 | 3,99 |
| 80×80 | 2000/3000 | 5,75 |
| 80×100 | 2000/3000/4000 | 7,08 |
| 100×100 | 3000 | 8,5–8,9 (B\*) |

## Kantholz Fichte gehobelt (ohne Festigkeitsangabe)

- Raster 24/34/44/54/74/94 mm, dazu 70×70 und 90×90.
- Standardlänge 2500 mm; 70×70 und 90×90 gibt es in 2000/3000 mm.
- 44×69, 58×58, 68×68 und 94×94 gibt es bei Hornbach **nicht**.

| Querschnitt | €/lfm |
|---|---|
| 24×94 | 3,32 |
| 34×54 | 2,88 |
| 44×44 | 3,38 |
| 44×74 | 5,68 |
| 44×94 | 6,1 |
| 54×54 | 4,3 |
| 70×70 | 7,45 |
| 90×90 | 11,95 |

Außerdem gibt es: Universalbrett Kiefer gehobelt 38×140×2500 und Furnierschichtholz 42×48/42×70×2400.

## Brettschichtholz (Konsta, Fichte)

| Querschnitt | Länge | Preis |
|---|---|---|
| 60×100 | 3000 | 19,80 € (6,60 €/m) |
| 80×100 | 3000 | 26,40 € |
| 100×100 | 3000 | 33,00 € |
| 100×120 | 3000 | 39,60 € |
| 120×120 | 3000 | 47,50 € |

- Größere Querschnitte bis 240×240 gibt es SI in 3–6 m.
- GL24h wird nicht ausdrücklich genannt (S: marktüblich).
- Echte Duo- und Triobalken wurden nicht gefunden.

## Leimholzplatten

| Holz / Dicke | Formate | Preisbeispiel |
|---|---|---|
| Fichte 18 mm A/B, B/C | 800–2500 × 200–600 | 2000×600 B/C 31,95 €; A/B 50,95 € |
| Kiefer 18 mm B/C | 2000×600 | 28,95 € |
| Buche 18 mm | 2000×600 | 53,95 € |
| Fichte 28 mm A/B | bis 2000×600 | ca. 79,95 € |
| Kiefer 28 mm B/C | 2500×300/400 | – |

## Platten für die Liegefläche

| Material | Dicke | Format | Preis |
|---|---|---|---|
| OSB/3 stumpf | 12–25 | 2500×1250 | 18 mm 31,09 €; 22 mm 38,13 €; 25 mm 46,72 € |
| OSB/3 Verlegeplatte N+F | 12–25 | 2500×675 / 2050×675 | 18 mm 14,50 €/Stk |
| 3-Schicht Fichte B/C | 19 / 27 | 2500×1250 | 129 € / 179 € |
| Multiplex Birke BB/BB | 18 | 2500×1250 | ca. 135 € (Palette) |
| Multiplex Eukalyptus/Birke | 12–21 | 2500×1220 | 18 mm 112 € |
| Spanplatte P5 Verlegeplatte | – | – | bei hornbach.de nicht gefunden |

## Dielen und Profilbretter

| Artikel | Querschnitt | Längen | Preis |
|---|---|---|---|
| Rauspund Fichte roh C | 18×96 | 2100/2400/2700 | 11,95 €/m² |
| N+F-Brett Kiefer B | 19×96 | bis 4000 | 12,95–15,95 €/m² |
| N+F-Brett Kiefer gehobelt (Bodendiele) | 27×146 | 2000–4000 | 19,95–23,95 €/m² |
| Faseprofil / Softline Fichte | 19×146 | 2400/3000 | 17–19 €/m² |
| Universaldiele Douglasie | 21×124 | 2500 | 6,25–6,75 €/Stk |

## Latten, Leisten, Rundstäbe

| Artikel | Preis |
|---|---|
| Latte Fichte sägerau 24×48, 2/2,5/3/4 m | ca. 0,84 €/m |
| Latte S10 30×50, 40×60 | – |
| Rechteckleiste Kiefer/Fichte 20×30/40/60, 2 m | – |
| Rundstab Buche Ø 20/25/30, 1 m | 3,55 € / 5,25–5,95 € / 6,70 € |
| Rundstab Kiefer Ø 20/23, 2 m | 7,45 € / 8,45 € |

## Zuschnittservice

- Preis „ab 0,10 € pro Schnitt“, in der Praxis 0,10–0,50 €, teils gratis.
- Geschnitten wird nur bei Hornbach gekaufte Ware, vor allem Platten; BSH SI auch cm-genau.
- Mindestmaß laut Hornbach 100×230 mm.
- Ablauf: online konfigurieren und reservieren (Bearbeitungszeit ca. 6 h); kein Rückgaberecht.
- Quelle: https://www.hornbach.de/conf/holzzuschnitt-nach-mass/80000/

## Schnittstellen und Preise

- **Keine öffentliche API.** Seiten enthalten schema.org-JSON-LD (`Product`, `offers` mit `OnSitePickup` und Marktcode), aber nur für den eingestellten Markt.
- Online- und Marktpreise sind laut Hornbach gleich (Dauertiefpreise). Marktabhängig sind Bestand, Palettenpflicht und Mengenstaffeln.
- Für die App heißt das: Preise per **Recherche-Prompt** über einen KI-Chat mit Websuche ermitteln, nicht durch automatisches Auslesen.
