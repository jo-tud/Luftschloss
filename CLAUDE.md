# Luftschloss – Hinweise für die Entwicklung

- Sprache von Quelltext, Doku und Kommentaren: Deutsch. Die App zeigt standardmäßig Englisch, Deutsch ist umschaltbar.
  Jeder sichtbare Text läuft über `t()` (feste Texte), `tr()` (zur Laufzeit) bzw. `tk()` (Tabellen) und braucht
  einen Eintrag in `src/i18n/en/*`; `tests/i18n.test.ts` prüft das. Ausnahmen je Zeile mit `// i18n-ok`.
  `README.md` (Englisch) und `README.de.md` (Deutsch) immer gemeinsam pflegen. Commit-Nachrichten: Englisch, Imperativ.
- Prüfen vor jedem Push: `npm test` und `npm run build` (Typprüfung + Build). CI macht genau das.
- Modell in ganzzahligen Millimetern; Koordinaten: x entlang Wand A, y in den Raum, z nach oben.
  three.js-Ansichten rechnen in Metern mit y nach oben (`T()` in `src/views/camera.ts`).
- `src/model` und `src/analysis` bleiben frei von DOM und React und werden mit Vitest getestet.
- Sicherheitsregeln sind Empfehlungen: Befunde in `src/analysis/checks.ts` mit stabiler `id`,
  damit sie quittiert werden können. Nie etwas hart verbieten.
- Materialien nur aus `src/model/catalog.ts` (Hornbach-Sortiment); neue Werte mit Quelle in
  `docs/recherche/` belegen oder als `priceEstimated` markieren.
- Spezifikation und Ausbaustufen: `SPEZIFIKATION.md`.
- Bei jeder Ausbaustufe an ein **Wow-Feature** denken (SPEZIFIKATION.md, Kapitel 12) und Ideen dort ergänzen.
- Tablet-Bedienung (Finger/Stift) mitdenken: Zeigerereignisse statt Mausereignisse, ausreichend große Bedienflächen.
- `main` ist der Hauptbranch; neue Features jeweils als eigener PR, nach grünem CI selbst mergen.
- Das **Beispielzimmer** (`testProject()` in `src/model/defaults.ts`) ist öffentlich und Grundlage vieler Tests:
  nicht leichtfertig ändern, keine „geschätzt“-Markierungen. Eigene Zimmer entstehen in der App bzw. mit dem Planungsassistenten.
- Zimmermannsmäßige Verbindungen nur in `src/model/joinery.ts` rechnen: 3D-Ansicht, Verbindungsdetail, Bauplan-Skizze
  und Zuschnittlängen nutzen dieselbe Geometrie. Erklärung (Wirkprinzip) und Herstellungsschritte stehen bei den
  Verbindungsarten in `src/model/joints.ts`.
- **Visuelle Qualität** (M8) ist umgesetzt; offene Punkte in SPEZIFIKATION.md, Kapitel 13.
- Online-Version: GitHub Pages über `.github/workflows/pages.yml` (Push auf `main`), Adresse https://jo-tud.github.io/Luftschloss/. Keine Laufzeit-Downloads von fremden CDNs (Offline-PWA).
