/**
 * RegionalDistribution - configuration panel
 *
 * Renders the collapsible control card (map selector, segment picker,
 * operation picker, denominator picker, group toggle) and the always-visible
 * verb sentence that describes what is currently being computed.
 */

import m from 'mithril';
import { Checklist } from '../../../model/Checklist.js';
import { Settings } from '../../../model/Settings.js';
import { NUMERIC_OPERATIONS, getOperationMeta } from './aggregate.js';
import { ANALYTICAL_INTENT_OCCURRENCE, OCCURRENCE_IDENTIFIER } from '../../../model/DataStructure.js';
import { t, tf } from 'virtual:i18n-self';
import { CollapsibleCard } from '../../shared/CollapsibleCard.js';
// ─── Helpers ──────────────────────────────────────────────────────────────────

const segBtn = (label, active, onClick) =>
  m('button' + (active ? '.selected' : ''), { onclick: onClick }, label);

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {{
 *   availableMaps:     Array,
 *   currentMap:        Object|null,
 *   segments:          Object|null,     detectSegments() result
 *   mapState:          Object,
 *   onMapChange:       Function,
 *   onStateChange:     Function,
 *   configCollapsed:   boolean,
 *   onToggleCollapse:  Function,
 *   filteredCount:     number,
 *   allCount:          number,
 * }}
 */
export function renderConfigPanel({
  availableMaps, currentMap, segments, mapState,
  onMapChange, onStateChange,
  configCollapsed, onToggleCollapse,
  filteredCount,
}) {
  const filterIsEmpty = Checklist.filter.isEmpty();
  const mode = Settings.analyticalIntent() === ANALYTICAL_INTENT_OCCURRENCE ? OCCURRENCE_IDENTIFIER : 'taxa';

  const {
    segmentTrack, categoryStatus, numericOperation,
    threshold, denominator, useGroups, _hasGroups, _groupTitles,
  } = mapState;

  const opMeta = getOperationMeta(numericOperation);
  const isMixed = segments?.hasNumeric && segments?.namedCategories.length > 0;
  // Show segment picker when the user has a real choice to make
  const showSeg = segments && !segments.isPresenceOnly && (isMixed || segments.namedCategories.length > 1);
  const showOp = segmentTrack === 'numeric';
  const showThresh = showOp && opMeta.usesThreshold;
  const showDenom = !filterIsEmpty && (segmentTrack !== 'numeric' || opMeta.usesDenominator);

  const verbFooter = currentMap
    ? m.trust(buildVerb({ currentMap, segments, mapState, filteredCount, mode, filterIsEmpty }))
    : null;

  return m(CollapsibleCard, {
    title: t('rd_config_title'),
    collapsed: configCollapsed,
    onToggle: onToggleCollapse,
    footer: verbFooter,
    bodyClass: 'rd-config-body',
  }, [

      // Map selector + groups toggle - these form a logical unit
      m('.chart-control-group.rd-control-map', [
        m('label', t('rd_map_label')),
        m('select.chart-select', {
          value: currentMap?.dataPath ?? '',
          onchange: e => {
            const map = availableMaps.find(x => x.dataPath === e.target.value);
            if (map) onMapChange(map);
          },
        }, [
          m('option', { value: '', disabled: true }, '- ' + t('view_map_select_map') + ' -'),
          ...availableMaps.map(map => m('option', { value: map.dataPath }, map.title)),
        ]),
        (_hasGroups && currentMap) ? m('label.rd-checkbox-label.rd-groups-checkbox', [
          m('input[type=checkbox]', {
            checked: useGroups,
            onchange: e => onStateChange({ useGroups: e.target.checked }),
          }),
          ' ',
          t('rd_group_toggle'),
          _groupTitles?.length
            ? ' (' + _groupTitles.slice(0, 3).join(', ') + (_groupTitles.length > 3 ? ', \u2026' : '') + ')'
            : null,
        ]) : null,
      ]),

      currentMap == null ? null : [

        // Segment picker
        showSeg ? m('.chart-control-group.rd-control-segment', [
          m('label', t('rd_segment_label')),
          m('.chart-segmented-control', [
            segBtn(t('rd_segment_any'),
              segmentTrack === 'category' && !categoryStatus,
              () => onStateChange({ segmentTrack: 'category', categoryStatus: null })),
            ...segments.namedCategories.map(cat =>
              segBtn(cat.legend || cat.status,
                segmentTrack === 'category' && categoryStatus === cat.status,
                () => onStateChange({ segmentTrack: 'category', categoryStatus: cat.status }))
            ),
            isMixed ? segBtn(t('rd_segment_numeric'),
              segmentTrack === 'numeric',
              () => onStateChange({ segmentTrack: 'numeric', categoryStatus: null }))
              : null,
          ]),
        ]) : null,

        // Numeric operation selector
        showOp ? m('.chart-control-group', [
          m('label', t('rd_operation_label')),
          m('select.chart-select', {
            value: numericOperation,
            onchange: e => onStateChange({ numericOperation: e.target.value }),
          },
            NUMERIC_OPERATIONS.map(op => m('option', { value: op.id }, t(op.labelKey)))
          ),
        ]) : null,

        // Threshold input (pct_above / pct_below)
        showThresh ? m('.chart-control-group', [
          m('label', t('rd_threshold_label')),
          m('input.chart-select[type=number]', {
            value: threshold,
            oninput: e => onStateChange({ threshold: parseFloat(e.target.value) || 0 }),
            style: 'width: 6em;',
          }),
        ]) : null,

        // Denominator picker
        showDenom ? m('.chart-control-group', [
          m('label', t('rd_denominator_label')),
          m('.chart-segmented-control', [
            segBtn(t('view_map_sum_by_filter'), denominator === 'filter', () => onStateChange({ denominator: 'filter' })),
            segBtn(t('view_map_sum_by_region'), denominator === 'region', () => onStateChange({ denominator: 'region' })),
            segBtn(t('view_map_sum_by_total'), denominator === 'total', () => onStateChange({ denominator: 'total' })),
          ]),
        ]) : null,

      ], // end currentMap-gated block
  ]);
}

// ─── Verb builder ─────────────────────────────────────────────────────────────

/**
 * Build a human-readable sentence describing exactly what is being computed.
 * The sentence intentionally changes with every config change so the user
 * can confirm the effect of each control.
 */
function buildVerb({ currentMap, segments, mapState, filteredCount, mode, filterIsEmpty }) {
  const { segmentTrack, categoryStatus, numericOperation, threshold, denominator } = mapState;
  const opMeta = getOperationMeta(numericOperation);
  const unit = t(mode === OCCURRENCE_IDENTIFIER ? 'rd_unit_occurrences' : 'rd_unit_taxa');

  // - What is being computed -
  let action;
  if (segmentTrack === 'numeric') {
    if (numericOperation === 'pct_above') {
      action = tf('rd_verb_pct_above', [threshold], true);
    } else if (numericOperation === 'pct_below') {
      action = tf('rd_verb_pct_below', [threshold], true);
    } else {
      action = tf('rd_verb_numeric_op', [t(opMeta.labelKey)], true);
    }
  } else if (categoryStatus && segments) {
    const catMeta = segments.namedCategories.find(c => c.status === categoryStatus);
    const label = catMeta?.legend || categoryStatus;
    action = tf('rd_verb_category', ['<strong>' + label + '</strong>'], true);
  } else {
    action = t('rd_verb_presence');
  }

  // - Scope / filter -
  let scope;
  if (filterIsEmpty) {
    scope = tf('rd_verb_scope_all', [unit], true);
  } else {
    const filterLabel = Settings.pinnedSearches.getHumanNameForSearch(
      JSON.parse(Checklist.queryKey()), true
    );
    scope = tf('rd_verb_scope_filtered', [filterLabel, unit, filteredCount], true);
  }

  // - Denominator clause -
  let denomClause = '';
  if (!filterIsEmpty && (segmentTrack !== 'numeric' || opMeta.usesDenominator)) {
    denomClause = ' - ' + t('rd_verb_denom_' + denominator);
  }

  // - Map name -
  const mapLabel = ' (' + currentMap.title + ')';

  return (currentMap.title ? "<strong>" + currentMap.title + "</strong>" : action) + ' ' + scope + denomClause;
}