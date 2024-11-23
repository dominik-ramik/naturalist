import { Checklist } from "../model/Checklist.js";
import { TaxonDataCellView } from "../view/TaxonDataCellView.js";

export let TaxonDataView = {
    view: function(vnode) {
        if (Object.keys(vnode.attrs.taxon.data).length == 0) {
            return null;
        }

        let cells = Checklist.getChecklistDataCellsForTaxon(vnode.attrs.taxon);

        return m(".taxon-data-view", [
            cells.top.length > 0 ? m(".top-row", m(TaxonDataCellView, { taxon: vnode.attrs.taxon, dataCells: cells.top })) : null,
            (cells.left.length + cells.middle.length + cells.right.length) > 0 ? m(".middle-row", [
                cells.left.length > 0 ? m(".column.left-column", m(TaxonDataCellView, { taxon: vnode.attrs.taxon, dataCells: cells.left })) : null,
                cells.middle.length > 0 ? m(".column.middle-column", m(TaxonDataCellView, { taxon: vnode.attrs.taxon, dataCells: cells.middle })) : null,
                cells.right.length > 0 ? m(".column.right-column", m(TaxonDataCellView, { taxon: vnode.attrs.taxon, dataCells: cells.right })) : null,
            ]) : null,
            cells.bottom.length > 0 ? m(".bottom-row", m(TaxonDataCellView, { taxon: vnode.attrs.taxon, dataCells: cells.bottom })) : null
        ]);
    }
}