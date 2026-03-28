import m from "mithril";
import { Checklist } from "../../model/Checklist.js";
import { Settings } from "../../model/Settings.js";
import { TaxonView } from "../../view/TaxonView.js";

export function ChecklistTree() {
    // Internal component state
    let totalItemsToShow = 50;
    const itemsNumberStep = 50;
    let cachedTree = null;
    let lastCacheKey = "";
    let lastQueryKey = "";

    return {
        view: function (vnode) {
            const { taxa, displayLevel, queryKey } = vnode.attrs;

            if (queryKey !== lastQueryKey) {
                totalItemsToShow = 50;
                lastQueryKey = queryKey;
            }

            // Calculate how many items to actually show (clamping)
            let clampedTaxa = taxa;
            let overflowing = 0;
            if (displayLevel === "" && clampedTaxa.length > totalItemsToShow) {
                overflowing = clampedTaxa.length - totalItemsToShow;
                clampedTaxa = clampedTaxa.slice(0, totalItemsToShow);
            }

            // Memoize the expensive treefication process
            const cacheKey = JSON.stringify({
                dataLength: clampedTaxa.length,
                intent: Settings.analyticalIntent(),
                showSpecimens: Settings.checklistShowSpecimens(),
                pruneEmpty: Settings.checklistPruneEmpty(),
                displayLevel: displayLevel
            });

            if (cacheKey !== lastCacheKey) {
                cachedTree = Checklist.treefiedTaxa(clampedTaxa);
                lastCacheKey = cacheKey;
            }

            const includeSpecimensInView = Settings.checklistShowSpecimens();
            const showEmptyTaxa = Settings.checklistPruneEmpty();

            // Helper for top-level filtering
            const branchHasSpecimens = (node) => {
                if (node.taxonMetaIndex === specimenMetaIndex) return true;
                if (!node.children) return false;
                return Object.values(node.children).some(branchHasSpecimens);
            };



            const specimenMetaIndex = Checklist.getSpecimenMetaIndex();

            const visibleTopLevelTaxa = Object.keys(cachedTree.children).filter(
                (taxonKey) => {
                    const node = cachedTree.children[taxonKey];
                    
                    // Filter by "Show Specimens" setting
                    const isNotSpecimenLevel = node.taxonMetaIndex !== specimenMetaIndex;
                    const visibilityByLevel = includeSpecimensInView || isNotSpecimenLevel;

                    // Filter by "Show taxa without specimens" setting
                    const visibilityByContent = showEmptyTaxa || branchHasSpecimens(node);

                    return visibilityByLevel && visibilityByContent;
                }
            );

            return m(".listed-taxa", [
                visibleTopLevelTaxa.map((taxonLevel) =>
                    m(TaxonView, {
                        parents: [],
                        taxonKey: taxonLevel,
                        taxonTree: cachedTree.children[taxonLevel],
                        currentTaxonLevel: cachedTree.children[taxonLevel].taxonMetaIndex,
                        displayMode: displayLevel,
                        showTaxonMeta: Settings.checklistShowTaxonMeta(),
                        showSpecimenMeta: Settings.checklistShowSpecimenMeta(),
                        terminalOnly: Settings.checklistShowTerminalOnly(),
                    })
                ),
                overflowing > 0 ? m(
                    ".show-more-items",
                    {
                        onclick: () => { totalItemsToShow += itemsNumberStep; },
                    },
                    t("next_items_checklist", Math.min(overflowing, itemsNumberStep))
                ) : null,
            ]);
        }
    };
}