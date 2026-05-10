// SearchView.js
import m from "mithril";
import { t, tf } from 'virtual:i18n-self';
import "./SearchView.css";

import { FilterDropdown } from "../view/FilterDropdownView.js";
import { Checklist } from "../model/Checklist.js";
import { FilterCrumbsView } from "./FilterCrumbsView.js";
import { InteractionAreaView } from "./InteractionAreaView.js";
import { Settings } from "../model/Settings.js";
import { ANALYTICAL_INTENT_TAXA, OCCURRENCE_IDENTIFIER } from "../model/DataStructure.js";
import { CacheManager } from "../model/CacheManager.js";
import { Icon } from "../components/Icon.js";
import { mdiChevronDown, mdiChevronUp, mdiDeleteOutline, mdiTune } from "@mdi/js";



const SEARCH_CATEGORY_SEPARATOR = "|";
const PRIORITY_PREFIX = "!";

/**
 * Parses a raw searchCategory string into its components.
 *
 * Handles four formats (whitespace around "!" is ignored, "!" and "! " are
 * treated identically):
 *   "!mygroup | mytitle"   → { isPriority: true,  category: "mygroup", title: "mytitle" }
 *   "! mygroup | mytitle"  → { isPriority: true,  category: "mygroup", title: "mytitle" }
 *   "! mytitle"            → { isPriority: true,  category: "",        title: "mytitle" }
 *   "mygroup | mytitle"    → { isPriority: false, category: "mygroup", title: "mytitle" }
 *   "mytitle"              → { isPriority: false, category: "",        title: "mytitle" }
 *
 * isPriority and category are independent axes: a priority "mygroup" and a
 * non-priority "mygroup" are distinct namespaces and will never be merged.
 */
function parseSearchCategory(raw) {
    let rest = raw.trim();

    const isPriority = rest.startsWith(PRIORITY_PREFIX);
    if (isPriority) {
        // Strip the "!" and any following whitespace ("!" and "! " are equivalent)
        rest = rest.slice(PRIORITY_PREFIX.length).trim();
    }

    let category = "";
    let title = "";

    if (rest.includes(SEARCH_CATEGORY_SEPARATOR)) {
        const parts = rest.split(SEARCH_CATEGORY_SEPARATOR);
        category = parts[0].trim();
        title    = parts[1].trim();
    } else {
        title = rest;
    }

    return { isPriority, category, title };
}

/**
 * Groups an array of data filter paths into an ordered structure, preserving
 * the first-seen order of categories and correctly merging non-contiguous items
 * that share the same (isPriority, category) key.
 *
 * Returns two arrays, each containing group objects { category, items[] }:
 *   - priorityGroups : filters whose searchCategory starts with "!" (with or
 *                      without a space after it)
 *   - normalGroups   : all other filters
 *
 * Each item in a group is: { title, dataPath }
 *
 * Because priority and normal filters live in separate Maps, "! mygroup" and
 * "mygroup" can never accidentally merge even when the stripped label is equal.
 */
function groupDataFilters(dataPaths) {
    const priorityMap = new Map(); // category → { category, items[] }
    const normalMap   = new Map();

    for (const dataPath of dataPaths) {
        const raw = Checklist.getDataMeta()[dataPath].searchCategory;

        if (!raw) {
            console.warn(`Data path '${dataPath}' is missing 'searchCategory' metadata. Skipping.`);
            continue;
        }

        const { isPriority, category, title } = parseSearchCategory(raw);
        const map = isPriority ? priorityMap : normalMap;

        if (!map.has(category)) {
            map.set(category, { category, items: [] });
        }
        map.get(category).items.push({ title, dataPath });
    }

    return {
        priorityGroups: Array.from(priorityMap.values()),
        normalGroups:   Array.from(normalMap.values()),
    };
}

/**
 * Renders a list of groups as filter button lists, with optional category
 * headings.
 *
 * @param {Array}   groups    - Output from groupDataFilters (priorityGroups or normalGroups)
 * @param {boolean} fullWidth - When true, adds the "full-width" modifier class so
 *                              items span the full row instead of the default two-column grid.
 */
function renderFilterGroups(groups, fullWidth) {
    return groups.map(({ category, items }) =>
        m("div.data-filter-category", [
            category ? m("h4.search-category-group", category) : null,
            m("ul.filter-buttons.data-filter" + (fullWidth ? ".full-width" : ""),
                items.map(({ title, dataPath }) =>
                    m("li", m(FilterDropdown, {
                        color:    Checklist.filter.data[dataPath].color,
                        title,
                        type:     "data",
                        dataPath,
                    }))
                )
            ),
        ])
    );
}

/**
 * Returns the total number of currently active filters (taxa, data, and free
 * text) so the mobile toggle button can display a live count badge.
 *
 * Each filter slot (taxa or data) is considered "active" when its value array
 * is non-empty. The free-text field counts as 1 when non-blank.
 */
function getActiveFilterCount() {
    let count = 0;

    // Free-text search
    if (Checklist.filter.text && Checklist.filter.text.trim().length > 0) {
        count++;
    }

    // Taxa-level filters
    for (const f of Object.values(Checklist.filter.taxa)) {
        const v = f.value ?? f.values ?? f.selected;
        if (Array.isArray(v) ? v.length > 0 : Boolean(v)) count++;
    }

    // Data-column filters
    for (const f of Object.values(Checklist.filter.data)) {
        const v = f.value ?? f.values ?? f.selected;
        if (Array.isArray(v) ? v.length > 0 : Boolean(v)) count++;
    }

    return count;
}

export let SearchView = {

    view: function () {

        const intent              = Settings.analyticalIntent();
        const occurrenceMetaIndex = Checklist.getOccurrenceMetaIndex();
        const inTaxonMode         = intent === ANALYTICAL_INTENT_TAXA;

        // ── Taxa filter dropdowns ─────────────────────────────────────────────
        let taxaFilterDropdown = [];
        Object.keys(Checklist.filter.taxa).forEach(function (dataPath, index) {
            // In taxon mode there are no occurrences, so the occurrence taxa-level
            // slot would always be empty - hide it.
            if (inTaxonMode && occurrenceMetaIndex !== -1 && index === occurrenceMetaIndex) return;
            taxaFilterDropdown.push(m("li", m(FilterDropdown, {
                color:    Checklist.filter.taxa[dataPath].color,
                title:    Checklist.getNameOfTaxonLevel(dataPath),
                type:     "taxa",
                dataPath,
            })));
        });

        // ── Collect eligible data filter paths ────────────────────────────────
        // Filtering happens here, before grouping, so groupDataFilters works on
        // the final set and never creates duplicate groups from non-contiguous
        // entries that happen to share a category label.
        const eligibleDataPaths = Object.keys(Checklist.filter.data).filter(dataPath => {
            // In taxon mode, occurrence-only data columns are meaningless.
            const belongsTo = Checklist.filter.data[dataPath].belongsTo || "taxon";
            if (inTaxonMode && belongsTo === OCCURRENCE_IDENTIFIER) return false;
            return true;
        });

        // ── Split and group into priority (!) and normal sections ─────────────
        const { priorityGroups, normalGroups } = groupDataFilters(eligibleDataPaths);

        return m(".search", [
            m(".filter-groups-wrapper", [
                // 1. Priority (!) data filters - full-width, above taxa
                renderFilterGroups(priorityGroups, true),

                // 2. Taxa filters
                m("ul.filter-buttons.taxa-filter", taxaFilterDropdown),

                // 3. Normal data filters - standard two-column layout
                renderFilterGroups(normalGroups, false),
            ]),

            // 4. Search box with integrated mobile toggle
            m(SearchBox, {
                isExpanded:    InteractionAreaView.isExpanded,
                toggleHandler: () => {
                    InteractionAreaView.isExpanded = !InteractionAreaView.isExpanded;
                    Settings.mobileFiltersPaneCollapsed(InteractionAreaView.isExpanded);
                }
            }),

            m(FilterCrumbsView),
        ]);
    }
};

let SearchBox = {
    typingTimer: null,
    // ghostText holds what the user has typed before the debounce fires.
    // Rendering from ghostText (rather than Checklist.filter.text) means that
    // Mithril redraws triggered by route commits can never clobber in-progress input.
    ghostText: null,
    _lastDataRevision: "",

    view: function (vnode) {
        const { isExpanded, toggleHandler } = vnode.attrs;

        // When a new dataset is loaded the data revision changes. Reset any
        // in-flight ghost text and pending debounce so the search box reflects
        // the freshly-cleared filter state.
        const currentRevision = CacheManager.contextRevision();
        if (currentRevision !== SearchBox._lastDataRevision) {
            if (SearchBox.typingTimer) {
                clearTimeout(SearchBox.typingTimer);
                SearchBox.typingTimer = null;
            }
            SearchBox.ghostText = null;
            SearchBox._lastDataRevision = currentRevision;
        }

        const displayValue = SearchBox.ghostText !== null
            ? SearchBox.ghostText
            : Checklist.filter.text;

        return m(".search-box", [
            m("input[id=free-text][autocomplete=off][type=search][placeholder=" + tf("free_text_search", [Settings.SEARCH_OR_SEPARATOR], true) + "]", {
                value: displayValue,
                onfocus: function () {
                    if (isExpanded) {
                        toggleHandler();
                    }
                },
                oninput: function (e) {
                    const newText = e.target.value;

                    // Always keep ghost in sync with the actual DOM value so that
                    // any redraw during debounce shows exactly what the user typed.
                    SearchBox.ghostText = newText;

                    if (SearchBox.typingTimer) {
                        clearTimeout(SearchBox.typingTimer);
                        SearchBox.typingTimer = null;
                    }

                    if (newText.length === 0) {
                        // Clearing the field: commit immediately and drop the ghost.
                        SearchBox.ghostText = null;
                        Checklist.filter.text = "";
                        Checklist.filter.commit();
                    } else {
                        // Debounce all non-empty input uniformly - including the very
                        // first character - to avoid a route commit mid-keystroke.
                        SearchBox.typingTimer = setTimeout(function () {
                            SearchBox.ghostText = null;
                            Checklist.filter.text = newText;
                            Checklist.filter.commit();
                        }, 500);
                    }
                },
                onkeydown: function (e) {
                    if (e.key === "Enter") {
                        if (SearchBox.typingTimer) {
                            clearTimeout(SearchBox.typingTimer);
                            SearchBox.typingTimer = null;
                        }
                        if (SearchBox.ghostText !== null) {
                            Checklist.filter.text = SearchBox.ghostText;
                            SearchBox.ghostText = null;
                        }
                        Checklist.filter.commit();
                    }
                }
            }),

            m("button.filter-button.mobile-filter-toggle", {
                onclick: toggleHandler,
            }, [
                m(Icon, { path: mdiTune }),
                t("filters"),
                (() => {
                    const n = getActiveFilterCount();
                    return n > 0 ? m("span.filter-count-badge", n) : null;
                })(),
                m(Icon, { path: isExpanded ? mdiChevronDown : mdiChevronUp }),
            ]),

            !Checklist.filter.isEmpty() ? m("button.filter-button.mobile-clear-filters", {
                onclick: function () {
                    if (SearchBox.typingTimer) {
                        clearTimeout(SearchBox.typingTimer);
                        SearchBox.typingTimer = null;
                    }
                    SearchBox.ghostText = null;
                    Checklist.filter.clear();
                    Checklist.filter.commit();
                },
            }, [
                m(Icon, { path: mdiDeleteOutline, color: "#dddddd" }),
                t("reset_filter_mobile"),
            ]) : null,
        ]);
    }
};