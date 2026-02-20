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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXCLUDED_WIDGETS = ['new flow estimate', 'ingress packet dropped'];
const UNIT_MAP: Record<string, string> = {
  'packets per second': 'packets/s',
  "sessions per second": "sessions/s",
  'bytes per second': 'Bps',
  'bits per second': 'bps',
  'count': 'Count',
  'bps': 'Bps',
  "percentile": "percentile",
  "rate": "rate",
  "ops per second": "OPS",
  "iops": "IOPS",
  "kilo bits per second": "Kbps",
  
};
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
  if (!s || s === 'nan' || /^\d+-\d+$/.test(s)) return [];
  return s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

const safeString = (value: unknown): string =>
  String(value ?? '').trim();

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
        values: parseDimensionValues(col5),
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
  const norm = (s: string) =>
    s.toLowerCase().replace('per backend', 'per be').replace(/\s/g, '');
  for (const [k, v] of Object.entries(dimMap)) {
    if (
      norm(label) === norm(k) ||
      norm(label).includes(norm(k)) ||
      norm(k).includes(norm(label))
    )
      return v;
  }
  return [];
}
function normLabel(s: string): string {
  return s.toLowerCase().replace('per backend', 'per be').replace(/\s/g, '');
}
// ─── Map widget size label → number ──────────────────────────────────────────
function mapWidgetSize(size: string): number {
  const s = size.toString().trim().toLowerCase();
  if (s === 'large') return 12;
  if (s === 'medium') return 6;
  if (s === 'small') return 3;
  return 12; // default
}

// ─── Map chart type string → api value ───────────────────────────────────────
function mapChartType(chart: string): string {
  return chart.toString().trim().toLowerCase(); // "Line" → "line"
}

// ─── Build Metric Definition Response from Metrics + Dimensions sheets ────────
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
    .slice(2)
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
  // ── Metrics lookup ────────────────────────────────────────────────────────
  const metricsRows = XLSX.utils.sheet_to_json<string[]>(
    workbook.Sheets['Metrics'],
    { header: 1, defval: '' }
  );

  const metricLookup: Record<
    string,
    { agg: string; metric: string; unit: string }
  > = {};
  metricsRows.slice(2).forEach((row) => {
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

  // ── Centralized Dashboard sheet ───────────────────────────────────────────
  const dashRows = XLSX.utils.sheet_to_json<string[]>(
    workbook.Sheets['Centralized Dashboard'],
    { header: 1, defval: '' }
  );

  const widgets: Widget[] = dashRows
    .slice(22)
    .filter((row) => {
      const name = String(row[0]).trim();
      if (!name || name === 'nan' || name === '') return false;

      // ✅ Exclude widgets not present in API
      const isExcluded = EXCLUDED_WIDGETS.some((ex) =>
        normLabel(name).includes(normLabel(ex))
      );
      return !isExcluded;
    })
    .map((row) => {
      const metricName  = safeString(row[0]);
      const widgetLabel = safeString(row[1]);
      const chartType   = mapChartType(safeString(row[3]));
      const size        = mapWidgetSize(safeString(row[5]));
    
      const looked =
        metricLookup[normLabel(metricName)] ??
        Object.entries(metricLookup).find(
          ([k]) =>
            normLabel(metricName).includes(k) || k.includes(normLabel(metricName))
        )?.[1];
    
      const metricKey = looked?.metric ?? normLabel(metricName).replace(/\s/g, '_');
      const unit = normaliseUnit(looked?.unit ?? '');  // ✅ normaliseUnit applied here
      const aggFunction = looked?.agg ?? 'sum';
    
      return {
        metric: metricKey,
        unit,                    // ✅ already normalised
        label: widgetLabel,
        color: 'default',
        size,
        chart_type: chartType,
        y_label: metricKey,
        aggregate_function: aggFunction,
      };
    });
  const dashboard: Dashboard = {
    id: 5, 
    type: 'standard',
    service_type: 'netloadbalancer',
    label: 'Network Load Balancer', 
    group_by: ['entity_id'],
    created: '2025-06-25T01:25:37', 
    updated: '2025-11-07T07:31:09', 
    widgets,
  };

  return { data: [dashboard], page: 1, pages: 1, results: 1 };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Metric Definition & Dashboard Builder Response', () => {
  let metricDefinitionResponse: MetricDefinitionResponse;
  let dashboardResponse: DashboardResponse;
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

  before(() => {
    cy.readFile('cypress/fixtures/NetworkLoadBalancer.xlsx', 'binary').then(
      (binary) => {
        const buffer = Uint8Array.from(binary, (c: string) => c.charCodeAt(0));
        const workbook = XLSX.read(buffer.buffer, { type: 'array' });

        metricDefinitionResponse = buildMetricDefinitionResponse(workbook);
        dashboardResponse = buildDashboardResponse(workbook);
      }
    );
  });

  // ── Metric Definition Tests ──────────────────────────────────────────────
  describe('Metric Definition Response', () => {
    it('has correct structure', () => {
      expect(metricDefinitionResponse.page).to.equal(1);
      expect(metricDefinitionResponse.pages).to.equal(1);
      expect(metricDefinitionResponse.results).to.equal(
        metricDefinitionResponse.data.length
      );
    });

    it('each metric has required fields', () => {
      metricDefinitionResponse.data.forEach((metric) => {
        expect(metric).to.have.property('label').and.not.be.empty;
        expect(metric).to.have.property('metric').and.not.be.empty;
        expect(metric).to.have.property('unit');
        expect(metric).to.have.property('metric_type');
        expect(metric).to.have.property('scrape_interval');
        expect(metric).to.have.property('is_alertable');
        expect(metric)
          .to.have.property('available_aggregate_functions')
          .and.be.an('array');
        expect(metric).to.have.property('dimensions').and.be.an('array');
      });
    });


  });

  // ── Dashboard Builder Tests ──────────────────────────────────────────────
  describe('Dashboard Builder Response', () => {
    it('has correct top-level structure', () => {
      expect(dashboardResponse.page).to.equal(1);
      expect(dashboardResponse.pages).to.equal(1);
      expect(dashboardResponse.results).to.equal(1);
      expect(dashboardResponse.data).to.have.length(1);
    });

    it('dashboard has correct fields', () => {
      const dashboard = dashboardResponse.data[0];
      expect(dashboard).to.have.property('label').and.not.be.empty;
      expect(dashboard).to.have.property('type', 'standard');
      expect(dashboard).to.have.property('service_type');
      expect(dashboard).to.have.property('group_by').and.be.an('array');
      expect(dashboard).to.have.property('widgets').and.be.an('array');
    });

    it('dashboard has correct number of widgets from Excel', () => {
      const dashboard = dashboardResponse.data[0];
      expect(dashboard.widgets).to.have.length(6); // 8 widgets in Centralized Dashboard sheet
    });

    it('each widget has required fields', () => {
      dashboardResponse.data[0].widgets.forEach((widget) => {
        expect(widget).to.have.property('metric').and.not.be.empty;
        expect(widget).to.have.property('unit');
        expect(widget).to.have.property('label').and.not.be.empty;
        expect(widget).to.have.property('color');
        expect(widget).to.have.property('size').and.be.a('number');
        expect(widget).to.have.property('chart_type');
        expect(widget).to.have.property('y_label');
        expect(widget).to.have.property('aggregate_function');
      });
    });


  });
  it.skip('MetricDefinitionResponse JSON response', () => {
    cy.writeFile(
      'cypress/e2e/core/cloudpulse/api-response/netloadbalancer-metric-definition.json',
      metricDefinitionResponse
    );
  });
  it.skip('dashboardResponse JSON response', () => {
    cy.writeFile(
      'cypress/e2e/core/cloudpulse/api-response/netloadbalancer-dashboard-response.json',
      dashboardResponse
    );
  });
});
