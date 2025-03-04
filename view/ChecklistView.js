import { routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { _t } from "../model/I18n.js";
import { Settings } from "../model/Settings.js";
import { TaxonView } from "../view/TaxonView.js";
import { AppLayoutView } from "./AppLayoutView.js";

export let ChecklistView = {
  itemsNumberStep: 50,
  totalItemsToShow: 0,
  lastQuery: "",
  displayMode: "", // either "" (display all) or name of any taxon level

  oninit: function () {
    ChecklistView.lastQuery = JSON.stringify(Checklist.queryKey());
    ChecklistView.totalItemsToShow = this.itemsNumberStep;
  },
  view: function () {
    let display =
      AppLayoutView.mobile() && AppLayoutView.display != "checklist"
        ? "display: none; "
        : "";

    if (!Checklist._isDataReady) {
      return m(".checklist[style=" + display + "]");
    }

    let currentQuery = JSON.stringify(Checklist.queryKey());

    if (m.route.param("q") && m.route.param("q").length > 0) {
      currentQuery = decodeURI(m.route.param("q"));
    }

    if (currentQuery != ChecklistView.lastQuery) {
      let q = {};
      try {
        q = JSON.parse(currentQuery);
      } catch (ex) {
        console.error("Malformed url query");
        routeTo("/checklist", "");
      }

      Checklist.filter.setFromQuery(q);

      ChecklistView.totalItemsToShow = ChecklistView.itemsNumberStep;
      ChecklistView.lastQuery = currentQuery;
      window.setTimeout(function () {
        if (
          document.getElementsByClassName("listed-taxa") &&
          document.getElementsByClassName("listed-taxa").length > 0
        ) {
          document.getElementsByClassName("listed-taxa")[0].scrollTo(0, 0);
        }
      }, 100);
    }

    let allResultingTaxa = Checklist.getTaxaForCurrentQuery();

    let treeTaxa = Checklist.treefiedTaxa(allResultingTaxa);

    let checklistDisplay = null;

    if (Settings.viewType() === "view_details") {
      checklistDisplay = DetailsView(allResultingTaxa, treeTaxa);
    }

    if (Settings.viewType() === "view_sunburst") {
      checklistDisplay = m(".checklist", "sunburst");
    }

    if (Settings.viewType() === "view_hierarchy") {
      checklistDisplay = HierarchyView(allResultingTaxa, treeTaxa);
    }

    return m(
      ".checklist[style=" +
        display +
        "background: linear-gradient(45deg, " +
        Checklist.getThemeHsl("dark") +
        ", " +
        Checklist.getThemeHsl("light") +
        ");]",
      m(".checklist-inner-wrapper", [
        allResultingTaxa.length == 0
          ? m(".nothing-found-wrapper", [
              m("h2", _t("nothing_found_oops")),
              m("img.search-world[src=img/ui/checklist/search_world.svg]"),
              m(".nothing-found-message", _t("nothing_found_checklist")),
              m(
                ".query",
                m.trust(
                  Settings.pinnedSearches.getHumanNameForPinnedItem(
                    JSON.parse(Checklist.queryKey())
                  )
                )
              ),
            ])
          : m(".checklist-inner-wrapper", [
              Checklist._isDraft ? draftNotice() : null,
              ChecklistView.displayMode != "" ? temporaryFilterNotice() : null,
              m(checklistDisplay),
            ]),
      ])
    );
  },
};

function HierarchyView(allResultingTaxa, treeTaxa) {
  console.log(allResultingTaxa, treeTaxa);

  return {
    oncreate: function (vnode) {
      let data = {
        name: "◯",
        children: [],
      };

      const maxDepth = Object.keys(Checklist.getTaxaMeta()).indexOf(
        ChecklistView.displayMode
      );

      for (const taxon of allResultingTaxa) {
        let currentDataItem = data;
        let depth = 0;
        for (const taxonLevel of taxon.t) {
          if (!currentDataItem.children) {
            currentDataItem.children = [];
          }

          let child = currentDataItem.children.find(
            (i) => i.name == taxonLevel.n
          );
          if (child === undefined) {
            child = { name: taxonLevel.n, value: 1 };
            currentDataItem.children.push(child);
          }

          currentDataItem = child;

          if (maxDepth == depth) {
            break;
          }
          depth++;
        }
      }

      let svgx = graph(data)

      vnode.dom.appendChild(svgx);

      // Specify the chart’s dimensions.
      const width = 1000;
      const height = width;
      const cx = width * 0.5; // adjust as needed to fit
      const cy = height * 0.5; // adjust as needed to fit
      const radius = Math.min(width, height) / 2 - 200;

      // Create a radial tree layout. The layout’s first dimension (x)
      // is the angle, while the second (y) is the radius.
      const tree = d3
        .tree()
        .size([2 * Math.PI, radius])
        .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth);

      // Sort the tree and apply the layout.
      const root = tree(
        d3
          .hierarchy(data)
          .sort((a, b) => d3.ascending(a.data.name, b.data.name))
      );

      // Creates the SVG container.
      const svg = d3
        .create("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [-cx, -cy, width, height])
        .attr("style", "width: 100%; height: auto; font: 10px sans-serif;");

      // Append links.
      svg
        .append("g")
        .attr("fill", "none")
        .attr("stroke", "white")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-width", 1.5)
        .selectAll()
        .data(root.links())
        .join("path")
        .attr(
          "d",
          d3
            .linkRadial()
            .angle((d) => d.x)
            .radius((d) => d.y)
        );

      // Append nodes.
      svg
        .append("g")
        .selectAll()
        .data(root.descendants())
        .join("circle")
        .attr(
          "transform",
          (d) => `rotate(${(d.x * 180) / Math.PI - 90}) translate(${d.y},0)`
        )
        .attr("fill", (d) => (d.children ? "#555" : "#999"))
        .attr("r", 2.5);

      // Append labels.
      svg
        .append("g")
        .attr("stroke-linejoin", "round")
        .attr("stroke-width", 3)
        .selectAll()
        .data(root.descendants())
        .join("text")
        .attr(
          "transform",
          (d) =>
            `rotate(${(d.x * 180) / Math.PI - 90}) translate(${d.y},0) rotate(${
              d.x >= Math.PI ? 180 : 0
            })`
        )
        .attr("dy", "0.31em")
        .attr("x", (d) => (d.x < Math.PI === !d.children ? 6 : -6))
        .attr("text-anchor", (d) =>
          d.x < Math.PI === !d.children ? "start" : "end"
        )
        .attr("paint-order", "stroke")
        //.attr("stroke", "white")
        .attr("fill", "white")
        .text((d) => d.data.name);

      //d3.select(vnode.dom).append(svg);
      vnode.dom.appendChild(svg.node());
    },
    view: function (vnode) {
      return m("div[style=overflow: auto;]");
    },
  };
}

function graph(data) {

    console.log(data)

  let root = data;

  let x0 = Infinity;
  let x1 = -x0;
  root.each((d) => {
    if (d.x > x1) x1 = d.x;
    if (d.x < x0) x0 = d.x;
  });

  const svg = d3
    .create("svg")
    .attr("viewBox", [0, 0, width, x1 - x0 + dx * 2])
    .style("overflow", "visible");

  const g = svg
    .append("g")
    .attr("font-family", "sans-serif")
    .attr("font-size", 10)
    .attr("transform", `translate(${marginLeft},${dx - x0})`);

  const link = g
    .append("g")
    .attr("fill", "none")
    .attr("stroke", "#555")
    .attr("stroke-opacity", 0.4)
    .attr("stroke-width", 1.5)
    .selectAll("path")
    .data(root.links())
    .join("path")
    .attr("stroke", (d) =>
      highlight(d.source) && highlight(d.target) ? "red" : null
    )
    .attr("stroke-opacity", (d) =>
      highlight(d.source) && highlight(d.target) ? 1 : null
    )
    .attr("d", treeLink);

  const node = g
    .append("g")
    .attr("stroke-linejoin", "round")
    .attr("stroke-width", 3)
    .selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("transform", (d) => `translate(${d.y},${d.x})`);

  node
    .append("circle")
    .attr("fill", (d) => (highlight(d) ? "red" : d.children ? "#555" : "#999"))
    .attr("r", 2.5);

  node
    .append("text")
    .attr("fill", (d) => (highlight(d) ? "red" : null))
    .attr("stroke", "white")
    .attr("paint-order", "stroke")
    .attr("dy", "0.31em")
    .attr("x", (d) => (d.children ? -6 : 6))
    .attr("text-anchor", (d) => (d.children ? "end" : "start"))
    .text(label);

  return svg.node();
}

function DetailsView(allResultingTaxa, treeTaxa) {
  return {
    view: function (vnode) {
      let overflowing = 0;
      if (
        ChecklistView.displayMode == "" &&
        allResultingTaxa.length > ChecklistView.totalItemsToShow
      ) {
        overflowing = allResultingTaxa.length - ChecklistView.totalItemsToShow;
        allResultingTaxa = allResultingTaxa.slice(
          0,
          ChecklistView.totalItemsToShow
        );
      }

      return m(".listed-taxa", [
        Object.keys(treeTaxa.children).map(function (taxonLevel) {
          return m(TaxonView, {
            parents: [],
            taxonKey: taxonLevel,
            taxonTree: treeTaxa.children[taxonLevel],
            currentLevel: 0,
            displayMode: ChecklistView.displayMode,
          });
        }),
        overflowing > 0
          ? m(
              ".show-more-items",
              {
                onclick: function () {
                  ChecklistView.totalItemsToShow +=
                    ChecklistView.itemsNumberStep;
                },
              },
              _t(
                "next_items_checklist",
                overflowing < ChecklistView.itemsNumberStep
                  ? overflowing
                  : ChecklistView.itemsNumberStep
              )
            )
          : null,
      ]);
    },
  };
}

function draftNotice() {
  return m(
    ".temporary-notice",
    {
      onclick: function () {
        ChecklistView.displayMode = "";
      },
    },
    [
      m(".notice", _t("draft_notice")),
      m(
        "button.show-all",
        {
          onclick: function () {
            routeTo("/manage");
          },
        },
        [
          m("img.notice-icon[src=img/ui/menu/manage.svg]"),
          _t("temporary_draft_goto_manage"),
        ]
      ),
    ]
  );
}

function temporaryFilterNotice() {
  return m(
    ".temporary-notice",
    {
      onclick: function () {
        ChecklistView.displayMode = "";
      },
    },
    [
      m(
        ".notice",
        m.trust(
          _t("temporary_filter", [
            Checklist.getTaxaMeta()[ChecklistView.displayMode].name,
          ])
        )
      ),
      m("button.show-all", [
        m("img.notice-icon[src=img/ui/menu/filter_list_off.svg]"),
        _t("temporary_filter_show_all"),
      ]),
    ]
  );
}
