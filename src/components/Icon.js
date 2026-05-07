import m from "mithril";

/**
 * Renders an MDI icon from a path string.
 *
 * Usage:
 *   import { mdiMenu } from "@mdi/js";
 *   m(Icon, { path: mdiMenu })
 *   m(Icon, { path: mdiMenu, size: 24, class: "menu-button-image" })
 *   m(Icon, { path: mdiMenu, color: "currentColor" })
 */

export const Icon = {
    view: function(vnode) {
        const {
            path,
            size = "24",
            color = "#444",
            class: cls,
            style,
            title,
            width,   // absorb so ...rest can't duplicate
            height,  // absorb so ...rest can't duplicate
            ...rest
        } = vnode.attrs;

        const colorValue = color === "nlblue" ? "#55769b" : (color || "#444");

        return m("svg", {
            class: cls,
            style: { width: size, height: size, flexShrink: 0, ...(style || {}) },
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            fill: colorValue,
            "aria-hidden": title ? undefined : "true",
            role: title ? "img" : undefined,
            ...rest
        }, [
            title ? m("title", title) : null,
            m("path", { d: path })
        ]);
    }
};

export const WELL_KNOWN_ICONS_NLLEAF = "m 21.819552,16.230777 a 10.839026,10.839026 0 0 1 -2.310519,3.398394 10.820961,10.820961 0 0 1 -3.414655,2.282249 c -1.283159,0.54421 -2.679948,0.817715 -4.152159,0.812292 -0.810217,-0.003 -1.605711,-0.09096 -2.3656174,-0.260136 A 10.522887,10.522887 0 0 1 7.7459803,21.875201 11.471302,11.471302 0 0 1 7.0158818,21.52519 10.658375,10.658375 0 0 1 5.4274226,20.526191 L 5.4715013,20.36496 C 7.8924878,11.383654 12.945551,7.3502744 15.819158,5.7259553 a 13.639107,13.639107 0 0 1 1.55549,-0.7619837 8.4905699,8.4905699 0 0 1 0.41658,-0.1589735 l 0.09918,-0.1251892 c 0,0 -0.19456,0.040191 -0.531112,0.1420814 C 16.996095,4.9318143 16.462815,5.117523 15.808228,5.4102692 12.809341,6.7508735 7.2977865,10.360723 4.1974642,19.438949 1.4764172,15.778068 0.42909629,11.748838 2.0653375,7.8051512 2.6253539,6.4891139 3.4018795,5.3342141 4.373508,4.3708974 5.3441428,3.406672 6.5051829,2.6398111 7.8253762,2.0904529 9.1368982,1.5462464 10.550217,1.271749 12.026041,1.2762626 l 2.856625,0.011749 1.701004,0.00659 6.123508,0.02485 -0.04182,10.7661334 c -0.0061,1.469592 -0.290667,2.863942 -0.845805,4.145205 z";