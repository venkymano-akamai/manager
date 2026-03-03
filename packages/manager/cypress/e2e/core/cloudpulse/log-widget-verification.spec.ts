/**
 * @file Integration Tests for CloudPulse Logs Dashboard.
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
} from 'support/intercepts/cloudpulse';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetUserPreferences } from 'support/intercepts/profile';
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

/**
 * This test ensures that widget titles are displayed correctly on the dashboard.
 * This test suite is dedicated to verifying the functionality and display of widgets on the Cloudpulse dashboard.
 *  It includes:
 * Validating that widgets are correctly loaded and displayed.
 * Ensuring that widget titles and data match the expected values.
 * Verifying that widget settings, such as granularity and aggregation, are applied correctly.
 * Testing widget interactions, including zooming and filtering, to ensure proper behavior.
 * Each test ensures that widgets on the dashboard operate correctly and display accurate information.
 */
const expectedGranularityArray = ['Auto', '1 day', '1 hr'];
const timeDurationToSelect = 'Last 24 Hours';
const { dashboardName, id, metrics, statusCode, streamName } =
  widgetDetails.logs;
const serviceType = 'logs';

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

// Dashboard creation
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

/**
 * Generates graph data from a given CloudPulse metrics response and
 * extracts average, last, and maximum metric values from the first
 * legend row. The values are rounded to two decimal places for
 * better readability.
 *
 * @param responsePayload - The metrics response blockstorage containing
 *                          the necessary data for graph generation.
 * @param label - The label for the graph, used for display purposes.
 *
 * @returns An object containing formatted metric values for the first legend
 *          row, with `average`, `last`, and `max` properties representing the
 *          rounded values as human-readable strings.
 */

const getWidgetLegendRowValuesFromResponse = (
  responsePayload: CloudPulseMetricsResponse,
  label: string,
  unit: string
) => {
  // Generate graph data using the provided parameters
  const graphData = generateGraphData({
    label,
    metricsList: responsePayload,
    resources: [
      {
        id: '1',
        label: 'us-ord-1',
        region: 'us-ord',
      },
    ],
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

const metricDefinitions = metrics.map(({ name, title, unit }) =>
  dashboardMetricFactory.build({
    label: title,
    metric: name,
    unit,
    dimensions: [...getFiltersForMetric(name)],
  })
);

const streams = streamFactory.build({ label: streamName });
describe('Integration Tests for Logs Dashboard ', () => {
  /**
   * Integration Tests for Logs Dashboard
   *
   * This suite validates end-to-end functionality of the CloudPulse  Logs Dashboard.
   * It covers:
   * - Loading and rendering of widgets with correct filters.
   * - Applying, clearing, and verifying "Group By" at dashboard and widget levels.
   * - Selecting time ranges, granularities, and aggregation functions.
   * - Triggering dashboard refresh and validating API calls.
   * - Performing widget interactions (zoom in/out) and verifying graph data.
   *
   * Actions focus on user flows (selecting dashboards, filters, group by, zoom, etc.)
   * and Verifications ensure correct API payloads, widget states, applied filters,
   * and accurate graph/legend values.
   */
  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(accountFactory.build());
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions);
    mockGetCloudPulseDashboards(serviceType, [dashboard]).as('fetchDashboard');
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetCloudPulseDashboard(id, dashboard).as('fetchDashboard');
    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    mockGetStreams([streams]);
    mockGetUserPreferences({});
    mockGetStreamById(1, streams);

    // navigate to the metrics page
    cy.visitWithLogin('/metrics');

    // Wait for the services and dashboard API calls to complete before proceeding
    cy.wait(['@fetchServices']);
    cy.wait('@fetchDashboard').then((interception: Interception) => {
      const dashboards = interception.response?.body?.data as Dashboard[];
      const dashboard = dashboards[0];
      expect(dashboard.widgets).to.have.length(3);
    });

    // Selecting a dashboard from the autocomplete input.
    ui.autocomplete
      .findByLabel('Dashboard')
      .should('be.visible')
      .type(dashboardName);

    ui.autocompletePopper
      .findByTitle(dashboardName)
      .should('be.visible')
      .click();

    cy.findByPlaceholderText('e.g., 200,404,500').type(String(statusCode));

    ui.autocomplete
      .findByLabel('Stream Names')
      .should('be.visible')
      .type(streamName);

    ui.autocompletePopper.findByTitle(streamName).should('be.visible').click();

    // Select a time duration from the autocomplete input.
    ui.button.findByTitle('Last hour').as('timeRangeTrigger');
    cy.get('@timeRangeTrigger').click();

    // select a different preset but cancel
    ui.button.findByTitle('Last day').click();

    cy.get('[data-qa-buttons="apply"]')
      .should('be.visible')
      .should('be.enabled')
      .click();

    // Wait for all metrics query requests to resolve.
    cy.wait(['@getMetrics', '@getMetrics', '@getMetrics']);
  });
  it('should apply group by at the dashboard level and verify the metrics API calls', () => {
    // Stub metrics API calls for dashboard group by changes
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload, {
      entity_id: '1',
    }).as('refreshMetrics');

    // Validate legend rows (pre "Group By")
    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector)
        .should('be.visible')
        .within(() => {
          const graphRowTitle = `[data-qa-graph-row-title="${testData.title}"]`;
          cy.get(graphRowTitle)
            .should('be.visible')
            .and('have.text', `${testData.title}`);
        });
    });

    // Locate the Dashboard Group By button and alias it
    ui.button
      .findByAttribute('aria-label', 'Group By Dashboard Metrics')
      .should('be.visible')
      .first()
      .as('dashboardGroupByBtn');

    // Ensure the button is scrolled into view
    cy.get('@dashboardGroupByBtn').scrollIntoView();

    // Verify tooltip "Group By" is present
    ui.tooltip.findByText('Group By');

    // Assert that the button has attribute data-qa-selected="true"
    cy.get('@dashboardGroupByBtn')
      .invoke('attr', 'data-qa-selected')
      .should('eq', 'true');

    // Click the Group By button to open the drawer
    cy.get('@dashboardGroupByBtn').should('be.visible').click();

    // Verify the drawer title is "Global Group By"
    cy.get('[data-testid="drawer-title"]')
      .should('be.visible')
      .and('have.text', 'Global Group By');

    // Verify the drawer body contains "Object Storage Dashboard"
    cy.get('[data-testid="drawer"]')
      .find('p')
      .first()
      .and('have.text', dashboardName);

    ui.autocomplete
      .findByLabel('Dimensions')
      .should('be.visible')
      .type('status_code');

    // Select "Node Type" from the popper options
    ui.autocompletePopper
      .findByTitle('status_code')
      .should('be.visible')
      .click();

    // Close the drawer using ESC
    cy.get('body').type('{esc}');

    // Click Apply to confirm the Group By selection
    cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

    // Verify the Group By button reflects the selection
    ui.button
      .findByAttribute('aria-label', 'Group By Dashboard Metrics')
      .should('have.attr', 'aria-label', 'Group By Dashboard Metrics')
      .and('have.attr', 'data-qa-selected', 'true');

    // Validate all intercepted metrics API calls contain correct filters and group_by values
    cy.get('@refreshMetrics.all')
      .should('have.length', 3)
      .each((interception: Interception) => {
        const { body: requestPayload } = interception.request;

        // Ensure group_by contains entity_id and node_type in correct order
        expect(requestPayload.group_by).to.have.ordered.members([
          'entity_id',
          'status_code',
        ]);
      });

    // Validate legend rows (post "Group By")
    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector)
        .should('be.visible')
        .within(() => {
          cy.get(`[data-qa-graph-row-title='${streamName}']`)
            .should('be.visible')
            .and('have.text', streamName);
        });
    });
  });

  it('should unselect all group bys and verify the metrics API calls', () => {
    // Stub metrics API calls for dashboard group by changes
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'refreshMetrics'
    );

    // Locate the Dashboard Group By button and alias it
    ui.button
      .findByAttribute('aria-label', 'Group By Dashboard Metrics')
      .should('be.visible')
      .first()
      .as('dashboardGroupByBtn');

    // Ensure the button is scrolled into view
    cy.get('@dashboardGroupByBtn').scrollIntoView();

    // Click the Group By button to open the drawer
    cy.get('@dashboardGroupByBtn').should('be.visible').click();

    // Inside Dimensions field, click the Clear button to remove all group by selections
    cy.get('[data-qa-autocomplete="Dimensions"]').within(() => {
      cy.get('button[aria-label="Clear"]').should('be.visible').click({});
    });

    // Click Apply to confirm unselection
    cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

    // Verify the Group By button now has data-qa-selected="false"
    ui.button
      .findByAttribute('aria-label', 'Group By Dashboard Metrics')
      .and('have.attr', 'data-qa-selected', 'false');

    // Validate all intercepted metrics API calls contain no group_by values
    cy.get('@refreshMetrics.all')
      .should('have.length', 3)
      .each((interception: Interception) => {
        const { body: requestPayload } = interception.request;

        // Ensure group_by is cleared (null, undefined, or empty array)
        expect(requestPayload.group_by).to.be.oneOf([null, undefined, []]);
      });
    // Validate legend rows (post "Group By")
    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector)
        .should('be.visible')
        .within(() => {
          cy.get(`[data-qa-graph-row-title="${testData.title}"]`)
            .should('be.visible')
            .and('have.text', testData.title);
        });
    });
  });

  it('should allow users to select their desired granularity and see the most recent data from the API reflected in the graph', () => {
    // validate the widget level granularity selection and its metrics
    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector)
        .should('be.visible')
        .find('h2')
        .should('have.text', `${testData.title} (${testData.unit})`);
      cy.get(widgetSelector)
        .should('be.visible')
        .within(() => {
          // check for all available granularity in popper
          ui.autocomplete
            .findByLabel('Select an Interval')
            .should('be.visible')
            .click();

          expectedGranularityArray.forEach((option) => {
            ui.autocompletePopper.findByTitle(option).should('exist');
          });

          mockCreateCloudPulseMetrics(
            serviceType,
            metricsAPIResponsePayload
          ).as('getGranularityMetrics');

          // find the interval component and select the expected granularity
          ui.autocomplete
            .findByLabel('Select an Interval')
            .should('be.visible')
            .type(`${testData.expectedGranularity}{enter}`); // type expected granularity

          // check if the API call is made correctly with time granularity value selected
          cy.wait('@getGranularityMetrics').then((interception) => {
            expect(interception)
              .to.have.property('response')
              .with.property('statusCode', 200);
            expect(testData.expectedGranularity).to.include(
              interception.request.body.time_granularity.value
            );
          });

          // validate the widget areachart is present
          cy.get('.recharts-responsive-container').within(() => {
            const expectedWidgetValues = getWidgetLegendRowValuesFromResponse(
              metricsAPIResponsePayload,
              testData.title,
              testData.unit
            );
            const graphRowTitle = `[data-qa-graph-row-title="${testData.title}"]`;
            cy.get(graphRowTitle)
              .should('be.visible')
              .should('have.text', `${testData.title}`);

            cy.get('[data-qa-graph-column-title="Max"]')
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.max}`);

            cy.get('[data-qa-graph-column-title="Avg"]')
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.average}`);

            cy.get('[data-qa-graph-column-title="Last"]')
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.last}`);
          });
        });
    });
  });
  it('should allow users to select the desired aggregation and view the latest data from the API displayed in the graph', () => {
    // Register mock ONCE before the loop
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getAggregationMetrics'
    );

    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector)
        .should('be.visible')
        .within(() => {
          // find the interval component and select the expected granularity
          ui.autocomplete
            .findByLabel('Select an Aggregate Function')
            .should('be.visible')
            .type(`${testData.expectedAggregation}{enter}`);

          // check if the API call is made correctly with aggregation value selected
          cy.wait('@getAggregationMetrics').then((interception) => {
            expect(interception)
              .to.have.property('response')
              .with.property('statusCode', 200);
            expect(testData.expectedAggregation).to.equal(
              interception.request.body.metrics[0].aggregate_function
            );
          });

          // validate the widget areachart is present
          cy.get('.recharts-responsive-container').within(() => {
            const expectedWidgetValues = getWidgetLegendRowValuesFromResponse(
              metricsAPIResponsePayload,
              testData.title,
              testData.unit
            );
            const graphRowTitle = `[data-qa-graph-row-title="${testData.title}"]`;
            cy.get(graphRowTitle)
              .should('be.visible')
              .should('have.text', `${testData.title}`);

            cy.get('[data-qa-graph-column-title="Max"]')
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.max}`);

            cy.get('[data-qa-graph-column-title="Avg"]')
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.average}`);

            cy.get('[data-qa-graph-column-title="Last"]')
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.last}`);
          });
        });
    });
  });
  it('should trigger the global refresh button and verify the corresponding network calls', () => {
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'refreshMetrics'
    );

    // click the global refresh button
    ui.button
      .findByAttribute('aria-label', 'Refresh Dashboard Metrics')
      .should('be.visible')
      .click();

    // validate the API calls are going with intended payload
    cy.get('@refreshMetrics.all')
      .should('have.length', 3)
      .each((interception: Interception) => {
        const { body: requestPayload } = interception.request;
        const { metrics: metric, relative_time_duration: timeRange } =
          requestPayload;
        const metricData = metrics.find(({ name }) => name === metric[0].name);

        if (!metricData) {
          throw new Error(
            `Unexpected metric name '${metric[0].name}' included in the outgoing refresh API request`
          );
        }
        expect(metric[0].name).to.equal(metricData.name);
        expect(timeRange).to.have.property('unit', 'days');
        expect(timeRange).to.have.property('value', 1);
      });
  });

  it('should zoom in and out of all the widgets', () => {
    // do zoom in and zoom out test on all the widgets
    metrics.forEach((testData) => {
      cy.get(`[data-qa-widget="${testData.title}"]`).as('widget');
      cy.get('@widget')
        .should('be.visible')
        .within(() => {
          ui.button
            .findByAttribute('aria-label', 'Zoom Out')
            .should('be.visible')
            .should('be.enabled')
            .click();
          cy.get('@widget').should('be.visible');

          cy.get('.recharts-responsive-container').within(() => {
            const expectedWidgetValues = getWidgetLegendRowValuesFromResponse(
              metricsAPIResponsePayload,
              testData.title,
              testData.unit
            );
            const graphRowTitle = `[data-qa-graph-row-title="${testData.title}"]`;
            cy.get(graphRowTitle)
              .should('be.visible')
              .should('have.text', `${testData.title}`);

            cy.get('[data-qa-graph-column-title="Max"]')
              .should('be.visible')
              .should('have.text', expectedWidgetValues.max);

            cy.get('[data-qa-graph-column-title="Avg"]')
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.average}`);

            cy.get('[data-qa-graph-column-title="Last"]')
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.last}`);
          });

          // click zoom out and validate the same
          ui.button
            .findByAttribute('aria-label', 'Zoom In')
            .should('be.visible')
            .should('be.enabled')
            .scrollIntoView()
            .click({ force: true });
          cy.get('@widget').should('be.visible');
          cy.get('.recharts-responsive-container').within(() => {
            const expectedWidgetValues = getWidgetLegendRowValuesFromResponse(
              metricsAPIResponsePayload,
              testData.title,
              testData.unit
            );
            const graphRowTitle = `[data-qa-graph-row-title="${testData.title}"]`;
            cy.get(graphRowTitle)
              .should('be.visible')
              .should('have.text', `${testData.title}`);

            cy.get('[data-qa-graph-column-title="Max"]')
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.max}`);

            cy.get('[data-qa-graph-column-title="Avg"]')
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.average}`);

            cy.get('[data-qa-graph-column-title="Last"]')
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.last}`);
          });
        });
    });
  });
});
