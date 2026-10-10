# Visuelle Qualität – Recherche (Oktober 2026)

Grundlage für Ausbaustufe M8 (SPEZIFIKATION.md, Kapitel 13). Versionen per `npm view` geprüft, Quelltexte von drei 10.7.9, R3F 9.8.1 und three 0.186.1 gelesen.

## Reihenfolge nach Aufwand und Wirkung

| # | Maßnahme | Aufwand | Wirkung |
|---|---|---|---|
| 1 | Licht-Grundlage: Lightformer-Umgebung, Schatten richtig einstellen, Tone Mapping | gering | sehr hoch |
| 2 | Prozedurales Holz im Shader, dazu Fasen | mittel | sehr hoch |
| 3 | Weich heranzoomen per Klick | gering | hoch |
| 4 | N8AO (Umgebungsverdeckung) und Bodenschatten | gering | hoch |
| 5 | Qualitätsstufen | gering | Pflicht fürs iPad |
| 6 | Fensterblick und Sonnenfleck | mittel | mittel bis hoch |
| 7 | Beschläge als Instanzen | mittel | mittel |

## Kernpunkte

- **Licht ohne Download:** `<Environment resolution={64} frames={1}>` mit `<Lightformer>`-Flächen an den Fenstern (kühl) und an der Lampe (warm). Die Cubemap entsteht lokal. `<Environment preset>` lädt dagegen von einem CDN (`raw.githack.com`) und bleibt offline hängen – nicht verwenden.
- **Schatten:** In three 0.186 ist `PCFSoftShadowMap` entfernt (Warnung in der Konsole); `<Canvas shadows="percentage">` verwenden. Schattenkamera eng ums Zimmer, `mapSize` 2048 (iPad 1024), `normalBias` ≈ 0,02.
- **Tone Mapping:** AgX oder Neutral, nicht doppelt anwenden.
- **Holz:** `MeshStandardMaterial.onBeforeCompile` mit Objektraum-Position; Jahresringe `r = length(p.yz − Mark)`, mit fbm verzerrt, `fract(r · Ringe/m)`, Früh-/Spätholz per `smoothstep`. Längsseiten zeigen Fladern, Stirnseiten Ringe. Hirnholz dunkler und rauer. Seed und Lage des Marks je Bauteil (KVH: Mark oft außerhalb, herzgetrennt). `customProgramCacheKey` je Werkstoff. Leimholz: Lamellen-Seed. OSB: Zellrauschen oder CC0-Textur (ambientCG Chipboard, auf 1K-WebP verkleinert).
- **Fasen:** `RoundedBoxGeometry(w, h, d, 1, 0.003)` aus `three/addons`; im Low-Profil nur im Shader vortäuschen.
- **Heranzoomen:** drei `<CameraControls>` (`fitToBox`, `setLookAt`, `smoothTime` 0,35, `setBoundary`) oder die vorhandene Kamera mit `lerpCam` – Klick nur bei Bewegung < 5 px.
- **Umgebungsverdeckung:** `<N8AO>` aus @react-three/postprocessing; iPad: `quality="performance"`, `halfRes`. `<EffectComposer multisampling={0}>` plus `<SMAA/>`.
- **Bodenschatten:** `<AccumulativeShadows temporal frames={60}>` mit `<RandomizedLight>`; im demand-Modus `invalidate` aufrufen.
- **Zimmer:** Putz mit leichter Farb- und Bump-Variation, Dielen 15–20 cm mit versetzten Stößen und eigenem Seed je Brett, Stuck per Profil (`ExtrudeGeometry`), Rosette per `LatheGeometry`.
- **Fensterblick:** echte Wandöffnungen (`Shape.holes`), `<Sky>` (prozedural) passend zur Sonnenrichtung, Bäume als wenige Low-Poly-Instanzen oder als prozedural gezeichnete `CanvasTexture`, Glas als `MeshPhysicalMaterial` mit geringer Deckkraft.
- **Qualitätsstufen:** niedrig (dpr ≤ 1,25, ohne Postprocessing), mittel (iPad: dpr 1,5, N8AO halfRes, SMAA), hoch (Desktop). Automatisch über `<PerformanceMonitor>`, Wahl in localStorage merken. iOS lädt bei Speichermangel den Tab neu – Texturen klein halten.
- **Beschläge:** Schlossschraube mit Halbkugelkopf und Mutter, Winkel/Balkenschuhe als Profil mit Löchern, Metall verzinkt (metalness 1, roughness 0,4) – braucht eine Umgebung zum Spiegeln. Gleiche Teile als `InstancedMesh`.

## Pakete (npm, 10.10.2026)

| Paket | Version | Hinweis |
|---|---|---|
| three | 0.186.1 | |
| @react-three/fiber | 9.8.1 | |
| @react-three/drei | 10.7.9 | bringt camera-controls 3.1 mit |
| @react-three/postprocessing | 3.2.0 | enthält n8ao 2.0 |
| postprocessing | 6.39.5 | Peer three < 0.187 – three nicht blind aktualisieren |
| @pmndrs/assets | 1.7.0 | optional, CC0-HDRIs als Modul (130–420 KB) |

## Nicht empfohlen

- `<Environment preset>` (CDN, offline kaputt), `useDetectGPU` (lädt von unpkg, erkennt Apple-GPUs nicht).
- `MeshTransmissionMaterial` fürs Glas (zusätzlicher Render-Durchgang je Material), `SoftShadows`/PCSS (global, teuer).
- WebGPU/TSL `WoodNodeMaterial` (nur WebGPU, verträgt sich nicht mit drei-Schatten/Postprocessing) – als Vorlage für GLSL brauchbar.
- Alte SSAO, three-good-godrays (inkompatibel), 4K-Texturen, SSR/DOF/Bloom.

## Quellen

drei Lightformer/Environment/Sky/AccumulativeShadows/ContactShadows/CameraControls (drei.docs.pmnd.rs), three.js `Material.onBeforeCompile` und Migration Guide, N8AO (github.com/N8python/n8ao), camera-controls (github.com/yomotsu/camera-controls), R3F „Scaling performance“, ambientCG- und Poly-Haven-Lizenz (CC0), WebKit-Bugs 300782 und 232357 (iOS-Speicher), three.js PR 31640 (WoodNodeMaterial), The Book of Shaders (Rauschen).
