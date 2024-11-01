import { nlDataStructure } from "../model/DataManagerData.js";

let doc = "";

doc += renderSheet(nlDataStructure.sheets.appearance);
doc += renderSheet(nlDataStructure.sheets.content);

document.getElementById("docgen").innerHTML = doc;

document.getElementById("toc").innerHTML = generateToc();

function generateToc() {
    var toc = "";
    var level = 0;
    var maxLevel = 3;

    document.getElementById("docs-content").innerHTML =
        document.getElementById("docs-content").innerHTML.replace(
            /<h([\d])>([^<]+)<\/h([\d])>/gi,
            function(str, openLevel, titleText, closeLevel) {
                if (openLevel != closeLevel) {
                    c.log(openLevel)
                    return str + ' - ' + openLevel;
                }

                if (openLevel > level) {
                    toc += (new Array(openLevel - level + 1)).join("<ol>");
                } else if (openLevel < level) {
                    toc += (new Array(level - openLevel + 1)).join("</ol>");
                }

                level = parseInt(openLevel);

                var anchor = titleText.replace(/ /g, "_");
                toc += "<li><a href=\"#" + anchor + "\">" + titleText +
                    "</a></li>";

                return "<h" + openLevel + "><a name=\"" + anchor + "\">" +
                    titleText + "</a></h" + closeLevel + "><p class=\"scroll-to-top\"><a href=\"#top\">↑ Scroll to the top</a></p>";
            }
        );

    if (level) {
        toc += (new Array(level + 1)).join("</ol>");
    }

    return toc;

}

function renderSheet(sheet) {
    let doc = "";

    doc += "<h2>Sheet '" + sheet.name + "'</h2>";
    doc += "<p>" + sheet.description.replaceAll("\n", "</p><p>") + "</p>";

    Object.keys(sheet.tables).forEach(function(tableKey) {
        doc += renderTable(sheet.tables[tableKey], tableKey);
    });


    return doc;
}

function renderTable(table, tableKey) {
    let doc = "";

    doc += "<h3 id=\"table-" + tableKey + "\">Table '" + table.name + "'</h3>";
    doc += "<p>" + table.description.replaceAll("\n", "</p><p>") + "</p>";
    doc += renderColumnsTable(table);

    return doc;
}

function renderColumnsTable(table) {

    let doc = "";

    doc += "<table>";
    doc += "<tr>";
    doc += "<th>Column name</th>";
    doc += "<th>Use</th>";
    doc += "<th>Content description</th>";
    doc += "<th style=\"max-width: 10em;\">Allowed content of each cell</th>";
    doc += "<th class=\"narrow\">Default value (when cell left empty)</th>";
    doc += "<th class=\"narrow\">Can be multilingual</th>";
    doc += "<th class=\"narrow\">Can contain empty cells</th>";
    doc += "<th class=\"narrow\">Can contain duplicate values</th>";
    doc += "</tr>";

    Object.keys(table.columns).forEach(function(columnKey) {
        doc += "<tr>";
        doc += "<td><strong>" + table.columns[columnKey].name + "</strong></td>";
        doc += "<td>" + table.columns[columnKey].description + "</td>";
        doc += renderColumnIntegrityInfo(table.columns[columnKey]);
        doc += "</tr>";
    });

    doc += "</table>";

    return doc;
}

function renderColumnIntegrityInfo(column) {
    let doc = "";

    doc += "<td>" + (column.integrity.description == "" ? "See 'Allowed content of each cell'" : column.integrity.description) + "</td>";

    switch (column.integrity.allowedContent) {
        case "any":
            doc += "<td>text</td>";
            break;
        case "list":
            let vals = column.integrity.listItems.filter(function(item) {
                if (item.trim() == "")
                    return true;
                return true;
            });
            vals = vals.map(function(item) { if (item.trim() == "") return "or an empty cell"; return "<strong>" + item + "</strong>"; });
            doc += "<td>one of the following values: " + vals.join(", ") + "</td>";
            break;
        case "columnName":
            doc += "<td>header of a column found in the checklist sheet, can be composed only of uppercase or lowercase letters</td>";
            break;
        case "cssColor":
            doc += "<td>a CSS representation of a color (name, rgb, rgba, hsl or hsla)</td>";
            break;
        case "filename":
            doc += "<td>name of a file, allowed extensions are: " + column.integrity.allowedExtensions.join(", ") + "</td>";
            break;
        case "url":
            doc += "<td>a valid URL, can contain an URL in form of a <a href=\"#g-template\">template</a></td>";
            break;
        case "dataPath":
            doc += "<td>a <a href=\"#g-datapath\">data path</a> describing a generalized name of a column in the checklist sheet, e.g. \"info.habit#\" will match the checklist sheet columns \"info.habit1\", \"info.habit2\" etc.</td>";
            break;

        default:
            break;
    }

    doc += "<td class=\"narrow\">" + (column.integrity.defaultValue ? column.integrity.defaultValue : "-") + "</td>";
    doc += "<td class=\"narrow " + (column.integrity.supportsMultilingual ? "yes" : "no") + "\">" + (column.integrity.supportsMultilingual ? "yes" : "no") + "</td>";
    doc += "<td class=\"narrow " + (column.integrity.allowEmpty ? "yes" : "no") + "\">" + (column.integrity.allowEmpty ? "yes" : "no") + "</td>";

    switch (column.integrity.allowDuplicates) {
        case "yes":
            doc += "<td class=\"narrow yes\">yes</td>";
            break;
        case "no":
            doc += "<td class=\"narrow no\">no</td>";
            break;
        case "empty-only":
            doc += "<td class=\"narrow\">no (multiple empty cells allowed)</td>";
            break;

        default:
            break;
    }

    return doc;
}