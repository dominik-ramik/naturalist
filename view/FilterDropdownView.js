import { copyToClipboard, roundWithPrecision, textLowerCaseAccentless } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { _t } from "../model/I18n.js";
import { AppLayoutView } from "./AppLayoutView.js";


export let FilterDropdown = function(initialVnode) {
    let _open = false;
    let filterDropdownId = "";
    let color = "#263238";
    let title = "?";
    let type = "";
    let dataPath = "";

    function setOpen(isOpen) {
        _open = isOpen;
        if (_open) {
            Checklist.filter.delayCommitDataPath = "";
        }
    }

    function isOpen() {
        return _open;
    }

    return {
        attachMenuClosingEventListener() {
            document.addEventListener('click', function(event) {
                let thisDropdown = document.getElementById(filterDropdownId);
                if (!thisDropdown) {
                    return;
                }
                if (event.target == thisDropdown || thisDropdown.contains(event.target)) {
                    return;
                }

                setOpen(false);
                m.redraw();
            }, { once: true });
        },

        oninit: function(vnode) {
            color = vnode.attrs.color;
            title = vnode.attrs.title;
            type = vnode.attrs.type; // "taxa" or "data"
            dataPath = vnode.attrs.dataPath;

            filterDropdownId = (Math.random() + 1).toString(36).substring(2);
        },
        oncreate: function(vnode) {
            this.attachMenuClosingEventListener();
        },
        onupdate: function(vnode) {
            this.attachMenuClosingEventListener();
        },
        view: function(vnode) {
            if (dataPath == "size.wingspan.male") {
                //_open = true;
            }

            let detectedUiType = "text";

            if (type == "data" && Checklist.getDataMeta()[dataPath].contentType == "number") {
                detectedUiType = "number";
            };

            let showOrb = false;
            if (Checklist.filter[type][dataPath].type == "text" && Checklist.filter[type][dataPath].selected.length > 0) {
                showOrb = true;
            }
            if (Checklist.filter[type][dataPath].type == "number" && Checklist.filter[type][dataPath].numeric.operation != "") {
                showOrb = true;
            }

            return [
                AppLayoutView.mobile() && isOpen() ? m(".filter-dropdown-backdrop", {
                    onclick: function(e) {}
                }) : null,
                m(".filter-dropdown[tabindex=0][id=" + filterDropdownId + "]", [
                    m(".label", {
                        onclick: function() {
                            setOpen(!isOpen());

                            if (!AppLayoutView.mobile()) {
                                if (isOpen()) {
                                    window.setTimeout(function() {
                                        if (document.getElementById(filterDropdownId + "_inner_text")) {
                                            document.getElementById(filterDropdownId + "_inner_text").focus();
                                        }
                                    }, 200);
                                }
                            }
                        },
                    }, [
                        m(".arrow", m("img[src=./img/ui/search/expand.svg]")),
                        m(".title", title),
                        m(".orb" + (showOrb ? "[style=background-color: " + color + "; color: white]" : ""), m.trust("&nbsp;")),
                        m(".count", Object.keys(Checklist.filter[type][dataPath].possible).length),
                        type == "taxa" ? m("img.clickable.copy[title=" + _t("copy_taxa_dropdown", [title]) + "][src=img/ui/search/copy.svg]", {
                            onclick: function(e) {
                                let listOfTaxa = Object.keys(Checklist.filter[type][dataPath].possible).sort().join("\n");

                                copyToClipboard(listOfTaxa, _t("list_of_taxa", [title]));
                                e.stopPropagation();
                            }
                        }) : null,
                    ]),
                    isOpen() ? m(Dropdown, { openHandler: setOpen, type: type, dataPath: dataPath, color: color, ui: detectedUiType, dropdownId: filterDropdownId + "_inner" }) : null,
                ])
            ];
        }
    }
}

let Dropdown = function(initialVnode) {
    let dropdownId = "";
    let type = "";
    let dataPath = "";

    return {
        rectifyPosition: function() {
            let listElm = document.getElementById(dropdownId);
            if (listElm) {
                let listPosition = listElm.getBoundingClientRect();

                let bottomOverflow = (listPosition.height + listPosition.top) - window.innerHeight;
                if (bottomOverflow > 0) {
                    listElm.style.top = (-1 * bottomOverflow + listElm.parentElement.getBoundingClientRect().height) + "px";
                }
            }
        },

        oninit: function(vnode) {
            dropdownId = vnode.attrs.dropdownId;
            type = vnode.attrs.type;
            dataPath = vnode.attrs.dataPath;
        },
        onupdate: function(vnode) {
            this.rectifyPosition();
        },
        view: function(vnode) {
            let innerDropdown = null;
            switch (vnode.attrs.ui) {
                case "text":
                    innerDropdown = m(DropdownText, { openHandler: vnode.attrs.openHandler, type: type, dataPath: dataPath, color: vnode.attrs.color, dropdownId: dropdownId });
                    break;
                case "number":
                    innerDropdown = m(DropdownNumber, { openHandler: vnode.attrs.openHandler, type: type, dataPath: dataPath, dropdownId: dropdownId });
                    break;
                default:
                    console.log("Unknown dropdown type: " + vnode.attrs.ui);
                    break;
            }

            return m(".dropdown-area[id=" + dropdownId + "]", innerDropdown);
        }
    }
}

let DropdownText = function(initialVnode) {
    let filter = ""; //always in lowerCase and .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    let initialOverflowLimit = 100;
    let itemsOverflowLimit = initialOverflowLimit;

    function matchesFilter(text) {
        if (filter == "") {
            return true;
        }

        text = textLowerCaseAccentless(text);

        if (text.startsWith(filter)) {
            return true;
        }

        if (text.indexOf(" " + filter) > 1) {
            return true;
        }

        return false;
    }

    function sortByCustomOrder(array, type, dataPath) {
        let result = array.sort();

        let guideArray = [];
        if (type == "taxa") {
            guideArray = Checklist.getTaxaMeta()[dataPath].searchCategoryOrder;
        } else if (type == "data") {
            guideArray = Checklist.getMetaForDataPath(dataPath).searchCategoryOrder;
        }

        if (guideArray.length > 0) {
            result = result.sort(function(a, b) {
                if (guideArray.indexOf(a.toLowerCase()) < 0) {
                    return 1;
                }
                if (guideArray.indexOf(b.toLowerCase()) < 0) {
                    return -1;
                }
                return guideArray.indexOf(a.toLowerCase()) - guideArray.indexOf(b.toLowerCase());
            });
        }
        return result;
    }

    return {
        oninit: function(vnode) {
            itemsOverflowLimit = initialOverflowLimit;
        },
        view: function(vnode) {
            let type = "";
            let dataPath = "";
            let color = "";

            type = vnode.attrs.type;
            dataPath = vnode.attrs.dataPath;
            color = vnode.attrs.color;

            let totalItems = 0;
            let itemsOverflowing = false;
            let totalPossibleUnchecked = 0;
            let filteredPossible = [];

            let showSelected = false;
            let selected = sortByCustomOrder(Checklist.filter[type][dataPath].selected, type, dataPath).map(function(item) {
                if (!matchesFilter(item)) {
                    return null;
                }
                if (Object.keys(Checklist.filter[type][dataPath].possible).indexOf(item) < 0) {
                    return null;
                }
                showSelected = true;
                return m(DropdownCheckItem, { state: "checked", type: type, dataPath: dataPath, item: item, count: Checklist.filter[type][dataPath].possible[item] });
            });
            let showPossible = false;
            let possible = sortByCustomOrder(Object.keys(Checklist.filter[type][dataPath].possible), type, dataPath).map(function(item) {
                if (!matchesFilter(item)) {
                    return null;
                }
                if (Checklist.filter[type][dataPath].selected.indexOf(item) >= 0) {
                    return null;
                };
                if (totalItems > itemsOverflowLimit) {
                    itemsOverflowing = true;
                    return null;
                }
                showPossible = true;
                totalItems++;
                totalPossibleUnchecked++;
                filteredPossible.push(item);
                return m(DropdownCheckItem, { state: "unchecked", type: type, dataPath: dataPath, item: item, count: Checklist.filter[type][dataPath].possible[item] });
            });
            let showImpossible = false;
            let impossible = sortByCustomOrder(Checklist.filter[type][dataPath].all, type, dataPath).filter(x => !Object.keys(Checklist.filter[type][dataPath].possible).includes(x)).map(function(item) {
                if (!matchesFilter(item)) {
                    return null;
                }
                if (totalItems > itemsOverflowLimit) {
                    itemsOverflowing = true;
                    return null;
                }
                showImpossible = true;
                totalItems++;
                return m(DropdownCheckItem, { state: "inactive", type: type, dataPath: dataPath, item: item, count: 0 });
            });

            return m(".inner-dropdown-area", [
                m(".search-filter", m("input.options-search[type=search][placeholder=" + _t("search") + "][id=" + vnode.attrs.dropdownId + "_text]", {
                    oninput: function() {
                        filter = this.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    }
                })),
                m(".options", [
                    showSelected ? m(".options-section[style=background-color: " + vnode.attrs.color + "20;]", selected) : null,
                    showPossible ? m(".options-section", possible) : null,
                    showImpossible ? m(".options-section", impossible) : null,
                    itemsOverflowing ? m(".show-next-items", {
                        onclick: function() {
                            itemsOverflowLimit = itemsOverflowLimit + initialOverflowLimit;
                            console.log(itemsOverflowLimit);
                        }
                    }, _t("next_items_dropdown", [initialOverflowLimit])) : null,
                    (showSelected + showPossible + showImpossible) == 0 ? m(".no-items-filter", _t("no_items_filter")) : null
                ]),
                filter.length > 0 && totalPossibleUnchecked > 1 ? m(".apply", {
                    onclick: function() {
                        Checklist.filter[type][dataPath].selected = Checklist.filter[type][dataPath].selected.concat(filteredPossible);
                        console.log(Checklist.filter[type][dataPath].selected);
                    }
                }, _t("check_all_shown")) : null,
                AppLayoutView.mobile() ? m(".apply", {
                    onclick: function() {
                        vnode.attrs.openHandler(false);
                    }
                }, _t("apply_selection")) : null
            ]);
        }
    }
}

let DropdownCheckItem = function(initialVnode) {
    return {
        view: function(vnode) {
            if (vnode.attrs.item.trim() == "") {
                return null;
            }

            return m(".option-item" + (vnode.attrs.state == "inactive" ? ".inactive" : ""), {
                onclick: function(e) {
                    switch (vnode.attrs.state) {
                        case "checked":
                            const index = Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].selected.indexOf(vnode.attrs.item);
                            if (index > -1) { // only splice array when item is found
                                Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].selected.splice(index, 1);
                                Checklist.filter.commit();
                            }
                            break;
                        case "unchecked":
                            Checklist.filter.delayCommitDataPath = vnode.attrs.type + "." + vnode.attrs.dataPath;
                            Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].selected.push(vnode.attrs.item);
                            Checklist.filter.commit();
                            break;
                        case "inactive":
                            //inactive, do nothing
                            return;
                            break;
                        default:
                            break;
                    }
                }
            }, [
                m("img.item-checkbox[src=img/ui/search/checkbox_" + (vnode.attrs.state == "checked" ? "checked" : "unchecked") + ".svg]"),
                m(".item-label", vnode.attrs.item),
                m(".item-count", vnode.attrs.count),
            ]);
        }
    }
}

let DropdownNumber = function(initialVnode) {
    let dataPath = "";
    let initialThresholds = [null, null, null];
    let actualThresholds = [null, null, null];
    let actualOperation = "";
    let thresholdsShown = 0;
    let dropdownId = initialVnode.attrs.dropdownId;

    function countResults() {
        let results = 0;

        if (actualOperation == "") {
            return 0;
        }

        let comparer = Checklist.filter.numericFilters[actualOperation].comparer;

        Checklist.filter.data[dataPath].possible.forEach(function(value) {
            if (comparer(value, actualThresholds[1], actualThresholds[2])) {
                results++;
            }
        });

        return results;
    }

    function inputsOk() {
        let inputsOk = true;

        for (let thresholdIndex = 0; thresholdIndex < thresholdsShown; thresholdIndex++) {
            let index = thresholdIndex + 1;
            if (typeof actualThresholds[index] !== "number" || isNaN(actualThresholds[index])) {
                inputsOk = false;
            }
        }

        return inputsOk;
    }

    function canApply() {
        return inputsOk() && countResults() > 0;
    }

    function numericInput(thresholdNumber, min, max) {
        let currentValue = null;
        thresholdsShown++;

        if (initialThresholds[thresholdNumber] === null) {
            if (actualThresholds[thresholdNumber] === null) {
                currentValue = null;
            } else {
                currentValue = actualThresholds[thresholdNumber];
            }
        } else {
            currentValue = initialThresholds[thresholdNumber];
        }

        let isInputError = false;
        if (typeof actualThresholds[thresholdNumber] !== "number" || isNaN(actualThresholds[thresholdNumber])) {
            isInputError = true;
        }
        if (actualOperation == "between" && thresholdNumber == 2 && currentValue !== null && currentValue < actualThresholds[1]) {
            isInputError = true;
        }
        if (actualOperation == "around" && thresholdNumber == 2 && currentValue !== null && currentValue <= 0) {
            isInputError = true;
        }

        return m("input" + (actualThresholds[thresholdNumber] !== null && isInputError ? ".error" : "") + "[id=threshold" + thresholdNumber + "_" + dropdownId + "][type=text][name=threshold" + thresholdNumber + "][increment=1][min=" + min + "][max=" + max + "]" + (currentValue !== null ? "[value=" + currentValue + "]" : ""), {
            oninput: function() {
                initialThresholds[thresholdNumber] = null;

                let inputValue = this.value;

                if (inputValue.endsWith(".") || inputValue.endsWith(",")) {
                    //leave it as it is, user is typing a decimal
                } else if (isFinite(inputValue.replace(",", ".")) && inputValue.trim() !== "") {
                    inputValue = parseFloat(inputValue.replace(",", "."));
                }

                actualThresholds[thresholdNumber] = inputValue;
            }
        });
    }

    function drawHistogram(dataAll, dataPossible) {
        dataAll = dataAll.filter(function(item) {
            if (item !== null && item !== undefined && !isNaN(item)) {
                return item;
            }
        });
        dataPossible = dataPossible.filter(function(item) {
            if (item !== null && item !== undefined && !isNaN(item)) {
                return item;
            }
        });


        let wrapper = document.getElementById("histogram_" + dropdownId);
        if (wrapper.getElementsByTagName("svg").length > 0) {
            for (const element of wrapper.getElementsByTagName("svg")) {
                element.remove();
            };
        }

        let margin = { top: 10, right: 10, bottom: 40, left: 30 };
        let width = wrapper.getBoundingClientRect().width - margin.left - margin.right;
        let height = wrapper.getBoundingClientRect().height - margin.top - margin.bottom;

        // append the svg object to the body of the page
        let svg = d3.select("#histogram_" + dropdownId)
            .append("svg")
            .attr("viewBox", "0 0 " + wrapper.getBoundingClientRect().width + " " + wrapper.getBoundingClientRect().height)
            .attr("style", "background-color: white;")
            .attr("class", "clickable")
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")")

        // get the data

        // X axis: scale and draw:
        let x = d3.scaleLinear()
            .domain([Math.min(...dataAll), Math.max(...dataAll)]) // can use this instead of 1000 to have the max of data: d3.max(data, function(d) { return +d.price })
            .range([0, width]);
        svg.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x))
            .selectAll("text").style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(-65)");

        // set the parameters for the histogram
        let histogram = d3.histogram()
            .value(function(d) { return d; }) // I need to give the vector of value
            .domain(x.domain()) // then the domain of the graphic
            .thresholds(x.ticks(15)); // then the numbers of bins

        // And apply this function to data to get the bins
        let bins = histogram(dataAll);
        let bins2 = histogram(dataPossible);

        // Y axis: scale and draw:
        let y = d3.scaleLinear()
            .range([height, 0]);
        y.domain([0, d3.max(bins, function(d) { return d.length; })]); // d3.hist has to be called before the Y axis obviously
        svg.append("g")
            .call(d3.axisLeft(y));

        // append the bar rectangles to the svg element
        svg.selectAll("rect")
            .data(bins)
            .enter()
            .append("rect")
            .attr("x", 1)
            .attr("transform", function(d) { return "translate(" + x(d.x0) + "," + y(d.length) + ")"; })
            .attr("width", function(d) { return x(d.x1) - x(d.x0) - 1; })
            .attr("height", function(d) { return height - y(d.length); })
            .style("fill", "#d3d3d3");

        svg.selectAll("rect2")
            .data(bins2)
            .enter()
            .append("rect")
            .attr("x", 1)
            .attr("transform", function(d) { return "translate(" + x(d.x0) + "," + y(d.length) + ")"; })
            .attr("width", function(d) { return x(d.x1) - x(d.x0) - 1; })
            .attr("height", function(d) { return height - y(d.length); })
            .style("fill", Checklist.getThemeHsl("light"))
            .style("opacity", 0.6)
    }

    return {
        oninit: function(vnode) {
            dataPath = vnode.attrs.dataPath;
            initialThresholds[1] = Checklist.filter.data[vnode.attrs.dataPath].numeric.threshold1;
            initialThresholds[2] = Checklist.filter.data[vnode.attrs.dataPath].numeric.threshold2;
            actualThresholds = [null, initialThresholds[1], initialThresholds[2]];
            actualOperation = Checklist.filter.data[vnode.attrs.dataPath].numeric.operation;
        },
        oncreate: function() {
            drawHistogram(Checklist.filter.data[dataPath].all, Checklist.filter.data[dataPath].possible);
        },
        onupdate: function() {
            //drawChart();
        },
        view: function(vnode) {
            let dataPath = "";
            let color = "";

            dataPath = vnode.attrs.dataPath;
            color = vnode.attrs.color;

            let inputUi = null;

            thresholdsShown = 0;
            let distinct = new Set(Checklist.filter.data[dataPath].possible).size;
            let min = Checklist.filter.data[dataPath].min === null ? Checklist.filter.data[dataPath].globalMin : Checklist.filter.data[dataPath].min;
            let max = Checklist.filter.data[dataPath].max === null ? Checklist.filter.data[dataPath].globalMax : Checklist.filter.data[dataPath].max;
            let avg = 0;
            const sum = Checklist.filter.data[dataPath].possible.reduce((a, b) => a + b, 0);
            avg = roundWithPrecision((sum / Checklist.filter.data[dataPath].possible.length) || 0, 2);

            switch (actualOperation) {
                case "":
                    inputUi = [
                        m(".label1.centered", _t("numeric_filter_select")),
                    ];
                    break;
                case "equal":
                    inputUi = [
                        m(".label1", _t("numeric_filter_equal")),
                        numericInput(1, min, max),
                    ];
                    break;
                case "lesser":
                    inputUi = [
                        m(".label1", _t("numeric_filter_lesser")),
                        numericInput(1, min, max),
                    ];
                    break;
                case "lesserequal":
                    inputUi = [
                        m(".label1", _t("numeric_filter_lesserequal")),
                        numericInput(1, min, max),
                    ];
                    break;
                case "greater":
                    inputUi = [
                        m(".label1", _t("numeric_filter_greater")),
                        numericInput(1, min, max),
                    ];
                    break;
                case "greaterequal":
                    inputUi = [
                        m(".label1", _t("numeric_filter_greaterequal")),
                        numericInput(1, min, max),
                    ];
                    break;
                case "between":
                    inputUi = [
                        m(".label1", _t("numeric_filter_between")),
                        numericInput(1, min, max),
                        m(".label2", _t("numeric_filter_and")),
                        numericInput(2, min, max),
                    ];
                    break;
                case "around":
                    inputUi = [
                        m(".label1", _t("numeric_filter_around")),
                        numericInput(1, min, max),
                        m(".label2", _t("numeric_filter_plusminus")),
                        numericInput(2, min, max),
                    ];
                    break;
                default:
                    break;
            }

            return m(".inner-dropdown-area.numeric", [
                m(".numeric-filter-buttons", [
                    Object.keys(Checklist.filter.numericFilters).map(function(filterKey) {
                        return [m(".numeric-filter-button.clickable" + (actualOperation == filterKey ? ".selected" : ""), {
                                onclick: function() {
                                    actualOperation = filterKey;
                                    window.setTimeout(function() {
                                        document.getElementById("threshold1_" + dropdownId).focus();
                                        document.getElementById("threshold1_" + dropdownId).select();
                                    }, 200);
                                }
                            }, m("img[src=img/ui/search/numeric_" + Checklist.filter.numericFilters[filterKey].icon + ".svg]")),
                            (filterKey == "equal" || filterKey == "greaterequal") ? m(".separator") : null
                        ];
                    })
                ]),
                m(".input-ui", [
                    inputUi,
                    actualOperation == "" ? null : m(".clear-button.clickable", {
                        onclick: function() {
                            actualOperation = "";
                            Checklist.filter.data[dataPath].numeric.operation = "";
                            initialThresholds = [null, null, null];
                            Checklist.filter.data[dataPath].numeric.threshold1 = null;
                            Checklist.filter.data[dataPath].numeric.threshold2 = null;
                            Checklist.filter.commit();
                            window.setTimeout(function() {
                                drawHistogram(Checklist.filter.data[dataPath].all, Checklist.filter.data[dataPath].possible);
                            }, 200);
                        }
                    }, m("img[src=img/ui/search/clear_filter_dark.svg]"))
                ]),
                actualOperation == "" ? null : m(".apply.clickable" + ((actualOperation == "" || !canApply()) ? ".inactive" : ""), {
                    onclick: function() {
                        if (actualOperation != "" && canApply()) {
                            Checklist.filter.data[dataPath].numeric.operation = actualOperation;
                            Checklist.filter.data[dataPath].numeric.threshold1 = actualThresholds[1];
                            Checklist.filter.data[dataPath].numeric.threshold2 = actualThresholds[2];
                            vnode.attrs.openHandler(false);
                            Checklist.filter.commit();
                        }
                    }
                }, countResults() == 0 ? _t("numeric_apply_show_results_no_results") : _t("numeric_apply_show_results", [countResults()])),
                m(".histogram-wrap", [
                    m(".histogram#histogram_" + dropdownId + ".image-wrap", {
                        onclick: function(e) {
                            this.classList.toggle("fullscreen");
                            this.getElementsByTagName("svg")[0].classList.toggle("clickable");
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }),
                    m(".legend", [
                        m(".legend-item", [
                            m(".map-fill[style=background-color: #d3d3d3]"),
                            m(".map-legend-title", _t("histogram_all_data"))
                        ]),
                        m(".legend-item", [
                            m(".map-fill[style=background-color: " + Checklist.getThemeHsl("light") + "]"),
                            m(".map-legend-title", _t("histogram_displayed_data"))
                        ]),
                    ])
                ]),
                m("ul.stats", [
                    m("li", _t("stats_min") + ": " + min.toLocaleString()),
                    m("li", _t("stats_max") + ": " + max.toLocaleString()),
                    m("li", _t("stats_avg") + ": " + avg.toLocaleString()),
                    m("li", _t("stats_distinct") + ": " + distinct.toLocaleString()),
                ]),
            ]);
        }
    }
}