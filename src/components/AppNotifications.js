import { t } from 'virtual:i18n-self';
import { Toast } from "../view/AppLayoutView.js";

export function showNewVersionToast(onConfirm) {
  Toast.show(t("new_version_available"), {
    showPermanently: true,
    whenClosed: onConfirm,
  });
}

export function showChecklistUpdatedToast(onConfirm) {
  Toast.show(t("checklist_data_updated"), {
    whenClosed: onConfirm,
  });
}

export function showOfflineFetchFailedToast() {
  Toast.show(t("offline_fetch_failed"));
}
