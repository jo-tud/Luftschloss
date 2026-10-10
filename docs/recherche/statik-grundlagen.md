# Grundlagen für die spätere Statik-Abschätzung

Recherche vom Oktober 2026. Kennzeichnung:
- **[N]** normativ belegt, über Sekundärquellen, die die Norm wiedergeben
- **[F]** Faustregel, Herstellerangabe oder eigene Herleitung

Hauptquelle für EC5 mit deutschem NA: HSBI Bielefeld, Leporello 1 „Bemessungs- und Konstruktionshilfen nach DIN EN 1995-1-1 + NA“, 2020. Im Folgenden kurz [LEP1].
https://www.hsbi.de/multimedia/Fachbereiche/Campus+Minden/%C3%9Cber+uns/Labore_+Lehrgebiete/Labore/Labor+konstruktiver+Ingenieurbau/Leporello/Leporello+1+_+Bemessung+von+Bauteilen+nach+EC5+_+2020+05+04-p-134198.pdf?download=1

## Festigkeitsklassen [N] (N/mm², kg/m³)

| Kennwert | C16 | C24 | C30 | GL24h |
|---|---|---|---|---|
| f_m,k | 16 | 24 | 30 | 24 |
| f_t,0,k | 8,5 | 14,5 | 19 | 19,2 |
| f_c,0,k | 17 | 21 | 24 | 24 |
| f_c,90,k | 2,2 | 2,5 | 2,7 | 2,5 |
| f_v,k | 3,2 | 4,0 | 4,0 | 3,5 |
| E_0,mean | 8000 | 11000 | 12000 | 11500 |
| E_0,05 | 5400 | 7400 | 8000 | 9600 |
| G_mean | 500 | 690 | 750 | 650 |
| ρ_k | 310 | 350 | 380 | 385 |
| ρ_mean | 370 | 420 | 460 | 420 |

Quellen: dataholz (https://www.dataholz.eu/fileadmin/dataholz/media/baustoffe/Datenblaetter_en/vh_en_01.pdf), Blueprints EN 338:2016, [LEP1] S. 4.

**Kiefer und Baumarktholz:**
- Für S10/C24 gelten dieselben Werte für Fichte, Tanne, **Kiefer**, Lärche und Douglasie ([LEP1]; KVH-Vereinbarung https://www.holzbau-deutschland.de/fileadmin/user_upload/eingebundene_Downloads/2026-04-02_KVH-Vereinbarung.pdf).
- Gehobeltes Baumarktholz ist meist nur nach Aussehen sortiert (EN 1611-1) und hat damit **rechnerisch keine Festigkeitsklasse**.
- App-Regel [F]: unsortiertes Holz als C16 rechnen und einen Hinweis geben; für tragende Teile KVH oder BSH empfehlen.

## EC5 vereinfacht (deutscher NA) [N]

- Bemessungswert: X_d = k_mod · X_k / γ_M mit γ_M = 1,3.
- k_mod in Nutzungsklasse 1:

  | Werkstoff | ständig | lang | mittel | kurz | sehr kurz |
  |---|---|---|---|---|---|
  | Vollholz, BSH, Sperrholz | 0,60 | 0,70 | 0,80 | 0,90 | 1,10 |
  | OSB/3 | 0,40 | 0,50 | 0,70 | 0,90 | 1,10 |
  | Spanplatte | 0,30 | 0,45 | 0,65 | 0,85 | 1,10 |

- Nutzlast Wohnraum: Lasteinwirkungsdauer „mittel“, ψ0/ψ1/ψ2 = 0,7/0,5/0,3.
- Teilsicherheitsbeiwerte: γ_G = 1,35, γ_Q = 1,5.
- k_def in NKL 1: Vollholz 0,6; Sperrholz 0,8; OSB 1,5; Spanplatte 2,25.
- Schub: τ_d = 1,5 · V_d / (k_cr · b · h). **Nach NA gilt k_cr = 2,0 / f_v,k für Nadelholz, bei C24 also 0,5.**
- Durchbiegungsgrenzen:

  | Fall | w_inst | w_net,fin | w_fin |
  |---|---|---|---|
  | normal | L/300 | L/300 | L/200 |
  | Kragarm | L/150 | L/150 | L/100 |

- Endverformung: w_fin = w_inst,G · (1 + k_def) + w_inst,Q · (1 + ψ2 · k_def).
- Knicken: λ_rel = (λ/π) · √(f_c,0,k / E_0,05); k = 0,5 · [1 + β_c · (λ_rel − 0,3) + λ_rel²]; k_c = 1 / (k + √(k² − λ_rel²)). Für Hochbettpfosten ist Knicken praktisch nie maßgebend.

## Lastannahmen

- **[N] DIN EN 1991-1-1/NA:**
  - A2 Wohnräume: 1,5 kN/m².
  - A3 ohne Querverteilung: 2,0 kN/m² und Q_k = 1,0 kN.
  - https://www.xlstatik.de/bt_01_nutzlasten.htm
- **[N] Prüfkräfte EN 747 (Stand 2012):** Liegefläche 1200 N statisch, Leitersprosse 1200 N, Standsicherheit 120 N horizontal. Laut einem Prüfbericht zusätzlich: Geländer 500 N horizontal. Siehe verbindungen-befestigung-normen.md.
- **[F] Springen:** etwa das 2–4,5-fache Körpergewicht (https://wrap.warwick.ac.uk/179212/1/Abraham_et_al%282023%29.pdf).
- **[F] Vorschlag für die App:**
  - q_k = 2,0 kN/m² plus Eigengewicht.
  - Q_k = 1,0 kN lokal.
  - Lastfall „Toben“: eine Person × 3 als Einzellast, kurze Lasteinwirkungsdauer.

## Ausklinkungen [N]/[F]

- EC5 6.5.2 (Formel siehe FRILO HO12, https://www.frilo.eu/wp-content/uploads/DE/Manuals/ho12-berechnungsgrundlagen.pdf).
- Nach NA gilt: h_ef/h ≥ 0,5.
- Faustregel: unten höchstens h/4 ausklinken, Innenecke ausrunden. **Die App klinkt Pfosten an Sockelleiste und Stuck höchstens bis zum halben Querschnitt aus** und meldet tiefere Ausklinkungen als Fehler.

## Durchbiegungsformeln

| System | Durchbiegung |
|---|---|
| Einfeldträger, Gleichlast | 5qL⁴/(384EI) |
| Einfeldträger, Einzellast Mitte | FL³/(48EI) |
| Kragarm, Endlast | FL³/(3EI) |
| Zweifeldträger, Gleichlast | ≈ qL⁴/(185EI) |

Schubanteil: w_V = qL²/(8·κ·G·A) mit κ = 5/6. Er macht ab L/h ≈ 12 etwa 10 % aus.

## Plattenwerkstoffe

| Platte | f_m,k | E_m,mean |
|---|---|---|
| OSB/3 18–25 mm | 14,8 / 7,4 | 4930 / 1980 |
| Spanplatte P5 13–20 mm | 13,3 | 3300 |
| Birke-Multiplex 18 mm | 40,2 / 34,1 | 10048 / 7452 |
| Fichte 3-Schicht 17–20 mm | 35 / 5 | 10000 / 550 |

Spannweiten nach der Kronospan-Tabelle [F] (L/400, 200 daN/m²):
- OSB 18 mm nur bis ca. **50 cm**
- 22 mm bis 60–62,5 cm
- 25 mm bis 65 cm

## Plausibilitätsbeispiel

KVH C24 60×120 hochkant, L = 2,0 m, q = 0,575 kN/m:
- **w ≈ 1,33 mm (L/1500)** einschließlich 5 % Schubanteil.
- Biegung ausgenutzt zu ca. 20 %, Schub zu ca. 15 %.
- Maßgebend sind bei Hochbetten Verbindungen und Aussteifung, nicht die Balken.

## Konsequenz für Luftschloss

Die Statik soll später **das ganze Gestell** prüfen, als Stabwerk mit Gelenken bzw. halbsteifen Ecken je nach Verbindungstyp. Vorbereitet ist das bereits:
- jede Verbindung trägt eine Steifigkeitsklasse und einen Restquerschnitt (`src/model/joints.ts`)
- jedes Holz trägt eine Festigkeitsklasse (`src/model/catalog.ts`)
- Auflager und Befestigungen sind als Fixings modelliert
