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
