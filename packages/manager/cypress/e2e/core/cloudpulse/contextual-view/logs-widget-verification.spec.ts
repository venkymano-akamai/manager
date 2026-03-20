/**
 * @file Integration Tests for CloudPulse Logs Service Contextual view.
 */
import { profileFactory } from '@linode/utilities';
import { widgetDetails } from 'support/constants/widgets';
import { mockGetAccount } from 'support/intercepts/account';
import {
  mockCreateCloudPulseJWEToken,
  mockCreateCloudPulseMetrics,
  mockGetCloudPulseDashboard,
  mockGetCloudPulseDashboards,
  mockGetCloudPulseMetricDefinitions,
  mockGetCloudPulseServices,
  mockGetStreamById,
  mockGetStreams,
  mockGetStreamsPaginated,
} from 'support/intercepts/cloudpulse';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetProfile } from 'support/intercepts/profile';
import { ui } from 'support/ui';
import { generateRandomMetricsData } from 'support/util/cloudpulse';

import {
  accountFactory,
  cloudPulseMetricsResponseFactory,
  dashboardFactory,
  dashboardMetricFactory,
  flagsFactory,
  streamFactory,
  widgetFactory,
} from 'src/factories';
import { generateGraphData } from 'src/features/CloudPulse/Utils/CloudPulseWidgetUtils';
import { formatToolTip } from 'src/features/CloudPulse/Utils/unitConversion';
import { humanizeLargeData } from 'src/features/CloudPulse/Utils/utils';

import type { CloudPulseMetricsResponse, Dashboard } from '@linode/api-v4';
import type { Interception } from 'support/cypress-exports';

// ─── Selector / Attribute Constants ──────────────────────────────────────────

const RECHARTS_CONTAINER = '.recharts-responsive-container';
const DATA_QA_WIDGET = 'data-qa-widget';
const DATA_QA_GRAPH_ROW_TITLE = 'data-qa-graph-row-title';
const GROUP_BY_ARIA_LABEL = 'Group By Dashboard Metrics';
const DRAWER_TITLE_TESTID = '[data-testid="drawer-title"]';
const DRAWER_TESTID = '[data-testid="drawer"]';
const DIMENSIONS_AUTOCOMPLETE = '[data-qa-autocomplete="Dimensions"]';
const ZOOM_OUT_ARIA = 'Zoom Out';
const ZOOM_IN_ARIA = 'Zoom In';
const COL_MAX = '[data-qa-graph-column-title="Max"]';
const COL_AVG = '[data-qa-graph-column-title="Avg"]';
const COL_LAST = '[data-qa-graph-column-title="Last"]';
const downloadCSV = 'Download CSV';
const downloadsFolder = Cypress.config('downloadsFolder');

// ─── Suite Constants ──────────────────────────────────────────────────────────

const expectedGranularityArray = ['Auto', '1 day', '1 hr'];
const timeDurationToSelect = 'Last 24 Hours';
const { dashboardName, id, metrics, statusCode, streamName } =
  widgetDetails.logs;
const serviceType = 'logs';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CLOCK_DATE = new Date('2025-08-01');
const BASE_TIMESTAMP = 1753939800; // Jul 31, 2025, 5:30 AM UTC
const INTERVAL_SECONDS = 300; // 5 min
const ROW_COUNT = 10;

const mockProfile = profileFactory.build({ timezone: 'UTC' });

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts widget-level filters into dashboard-compatible filter objects.
 */
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

/**
 * Generates and returns formatted legend row values (max, avg, last)
 * from a CloudPulse metrics API response payload.
 */
const getWidgetLegendRowValuesFromResponse = (
  responsePayload: CloudPulseMetricsResponse,
  label: string,
  unit: string
) => {
  const graphData = generateGraphData({
    label,
    metricsList: responsePayload,
    resources: [{ id: '1', label: 'us-ord-1', region: 'us-ord' }],
    status: 'success',
    unit,
    serviceType,
    groupBy: ['entity_id'],
  });

  const { average, last, max } = graphData.legendRowsData[0].data;

  const formatValue = (value: number) =>
    unit === 'Count'
      ? `${humanizeLargeData(value)} ${unit}`
      : formatToolTip(value, unit);

  return {
    average: formatValue(average),
    last: formatValue(last),
    max: formatValue(max),
  };
};

/**
 * Reusable helper to validate legend row values (Max, Avg, Last)
 * inside a recharts container for a given widget's test data.
 */
const validateLegendRows = (testData: (typeof metrics)[0]) => {
  cy.get(RECHARTS_CONTAINER).within(() => {
    const expected = getWidgetLegendRowValuesFromResponse(
      metricsAPIResponsePayload,
      testData.title,
      testData.unit
    );

    cy.get(`[${DATA_QA_GRAPH_ROW_TITLE}="${testData.title}"]`)
      .should('be.visible')
      .and('have.text', testData.title);

    cy.get(COL_MAX).should('be.visible').and('have.text', expected.max);
    cy.get(COL_AVG).should('be.visible').and('have.text', expected.average);
    cy.get(COL_LAST).should('be.visible').and('have.text', expected.last);
  });
};

/**
 * Verifies granularity interception response and request payload.
 */
const verifyGranularityInterception = (
  interception: Interception,
  expectedGranularity: string
) => {
  expect(interception.response?.statusCode).to.equal(200);
  expect(expectedGranularity).to.include(
    interception.request.body.time_granularity.value
  );
};

/**
 * Verifies aggregation interception response and request payload.
 */
const verifyAggregationInterception = (
  interception: Interception,
  expectedAggregation: string
) => {
  expect(interception.response?.statusCode).to.equal(200);
  expect(expectedAggregation).to.equal(
    interception.request.body.metrics[0].aggregate_function
  );
};

/**
 * Extracts a key/value pair from a CSV metadata row.
 */
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

/**
 * Reads and validates the downloaded CSV file against expected values.
 */
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

    // --- Time Range ---
    const csvDuration = getValue(lines, 'Time Range');
    expect(csvDuration.key).to.equal('Time Range');
    expect(csvDuration.value).to.equal('Last day');

    const streamRow = getValue(lines, 'Stream Names');
    expect(streamRow.key).to.equal('Stream Names');
    expect(streamRow.value).to.equal(streamName);

    // --- Stream ---
    const statusCodeRow = getValue(lines, 'Status Code');
    expect(statusCodeRow.key).to.equal('Status Code');
    expect(statusCodeRow.value).to.equal('200');

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

    // --- Timestamp header ---
    const timestampHeader = lines.find((l) => l.startsWith('"time (UTC)"'));
    expect(timestampHeader).to.equal(`"time (UTC)","${streamName}"`);

    // --- Data rows ---
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

// ─── Factories ────────────────────────────────────────────────────────────────

const dashboard = dashboardFactory.build({
  label: dashboardName,
  group_by: ['entity_id'],
  service_type: serviceType,
  id,
  widgets: metrics.map(({ name, title, unit, yLabel }) =>
    widgetFactory.build({
      label: title,
      metric: name,
      unit,
      y_label: yLabel,
      namespace_id: id,
      service_type: serviceType,
    })
  ),
});

// metricsAPIResponsePayload uses metricValues so mock data and
// expectedRows are always derived from the same source of truth
const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: {
    result: generateRandomMetricsData(timeDurationToSelect, '5 min').result.map(
      (metricResult) => ({
        ...metricResult,
        values: metricValues,
      })
    ),
  },
});

const metricDefinitions = metrics.map(({ name, title, unit }) =>
  dashboardMetricFactory.build({
    label: title,
    metric: name,
    unit,
    dimensions: [...getFiltersForMetric(name)],
  })
);

const streams = streamFactory.build({ label: streamName, id: 1 });

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Integration Tests for Logs Dashboard', () => {
  beforeEach(() => {
    cy.exec(
      `find "${downloadsFolder}" -maxdepth 1 -type f \\( \
        -name "Error*" -o \
        -name "Success*" \
        \\) -delete`,
      { failOnNonZeroExit: false }
    );
    cy.clock(MOCK_CLOCK_DATE.getTime(), ['Date']);
    mockGetProfile(mockProfile);

    // ── Mocks ──
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(accountFactory.build());
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions);
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetCloudPulseDashboards(serviceType, [dashboard]).as('fetchDashboards');
    mockGetCloudPulseDashboard(id, dashboard).as('fetchDashboardById');
    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    mockGetStreams([streams]);
    mockGetStreamsPaginated([streams]);
    mockGetStreamById(streams.id, streams).as('fetchStream');

    // ── Navigation ──
    cy.visitWithLogin(`logs/delivery/streams/${streams.id}/edit`);
    cy.wait('@fetchStream');
    cy.wait('@fetchDashboards').then((interception: Interception) => {
      const dashboards = interception.response?.body?.data as Dashboard[];
      expect(dashboards[0].widgets).to.have.length(3);
    });

    // ── Verify Dashboard autocomplete is disabled and pre-filled ──
    ui.autocomplete
      .findByLabel('Dashboard')
      .should('be.disabled')
      .should('have.value', dashboardName);

    // ── Apply status code filter ──
    cy.findByPlaceholderText('e.g., 200,400').type(`${statusCode}`);

    // ── Select time range ──
    ui.button.findByTitle('Last hour').click();
    ui.button.findByTitle('Last day').click();
    cy.get('[data-qa-buttons="apply"]')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // ── Wait for initial metrics load ──
    cy.wait(['@getMetrics', '@getMetrics', '@getMetrics']);
  });

  // ─── Test: Group By at Dashboard Level ──────────────────────────────────────

  it('should apply group by at the dashboard level and verify the metrics API calls', () => {
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload, {
      entity_id: '1',
    }).as('refreshMetrics');

    metrics.forEach((testData) => {
      cy.get(`[${DATA_QA_WIDGET}="${testData.title}"]`)
        .should('be.visible')
        .within(() => {
          cy.get(`[${DATA_QA_GRAPH_ROW_TITLE}="${testData.title}"]`)
            .should('be.visible')
            .and('have.text', testData.title);
        });
    });

    ui.button
      .findByAttribute('aria-label', GROUP_BY_ARIA_LABEL)
      .should('be.visible')
      .first()
      .as('dashboardGroupByBtn');

    cy.get('@dashboardGroupByBtn').scrollIntoView();
    ui.tooltip.findByText('Group By');

    cy.get('@dashboardGroupByBtn').should(
      'have.attr',
      'data-qa-selected',
      'true'
    );

    cy.get('@dashboardGroupByBtn').click();

    cy.get(DRAWER_TITLE_TESTID)
      .should('be.visible')
      .and('have.text', 'Global Group By');

    cy.get(DRAWER_TESTID).find('p').first().and('have.text', dashboardName);

    ui.autocomplete
      .findByLabel('Dimensions')
      .should('be.visible')
      .type('status_code');

    ui.autocompletePopper
      .findByTitle('status_code')
      .should('be.visible')
      .click();

    cy.get('body').type('{esc}');
    cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

    cy.get('@dashboardGroupByBtn')
      .should('have.attr', 'aria-label', GROUP_BY_ARIA_LABEL)
      .and('have.attr', 'data-qa-selected', 'true');

    cy.get('@refreshMetrics.all')
      .should('have.length', 3)
      .each((interception: Interception) => {
        expect(interception.request.body.group_by).to.have.ordered.members([
          'entity_id',
          'status_code',
        ]);
      });

    metrics.forEach((testData) => {
      cy.get(`[${DATA_QA_WIDGET}="${testData.title}"]`)
        .should('be.visible')
        .within(() => {
          cy.get(`[${DATA_QA_GRAPH_ROW_TITLE}="${streamName}"]`)
            .should('be.visible')
            .and('have.text', streamName);
        });
    });
  });

  // ─── Test: Unselect All Group Bys ───────────────────────────────────────────

  it('should unselect all group bys and verify the metrics API calls', () => {
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'refreshMetrics'
    );

    ui.button
      .findByAttribute('aria-label', GROUP_BY_ARIA_LABEL)
      .should('be.visible')
      .first()
      .as('dashboardGroupByBtn');

    cy.get('@dashboardGroupByBtn').scrollIntoView();
    cy.get('@dashboardGroupByBtn').click();

    cy.get(DIMENSIONS_AUTOCOMPLETE).within(() => {
      cy.get('button[aria-label="Clear"]').should('be.visible').click();
    });

    cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

    cy.get('@dashboardGroupByBtn').should(
      'have.attr',
      'data-qa-selected',
      'false'
    );

    cy.get('@refreshMetrics.all')
      .should('have.length', 3)
      .each((interception: Interception) => {
        const { group_by } = interception.request.body;
        expect(
          group_by === null ||
            group_by === undefined ||
            (Array.isArray(group_by) && group_by.length === 0),
          'group_by should be null, undefined, or empty array'
        ).to.be.true;
      });

    metrics.forEach((testData) => {
      cy.get(`[${DATA_QA_WIDGET}="${testData.title}"]`)
        .should('be.visible')
        .within(() => {
          cy.get(`[${DATA_QA_GRAPH_ROW_TITLE}="${testData.title}"]`)
            .should('be.visible')
            .and('have.text', testData.title);
        });
    });
  });

  // ─── Test: Granularity Selection ────────────────────────────────────────────

  it('should allow users to select their desired granularity and see the most recent data from the API reflected in the graph', () => {
    metrics.forEach((testData) => {
      const widgetSelector = `[${DATA_QA_WIDGET}="${testData.title}"]`;

      cy.get(widgetSelector)
        .should('be.visible')
        .find('h2')
        .should('have.text', `${testData.title} (${testData.unit})`);

      cy.get(widgetSelector).within(() => {
        ui.autocomplete
          .findByLabel('Select an Interval')
          .should('be.visible')
          .click();

        expectedGranularityArray.forEach((option) => {
          ui.autocompletePopper.findByTitle(option).should('exist');
        });

        mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
          'getGranularityMetrics'
        );

        ui.autocomplete
          .findByLabel('Select an Interval')
          .should('be.visible')
          .type(`${testData.expectedGranularity}{enter}`);

        cy.wait('@getGranularityMetrics').then((interception: Interception) => {
          verifyGranularityInterception(
            interception,
            testData.expectedGranularity
          );
        });

        validateLegendRows(testData);
      });
    });
  });

  // ─── Test: Aggregation Selection ────────────────────────────────────────────

  it('should allow users to select the desired aggregation and view the latest data from the API displayed in the graph', () => {
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getAggregationMetrics'
    );

    metrics.forEach((testData) => {
      cy.get(`[${DATA_QA_WIDGET}="${testData.title}"]`)
        .should('be.visible')
        .within(() => {
          ui.autocomplete
            .findByLabel('Select an Aggregate Function')
            .should('be.visible')
            .type(`${testData.expectedAggregation}{enter}`);

          cy.wait('@getAggregationMetrics').then(
            (interception: Interception) => {
              verifyAggregationInterception(
                interception,
                testData.expectedAggregation
              );
            }
          );

          validateLegendRows(testData);
        });
    });
  });

  // ─── Test: Widget Zoom In / Out ──────────────────────────────────────────────

  it('should zoom in and out of all the widgets', () => {
    metrics.forEach((testData) => {
      cy.get(`[${DATA_QA_WIDGET}="${testData.title}"]`)
        .should('be.visible')
        .within(() => {
          ui.button
            .findByAttribute('aria-label', ZOOM_OUT_ARIA)
            .should('be.visible')
            .and('be.enabled')
            .click();

          validateLegendRows(testData);

          ui.button
            .findByAttribute('aria-label', ZOOM_IN_ARIA)
            .should('be.visible')
            .and('be.enabled')
            .scrollIntoView()
            .click({ force: true });

          validateLegendRows(testData);
        });
    });
  });

  metrics.forEach((widgetConfig) => {
    it(`should download CSV and validate content for ${widgetConfig.title}`, () => {
      mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload, {
        entity_id: '1',
      }).as('getMetrics');

      const { title, name } = widgetConfig;
      const widgetSelector = `[${DATA_QA_WIDGET}="${title}"]`;

      // ── Assert widget is visible ────────────────────────────────────────
      cy.get(widgetSelector)
        .should('be.visible')
        .find('h2')
        .should('contain.text', title);

      // ── Set interval, aggregation, trigger CSV download ─────────────────
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

      // ── Build CSV file path ─────────────────────────────────────────────
      const sanitizedTitle = widgetConfig.title.replace(/\//g, '_');
      const csvFilePath = `${downloadsFolder}/${sanitizedTitle}.csv`;

      // ── Find matching interception and validate CSV ─────────────────────
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
