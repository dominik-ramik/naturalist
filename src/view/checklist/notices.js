import m from "mithril";
import { routeTo } from "../../components/Utils.js";
import { Checklist } from "../../model/Checklist.js";
import { Settings } from "../../model/Settings.js";
import { NoticeView } from "./notices/NoticeView.js";

export function renderChecklistNotices(ctx) {
  const notices = [];

  if (Checklist._isDraft) {
    notices.push(
      m(NoticeView, {
        action: function () {
          ctx.resetDisplayMode();
        },
        notice: t("draft_notice"),
        additionalButton: {
          action: function () {
            routeTo("/manage/review");
          },
          icon: "manage",
          text: t("temporary_draft_goto_manage"),
        },
      })
    );
  }

  if (!Checklist.filter.isEmpty()) {
    notices.push(
      m(NoticeView, {
        additionalClasses: ".mobile-filter-on",
        action: function () {
          ctx.resetDisplayMode();
        },
        notice: m.trust(
          tf(
            "mobile_filter_notice",
            [Settings.pinnedSearches.getHumanNameForSearch()],
            true
          )
        ),
      })
    );
  }

  return notices;
}
