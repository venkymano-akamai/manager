/* eslint-disable cypress/no-unnecessary-waiting */
/**
 * @file Integration Tests for CloudPulse Volume Dashboard – Refactored & Stable
 */

import { profileFactory, regionFactory } from '@linode/utilities';
import { widgetDetails } from 'support/constants/widgets';
import { mockGetAccount } from 'support/intercepts/account';
import {
  mockCreateCloudPulseJWEToken,
  mockCreateCloudPulseMetrics,
  mockGetCloudPulseDashboard,
  mockGetCloudPulseDashboards,
  mockGetCloudPulseMetricDefinitions,
  mockGetCloudPulseServices,
} from 'support/intercepts/cloudpulse';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetProfile } from 'support/intercepts/profile';
import { mockGetRegions } from 'support/intercepts/regions';
import { mockGetVolume, mockGetVolumes } from 'support/intercepts/volumes';
import { ui } from 'support/ui';
import { generateRandomMetricsData } from 'support/util/cloudpulse';

import {
  accountFactory,
  cloudPulseMetricsResponseFactory,
  dashboardFactory,
  dashboardMetricFactory,
  flagsFactory,
  volumeFactory,
  widgetFactory,
} from 'src/factories';
import { generateGraphData } from 'src/features/CloudPulse/Utils/CloudPulseWidgetUtils';
import { formatToolTip } from 'src/features/CloudPulse/Utils/unitConversion';
import { humanizeLargeData } from 'src/features/CloudPulse/Utils/utils';

import type { CloudPulseMetricsResponse } from '@linode/api-v4';
import type { Interception } from 'support/cypress-exports';

const expectedGranularityArray = ['Auto', '1 day', '1 hr'];
const downloadsFolder = Cypress.config('downloadsFolder');
const { dashboardName, id, metrics } = widgetDetails.blockstorage;

const serviceType = 'blockstorage';
const capabilities = 'Block Storage';

const dimensions = [
  { label: 'Region', dimension_label: 'region', value: 'us-ord' },
];
const MOCK_CLOCK_DATE = new Date('2025-08-01');
const mockProfile = profileFactory.build({
  timezone: 'UTC',
});
const downloadCSV = 'Download CSV';

const getValue = (
  lines: string[],
  key: string
): { key: string; value: string } => {
  const line = lines.find((l) => l.startsWith(`"${key}"`));
  if (!line) {
    throw new Error(`CSV row not found for key: "${key}"`);
  }
  const [parsedKey, parsedValue] = line.split('","');
  return {
    key: parsedKey?.replace(/^"/, '').trim(),
    value: parsedValue?.replace(/"$/, '').trim(),
  };
};

const matchesWidgetName = (m: { name: string }, widgetName: string) =>
  m.name === widgetName;

const findInterceptionForWidget = (
  interceptions: Interception[],
  widgetName: string
) =>
  [...interceptions]
    .reverse()
    .find((i) =>
      i.request.body.metrics.some((m: { name: string }) =>
        matchesWidgetName(m, widgetName)
      )
    );
const BASE_TIMESTAMP = 1753939800;
const INTERVAL_SECONDS = 300;
const ROW_COUNT = 10;
const metricValues: [number, string][] = Array.from(
  { length: ROW_COUNT },
  (_, i) => [BASE_TIMESTAMP + i * INTERVAL_SECONDS, `${i + 1}.00`]
);

const expectedRows = metricValues.map(
  ([ts, val]) =>
    `"${new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    }).format(new Date(ts * 1000))}","${parseInt(val)}"`
);

const validateCSV = (
  csvFilePath: string,
  widgetConfig: (typeof metrics)[number],
  _interception: Interception
) => {
  cy.readFile(csvFilePath).then((csvContent: string) => {
    const lines = csvContent.split('\n').map((l) => l.trim());

    // --- Dashboard ---
    const dashboardRow = getValue(lines, 'Dashboard');
    expect(dashboardRow.key).to.equal('Dashboard');
    expect(dashboardRow.value).to.equal(dashboardName);

    const csvDuration = getValue(lines, 'Time Range');
    expect(csvDuration.key).to.equal('Time Range');
    expect(csvDuration.value).to.equal('Last hour');

    const dbClusters = getValue(lines, 'Volumes');
    expect(dbClusters.key).to.equal('Volumes');
    expect(dbClusters.value).to.equal('test-volume-ord');

    const groupByRow = getValue(lines, 'Group By');
    expect(groupByRow.key).to.equal('Group By');
    expect(groupByRow.value).to.equal('Entity Id');

    // --- Aggregation Function ---
    const aggregationRow = getValue(lines, 'Aggregation Function');
    expect(aggregationRow.key).to.equal('Aggregation Function');
    expect(aggregationRow.value.toLowerCase()).to.equal(
      widgetConfig.expectedAggregation.toLowerCase()
    );

    // --- Data Aggregation Interval ---
    const granularityRow = getValue(lines, 'Data Aggregation Interval');
    expect(granularityRow.key).to.equal('Data Aggregation Interval');
    expect(granularityRow.value).to.equal(widgetConfig.expectedGranularity);

    // --- Widget Metadata ---
    const metricRow = getValue(lines, 'Metric');
    expect(metricRow.key).to.equal('Metric');
    expect(metricRow.value).to.equal(widgetConfig.title);

    const unitRow = getValue(lines, 'Unit');
    expect(unitRow.key).to.equal('Unit');
    expect(unitRow.value).to.equal(widgetConfig.unit);

    const timestampHeader = lines.find((l) => l.startsWith('"time (UTC)"'));
    expect(timestampHeader).to.equal('"time (UTC)","test-volume-ord"');

    const headerIndex = lines.findIndex((l) => l.startsWith('"time (UTC)"'));

    const csvRows = lines.slice(headerIndex + 2, headerIndex + 2 + ROW_COUNT);
    cy.wrap(null).then(() => {
      const mismatches: string[] = [];
      expectedRows.forEach((expectedRow, index) => {
        if (csvRows[index] !== expectedRow) {
          mismatches.push(
            `Row ${index}: expected "${expectedRow}" got "${csvRows[index]}"`
          );
        }
      });
      if (mismatches.length > 0) {
        throw new Error(`CSV row mismatches:\n${mismatches.join('\n')}`);
      }
    });
  });
};

// Convert widget filters to dashboard filters
const getFiltersForMetric = (metricName: string) => {
  const metric = metrics.find((m) => m.name === metricName);
  if (!metric) return [];

  return metric.filters.map((filter) => ({
    dimension_label: filter.dimension_label,
    label: filter.dimension_label,
    values: filter.value
      ? Array.isArray(filter.value)
        ? filter.value
        : [filter.value]
      : undefined,
  }));
};

// Dashboard + Metric Definitions
const dashboard = dashboardFactory.build({
  label: dashboardName,
  group_by: ['entity_id'],
  service_type: serviceType,
  id,
  widgets: metrics.map(({ name, title, unit, yLabel }) =>
    widgetFactory.build({
      filters: [...dimensions],
      label: title,
      metric: name,
      unit,
      y_label: yLabel,
      namespace_id: id,
      service_type: serviceType,
    })
  ),
});

const metricDefinitions = metrics.map(({ name, title, unit }) =>
  dashboardMetricFactory.build({
    label: title,
    metric: name,
    unit,
    dimensions: [...dimensions, ...getFiltersForMetric(name)],
  })
);

const mockRegions = [
  regionFactory.build({
    capabilities: [capabilities],
    id: 'us-ord',
    label: 'Chicago, IL',
    monitors: { metrics: [capabilities], alerts: [] },
  }),
];

const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: {
    result: generateRandomMetricsData('Last 24 Hours', '5 min').result.map(
      (metricResult) => ({
        ...metricResult,
        values: metricValues,
      })
    ),
  },
});

const mockVolumesEncrypted = [
  volumeFactory.build({
    encryption: 'enabled',
    label: 'test-volume-ord',
    region: 'us-ord',
  }),
];

/** Extract expected Avg/Max/Last for comparison */
const getExpectedLegendValues = (
  response: CloudPulseMetricsResponse,
  label: string,
  unit: string
) => {
  const graphData = generateGraphData({
    label,
    metricsList: response,
    resources: [{ id: '1', label: 'us-ord-1', region: 'us-ord' }],
    status: 'success',
    unit,
    serviceType,
    groupBy: ['entity_id'],
  });

  // Extract metrics from the first legend row
  const { average, last, max } = graphData.legendRowsData[0].data;

  // Helper function to format value based on unit
  const formatValue = (value: number) =>
    unit === 'Count'
      ? `${humanizeLargeData(value)} ${unit}`
      : formatToolTip(value, unit);

  // Return formatted metrics
  return {
    average: formatValue(average),
    last: formatValue(last),
    max: formatValue(max),
  };
};

/** Assert values inside a widget */
const assertLegendValues = (testData: {
  expectedAggregation?: string;
  expectedAggregationArray?: string[];
  expectedGranularity?: string;
  filters?: {
    dimension_label: string;
    operator: string;
    value: null | string[];
  }[];
  name?: string;
  title: string;
  unit: string;
  yLabel?: string;
}) => {
  const expected = getExpectedLegendValues(
    metricsAPIResponsePayload,
    testData.title,
    testData.unit
  );

  cy.get('.recharts-responsive-container').within(() => {
    cy.get(`[data-qa-graph-row-title="${testData.title}"]`).should(
      'have.text',
      testData.title
    );

    cy.get('[data-qa-graph-column-title="Max"]').should(
      'have.text',
      expected.max
    );
    cy.get('[data-qa-graph-column-title="Avg"]').should(
      'have.text',
      expected.average
    );
    cy.get('[data-qa-graph-column-title="Last"]').should(
      'have.text',
      expected.last
    );
  });
};

/** Open Global Group-By Drawer */
const openGlobalGroupBy = () => {
  ui.button
    .findByAttribute('aria-label', 'Group By Dashboard Metrics')
    .first()
    .scrollIntoView()
    .click();
};

/** Clear all group-by selections */
const clearGroupBy = () => {
  cy.get('[data-qa-autocomplete="Dimensions"]')
    .find('button[aria-label="Clear"]')
    .click();
};
beforeEach(() => {
  const folder = Cypress.config('downloadsFolder');
  cy.exec(`find "${folder}" -maxdepth 1 -iname "volume*.csv" -delete`, {
    failOnNonZeroExit: false,
  });
});
describe('CloudPulse Blockstorage Dashboard – Refactored', () => {
  beforeEach(() => {
    cy.clock(MOCK_CLOCK_DATE.getTime(), ['Date']);
    mockGetProfile(mockProfile);
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(accountFactory.build());
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions);
    mockGetCloudPulseDashboards(serviceType, [dashboard]).as('fetchDashboard');
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetCloudPulseDashboard(id, dashboard).as('fetchDashboard');
    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'initialMetrics'
    );

    mockGetRegions(mockRegions);
    mockGetVolume(mockVolumesEncrypted[0]);
    mockGetVolumes(mockVolumesEncrypted);

    cy.visitWithLogin('/volumes/1/metrics');

    ui.button
      .findByAttribute('aria-label', 'Group By Dashboard Metrics')
      .should('be.visible')
      .first()
      .as('dashboardGroupByBtn');

    // Ensure the button is scrolled into view
    cy.get('@dashboardGroupByBtn').scrollIntoView();

    ui.tooltip.findByText('Group By');
    cy.get('@dashboardGroupByBtn')
      .invoke('attr', 'data-qa-selected')
      .should('eq', 'true');

    cy.wait(1000);
  });

  it('applies Group By at dashboard level and validates API', () => {
    // The third parameter is an entity filter for the metrics API request.
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload, {
      entity_id: '1',
    }).as('refreshMetrics');

    openGlobalGroupBy();

    ui.autocomplete.findByLabel('Dimensions').type('Region');
    ui.autocompletePopper.findByTitle('Region').click();

    cy.get('body').type('{esc}');
    cy.findByTestId('apply').click();

    cy.get('@refreshMetrics.all')
      .should('have.length', 6)
      .each((interception: Interception) => {
        expect(interception.request.body.group_by).to.deep.equal([
          'entity_id',
          'region',
        ]);
      });
  });
  it('should clear all Group By selections', () => {
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'refreshMetrics'
    );

    openGlobalGroupBy();
    clearGroupBy();
    cy.findByTestId('apply').click();

    cy.get('@refreshMetrics.all').each((interception: Interception) => {
      expect(interception.request.body.group_by).to.be.oneOf([
        null,
        undefined,
        [],
      ]);
    });
  });

  it('applies widget-level Group By and validates API payload', () => {
    const widgetSelector = '[data-qa-widget="Volume Read Operations"]';

    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'widgetGroupBy'
    );

    cy.get(widgetSelector).within(() => {
      ui.button
        .findByAttribute('aria-label', 'Group By Dashboard Metrics')
        .as('widgetGroupBtn')
        .scrollIntoView()
        .click();
    });

    cy.get('[data-testid="drawer-title"]').should('have.text', 'Group By');
    cy.get('[data-qa-id="groupby-drawer-subtitle"]').should(
      'have.text',
      'Volume Read Operations'
    );

    ui.autocomplete.findByLabel('Dimensions').type('response_type');
    ui.autocompletePopper.findByTitle('response_type').click();

    cy.get('body').type('{esc}');
    cy.findByTestId('apply').click();

    cy.wait('@widgetGroupBy').then((interception: Interception) => {
      expect(interception.request.body.group_by).to.have.ordered.members([
        'entity_id',
        'response_type',
      ]);
    });
  });

  it('updates graph values when granularity changes', () => {
    metrics.forEach((testData) => {
      mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
        'granularity'
      );

      const widget = `[data-qa-widget="${testData.title}"]`;

      cy.get(widget).within(() => {
        ui.autocomplete.findByLabel('Select an Interval').click();

        expectedGranularityArray.forEach((opt) =>
          ui.autocompletePopper.findByTitle(opt).should('exist')
        );

        ui.autocomplete
          .findByLabel('Select an Interval')
          .type(`${testData.expectedGranularity}{enter}`);

        assertLegendValues(testData);
      });
    });
  });

  it('updates graph values when aggregation changes', () => {
    metrics.forEach((testData) => {
      mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
        'agg'
      );

      const widget = `[data-qa-widget="${testData.title}"]`;

      cy.get(widget).within(() => {
        ui.autocomplete
          .findByLabel('Select an Aggregate Function')
          .type(`${testData.expectedAggregation}{enter}`);

        cy.wait('@agg').then((i: Interception) => {
          expect(i.request.body.metrics[0].aggregate_function).to.eq(
            testData.expectedAggregation
          );
        });

        assertLegendValues(testData);
      });
    });
  });

  it('zooms in and out on all widgets', () => {
    metrics.forEach((testData) => {
      const widget = `[data-qa-widget="${testData.title}"]`;

      cy.get(widget).within(() => {
        ui.button.findByAttribute('aria-label', 'Zoom Out').click();
        assertLegendValues(testData);

        ui.button
          .findByAttribute('aria-label', 'Zoom In')
          .click({ force: true });
        assertLegendValues(testData);
      });
    });
  });

  metrics.forEach((widgetConfig) => {
    it(`should download CSV and validate content for ${widgetConfig.title}`, () => {
      mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload, {
        entity_id: '1',
      }).as('getMetrics');

      const { title, name } = widgetConfig;
      const widgetSelector = `[data-qa-widget="${title}"]`;

      // ── Assert widget is visible ──────────────────────────────────────────
      cy.get(widgetSelector)
        .should('be.visible')
        .find('h2')
        .should('contain.text', title);

      // ── Set interval, aggregation, trigger CSV download ───────────────────
      cy.get(widgetSelector)
        .should('be.visible')
        .within(() => {
          ui.autocomplete
            .findByLabel('Select an Interval')
            .should('be.visible')
            .type(`${widgetConfig.expectedGranularity}{enter}`);

          ui.autocomplete
            .findByLabel('Select an Aggregate Function')
            .should('be.visible')
            .type(`${widgetConfig.expectedAggregation}{enter}`);
          ui.tooltip.findByText(downloadCSV).should('be.visible');

          cy.get(`[aria-label="${downloadCSV}"] button`).as('csvButton');
          cy.get('@csvButton').scrollIntoView();

          cy.get('@csvButton').should('be.visible').should('be.enabled');

          cy.get('@csvButton').click({ force: true });
        });

      // ── Build CSV file path ───────────────────────────────────────────────
      const sanitizedTitle = widgetConfig.title.replace(/\//g, '_');
      const csvFilePath = `${downloadsFolder}/${sanitizedTitle}.csv`;

      // ── Find matching interception and validate CSV ───────────────────────
      cy.get('@getMetrics.all').then((calls) => {
        const interceptions = calls as unknown as Interception[];
        const interception = findInterceptionForWidget(interceptions, name);

        if (!interception) {
          throw new Error(`No interception found for widget: ${name}`);
        }

        validateCSV(csvFilePath, widgetConfig, interception);
      });
    });
  });
});
