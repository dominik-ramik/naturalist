import { mdiBookOpenVariantOutline, mdiCloudSearchOutline, mdiImageOutline, mdiMapOutline, mdiTextBoxSearchOutline } from "@mdi/js";
import { t } from 'virtual:i18n-self';

export function getUiForTab(tabId) {

    switch (tabId) {
        case "summary":
            return {
                icon: mdiTextBoxSearchOutline,
                text: t("tab_title_summary")
            }
        case "externalsearch":
            return {
                icon: mdiCloudSearchOutline,
                text: t("tab_title_externalsearch")
            }
        case "media":
            return {
                icon: mdiImageOutline,
                text: t("tab_title_media")
            }
        case "map":
            return {
                icon: mdiMapOutline,
                text: t("tab_title_map")
            }
        case "text":
            return {
                icon: mdiBookOpenVariantOutline,
                text: t("tab_title_text")
            }

        default:
            console.error("Unknown tab id: " + tabId);
            break;
    }
}