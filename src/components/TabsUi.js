import { mdiBookOpenVariantOutline, mdiCloudSearchOutline, mdiImageOutline, mdiMapOutline, mdiTextBoxSearchOutline } from "@mdi/js";

export function getUiForTab(tabId) {

    switch (tabId) {
        case "summary":
            return {
                icon: mdiTextBoxSearchOutline,
                text: "tab_title_summary"
            }
        case "externalsearch":
            return {
                icon: mdiCloudSearchOutline,
                text: "tab_title_externalsearch"
            }
        case "media":
            return {
                icon: mdiImageOutline,
                text: "tab_title_media"
            }
        case "map":
            return {
                icon: mdiMapOutline,
                text: "tab_title_map"
            }
        case "text":
            return {
                icon: mdiBookOpenVariantOutline,
                text: "tab_title_text"
            }

        default:
            console.error("Unknown tab id: " + tabId);
            break;
    }
}