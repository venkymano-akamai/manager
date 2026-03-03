/* eslint-disable sonarjs/no-skipped-tests */
(window as any).process = { env: {}, argv: [], exit: () => {} };

import * as XLSX from 'xlsx';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Dimension {
  dimension_label: string;
  label: string;
  values: string[];
}

interface MetricDefinition {
  available_aggregate_functions: string[];
  dimensions: Dimension[];
  is_alertable: boolean;
  label: string;
  metric: string;
  metric_type: string;
  scrape_interval: string;
  unit: string;
}

interface MetricDefinitionResponse {
  data: MetricDefinition[];
  page: number;
  pages: number;
  results: number;
}

interface Widget {
  aggregate_function: string;
  chart_type: string;
  color: string;
  label: string;
  metric: string;
  size: number;
  unit: string;
  y_label: string;
}

interface Dashboard {
  created: string;
  group_by: string[];
  id: number;
  label: string;
  service_type: string;
  type: string;
  updated: string;
  widgets: Widget[];
}

interface DashboardResponse {
  data: Dashboard[];
  page: number;
  pages: number;
  results: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXCLUDED_WIDGETS = ['new flow estimate', 'ingress packet dropped'];

const UNIT_MAP: Record<string, string> = {
  'packets per second': 'packets/s',
  'sessions per second': 'sessions/s',
  'bytes per second': 'Bps',
  'bits per second': 'bps',
  count: 'Count',
  bps: 'Bps',
  percentile: 'percentile',
  rate: 'rate',
  'ops per second': 'OPS',
  iops: 'IOPS',
  'kilo bits per second': 'Kbps',
  percent: 'Percent', // FIX: was missing — 'Error Upload Rate' unit was falling through unresolved
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeString = (value: unknown): string => String(value ?? '').trim();

function normaliseUnit(raw: string): string {
  const s = raw.toString().trim();
  return UNIT_MAP[s.toLowerCase()] ?? s;
}

function normaliseScrapeInterval(raw: string): string {
  const s = raw.toString().trim().toLowerCase();
  if (s === '1 minute' || s === '60s') return '60s';
  const m = s.match(/^(\d+)\s*minutes?$/);
  return m ? `${parseInt(m[1]) * 60}s` : '60s';
}

function parseDimensionValues(raw: string): string[] {
  const s = raw.toString().trim();
  // FIX: return [] for 'Dynamic' (and any non-enumerable value) —
  // dimension values are only populated when the sheet lists explicit
  // predefined values (e.g. "value1,value2"). "Dynamic" means the values
  // are resolved at runtime and must NOT be hardcoded in the response.
  if (!s || s === 'nan' || s.toLowerCase() === 'dynamic' || /^\d+-\d+$/.test(s))
    return [];
  return s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function normLabel(s: string): string {
  return s.toLowerCase().replace('per backend', 'per be').replace(/\s/g, '');
}

function mapWidgetSize(size: string): number {
  const s = size.toString().trim().toLowerCase();
  if (s === 'large') return 12;
  if (s === 'medium') return 6;
  if (s === 'small') return 3;
  return 12;
}

function mapChartType(chart: string): string {
  return chart.toString().trim().toLowerCase();
}

// ─── Dimension map builder ────────────────────────────────────────────────────

function buildDimMap(dimsRows: string[][]): Record<string, Dimension[]> {
  const dimMap: Record<string, Dimension[]> = {};
  let currentLabels: string[] = [];

  dimsRows.forEach((row) => {
    const col0 = safeString(row[0]);
    const col1 = safeString(row[1]);
    const col3 = safeString(row[3]);
    const col4 = safeString(row[4]);
    const col5 = safeString(row[5]);

    if (
      col0 &&
      col0 !== 'nan' &&
      col0 !== '*' &&
      !col0.toLowerCase().includes('phase 2') &&
      !col0.toLowerCase().includes('this sheet') &&
      !col0.toLowerCase().includes('metric name')
    ) {
      currentLabels = col0
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      currentLabels.forEach((l) => {
        if (!dimMap[l]) dimMap[l] = [];
      });
    }

    if (col1 && col1 !== 'nan' && col3.toLowerCase() === 'yes') {
      const dim: Dimension = {
        label: col4 && col4 !== '-' && col4 !== 'nan' ? col4 : col1,
        dimension_label: col1,
        values: parseDimensionValues(col5), // returns [] when value is 'Dynamic'
      };
      currentLabels.forEach((l) => dimMap[l]?.push(dim));
    }
  });

  return dimMap;
}

function findDimensions(
  label: string,
  dimMap: Record<string, Dimension[]>
): Dimension[] {
  if (dimMap[label]) return dimMap[label];
  for (const [k, v] of Object.entries(dimMap)) {
    if (
      normLabel(label) === normLabel(k) ||
      normLabel(label).includes(normLabel(k)) ||
      normLabel(k).includes(normLabel(label))
    )
      return v;
  }
  return [];
}

// ─── Response builders ────────────────────────────────────────────────────────

function buildMetricDefinitionResponse(
  workbook: XLSX.WorkBook
): MetricDefinitionResponse {
  const metricsRows = XLSX.utils.sheet_to_json<string[]>(
    workbook.Sheets['Metrics'],
    { header: 1, defval: '' }
  );
  const dimsRows = XLSX.utils.sheet_to_json<string[]>(
    workbook.Sheets['Dimensions'],
    { header: 1, defval: '' }
  );

  const dimMap = buildDimMap(dimsRows);

  const data: MetricDefinition[] = metricsRows
    .slice(1) // FIX: was slice(2) — Logs.xlsx has only 1 header row so slice(2) skipped 'Successful Upload Count'
    .filter((row) => {
      const name = String(row[0]).trim();
      const metric = String(row[1]).trim();
      return (
        name &&
        metric &&
        name !== 'nan' &&
        metric !== 'nan' &&
        !name.toLowerCase().includes('phase 2') &&
        !name.toLowerCase().includes('customer facing')
      );
    })
    .map((row) => ({
      label: String(row[0]).trim(),
      metric: String(row[1]).trim(),
      unit: normaliseUnit(String(row[2])),
      metric_type: String(row[3]).trim().toLowerCase(),
      scrape_interval: normaliseScrapeInterval(String(row[5])),
      is_alertable:
        String(row[10]).trim() !== '' &&
        String(row[10]).trim() !== 'nan' &&
        String(row[10]).trim() !== '-',
      available_aggregate_functions: String(row[7])
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      dimensions: findDimensions(String(row[0]).trim(), dimMap),
    }));

  return { data, page: 1, pages: 1, results: data.length };
}

function buildDashboardResponse(workbook: XLSX.WorkBook): DashboardResponse {
  const metricsRows = XLSX.utils.sheet_to_json<string[]>(
    workbook.Sheets['Metrics'],
    { header: 1, defval: '' }
  );

  const metricLookup: Record<
    string,
    { agg: string; metric: string; unit: string }
  > = {};

  metricsRows.slice(1).forEach((row) => { // FIX: was slice(2)
    const name = String(row[0]).trim();
    const metric = String(row[1]).trim();
    if (!name || !metric || name === 'nan' || metric === 'nan') return;
    if (name.toLowerCase().includes('phase 2')) return;
    const agg = String(row[7]).split(',')[0].trim().toLowerCase() || 'sum';
    metricLookup[normLabel(name)] = {
      metric,
      unit: String(row[2]).trim(),
      agg,
    };
  });

  const dashRows = XLSX.utils.sheet_to_json<string[]>(
    workbook.Sheets['Centralized Dashboard'],
    { header: 1, defval: '' }
  );

  const widgets: Widget[] = dashRows
    .slice(18) // FIX: was slice(22) — widget rows start at index 18 in Logs.xlsx, not 22
    .filter((row) => {
      const name = String(row[0]).trim();
      // FIX: also guard against the trailing note row ("Contextual Dashboard...")
      if (
        !name ||
        name === 'nan' ||
        name === '' ||
        name.toLowerCase().startsWith('contextual')
      )
        return false;
      return !EXCLUDED_WIDGETS.some((ex) =>
        normLabel(name).includes(normLabel(ex))
      );
    })
    .map((row) => {
      const metricName  = safeString(row[0]);
      const widgetLabel = safeString(row[1]);
      const chartType   = mapChartType(safeString(row[4])); // FIX: was row[3] (grouping col) — col 4 = Chart type
      const size        = mapWidgetSize(safeString(row[5]));

      const looked =
        metricLookup[normLabel(metricName)] ??
        Object.entries(metricLookup).find(
          ([k]) =>
            normLabel(metricName).includes(k) ||
            k.includes(normLabel(metricName))
        )?.[1];

      const metricKey   = looked?.metric ?? normLabel(metricName).replace(/\s/g, '_');
      const unit        = normaliseUnit(looked?.unit ?? '');
      const aggFunction = looked?.agg ?? 'sum';

      return {
        metric: metricKey,
        unit,
        label: widgetLabel,
        color: 'default',
        size,
        chart_type: chartType,
        y_label: metricKey,
        aggregate_function: aggFunction,
      };
    });

  const dashboard: Dashboard = {
    id: 9,
    type: 'standard',
    service_type: 'logs',
    label: 'Logs Dashboard',
    group_by: ['entity_id'],
    created: '2025-06-25T01:25:37',
    updated: '2025-11-07T07:31:09',
    widgets,
  };

  return { data: [dashboard], page: 1, pages: 1, results: 1 };
}

// ─── Output paths ─────────────────────────────────────────────────────────────

const OUTPUT_DIR = 'cypress/e2e/core/cloudpulse/api-response';
const METRIC_DEF_PATH = `${OUTPUT_DIR}/logs-metric-definition.json`;
const DASHBOARD_PATH  = `${OUTPUT_DIR}/logs-dashboard-response.json`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Metric Definition & Dashboard Builder Response', () => {
  /**
   * SECURITY NOTICE - Excel File Parsing
   * ─────────────────────────────────────────────────────────────────────────────
   * The xlsx library can execute formulas and macros embedded in Excel files,
   * which poses a security risk with untrusted sources.
   *
   * ✅ SAFE   - This code only processes known, trusted fixture files
   *             stored in cypress/fixtures/ under version control.
   *
   * ❌ UNSAFE - Do NOT reuse this pattern for:
   *             - User-uploaded Excel files
   *             - Files from external/unknown sources
   *             - Files received over a network at runtime
   *
   * If Excel parsing is needed for untrusted sources in the future, use a
   * server-side solution with sandboxing instead of parsing in the browser.
   * ─────────────────────────────────────────────────────────────────────────────
   */

  let metricDefinitionResponse: MetricDefinitionResponse;
  let dashboardResponse: DashboardResponse;

  before(() => {
    cy.readFile('cypress/fixtures/Logs.xlsx', 'binary').then(
      (binary) => {
        const buffer = Uint8Array.from(binary, (c: string) => c.charCodeAt(0));
        const workbook = XLSX.read(buffer.buffer, { type: 'array' });

        metricDefinitionResponse = buildMetricDefinitionResponse(workbook);
        dashboardResponse = buildDashboardResponse(workbook);
      }
    );
  });

  it('MetricDefinitionResponse JSON response', () => {
    cy.writeFile(METRIC_DEF_PATH, metricDefinitionResponse, { flag: 'w' });
  });

  it('dashboardResponse JSON response', () => {
    cy.writeFile(DASHBOARD_PATH, dashboardResponse, { flag: 'w' });
  });
});
