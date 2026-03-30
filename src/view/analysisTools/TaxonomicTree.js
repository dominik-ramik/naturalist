import m from "mithril";
import { Checklist } from "../../model/Checklist.js";
import { Settings } from "../../model/Settings.js";
import { TaxonView } from "./TaxonomicTree/TaxonView.js";
import { SelectParam, ToggleParam } from "../shared/FormControls.js";

export const config = {
    id: "tool_taxonomic_tree",
    label: "Taxonomic tree",
    iconPath: {
        light: "./img/ui/menu/view_checklist-light.svg",
        dark: "./img/ui/menu/view_checklist.svg",
    },
    info: "Browse your data as a taxonomic tree, applying filters to easily isolate the exact records you need",
    getTaxaAlongsideSpecimens: true,

    getAvailability: (availableIntents, checklistData) => {
        // 1. Filter the passed intents based on data presence
        const supportedIntents = availableIntents.filter(intent => {
            if(intent == "#T" || intent == "#S") {
                return checklistData.checklist && checklistData.checklist.length > 0;
            }
        });

        // 2. Return the standard availability object
        return {
            supportedIntents,
            isAvailable: supportedIntents.length > 0,
            toolDisabledReason: "No data found in this dataset.",
            scopeDisabledReason: (intent) => `${config.label} is unavailable ${intent == "#S" ? "for specimens" : "for taxa"} because none were found.`
        }
    },

    parameters: (scope) => {
        const specimenIndex = Checklist.getSpecimenMetaIndex();
        const taxaMeta = Checklist.getTaxaMeta() || {};
        const levels = Object.keys(taxaMeta)
            .filter((_, i) => i !== specimenIndex)
            .map(key => `${key} | ${taxaMeta[key]?.name || key}`);

        const taxonLevelSelector = m(SelectParam, {
            label: "Limit checklist to taxon level:",
            accessor: (val) => {
                if(val == t("display_all_taxa")) val = "";
                if (val === undefined) return Settings.checklistDisplayLevel() || "";
                Settings.checklistDisplayLevel(val);
            },
            values: [t("display_all_taxa"), ...levels]
        });

        const showTaxaWithoutSpecimens = m(ToggleParam, {
            label: "Show taxa without specimens",
            accessor: Settings.checklistPruneEmpty
        });

        const showTaxonMeta = m(ToggleParam, {
            label: "Show taxon metadata",
            accessor: Settings.checklistShowTaxonMeta
        });

        const showTerminalTaxaOnly = m(ToggleParam, {
            label: "Show terminal taxa only",
            accessor: Settings.checklistShowTerminalOnly
        });

        const includeChildrenInMatches = m(ToggleParam, {
            label: "Include children in search matches",
            accessor: Settings.checklistIncludeChildren
        });

        let options = [];

        options.push(taxonLevelSelector);
        if (Checklist.hasSpecimens()) {
            options.push(showTaxonMeta);
        }
        if (scope === "#S") {
            options.push(m(ToggleParam, {
                label: "Show specimen metadata",
                accessor: Settings.checklistShowSpecimenMeta
            }));
            options.push(showTaxaWithoutSpecimens);
        }
        if (Checklist.hasSpecimens()) {
            options.push(includeChildrenInMatches);
            options.push(showTerminalTaxaOnly);
        }

        return options;
    },

    render: ({ filteredTaxa, queryKey }) =>
        m(ChecklistTree, {
            taxa: filteredTaxa,
            displayLevel: Settings.checklistDisplayLevel(),
            queryKey,
        }),
};

function ChecklistTree() {
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
                queryKey: queryKey,
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
