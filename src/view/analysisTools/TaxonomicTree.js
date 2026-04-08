import m from "mithril";
import { Checklist } from "../../model/Checklist.js";
import { Settings } from "../../model/Settings.js";
import { TaxonView } from "./TaxonomicTree/TaxonView.js";

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
        const supportedIntents = availableIntents.filter(intent => {
            if (intent === "#T" || intent === "#S") {
                return checklistData.checklist && checklistData.checklist.length > 0;
            }
        });
        return {
            supportedIntents,
            isAvailable: supportedIntents.length > 0,
            toolDisabledReason: "No data found in this dataset.",
            scopeDisabledReason: (intent) =>
                `${config.label} is unavailable ${intent === "#S" ? "for specimens" : "for taxa"} because none were found.`,
        };
    },

    // ─── Declarative parameter descriptors ─────────────────────────────────────
    //
    // Each entry has: id, label, type, default, accessor, and optionally
    // values (select), condition (fn), or render (escape hatch).
    //
    // • `default` is the authoritative fresh-state value.
    // • `condition(scope)` controls both rendering AND non-default detection;
    //   params hidden by their condition are ignored in the notice.
    // ───────────────────────────────────────────────────────────────────────────
    parameters: [
        {
            id: "displayLevel",
            label: "Taxon display level",
            type: "select",
            default: "",
            accessor: Settings.checklistDisplayLevel,
            // Dynamic: option keys come from runtime taxon meta, not a static list.
            // The leading "|" gives the "show all" option a value of "" while still
            // rendering a human-readable label — the SelectParam split-on-pipe logic
            // handles this without any accessor-side normalization.
            values: () => {
                const taxaMeta = Checklist.getTaxaMeta() || {};
                const specimenIndex = Checklist.getSpecimenMetaIndex();
                const levelOptions = Object.keys(taxaMeta)
                    .filter((_, i) => i !== specimenIndex)
                    .map(key => `${key} | ${taxaMeta[key]?.name || key}`);
                return [`| ${t("display_all_taxa")}`, ...levelOptions];
            },
        },

        {
            id: "showTaxonMeta",
            label: "Show taxon metadata",
            type: "toggle",
            default: true,
            accessor: Settings.checklistShowTaxonMeta,
        },

        {
            id: "showSpecimenMeta",
            label: "Show specimen metadata",
            type: "toggle",
            default: true,
            accessor: Settings.checklistShowSpecimenMeta,
            // Only visible (and only flagged as non-default) in specimen scope
            condition: (scope) => scope === "#S",
        },

        {
            id: "pruneEmpty",
            label: "Show taxa without specimens",
            type: "toggle",
            default: true,
            accessor: Settings.checklistPruneEmpty,
            // Pruning only makes sense in specimen scope
            condition: (scope) => scope === "#S",
        },

        {
            id: "includeChildren",
            label: "Include children in search matches",
            type: "toggle",
            default: true,
            accessor: Settings.checklistIncludeChildren,
        },

        {
            id: "terminalOnly",
            label: "Show terminal taxa only",
            type: "toggle",
            default: false,
            accessor: Settings.checklistShowTerminalOnly,
        },
    ],

    render: ({ filteredTaxa, queryKey, datasetRevision }) =>
        m(ChecklistTree, {
            taxa: filteredTaxa,
            displayLevel: Settings.checklistDisplayLevel(),
            queryKey,
            datasetRevision,
        }),
};

// ─── ChecklistTree internal component ────────────────────────────────────────

function ChecklistTree() {
    let totalItemsToShow = 50;
    const itemsNumberStep = 50;
    let cachedTree = null;
    let lastCacheKey = "";
    let lastQueryKey = "";
    let lastDatasetRevision = -1;

    return {
        view: function (vnode) {
            const { taxa, displayLevel, queryKey, datasetRevision } = vnode.attrs;

            if (datasetRevision !== lastDatasetRevision) {
                // Reset memoized output when Checklist.loadData(...) swaps in a new dataset.
                cachedTree = null;
                lastCacheKey = "";
                lastQueryKey = "";
                totalItemsToShow = 50;
                lastDatasetRevision = datasetRevision;
            }

            if (queryKey !== lastQueryKey) {
                totalItemsToShow = 50;
                lastQueryKey = queryKey;
            }

            // Clamp the visible set and track overflow
            let clampedTaxa = taxa;
            let overflowing = 0;
            if (displayLevel === "" && clampedTaxa.length > totalItemsToShow) {
                overflowing = clampedTaxa.length - totalItemsToShow;
                clampedTaxa = clampedTaxa.slice(0, totalItemsToShow);
            }

            // Memoize the expensive treefication step
            const cacheKey = JSON.stringify({
                queryKey: queryKey,
                dataLength: clampedTaxa.length,
                intent: Settings.analyticalIntent(),
                showSpecimens: Settings.checklistShowSpecimens(),
                pruneEmpty: Settings.checklistPruneEmpty(),
                displayLevel: displayLevel,
            });

            if (cachedTree === null || cacheKey !== lastCacheKey) {
                cachedTree = Checklist.treefiedTaxa(clampedTaxa);
                lastCacheKey = cacheKey;
            }

            const includeSpecimensInView = Settings.checklistShowSpecimens();
            const showEmptyTaxa = Settings.checklistPruneEmpty();
            const specimenMetaIndex = Checklist.getSpecimenMetaIndex();

            const branchHasSpecimens = (node) => {
                if (node.taxonMetaIndex === specimenMetaIndex) return true;
                if (!node.children) return false;
                return Object.values(node.children).some(branchHasSpecimens);
            };

            const visibleTopLevelTaxa = Object.keys(cachedTree.children).filter((taxonKey) => {
                const node = cachedTree.children[taxonKey];

                const isNotSpecimenLevel = node.taxonMetaIndex !== specimenMetaIndex;
                const visibilityByLevel = includeSpecimensInView || isNotSpecimenLevel;
                const visibilityByContent = showEmptyTaxa || branchHasSpecimens(node);

                return visibilityByLevel && visibilityByContent;
            });

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
                overflowing > 0
                    ? m(".show-more-items",
                        { onclick: () => { totalItemsToShow += itemsNumberStep; } },
                        t("next_items_checklist", Math.min(overflowing, itemsNumberStep))
                    )
                    : null,
            ]);
        },
    };
}
