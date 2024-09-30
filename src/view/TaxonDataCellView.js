import { TaxonDataItemView } from "../view/TaxonDataItemView.js";

export let TaxonDataCellView = {
    view: function(vnode) {
        if (vnode.attrs.dataCells.length == 0) {
            return null;
        }

        return m(".taxon-data-cell-view", vnode.attrs.dataCells.map(function(item) {

            return m(TaxonDataItemView, {
                originalData: vnode.attrs.originalData,
                dataItem: item,
                taxon: vnode.attrs.taxon,
                taxonName: vnode.attrs.taxonName
            });
        }));
    }
}