/**
 * analyticalIntentIcons.js
 * ─────────────────────────────────────────────────────────────────────────────
 * UI-only enrichment of ANALYTICAL_INTENTS with MDI icon paths.
 *
 * Kept separate from nlDataStructureSheets.js so the model layer stays free
 * of any @mdi/js dependency.
 */

import { mdiFileTree, mdiTag } from "@mdi/js";
import { ANALYTICAL_INTENTS } from "../model/DataStructure.js";

const INTENT_ICONS = {
    T: mdiFileTree,
    O: mdiTag,
};

/**
 * ANALYTICAL_INTENTS augmented with an `icon` field (MDI SVG path string)
 * ready to pass to the Icon component.
 */
export const ANALYTICAL_INTENTS_UI = ANALYTICAL_INTENTS.map(intent => ({
    ...intent,
    icon: INTENT_ICONS[intent.id],
}));
