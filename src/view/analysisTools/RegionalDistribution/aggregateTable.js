/**
 * RegionalDistribution — aggregate table with drill-down panel
 */

import m from 'mithril';
import { Checklist } from '../../../model/Checklist.js';
import { resolveRegionColor } from '../../../components/MapregionsColorEngine.js';
import { getOperationMeta, computeRatio } from './aggregate.js';

let _selectedKey = null;

export function resetDrillState() {
  _selectedKey = null;
}

export function renderAggregateTable({
  regionAggregates, colors, regionData,
  mapState, filteredCount, effectiveAllCounts, legendConfig,
}) {
  const { segmentTrack, numericOperation, categoryStatus, denominator } = mapState;
  const opMeta  = getOperationMeta(numericOperation);
  const showRaw = segmentTrack === 'numeric' && !opMeta.usesDenominator && numericOperation !== 'count';

  const sortedKeys = Object.keys(regionAggregates).sort(
    (a, b) => regionAggregates[b].value - regionAggregates[a].value
  );

  if (!sortedKeys.length) {
    return m('.rd-no-data', m('.chart-info-item', t('rd_no_data_message')));
  }

  const rows = sortedKeys.flatMap(key => {
    const agg      = regionAggregates[key];
    const color    = colors[key] ?? '#eeeeee';
    const isGroup  = !!regionData[key]?._isGroup;
    const isActive = _selectedKey === key;
    const label    = isGroup ? key : (Checklist.nameForMapRegion(key) || key);

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
      (isGroup  ? '.rd-row-group'  : ''),
    {
      onclick: () => { _selectedKey = isActive ? null : key; },
      title:   t('rd_row_click_hint'),
    }, [
      m('td.rd-cell-dot',   m('span.rd-dot', { style: { background: color } })),
      m('td.rd-cell-name',  label),
      m('td.rd-cell-value', displayValue),
      m('td.rd-cell-count', String(agg.count)),
      m('td.rd-cell-arrow', isActive ? '▲' : '▼'),
    ]);

    const drillRow = isActive
      ? m('tr.rd-drill-row', m('td[colspan=5]',
          renderDrillPanel(key, regionData, mapState, legendConfig)
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
        m('th',            valueHeader),
        m('th',            t('rd_col_count')),
        m('th',            ''),
      ])),
      m('tbody', rows),
    ]),
    m('.rd-table-hint', t('rd_click_row_hint')),
  ]);
}

function renderDrillPanel(key, regionData, mapState, legendConfig) {
  const data = regionData[key];
  if (!data) return null;

  const { segmentTrack, categoryStatus } = mapState;

  const records = segmentTrack === 'category' && categoryStatus
    ? data.records.filter(r => r.status === categoryStatus)
    : data.records;

  if (!records.length) return m('.rd-drill-empty', t('rd_drill_empty'));

  const numerics = records.map(r => r.numeric).filter(n => n !== null);
  const isGroup  = !!data._isGroup;

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

    data.excluded > 0
      ? m('.rd-drill-excluded', tf('rd_drill_excluded', [data.excluded]))
      : null,

    m('table.rd-drill-table', [
      m('thead', m('tr', [
        m('th', t('rd_drill_name')),
        m('th', t('rd_drill_status')),
      ])),
      m('tbody',
        records.slice(0, 100).map(rec => m('tr', [
          m('td', rec.name),
          m('td', renderStatusCell(rec.status, legendConfig)),
        ]))
      ),
      records.length > 100
        ? m('tfoot', m('tr', m('td[colspan=2].rd-drill-overflow',
            tf('rd_drill_overflow', [records.length - 100])
          )))
        : null,
    ]),
  ]);
}

function renderNumericStats(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const n      = sorted.length;
  const mean   = sorted.reduce((a, b) => a + b, 0) / n;
  const mid    = n >> 1;
  const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return m('.rd-numeric-stats', [
    stat('n',                 n),
    stat(t('rd_stat_min'),    formatNumber(sorted[0])),
    stat(t('rd_stat_mean'),   formatNumber(mean)),
    stat(t('rd_stat_median'), formatNumber(median)),
    stat(t('rd_stat_max'),    formatNumber(sorted[n - 1])),
  ]);
}

const stat = (label, value) =>
  m('span.rd-stat', [m('strong', label + ': '), String(value)]);

/**
 * Render status cell with colour swatch + most human-readable label.
 *
 * Category/fallback rows → legend label (e.g. "Confirmed breeding"), not code.
 * Numeric values         → show the raw value; it IS the meaningful data.
 * Unresolved             → raw status string or em dash.
 *
 * Stats are passed as null because per-record colouring uses per-taxon scale
 * (not aggregate); for category rows stats are irrelevant anyway.
 */
function renderStatusCell(status, legendConfig) {
  const resolved = resolveRegionColor(status, legendConfig, null);

  const label = (resolved?.resolvedAs === 'category' || resolved?.resolvedAs === 'fallback')
    ? (resolved.legend || status || '—')
    : (status || '—');

  return [
    resolved?.fill ? m('span.rd-status-dot', { style: { background: resolved.fill } }) : null,
    ' ',
    label,
  ];
}

function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}