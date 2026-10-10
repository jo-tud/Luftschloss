# Luftschloss – Hinweise für die Entwicklung

- Sprache der App, der Doku und der Kommentare: Deutsch. Commit-Nachrichten: Englisch, Imperativ.
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
- PRs dürfen nach grünem CI selbst gemergt werden.
- `main` ist der Hauptbranch; neue Features jeweils als eigener PR, nach grünem CI selbst mergen.
- Testprojekt (`testProject()`) nicht an Fotos oder Schätzungen anpassen: Maße werden direkt in der App korrigiert – das ist zugleich der Usability-Test.
- Für später vorgemerkt: **visuelle Qualität** als letzter Schritt (SPEZIFIKATION.md, Kapitel 13).
