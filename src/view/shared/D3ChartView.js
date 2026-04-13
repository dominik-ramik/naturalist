import m from "mithril";

export let D3ChartView = function (initialVnode) {
  const uid = initialVnode.attrs.id;
  let chart = initialVnode.attrs.chart;
  let options = initialVnode.attrs.options;

  const getEl = () => document.getElementById(uid);

  function renderChart(forceUpdate) {
    const el = getEl();
    if (!el) {
      return;
    }

    const nextOptions = options();
    if (!forceUpdate && nextOptions.shouldUpdate === false) {
      return;
    }

    el.innerHTML = "";
    el.appendChild(chart(nextOptions));
  }

  return {
    oninit: function (vnode) {},
    oncreate: function (vnode) {
      chart = vnode.attrs.chart;
      options = vnode.attrs.options;
      renderChart(true);
    },
    onbeforeupdate: function (vnode) {
      chart = vnode.attrs.chart;
      options = vnode.attrs.options;
      // Always allow Mithril to diff the vdom; the real guard
      // is inside renderChart (options().shouldUpdate).
      return true;
    },
    onupdate: function (vnode) {
      // attrs already captured in onbeforeupdate — skip redundant assignment
      renderChart(false);
    },
    onbeforeremove: function (vnode) {
      const el = getEl();
      if (el) {
        el.innerHTML = "";
      }
    },
    view: function (vnode) {
      return m(
        ".d3chart-outer-wrapper[style=display: flex; flex-direction: column; flex-grow: 1]",
        m(
          ".d3chart-wrapper[style=display: flex; flex-direction: row; flex-wrap: nowrap; flex-grow: 1; justify-content: center;]",
          m(".chart-container[id=" + uid + "][style=margin: 0.5em]")
        )
      );
    },
  };
};
