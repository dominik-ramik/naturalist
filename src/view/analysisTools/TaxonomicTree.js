import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { Checklist } from "../../model/Checklist.js";
import { Settings } from "../../model/Settings.js";
import { TaxonView } from "./TaxonomicTree/TaxonView.js";
import { TaxonNameView } from "./TaxonomicTree/TaxonNameView.js";
import { TaxonDataView } from "./TaxonomicTree/TaxonDataView.js";
import { ANALYTICAL_INTENT_OCCURRENCE, ANALYTICAL_INTENT_TAXA } from "../../model/nlDataStructureSheets.js";

registerMessages(selfKey, {
  en: {
    next_items_checklist: "Show next {0} search results",
    display_all_taxa: "All taxonomic ranks",
    display_occurrences_only: "Occurrences only",
  },
  fr: {
    next_items_checklist: "Afficher les {0} résultats de recherche suivants",
    display_all_taxa: "Tous les rangs taxonomiques",
    display_occurrences_only: "Occurrences uniquement",
  }
});

// Sentinel value stored in Settings.checklistDisplayLevel when the user selects
// the "Occurrences only" flat-list mode. Must not collide with any real taxon
// meta key (those are dataset column names, never starting with "__").
export const DISPLAY_MODE_OCCURRENCES_ONLY = "__occurrences_only__";

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
            label: "Display mode",
            type: "select",
            default: "",
            accessor: Settings.checklistDisplayLevel,
            // Dynamic: option keys come from runtime taxon meta, not a static list.
            // The leading "|" gives the "show all" option a value of "" while still
            // rendering a human-readable label - the SelectParam split-on-pipe logic
            // handles this without any accessor-side normalization.
            // The trailing occurrences-only option is appended only in occurrence scope
            // so it never appears when browsing taxa alone.
            values: () => {
                const taxaMeta = Checklist.getTaxaMeta() || {};
                const occurrenceIndex = Checklist.getOccurrenceMetaIndex();
                const levelOptions = Object.keys(taxaMeta)
                    .filter((_, i) => i !== occurrenceIndex)
                    .map(key => `${key} | ${taxaMeta[key]?.name || key}`);
                const occurrencesOnlyOption = Settings.analyticalIntent() === ANALYTICAL_INTENT_OCCURRENCE
                    ? [`${DISPLAY_MODE_OCCURRENCES_ONLY} | ${t("display_occurrences_only")}`]
                    : [];
                return [`| ${t("display_all_taxa")}`, ...levelOptions, ...occurrencesOnlyOption];
            },
        },

        {
            id: "showTaxonMeta",
            label: "Show taxon metadata",
            type: "toggle",
            default: true,
            accessor: Settings.checklistShowTaxonMeta,
            // Hidden in occurrences-only mode — there are no taxon rows to annotate.
            condition: () => Settings.checklistDisplayLevel() !== DISPLAY_MODE_OCCURRENCES_ONLY,
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
            // Pruning only makes sense in occurrence scope, and is irrelevant in
            // occurrences-only mode where no taxon rows are rendered at all.
            condition: (scope) =>
                scope === ANALYTICAL_INTENT_OCCURRENCE &&
                Settings.checklistDisplayLevel() !== DISPLAY_MODE_OCCURRENCES_ONLY,
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
            // Meaningless in occurrences-only mode.
            condition: () => Settings.checklistDisplayLevel() !== DISPLAY_MODE_OCCURRENCES_ONLY,
        },
    ],

    render: ({ filteredTaxa, queryKey, dataContextRevision }) => {
        // Guard: the occurrences-only sentinel is only valid in occurrence scope.
        // If the user switches to taxa scope while it is set, reset to the
        // default ("") so the tree renders normally and the select shows a
        // valid option rather than the raw sentinel string.
        if (
            Settings.checklistDisplayLevel() === DISPLAY_MODE_OCCURRENCES_ONLY &&
            Settings.analyticalIntent() !== ANALYTICAL_INTENT_OCCURRENCE
        ) {
            Settings.checklistDisplayLevel("");
        }

        return m(ChecklistTree, {
            taxa: filteredTaxa,
            displayLevel: Settings.checklistDisplayLevel(),
            queryKey,
            dataContextRevision,
        });
    },
};

// ─── ChecklistTree internal component ────────────────────────────────────────

function ChecklistTree() {
    let totalItemsToShow = 50;
    const itemsNumberStep = 50;
    let cachedTree = null;
    let lastCacheKey = "";
    let lastQueryKey = "";
    let lastDataContextRevision = "";

    return {
        view: function (vnode) {
            const { taxa, displayLevel, queryKey, dataContextRevision } = vnode.attrs;

            if (dataContextRevision !== lastDataContextRevision) {
                // Reset memoized output when Checklist.loadData(...) swaps in a new dataset.
                cachedTree = null;
                lastCacheKey = "";
                lastQueryKey = "";
                totalItemsToShow = 50;
                lastDataContextRevision = dataContextRevision;
            }

            if (queryKey !== lastQueryKey) {
                totalItemsToShow = 50;
                lastQueryKey = queryKey;
            }

            // Clamp the visible set and track overflow.
            // In occurrences-only mode we don't clamp the raw taxa here — we collect
            // occurrence leaf nodes from the tree first and clamp that derived list.
            let clampedTaxa = taxa;
            let overflowing = 0;
            if (displayLevel === "" && clampedTaxa.length > totalItemsToShow) {
                overflowing = clampedTaxa.length - totalItemsToShow;
                clampedTaxa = clampedTaxa.slice(0, totalItemsToShow);
            }

            // Memoize the expensive treefication step.
            // For occurrences-only mode treefify the full (unclamped) set so that
            // the occurrence leaf collector below sees everything; clamping happens
            // after collection on the flat occurrence list.
            const taxaForTree = displayLevel === DISPLAY_MODE_OCCURRENCES_ONLY ? taxa : clampedTaxa;
            const cacheKey = JSON.stringify({
                queryKey: queryKey,
                dataLength: taxaForTree.length,
                intent: Settings.analyticalIntent(),
                showOccurrences: Settings.checklistShowOccurrences(),
                pruneEmpty: Settings.checklistPruneEmpty(),
                displayLevel: displayLevel,
                dataContextRevision,
            });

            if (cachedTree === null || cacheKey !== lastCacheKey) {
                cachedTree = Checklist.treefiedTaxa(taxaForTree);
                lastCacheKey = cacheKey;
            }

            // ── Occurrences-only flat list ────────────────────────────────────
            if (displayLevel === DISPLAY_MODE_OCCURRENCES_ONLY) {
                const occurrenceMetaIndex = Checklist.getOccurrenceMetaIndex();

                // Walk the tree and collect all nodes sitting at the occurrence level.
                const occurrenceNodes = [];
                const collectOccurrences = (node) => {
                    if (node.taxonMetaIndex === occurrenceMetaIndex) {
                        occurrenceNodes.push(node);
                        return;
                    }
                    if (node.children) {
                        Object.values(node.children).forEach(collectOccurrences);
                    }
                };
                Object.values(cachedTree.children).forEach(collectOccurrences);

                return m(OccurrenceListView, {
                    occurrenceNodes,
                    occurrenceMetaIndex,
                    totalItemsToShow,
                    itemsNumberStep,
                    onShowMore: () => { totalItemsToShow += itemsNumberStep; },
                });
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

// ─── OccurrenceListView ───────────────────────────────────────────────────────
//
// Flat list of occurrence cards, rendered without any parent taxon tree.
// Each item in `taxa` that sits at the occurrence meta index gets its own card,
// identical in structure to the occurrence cards produced by TaxonView — reusing
// TaxonNameView and TaxonDataView directly so styling stays perfectly in sync.

const OccurrenceListView = {
    view: function (vnode) {
        const { occurrenceNodes, occurrenceMetaIndex, totalItemsToShow, itemsNumberStep, onShowMore } = vnode.attrs;

        const showOccurrenceMeta = Settings.checklistShowOccurrenceMeta();

        // occurrenceNodes are already tree nodes at the occurrence level,
        // collected by walking the treefied result in ChecklistTree.
        let visibleOccurrences = occurrenceNodes;
        let overflowing = 0;
        if (occurrenceNodes.length > totalItemsToShow) {
            overflowing = occurrenceNodes.length - totalItemsToShow;
            visibleOccurrences = occurrenceNodes.slice(0, totalItemsToShow);
        }

        return m(".listed-taxa.occurrences-only-list", [
            visibleOccurrences.map((taxon) =>
                m("ul.card.taxon-level0.occurrence-level.occurrence-flat-card", { key: taxon.taxon?.name }, [
                    m("li.taxon", [
                        m(".taxon-name-stripe", [
                            m(TaxonNameView, {
                                taxonTree: taxon,
                                currentTaxonLevel: occurrenceMetaIndex,
                                // In flat mode the parents array is intentionally empty:
                                // the parent-taxon indicator inside TaxonNameView will
                                // use the sparse-lookup path to find the actual parent.
                                parents: [],
                                variant: "occurrence",
                            }),
                            m(".spacer"),
                        ]),
                        showOccurrenceMeta
                            ? m(TaxonDataView, { taxon: taxon })
                            : null,
                    ]),
                ])
            ),
            overflowing > 0
                ? m(".show-more-items",
                    { onclick: onShowMore },
                    t("next_items_checklist", Math.min(overflowing, itemsNumberStep))
                )
                : null,
        ]);
    },
};
