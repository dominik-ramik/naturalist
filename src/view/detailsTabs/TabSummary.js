import m from "mithril";

import { Checklist } from "../../model/Checklist";
import { Settings } from "../../model/Settings";

export function TabSummary(taxon, taxonName) {
  const stats = computeTaxonSummaryStats(taxon);
  if (!stats.length) return m("p", "—");

  const showSpecimens = stats.some(r => r.specimens !== null);
  const SPECIMEN_ICON = "./img/ui/checklist/tag.svg";

  function specimenTd(row) {
    if (!showSpecimens) return null;
    const s = row.specimens;
    const hasData = s && (s.direct > 0 || (s.total != null && s.total > 0));
    if (!hasData) return m("td.summary-cell-specimens");
    const label = s.total != null && s.total !== s.direct
      ? s.direct + " / " + s.total
      : String(s.direct);
    return m("td.summary-cell-specimens", [
      m("img.summary-specimen-icon", { src: SPECIMEN_ICON }),
      label,
    ]);
  }

  return m("div.summary-table-wrap",
    m("table.summary-table",
      m("tbody",
        stats.map(row => {
          const cls = row.isCurrent ? ".summary-row-current"
            : row.isAncestor    ? ".summary-row-ancestor"
            :                      ".summary-row-descendant";

          const nameTd = row.name != null
            ? m("td.summary-cell-name", row.name)
            : m("td.summary-cell-name.summary-cell-count", m.trust(tf("summary_cell_count", [row.count])));

          const contextTd = m("td.summary-cell-context",
            row.siblingCount != null && row.siblingCount > 1
              ? row.siblingCount + " in group" : ""
          );

          return m("tr" + cls, [
            m("td.summary-cell-rank", row.levelName),
            nameTd,
            contextTd,
            specimenTd(row),
          ]);
        })
      )
    )
  );
}

/**
 * Compute taxonomy + specimen statistics for the Summary tab.
 *
 * Returns an array of row descriptors, one per non-specimen taxonomic level.
 *
 * Ancestor / current rows:
 *   { levelName, name, isCurrent, isAncestor:true, siblingCount, specimens }
 * Descendant rows:
 *   { levelName, count, isCurrent:false, isAncestor:false, specimens }
 *
 * `specimens` is null when specimen mode is off; otherwise:
 *   { direct[, total] }  — `total` present only on the current level row.
 *
 * Intentionally returns a plain data structure so future callers (e.g. category
 * stats) can add extra fields to each row without touching the render logic.
 */
function computeTaxonSummaryStats(taxon) {
  const checklist = Checklist.getEntireChecklist();
  const taxaMeta = Checklist.getTaxaMeta();
  const taxaKeys = Object.keys(taxaMeta);
  const specimenDataPath = Checklist.getSpecimenDataPath();
  const specimenMetaIndex = Checklist.getSpecimenMetaIndex();
  const showSpecimens = Settings.analyticalIntent() === "#S"
    && Checklist.hasSpecimens()
    && specimenMetaIndex !== -1;

  // Deepest non-specimen, non-null level index in this taxon's ancestry
  let currentLevelIndex = -1;
  for (let i = taxaKeys.length - 1; i >= 0; i--) {
    if (taxaKeys[i] === specimenDataPath) continue;
    if (taxon.t[i] != null) { currentLevelIndex = i; break; }
  }
  if (currentLevelIndex === -1) return [];

  // level-index → ancestor name for all filled, non-specimen levels up to current
  const ancestry = {};
  for (let i = 0; i <= currentLevelIndex; i++) {
    if (taxaKeys[i] === specimenDataPath || taxon.t[i] == null) continue;
    ancestry[i] = taxon.t[i].name;
  }

  const inSubtree = row =>
    Object.entries(ancestry).every(([i, name]) => row.t[i]?.name === name);

  // Deepest taxon level of a row (excludes specimen level)
  const deepestTaxonLevel = row => {
    let d = -1;
    const limit = specimenMetaIndex === -1 ? taxaKeys.length : specimenMetaIndex;
    for (let i = 0; i < limit; i++) if (row.t[i] != null) d = i;
    return d;
  };

  return taxaKeys.flatMap((levelKey, li) => {
    if (levelKey === specimenDataPath) return [];
    const levelName = taxaMeta[levelKey].name;

    if (li <= currentLevelIndex) {
      // ── Ancestor or current level ─────────────────────────────────────────
      const name = ancestry[li];
      if (!name) return []; // gap (null slot in taxonomy)

      // Siblings: distinct names at this level sharing the same parent context
      const siblingsSet = new Set();
      checklist.forEach(row => {
        for (let i = 0; i < li; i++) {
          if (ancestry[i] !== undefined && row.t[i]?.name !== ancestry[i]) return;
        }
        if (row.t[li] != null) siblingsSet.add(row.t[li].name);
      });

      let specimens = null;
      if (showSpecimens) {
        let direct = 0, total = 0;
        checklist.forEach(row => {
          if (row.t[li]?.name !== name || row.t[specimenMetaIndex] == null) return;
          if (li === currentLevelIndex) total++;
          if (deepestTaxonLevel(row) === li) direct++;
        });
        specimens = li === currentLevelIndex ? { direct, total } : { direct };
      }

      return [{ levelName, name, isCurrent: li === currentLevelIndex, isAncestor: li < currentLevelIndex, siblingCount: siblingsSet.size, specimens }];

    } else {
      // ── Descendant level: count distinct taxa in the subtree ──────────────
      const set = new Set();
      checklist.forEach(row => {
        if (inSubtree(row) && row.t[li] != null) set.add(row.t[li].name);
      });
      if (set.size === 0) return [];

      let specimens = null;
      if (showSpecimens) {
        let direct = 0;
        checklist.forEach(row => {
          if (!inSubtree(row) || row.t[li] == null || row.t[specimenMetaIndex] == null) return;
          if (deepestTaxonLevel(row) === li) direct++;
        });
        specimens = { direct };
      }

      return [{ levelName, isCurrent: false, isAncestor: false, count: set.size, specimens }];
    }
  });
}