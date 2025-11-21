import m from "mithril";


export let D3ChartView = function (initialVnode) {
  const uid = initialVnode.attrs.id;
  let chart = initialVnode.attrs.chart;
  let options = initialVnode.attrs.options;

  const getEl = () => document.getElementById(uid);

  return {
    oninit: function (vnode) {},
    oncreate: function (vnode) {
      getEl().appendChild(chart(options()));
      m.redraw();
    },
    onupdate: function (vnode) {
        getEl().innerHTML = "";
        console.time("redraw");
        getEl().appendChild(chart(options()));
        console.timeEnd("redraw");
    },
    onbeforeremove: function (vnode) {
      getEl().innerHTML = "";
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
