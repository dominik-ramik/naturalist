/**
 * RegionalDistribution - aggregate table with drill-down panel
 */

import m from 'mithril';
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { Checklist } from '../../../model/Checklist.js';
import { resolveRegionColor, computeDatasetStats } from '../../../components/MapregionsColorEngine.js';
import { getOperationMeta, computeRatio } from './aggregate.js';

registerMessages(selfKey, {
  en: {
    rd_col_region: "Region",
    rd_col_count: "Records",
    rd_row_click_hint: "Click to see individual records",
    rd_click_row_hint: "Click a row to see individual records",
    rd_no_data_message: "No data for the current selection. Try changing the filter, segment, or operation.",
    rd_stat_min: "Min",
    rd_stat_mean: "Mean",
    rd_stat_median: "Median",
    rd_stat_max: "Max",
    rd_drill_name: "Record",
    rd_drill_status: "Status / value",
    rd_drill_group_members: "Regions in group",
    rd_drill_empty: "No matching records for the current segment.",
    rd_drill_excluded: "{0} record(s) with non-numeric status excluded from calculation.",
    rd_drill_overflow: "… and {0} more records not shown.",
    rd_drill_show_all: "Show all {0} records",
    rd_drill_show_less: "Show less",
    rd_op_count: "Count",
    rd_op_sum: "Sum",
    rd_op_mean: "Mean",
    rd_op_median: "Median",
    rd_op_min: "Min",
    rd_op_max: "Max",
    rd_op_stddev: "Std. deviation",
    rd_op_pct_above: "% above threshold",
    rd_op_pct_below: "% below threshold",
  },
  fr: {
    rd_col_region: "Région",
    rd_col_count: "Enregistrements",
    rd_row_click_hint: "Cliquez pour voir les enregistrements individuels",
    rd_click_row_hint: "Cliquez sur une ligne pour voir les enregistrements individuels",
    rd_no_data_message: "Aucune donnée pour la sélection actuelle. Essayez de changer le filtre, le segment ou l'opération.",
    rd_stat_min: "Min",
    rd_stat_mean: "Moyenne",
    rd_stat_median: "Médiane",
    rd_stat_max: "Max",
    rd_drill_name: "Enregistrement",
    rd_drill_status: "Statut / valeur",
    rd_drill_group_members: "Régions dans le groupe",
    rd_drill_empty: "Aucun enregistrement correspondant pour le segment actuel.",
    rd_drill_excluded: "{0} enregistrement(s) avec un statut non numérique exclus de calculations.",
    rd_drill_overflow: "… et {0} enregistrements supplémentaires non affichés.",
    rd_drill_show_all: "Afficher les {0} enregistrements",
    rd_drill_show_less: "Afficher moins",
    rd_op_count: "Nombre",
    rd_op_sum: "Somme",
    rd_op_mean: "Moyenne",
    rd_op_median: "Médiane",
    rd_op_min: "Min",
    rd_op_max: "Max",
    rd_op_stddev: "Écart-type",
    rd_op_pct_above: "% au-dessus du seuil",
    rd_op_pct_below: "% en-dessous du seuil",
  }
});


const OVERFLOW_THRESHOLD = 200;

let _selectedKey = null;
let _showFullDrill = false;

export function resetDrillState() {
  _selectedKey = null;
  _showFullDrill = false;
}

export function renderAggregateTable({
  regionAggregates, colors, regionData,
  mapState, filteredCount, effectiveAllCounts, legendConfig,
}) {
  const { segmentTrack, numericOperation, categoryStatus, denominator } = mapState;
  const opMeta = getOperationMeta(numericOperation);
  const showRaw = segmentTrack === 'numeric' && !opMeta.usesDenominator && numericOperation !== 'count';

  const datasetStats = (segmentTrack === 'numeric' && opMeta.usesLegendScale && legendConfig?.numericMode === 'stepped')
    ? computeDatasetStats(Object.values(regionAggregates).map(r => r.value))
    : null;

  const sortedKeys = Object.keys(regionAggregates).sort(
    (a, b) => regionAggregates[b].value - regionAggregates[a].value
  );

  if (!sortedKeys.length) {
    return m('.rd-no-data', m('.chart-info-item', t('rd_no_data_message')));
  }

  const rows = sortedKeys.flatMap(key => {
    const agg = regionAggregates[key];
    const color = colors[key] ?? '#eeeeee';
    const isGroup = !!regionData[key]?._isGroup;
    const isActive = _selectedKey === key;
    const label = isGroup ? key : (Checklist.nameForMapRegion(key) || key);

    let displayValue;
    if (showRaw) {
      displayValue = opMeta.resultIsPercent
        ? formatNumber(agg.value) + '%'
        : formatNumber(agg.value);
    } else {
      displayValue = (computeRatio(agg.value, key, denominator, filteredCount, effectiveAllCounts) * 100).toFixed(1) + '%';
    }

    const mainRow = m('tr.rd-table-row' +
      (isActive ? '.rd-row-active' : '') +
      (isGroup ? '.rd-row-group' : ''),
      {
        onclick: () => { _selectedKey = isActive ? null : key; _showFullDrill = false; },
        title: t('rd_row_click_hint'),
      }, [
      m('td.rd-cell-dot', m('span.rd-dot', { style: { background: color } })),
      m('td.rd-cell-name', label),
      m('td.rd-cell-value', displayValue),
      m('td.rd-cell-count', String(agg.count)),
      m('td.rd-cell-arrow', isActive ? '▲' : '▼'),
    ]);

    const drillRow = isActive
      ? m('tr.rd-drill-row', m('td[colspan=5]',
        renderDrillPanel(key, regionData, regionAggregates, mapState, legendConfig, datasetStats)
      ))
      : null;

    return drillRow ? [mainRow, drillRow] : mainRow;
  });

  const valueHeader = showRaw
    ? (opMeta.resultIsPercent ? t(opMeta.labelKey) + ' %' : t(opMeta.labelKey))
    : '%';

  return m('.rd-table-wrap', [
    m('table.results-table.rd-table', [
      m('thead', m('tr', [
        m('th[colspan=2]', t('rd_col_region')),
        m('th', valueHeader),
        m('th', t('rd_col_count')),
        m('th', ''),
      ])),
      m('tbody', rows),
    ]),
    m('.rd-table-hint', t('rd_click_row_hint')),
  ]);
}

function renderDrillPanel(key, regionData, regionAggregates, mapState, legendConfig, datasetStats) {
  const data = regionData[key];
  if (!data) return null;

  const { segmentTrack, categoryStatus } = mapState;

  const filtered = segmentTrack === 'numeric'
    ? data.records.filter(r => r.numeric !== null)
    : categoryStatus
      ? data.records.filter(r => r.status === categoryStatus)
      : data.records;

  if (!filtered.length) return m('.rd-drill-empty', t('rd_drill_empty'));

  const records = sortDrillRecords(filtered, legendConfig);
  const numerics = records.map(r => r.numeric).filter(n => n !== null);
  const isGroup = !!data._isGroup;
  const colSpan = isGroup ? 3 : 2;
  const excluded = regionAggregates[key]?.excluded ?? 0;

  return m('.rd-drill-panel', [
    segmentTrack === 'numeric' && numerics.length > 0 ? renderNumericStats(numerics) : null,

    isGroup && data.memberCodes?.length
      ? m('.rd-drill-members',
        t('rd_drill_group_members') + ': ',
        data.memberCodes.map((code, i) => [
          i > 0 ? ', ' : null,
          m('span.rd-member-code', Checklist.nameForMapRegion(code) || code),
        ])
      )
      : null,

    excluded > 0
      ? m('.rd-drill-excluded', m.trust(tf('rd_drill_excluded', [excluded])))
      : null,

    m('table.rd-drill-table', [
      m('thead', m('tr', [
        m('th', t('rd_drill_name')),
        isGroup ? m('th', t('rd_col_region')) : null,
        m('th', t('rd_drill_status')),
      ])),
      m('tbody',
        (_showFullDrill ? records : records.slice(0, OVERFLOW_THRESHOLD)).map(rec => m('tr', [
          m('td', rec.name),
          isGroup ? m('td.rd-drill-region', Checklist.nameForMapRegion(rec.regionCode) || rec.regionCode || '') : null,
          m('td', renderStatusCell(rec, legendConfig, datasetStats)),
        ]))
      ),
      records.length > OVERFLOW_THRESHOLD
        ? m('tfoot', m('tr', m('td[colspan=' + colSpan + '].rd-drill-overflow',
          _showFullDrill
            ? [
              m('button.rd-drill-toggle', {
                onclick: (e) => { e.stopPropagation(); _showFullDrill = false; },
              }, t('rd_drill_show_less')),
            ]
            : [
              m.trust(tf('rd_drill_overflow', [records.length - OVERFLOW_THRESHOLD])),
              ' ',
              m('button.rd-drill-toggle', {
                onclick: (e) => { e.stopPropagation(); _showFullDrill = true; },
              }, m.trust(tf('rd_drill_show_all', [records.length]))),
            ]
        )))
        : null,
    ]),
  ]);
}

/**
 * Sort drill-down records with a stable multi-level comparator:
 *   1. Region name (alphabetical) - meaningful in grouped mode
 *   2. Category statuses first (alphabetical), then numerics (high→low)
 *   3. Within the same status/value: record name alphabetical
 */
function sortDrillRecords(records, legendConfig) {
  // Build a set of known category status strings for fast lookup
  const categoryStatuses = new Set(
    (legendConfig?.categoryRows ?? []).filter(r => r.status).map(r => r.status)
  );

  return [...records].sort((a, b) => {
    // 1. Region name (resolved to human-readable)
    const regionA = (Checklist.nameForMapRegion(a.regionCode) || a.regionCode || '').toLowerCase();
    const regionB = (Checklist.nameForMapRegion(b.regionCode) || b.regionCode || '').toLowerCase();
    if (regionA < regionB) return -1;
    if (regionA > regionB) return 1;

    // 2. Category before numeric; within category: alpha; within numeric: high→low
    const aCat = categoryStatuses.has(a.status);
    const bCat = categoryStatuses.has(b.status);
    if (aCat && !bCat) return -1;
    if (!aCat && bCat) return 1;
    if (aCat && bCat) {
      const cmp = a.status.localeCompare(b.status);
      if (cmp !== 0) return cmp;
    } else if (a.numeric !== null && b.numeric !== null) {
      if (b.numeric !== a.numeric) return b.numeric - a.numeric;
    } else if (a.numeric !== null) {
      return -1;  // numeric before non-category non-numeric (edge case)
    } else if (b.numeric !== null) {
      return 1;
    } else {
      // Both non-category, non-numeric - sort status alphabetically
      const cmp = (a.status ?? '').localeCompare(b.status ?? '');
      if (cmp !== 0) return cmp;
    }

    // 3. Record name
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}

function renderNumericStats(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const mid = n >> 1;
  const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return m('.rd-numeric-stats', [
    stat('n', n),
    stat(t('rd_stat_min'), formatNumber(sorted[0])),
    stat(t('rd_stat_mean'), formatNumber(mean)),
    stat(t('rd_stat_median'), formatNumber(median)),
    stat(t('rd_stat_max'), formatNumber(sorted[n - 1])),
  ]);
}

const stat = (label, value) =>
  m('span.rd-stat', [m('strong', label + ': '), String(value)]);

/**
 * Render status cell with color swatch + most human-readable label.
 *
 * Numeric records  → show the raw value (the number IS the meaningful data).
 *                    Never show the fallback legend ("Present") for a number.
 * Category rows    → show the legend label (e.g. "Confirmed breeding").
 * Fallback rows    → show the legend label.
 * Unresolved       → raw status string or em dash.
 *
 * rec.numeric is pre-computed by collectRegionData; it is non-null when the
 * status string parsed as a number, so we use it as the authoritative flag
 * rather than calling resolveRegionColor with null stats (which would demote
 * a numeric to 'fallback' and incorrectly show the fallback legend label).
 */
function renderStatusCell(rec, legendConfig, datasetStats) {
  const { status, numeric } = rec;
  const resolved = resolveRegionColor(status, legendConfig, null);

  let label;
  if (numeric !== null) {
    // Stepped legend - show the raw value AND the inferred bin label.
    if (datasetStats && legendConfig?.numericMode === 'stepped') {
      const stepped = resolveRegionColor(status, legendConfig, datasetStats);
      if (stepped?.resolvedAs === 'stepped') {
        const binLabel = [stepped.legend].filter(Boolean).join(' ');
        return [
          stepped.fill ? m('span.rd-status-dot', { style: { background: stepped.fill } }) : null,
          ' ',
          status || '-',
          binLabel ? m('span.rd-status-bin-label', ' (' + binLabel + ')') : null,
        ];
      }
    }
    // Plain numeric value - display the raw value string, not a legend label.
    label = status || '-';
  } else if (resolved?.resolvedAs === 'category' || resolved?.resolvedAs === 'fallback') {
    // Named category or generic presence - show the human-readable legend label.
    label = resolved.legend || status || '-';
  } else {
    // Gradient / stepped with null stats (shouldn't normally reach here in a
    // drill row, but defend gracefully).
    label = status || '-';
  }

  return [
    resolved?.fill ? m('span.rd-status-dot', { style: { background: resolved.fill } }) : null,
    ' ',
    label,
  ];
}

function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}