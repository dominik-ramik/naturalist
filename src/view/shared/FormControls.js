import m from "mithril";

/**
 * A labelled <select> backed by an accessor function.
 *
 * attrs:
 *   label    — string shown above the select
 *   accessor — getter/setter: accessor() reads, accessor(val) writes
 *   values   — array of option values (strings or numbers)
 */
export const SelectParam = {
  view: ({ attrs }) => {
    const { label, accessor, values } = attrs;
    return m("label.configuration-select-label", [
      label,
      m("select.configuration-select", {
        onchange: e => {
          const raw = e.target.value;
          const final = (typeof raw === "string" && raw !== "" && !isNaN(raw))
            ? parseInt(raw, 10)
            : raw;
          accessor(final);
        }
      }, (values || []).map(v =>
        m("option", { value: v, selected: accessor() == v },
          v === "" ? "All taxon levels" : v
        )
      ))
    ]);
  }
};

/**
 * A checkbox toggle backed by an accessor function.
 *
 * attrs:
 *   label    — string shown next to the checkbox
 *   accessor — getter/setter: accessor() reads, accessor(val) writes
 */
export const ToggleParam = {
  view: ({ attrs }) => {
    const { label, accessor } = attrs;
    return m("label.configuration-checkbox", [
      m("input[type=checkbox]", {
        checked: accessor(),
        onchange: () => accessor(!accessor())
      }),
      label
    ]);
  }
};
