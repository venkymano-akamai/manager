/**
 * @file Integration Tests for CloudPulse Logs Service Contextual view.
 */
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

// ─── Suite Constants ──────────────────────────────────────────────────────────

const expectedGranularityArray = ['Auto', '1 day', '1 hr'];
const timeDurationToSelect = 'Last 24 Hours';
const { dashboardName, id, metrics, statusCode, streamName } =
  widgetDetails.logs;
const serviceType = 'logs';

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
 * Verifies refresh interception response and request payload.
 */
const verifyRefreshInterception = (interception: Interception) => {
  const { metrics: metric, relative_time_duration: timeRange } =
    interception.request.body;
  const metricData = metrics.find(({ name }) => name === metric[0].name);

  if (!metricData) {
    throw new Error(
      `Unexpected metric name '${metric[0].name}' in refresh API request`
    );
  }

  expect(metric[0].name).to.equal(metricData.name);
  expect(timeRange).to.have.property('unit', 'days');
  expect(timeRange).to.have.property('value', 1);
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

const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: generateRandomMetricsData(timeDurationToSelect, '5 min'),
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
    cy.findByPlaceholderText('e.g., 200,404,500').type(`${statusCode}`);

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

    // Validate legend rows before applying Group By
    metrics.forEach((testData) => {
      cy.get(`[${DATA_QA_WIDGET}="${testData.title}"]`)
        .should('be.visible')
        .within(() => {
          cy.get(`[${DATA_QA_GRAPH_ROW_TITLE}="${testData.title}"]`)
            .should('be.visible')
            .and('have.text', testData.title);
        });
    });

    // Open Group By drawer
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

    // Select dimension
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

    // Verify API calls contain correct group_by values
    cy.get('@refreshMetrics.all')
      .should('have.length', 3)
      .each((interception: Interception) => {
        expect(interception.request.body.group_by).to.have.ordered.members([
          'entity_id',
          'status_code',
        ]);
      });

    // Validate legend rows after Group By
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

    // Clear all dimensions
    cy.get(DIMENSIONS_AUTOCOMPLETE).within(() => {
      cy.get('button[aria-label="Clear"]').should('be.visible').click();
    });

    cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

    cy.get('@dashboardGroupByBtn').should(
      'have.attr',
      'data-qa-selected',
      'false'
    );

    // Correctly validate empty/null group_by
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

    // Validate legend rows after clearing Group By
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
        // Verify all granularity options exist in popper
        ui.autocomplete
          .findByLabel('Select an Interval')
          .should('be.visible')
          .click();

        expectedGranularityArray.forEach((option) => {
          ui.autocompletePopper.findByTitle(option).should('exist');
        });

        // Register mock once per widget
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
    // Register mock once before the loop
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

  // ─── Test: Global Refresh (Skipped) ──────────────────────────────────────────

  // FIXME: Global refresh button has a race condition. Unskip after resolving CLOUD-XXXX.
  it.skip('should trigger the global refresh button and verify the corresponding network calls', () => {
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'refreshMetrics'
    );

    ui.button
      .findByAttribute('aria-label', 'Refresh Dashboard Metrics')
      .should('be.visible')
      .click();

    cy.get('@refreshMetrics.all')
      .should('have.length', 3)
      .each((interception: Interception) => {
        verifyRefreshInterception(interception);
      });
  });

  // ─── Test: Widget Zoom In / Out ───────────────────────────────────────────────

  it('should zoom in and out of all the widgets', () => {
    metrics.forEach((testData) => {
      cy.get(`[${DATA_QA_WIDGET}="${testData.title}"]`)
        .should('be.visible')
        .within(() => {
          // Zoom Out
          ui.button
            .findByAttribute('aria-label', ZOOM_OUT_ARIA)
            .should('be.visible')
            .and('be.enabled')
            .click();

          validateLegendRows(testData);

          // Zoom In
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
});
