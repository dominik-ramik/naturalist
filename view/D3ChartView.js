export let D3ChartView = function (initialVnode) {
  const uid = initialVnode.attrs.id;
  let chart = initialVnode.attrs.chart;
  let options = initialVnode.attrs.options;
  let parentWidth = 0;
  let parentHeight = 0;

  let dataLevel = 50

  function dataLevelSet(level){
    dataLevel = level
    oldDataString = ""
  }

  function reportWindowSize() {
    let tmpChartEl = getEl().firstChild;

    getEl().innerHTML = "";
    getEl().style.width = "0px";
    getEl().style.height = "0px";
    getEl().style.width =
      getEl().parentElement.getBoundingClientRect().width + "px";
    getEl().style.height =
      getEl().parentElement.getBoundingClientRect().height + "px";
    getEl().appendChild(tmpChartEl);
  }

  function downloadSVG() {
    var svgData = getEl().innerHTML;
    var svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    var svgUrl = URL.createObjectURL(svgBlob);
    var downloadLink = document.createElement("a");
    downloadLink.href = svgUrl;
    downloadLink.download = "naturalist-chart.svg";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }

  function changeChartZoom(offset) {
    let width = getEl().firstChild.style.width.replace("%", "");
    getEl().firstChild.style.width = parseInt(width) + offset + "%";
  }

  window.onresize = reportWindowSize;

  const getEl = () => document.getElementById(uid);

  let oldDataString = "";

  return {
    oninit: function (vnode) {
    },
    oncreate: function (vnode) {
      parentWidth = getEl().parentElement.getBoundingClientRect().width;
      parentHeight = getEl().parentElement.getBoundingClientRect().height;
      getEl().appendChild(chart(options(), dataLevel));
      m.redraw()
    },
    onupdate: function (vnode) {
      let newDataString = JSON.stringify(options().dataSource);
      if (
        oldDataString.length != newDataString.length &&
        oldDataString != newDataString
      ) {
        getEl().innerHTML = "";
        getEl().appendChild(chart(options(), dataLevel));
        oldDataString = newDataString;
      }
    },
    onbeforeremove: function (vnode) {
      getEl().innerHTML = "";
    },
    view: function (vnode) {
      return m(
        "div[style=display: flex; flex-direction: column; flex-wrap: nowrap; flex-grow: 1;]",
        [
          m(
            "button",
            {
              onclick: (e) => {
                downloadSVG();
                e.redraw = false;
              },
            },
            "Download SVG"
          ),
          m(
            "button",
            {
              onclick: (e) => {
                changeChartZoom(+15);
              },
            },
            "+"
          ),
          m(
            "button",
            {
              onclick: (e) => {
                changeChartZoom(-15);
              },
            },
            "-"
          ),
          m("div", [
            m(
              "button",
              {
                onclick: (e) => {
                  dataLevelSet(1);
                },
              },
              "1"
            ),
            m(
              "button",
              {
                onclick: (e) => {
                  dataLevelSet(2);
                },
              },
              "2"
            ),
            m(
              "button",
              {
                onclick: (e) => {
                  dataLevelSet(3);
                },
              },
              "3"
            ),
            m(
              "button",
              {
                onclick: (e) => {
                  dataLevelSet(4);
                },
              },
              "4"
            ),
            m(
              "button",
              {
                onclick: (e) => {
                  dataLevelSet(5);
                },
              },
              "5"
            ),
          ]),
          m(
            ".chart-wrapper[style=flex-grow: 1; background-color: rgb(37, 50, 65)]",
            m(
              "div[id=" +
                uid +
                "][style=overflow: auto; max-width: 100%; width: " +
                parentWidth +
                "px; height: " +
                parentHeight +
                "px ]"
            )
          ),
        ]
      );
    },
  };
};
