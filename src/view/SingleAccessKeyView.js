import m from "mithril";
import { Checklist } from "../model/Checklist.js";
import { processMarkdownWithBibliography } from "../components/Utils.js";
import { _t } from "../model/I18n.js";
import { Settings } from "../model/Settings.js";

// ==========================================
// 1. DATA & LOGIC HELPERS
// ==========================================

const KeyLogic = {
    getAllKeys: () => Checklist.getSingleAccessTaxonomicKeys() || [],
    getKeyById: (id) => KeyLogic.getAllKeys().find(k => k.id === id),

    validateAndParseSteps: (key, stepsStr) => {
        if (!stepsStr) return [1];
        const rawParts = stepsStr.split('-');
        if (parseInt(rawParts[0]) !== 1) return [1];

        const path = [1];
        let currentStepId = 1;

        for (let i = 1; i < rawParts.length; i++) {
            const rawPart = rawParts[i];
            const isNumber = !isNaN(rawPart);
            const stepOpts = key.steps.filter(s => s.step_id === currentStepId);

            if (stepOpts.length === 0) break;

            let validMove = false;
            if (isNumber) {
                const targetId = parseInt(rawPart);
                validMove = stepOpts.some(s => s.type === 'internal' && s.target === targetId);
                if (validMove) {
                    currentStepId = targetId;
                    path.push(targetId);
                }
            } else {
                // External (Result)
                const taxonName = rawParts.slice(i).join('-');
                validMove = stepOpts.some(s => s.type === 'external' && s.target === taxonName);
                if (validMove) {
                    path.push(taxonName);
                    return path;
                }
            }
            if (!validMove) break;
        }
        return path;
    },

    getHistoryDetails: (key, pathArray) => {
        if (pathArray.length <= 1) return [];
        const history = [];
        for (let i = 0; i < pathArray.length - 1; i++) {
            const stepId = pathArray[i];
            const nextId = pathArray[i + 1];
            const stepOptions = key.steps.filter(s => s.step_id === stepId);
            const selectedOption = stepOptions.find(s =>
                (typeof nextId === 'number' && s.target === nextId) ||
                (typeof nextId === 'string' && s.target === nextId)
            );

            if (selectedOption) {
                history.push({
                    stepId: stepId,
                    text: selectedOption.text,
                    images: selectedOption.images || [],
                    pathSubset: pathArray.slice(0, i + 1).join('-')
                });
            }
        }
        return history;
    },

    getRecursiveTaxa: (key, currentId) => {
        if (typeof currentId === 'string') return [currentId];
        const choices = key.steps.filter(s => s.step_id === currentId);
        let taxa = [];
        choices.forEach(choice => {
            if (choice.type === 'external') {
                taxa.push(choice.target);
            } else {
                taxa = taxa.concat(KeyLogic.getRecursiveTaxa(key, choice.target));
            }
        });
        return [...new Set(taxa)].sort();
    },

    getPathToTaxon: (key, taxonName) => {
        const findPath = (currentId, currentPath) => {
            const options = key.steps.filter(s => s.step_id === currentId);
            for (const opt of options) {
                if (opt.type === 'external') {
                    if (opt.target === taxonName) {
                        return [...currentPath, taxonName];
                    }
                } else {
                    // Internal node, recurse
                    const result = findPath(opt.target, [...currentPath, opt.target]);
                    if (result) return result;
                }
            }
            return null;
        };
        return findPath(1, [1]);
    }
};

// ==========================================
// 2. SUB-COMPONENTS
// ==========================================

const ImageToggler = {
    view: ({ attrs, state }) => {
        return m("span", [
            m("img.sak-thumb", {
                src: attrs.src,
                onclick: (e) => {
                    e.stopPropagation();
                    state.isFullscreen = true;
                }
            }),
            state.isFullscreen ? m(".sak-fullscreen-overlay", {
                onclick: (e) => {
                    e.stopPropagation();
                    state.isFullscreen = false;
                }
            }, m("img.sak-fullscreen-img", { src: attrs.src })) : null
        ]);
    }
};

// ==========================================
// 3. MAIN CONFIGURABLE COMPONENT
// ==========================================

const KeyCard = {
    oninit: (vnode) => {
        // [REFRACTOR] Auto-expand details if we are loading into a specific path (result)
        const hasSteps = vnode.attrs.isActive && vnode.attrs.currentPath && vnode.attrs.currentPath.length > 1;
        vnode.state.isDetailsExpanded = hasSteps;
        vnode.state.isTaxaExpanded = vnode.attrs.isActive;
    },

    view: (vnode) => {
        const { keyData, isActive, currentPath, history, onSelect, onStepClick, onRestart, onBack } = vnode.attrs;
        const state = vnode.state;
        const isListView = !isActive;

        // --- Logic Calculation ---
        const currentStepId = isActive ? currentPath[currentPath.length - 1] : 1;
        const stepsPassed = isActive && currentPath.length > 1;

        // --- CALCULATION: Reachable Taxa ---
        // We calculate this here so we can use it for both the Footer and the External Filter Call
        const allTaxa = KeyLogic.getRecursiveTaxa(keyData, 1);
        const reachableTaxa = isActive
            ? KeyLogic.getRecursiveTaxa(keyData, currentStepId)
            : allTaxa;

        // --- EXTERNAL CALL: Set Filter ---
        // Called immediately on render if in single view (isActive)
        if (isActive && typeof setFilterForPossibleTaxa === 'function') {
            setFilterForPossibleTaxa(reachableTaxa);
        }

        // --- 1. Header Logic ---

        // Expander Icon:
        // List Mode: Always "chevron_forward"
        // Active Mode: Shown only if steps passed OR description exists.
        const hasDescription = !!keyData.description;
        const showActiveExpander = stepsPassed || hasDescription;
        const showIcon = isListView || showActiveExpander;

        const iconSrc = isListView
            ? "img/ui/menu/chevron_forward.svg"
            : (state.isDetailsExpanded ? "img/ui/menu/collapse_all.svg" : "img/ui/menu/expand_all.svg");

        // --- 2. Description Logic ---

        // List Mode: Always render if present.
        // Active Mode: Render only if expanded.
        const showDescription = hasDescription && (isListView || state.isDetailsExpanded);


        // --- Render Functions ---

        const renderHeader = () => m(".sak-header", {
            onclick: (e) => {
                // List View: Clicking header selects key
                if (isListView && onSelect) {
                    onSelect();
                }
                // Single View: Clicking header toggles expansion
                else if (isActive && showActiveExpander) {
                    state.isDetailsExpanded = !state.isDetailsExpanded;
                }
            }
        }, [
            (!isListView && onBack) ? m("img.sak-icon.sak-icon-left", { 
                src: "img/ui/menu/arrow_circle_left.svg",
                onclick: (e) => {
                    e.stopPropagation();
                    onBack();
                }
            }) : null,
            m("h3.sak-title", m.trust(processMarkdownWithBibliography(keyData.title))),
            showIcon
                ? m("img.sak-icon", { src: iconSrc })
                : null
        ]);

        const renderDescription = () => {
            if (!showDescription) return null;
            return m(".sak-description", {
                onclick: (e) => {
                    // List View: Clicking header selects key
                    if (isListView && onSelect) {
                        onSelect();
                    }
                    // Single View: Clicking header toggles expansion
                    else if (isActive && showActiveExpander) {
                        state.isDetailsExpanded = !state.isDetailsExpanded;
                    }
                }
            }, m.trust(processMarkdownWithBibliography(keyData.description)));
        };

        const renderStackLine = () => {
            return m(".sak-stack-line", {
                onclick: (e) => {
                    e.stopPropagation();
                    state.isDetailsExpanded = !state.isDetailsExpanded;
                }
            });
        };

        const renderDashedSeparator = () => {
            return m("hr.sak-separator-dashed", { "data-text": _t("key_or") });
        };

        const renderStepsArea = () => {
            if (!isActive) return null;

            // Get current options
            let currentOptions = [];
            let isResult = false;
            let linkedKey = null;

            if (typeof currentStepId === 'string') {
                isResult = true;
                linkedKey = KeyLogic.getKeyById(currentStepId);
            } else {
                currentOptions = keyData.steps.filter(s => s.step_id === currentStepId);
            }

            return m(".sak-steps-container", {
                // Class controls the CSS expansion
                class: state.isDetailsExpanded ? "sak-expanded" : "sak-collapsed"
            }, [

                // 1. HISTORY (Always rendered)
                // In collapsed mode, CSS will hide the .sak-history-item (body) 
                // but keep the .sak-stack-line (header) visible.
                history && history.length > 0 ? m("div.sak-history-list", history.map((hItem) => [
                    renderStackLine(),
                    m(".sak-option.sak-history-item", {
                        onclick: () => onStepClick(hItem.pathSubset)
                    }, [
                        m("span.sak-option-text", m.trust(processMarkdownWithBibliography(hItem.text))),
                        hItem.images && hItem.images.length > 0
                            ? m(".sak-option-images", hItem.images.map(img => m(ImageToggler, { src: img })))
                            : null
                    ])
                ])) : null,

                // 2. CURRENT STEP HEADER
                // If it is a Result, we need a line (header).
                // If it is Options, the card has a border, so no line needed.
                isResult ? renderStackLine() : null,

                // 3. CURRENT CONTENT (Options or Result)
                isResult
                    ? m(".sak-result", [
                        m("h3", m.trust(currentStepId)),
                        linkedKey && m(".sak-result-actions", [
                            // [NEW] The button that links to the next key
                            linkedKey
                                ? m("button", {
                                    onclick: () => m.route.set("/single-access-keys/:key", { key: linkedKey.id })
                                }, "Go to " + linkedKey.title)
                                : null,
                        ])
                    ])
                    : m(".sak-options-list.sak-card", currentOptions.map((opt, idx) => [
                        idx > 0 ? renderDashedSeparator() : null,
                        m(".sak-option", {
                            onclick: () => {
                                const nextVal = opt.type === 'external' ? opt.target : opt.target;
                                const newPath = currentPath.join('-') + '-' + nextVal;
                                onStepClick(newPath);
                            }
                        }, [
                            m("span.sak-option-text", m.trust(processMarkdownWithBibliography(opt.text))),
                            opt.images && opt.images.length > 0
                                ? m(".sak-option-images", opt.images.map(img => m(ImageToggler, { src: img })))
                                : null
                        ])
                    ]))
            ]);
        };

        const renderFooter = () => {
            // Pre-calculated variables (derived in the main view scope)
            const allTaxa = KeyLogic.getRecursiveTaxa(keyData, 1);
            const currentStepId = isActive ? currentPath[currentPath.length - 1] : 1;
            const reachableTaxa = isActive
                ? KeyLogic.getRecursiveTaxa(keyData, currentStepId)
                : allTaxa;

            return m(".sak-footer", {
                class: isActive ? "sak-footer-noborder" : ""
            }, [
                m(".sak-footer-header", {
                    onclick: (e) => {
                        e.stopPropagation();
                        state.isTaxaExpanded = !state.isTaxaExpanded;
                    }
                }, [
                    m("span", `Taxa Included (${reachableTaxa.length}/${allTaxa.length})`),
                    m("img.sak-icon", {
                        src: state.isTaxaExpanded
                            ? "img/ui/menu/expand_less.svg"
                            : "img/ui/menu/expand_more.svg"
                    })
                ]),

                state.isTaxaExpanded ? m(".sak-chips-container", allTaxa.map(taxon => {
                    const isPossible = reachableTaxa.includes(taxon);
                    return m("span.sak-chip", {
                        class: isPossible ? "reachable" : "unreachable",
                        onclick: (e) => {
                            e.stopPropagation();
                            //if (!isPossible) return;

                            // Calculate path once.
                            const fullPath = KeyLogic.getPathToTaxon(keyData, taxon);
                            if (!fullPath || fullPath.length === 0) return;

                            const pathStr = fullPath.join('-');

                            // Always expand details to ensure the result is visible
                            state.isDetailsExpanded = true;

                            if (isActive) {
                                // Already in the key: just update the steps
                                onStepClick(pathStr);
                            } else {
                                // Not in the key: Route to the specific Key + Path
                                m.route.set("/single-access-keys/:key/:steps", {
                                    key: keyData.id,
                                    steps: pathStr
                                });
                            }
                        }
                    }, m.trust(taxon));
                })) : null
            ]);
        };

        return m(".sak-card", [
            renderHeader(),
            renderDescription(),
            renderStepsArea(),
            renderFooter()
        ]);
    }
};

// ==========================================
// 4. MAIN CONTROLLER / ROUTE VIEW
// ==========================================

export const SingleAccessKeyView = {
    view: (vnode) => {
        const allKeys = KeyLogic.getAllKeys();
        const keyId = m.route.param("key");
        const stepsParam = m.route.param("steps");

        // --- List of Keys View ---
        if (!keyId) {
            return m(".single-access-key-view", [
                allKeys.map(k => m(KeyCard, {
                    keyData: k,
                    isActive: false,
                    onSelect: () => m.route.set("/single-access-keys/:key", { key: k.id })
                }))
            ]);
        }

        // --- Single Key View ---
        const activeKey = KeyLogic.getKeyById(keyId);
        if (!activeKey) return m(".single-access-key-view", "Key not found.");

        const pathArray = KeyLogic.validateAndParseSteps(activeKey, stepsParam);
        const historyData = KeyLogic.getHistoryDetails(activeKey, pathArray);

        return m(".single-access-key-view", [

            m(KeyCard, {
                keyData: activeKey,
                isActive: true,
                currentPath: pathArray,
                history: historyData,
                onStepClick: (newPathStr) => m.route.set("/single-access-keys/:key/:steps", { key: activeKey.id, steps: newPathStr }),
                onRestart: () => m.route.set("/single-access-keys/:key", { key: activeKey.id }),
                onBack: () => m.route.set("/single-access-keys")
            })
        ]);
    }
};

function setFilterForPossibleTaxa(reachableTaxa) {
    // 1. Construct the separator-delimited regex string for the filter
    // Filter.js handles the separator as an OR operator automatically
    const newFilterText = reachableTaxa && reachableTaxa.length > 0
        ? reachableTaxa.join(" " + Settings.SEARCH_OR_SEPARATOR + " ")
        : "";

    // 2. CRITICAL: Infinite Loop Prevention
    // Only commit if the filter text has actually changed.
    // Without this check: View -> setFilter -> Route Update -> View -> ... (Crash)
    if (Checklist.filter.text !== newFilterText) {

        // 3. Clear previous filters (Data/Taxa dropdowns)
        // This ensures the user only sees results relevant to the Key
        Checklist.filter.clear();

        // 4. Set the new text filter
        Checklist.filter.text = newFilterText;

        // 5. Commit to the CURRENT Route
        // We get the current path (e.g., "/single-access-keys/gbif/1-2")
        // splitting at '?' ensures we don't duplicate existing query params.
        const currentRoutePath = m.route.get().split("?")[0];

        // This triggers routeTo() which appends the new ?q=... param
        Checklist.filter.commit(currentRoutePath);
    }
}