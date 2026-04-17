import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { Checklist } from "../../model/Checklist.js";
import { Settings } from "../../model/Settings.js";
import { TaxonView } from "./TaxonomicTree/TaxonView.js";
import { ANALYTICAL_INTENT_OCCURRENCE, ANALYTICAL_INTENT_TAXA } from "../../model/nlDataStructureSheets.js";

export const config = {
    id: "tool_taxonomic_tree",
    label: "Taxonomic tree",
    iconPath: {
        light: "./img/ui/menu/view_checklist-light.svg",
        dark: "./img/ui/menu/view_checklist.svg",
    },
    info: "Browse your data as a taxonomic tree, applying filters to easily isolate the exact records you need",
    getTaxaAlongsideOccurrences: true,

    getAvailability: (availableIntents, checklistData) => {
        const supportedIntents = availableIntents.filter(intent => {
            if (intent === ANALYTICAL_INTENT_TAXA || intent === ANALYTICAL_INTENT_OCCURRENCE) {
                return checklistData.checklist && checklistData.checklist.length > 0;
            }
        });
        return {
            supportedIntents,
            isAvailable: supportedIntents.length > 0,
            toolDisabledReason: "No data found in this dataset.",
            scopeDisabledReason: (intent) =>
                `${config.label} is unavailable ${intent === ANALYTICAL_INTENT_OCCURRENCE ? "for occurrences" : "for taxa"} because none were found.`,
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
            // rendering a human-readable label - the SelectParam split-on-pipe logic
            // handles this without any accessor-side normalization.
            values: () => {
                const taxaMeta = Checklist.getTaxaMeta() || {};
                const occurrenceIndex = Checklist.getOccurrenceMetaIndex();
                const levelOptions = Object.keys(taxaMeta)
                    .filter((_, i) => i !== occurrenceIndex)
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
            id: "showOccurrenceMeta",
            label: "Show occurrence metadata",
            type: "toggle",
            default: true,
            accessor: Settings.checklistShowOccurrenceMeta,
            // Only visible (and only flagged as non-default) in occurrence scope
            condition: (scope) => scope === ANALYTICAL_INTENT_OCCURRENCE,
        },

        {
            id: "pruneEmpty",
            label: "Show taxa without occurrences",
            type: "toggle",
            default: true,
            accessor: Settings.checklistPruneEmpty,
            // Pruning only makes sense in occurrence scope
            condition: (scope) => scope === ANALYTICAL_INTENT_OCCURRENCE,
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
                showOccurrences: Settings.checklistShowOccurrences(),
                pruneEmpty: Settings.checklistPruneEmpty(),
                displayLevel: displayLevel,
            });

            if (cachedTree === null || cacheKey !== lastCacheKey) {
                cachedTree = Checklist.treefiedTaxa(clampedTaxa);
                lastCacheKey = cacheKey;
            }

            const includeOccurrencesInView = Settings.checklistShowOccurrences();
            const showEmptyTaxa = Settings.checklistPruneEmpty();
            const occurrenceMetaIndex = Checklist.getOccurrenceMetaIndex();

            const branchHasOccurrences = (node) => {
                if (node.taxonMetaIndex === occurrenceMetaIndex) return true;
                if (!node.children) return false;
                return Object.values(node.children).some(branchHasOccurrences);
            };

            const visibleTopLevelTaxa = Object.keys(cachedTree.children).filter((taxonKey) => {
                const node = cachedTree.children[taxonKey];

                const isNotOccurrenceLevel = node.taxonMetaIndex !== occurrenceMetaIndex;
                const visibilityByLevel = includeOccurrencesInView || isNotOccurrenceLevel;
                const visibilityByContent = showEmptyTaxa || branchHasOccurrences(node);

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
                        showOccurrenceMeta: Settings.checklistShowOccurrenceMeta(),
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
