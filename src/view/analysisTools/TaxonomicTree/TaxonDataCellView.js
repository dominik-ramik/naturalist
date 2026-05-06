import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';

import { TaxonDataItemView } from "./TaxonDataItemView.js";

export let TaxonDataCellView = {
    view: function(vnode) {
        if (vnode.attrs.dataCells.length == 0) {
            return null;
        }

        // Pre-filter to only cells that will actually render something.
        // m(TaxonDataItemView, ...) always returns a vnode object, so we can't
        // detect null renders after the fact. Instead we call titleValuePair
        // directly - the same check TaxonDataItemView.view() uses - to see
        // whether each cell would produce output before committing to a wrapper.
        const visibleCells = vnode.attrs.dataCells.filter(function(item) {
            const data = vnode.attrs.taxon.data[item];
            const currentTaxonName = vnode.attrs.taxon.taxon;
            const titleValue = TaxonDataItemView.titleValuePair(
                data,
                item,
                currentTaxonName
            );
            return titleValue !== null;
        });

        if (visibleCells.length === 0) {
            return null;
        }

        return m(".taxon-data-cell-view", visibleCells.map(function(item) {
            return m(TaxonDataItemView, {
                originalData: vnode.attrs.originalData,
                dataItem: item,
                taxon: vnode.attrs.taxon,
                taxonName: vnode.attrs.taxonName
            });
        }));
    }
}