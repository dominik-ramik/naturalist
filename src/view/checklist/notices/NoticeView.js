import m from "mithril";

export let NoticeView = {
  view: function (vnode) {
    return m(
      ".temporary-notice" +
        (vnode.attrs.additionalClasses === undefined
          ? ""
          : "." + vnode.attrs.additionalClasses),
      {
        onclick: vnode.attrs.action,
      },
      [
        m(".notice", vnode.attrs.notice),
        vnode.attrs.additionalButton === undefined
          ? null
          : m(
              "button.show-all",
              {
                onclick: vnode.attrs.additionalButton.action,
              },
              [
                m(
                  "img.notice-icon[src=img/ui/menu/" +
                    vnode.attrs.additionalButton.icon +
                    ".svg]"
                ),
                vnode.attrs.additionalButton.text,
              ]
            ),
      ]
    );
  },
};

