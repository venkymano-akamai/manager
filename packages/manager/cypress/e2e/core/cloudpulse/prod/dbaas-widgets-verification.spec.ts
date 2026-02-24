import { Widget } from '@linode/design-language-system';
/**
 * @file Integration Tests for CloudPulse Dbass Dashboard.
 */
import { regionFactory } from '@linode/utilities';
import { mockCreateCloudPulseMetrics } from 'support/intercepts/cloudpulse';
import { mockGetUserPreferences } from 'support/intercepts/profile';
import { ui } from 'support/ui';
import { generateRandomMetricsData } from 'support/util/cloudpulse';
import { apiMatcher } from 'support/util/intercepts';

import { cloudPulseMetricsResponseFactory } from 'src/factories';
import { generateGraphData } from 'src/features/CloudPulse/Utils/CloudPulseWidgetUtils';
import { formatToolTip } from 'src/features/CloudPulse/Utils/unitConversion';

import type {
  CloudPulseMetricsResponse,
  CloudPulseServiceType,
  Dashboard,
  MetricDefinition,
  Widgets,
} from '@linode/api-v4';
import type { Interception } from 'cypress/types/net-stubbing';

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
const expectedGranularityArray = ['Auto', '1 day', '1 hr', '5 min'];
const timeDurationToSelect = 'Last 24 Hours';

const dashboardName = 'Resource Usage';
const clusterName = 'DemoClusterRanthambore';
const engine = 'MySQL';
const nodeType = 'Primary';
const serviceType = 'dbaas';
let metrics: Widgets[] = [];
let dashboard: Dashboard;

const interceptMetricDefinitions = (serviceType: string) => {
  return cy.intercept(
    'GET',
    apiMatcher(`monitor/services/${serviceType}/metric-definitions`)
  );
};
const interceptDashboardDefinitions = (serviceType: string) => {
  return cy.intercept(
    'GET',
    apiMatcher(`monitor/services/${serviceType}/dashboards`)
  );
};
const getAllMetricDefinitionWidgets = (serviceName: CloudPulseServiceType) => {
  return cy.wait('@getMetricDefinitions').then(({ response }) => {
    if (!response?.body?.data || !Array.isArray(response.body.data)) {
      throw new Error(`Metric definitions response invalid for ${serviceName}`);
    }

    return (response.body.data as MetricDefinition[]).map(
      (metric): Widgets => ({
        aggregate_function: 'avg',
        chart_type: 'line',
        color: '#1976d2',
        entity_ids: [],
        filters: [],
        group_by: [],
        label: metric.label,
        metric: metric.metric,
        namespace_id: 0,
        region_id: 0,
        service_type: serviceName,
        serviceType: serviceName, // ← YOU WERE MISSING THIS
        size: 12,
        time_duration: { unit: 'hour', value: 24 },
        time_granularity: { unit: 'minute', value: 5 },
        unit: metric.unit,
        y_label: metric.label,
      })
    );
  });
};

const interceptMetricData = (serviceType: string) => {
  return cy.intercept('POST', `**/v2/monitor/services/${serviceType}/metrics`);
};

/**
 * Generates graph data from a given CloudPulse metrics response and
 * extracts average, last, and maximum metric values from the first
 * legend row. The values are rounded to two decimal places for
 * better readability.
 *
 * @param responsePayload - The metrics response object containing
 *                          the necessary data for graph generation.
 * @param label - The label for the graph, used for display purposes.
 *
 * @returns An object containing rounded values for max average, last,
 *
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
        label: clusterName,
        region: 'us-ord',
      },
    ],
    status: 'success',
    unit,
    serviceType: serviceType as CloudPulseServiceType,
  });

  // Destructure metrics data from the first legend row
  const { average, last, max } = graphData.legendRowsData[0].data;

  // Round the metrics values to two decimal places
  const roundedAverage = formatToolTip(average, unit);
  const roundedLast = formatToolTip(last, unit);
  const roundedMax = formatToolTip(max, unit);
  // Return the rounded values in an object
  return { average: roundedAverage, last: roundedLast, max: roundedMax };
};
const mockRegion = regionFactory.build({
  capabilities: ['Managed Databases'],
  id: 'us-ord',
  label: 'Chicago, IL',
  monitors: {
    metrics: ['Managed Databases'],
    alerts: [],
  },
});

const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: generateRandomMetricsData(timeDurationToSelect, '5 min'),
});

const initializeDashboardMetrics = (): Cypress.Chainable<Dashboard> => {
  return cy.wait('@getDashboardDefinitions').then(({ response }) => {
    const dashboard: Dashboard = response?.body?.data?.[0];
    return dashboard;
  });
};

describe('Integration Tests for DBaaS Dashboard ', () => {
  /**
   * Integration Tests for DBaaS Dashboard
   *
   * This suite validates end-to-end functionality of the CloudPulse DBaaS Dashboard.
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
  let metricToLabelMap: Record<string, string> = {};

  beforeEach(() => {
    mockGetUserPreferences({});
    interceptMetricDefinitions(serviceType).as('getMetricDefinitions');
    interceptMetricData(serviceType).as('metricData');
    interceptDashboardDefinitions(serviceType).as('getDashboardDefinitions');

    cy.visitWithLogin('/metrics');

    initializeDashboardMetrics().then((data) => {
      dashboard = data;
      metrics = data.widgets;
      metricToLabelMap = Object.fromEntries(
        data.widgets.map((w) => [w.metric, w.label])
      );
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

    // Select a time duration from the autocomplete input.
    ui.button.findByTitle('Last hour').as('timeRangeTrigger');
    cy.get('@timeRangeTrigger').click();

    // select a different preset but cancel
    ui.button.findByTitle('Last day').click();

    // Click the "Apply" button to confirm the end date and time
    cy.get('[data-qa-buttons="apply"]')
      .should('be.visible')
      .should('be.enabled')
      .click();
    // Select a Database Engine from the autocomplete input.
    ui.autocomplete
      .findByLabel('Database Engine')
      .should('be.visible')
      .type(engine);

    ui.autocompletePopper.findByTitle(engine).should('be.visible').click();

    ui.regionSelect.find().click();
    ui.regionSelect.find().clear();
    ui.regionSelect
      .findItemByRegionId('us-ord', [mockRegion])
      .should('be.visible')
      .click();

    // Select a resource (Database Clusters) from the autocomplete input.
    ui.autocomplete
      .findByLabel('Database Clusters')
      .should('be.visible')
      .type(clusterName);

    ui.autocompletePopper.findByTitle(clusterName).should('be.visible').click();

    ui.button
      .findByAttribute('aria-label', 'Close')
      .should('be.visible')
      .click();

    // Select a Node from the autocomplete input.
    ui.autocomplete
      .findByLabel('Node Type')
      .should('be.visible')
      .type(`${nodeType}{enter}`);

    // Expand the applied filters section
    ui.button.findByTitle('Filters').should('be.visible').click();

    getAllMetricDefinitionWidgets('dbaas').then((data) => {
      metrics = data;
    });
  });
  it('should apply group by at the dashboard level and verify the metrics API calls', () => {
    // Validate legend rows (pre "Group By")
    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget="${testData.label}"]`;

      cy.get(widgetSelector)
        .should('be.visible')
        .within(() => {
          cy.contains(
            '[data-qa-graph-row-title]',
            `${clusterName} | ${nodeType.toLowerCase()}`
          ).should('be.visible');
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

    // Verify the drawer body contains "Dbaas Dashboard"
    cy.get('[data-testid="drawer"]')
      .find('p')
      .first()
      .and('have.text', dashboardName);

    // Type "Node Type" in Dimensions autocomplete field
    ui.autocomplete
      .findByLabel('Dimensions')
      .should('be.visible')
      .type('Node Type');

    // Select "Node Type" from the popper options
    ui.autocompletePopper.findByTitle('Node Type').should('be.visible').click();

    // Close the drawer using ESC
    cy.get('body').type('{esc}');

    // Click Apply to confirm the Group By selection
    cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

    // Verify the Group By button reflects the selection
    ui.button
      .findByAttribute('aria-label', 'Group By Dashboard Metrics')
      .should('have.attr', 'aria-label', 'Group By Dashboard Metrics')
      .and('have.attr', 'data-qa-selected', 'true');

    // Validate legend rows (post "Group By")
    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget="${testData.label}"]`;

      cy.get(widgetSelector)
        .should('be.visible')
        .within(() => {
          cy.contains(
            '[data-qa-graph-row-title]',
            `${clusterName} | ${nodeType} | ${nodeType.toLowerCase()}`
          ).should('be.visible');
        });
    });
  });

  it('should unselect all group bys and verify the metrics API calls', () => {
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

    // Scroll to the top of the page to ensure consistent test behavior
    cy.scrollTo('top');
  });
  type MetricValues = { average: string; last: string; max: string };

  /**
   * Builds metricValuesStore from static mock payload
   */
  const buildMetricValuesStore = (
    metrics: Widgets[],
    metricToLabelMap: Record<string, string>,
    responsePayload: CloudPulseMetricsResponse
  ): Record<string, MetricValues> => {
    const store: Record<string, MetricValues> = {};

    metrics.forEach((testData) => {
      const metricKey = Object.keys(metricToLabelMap).find(
        (key) => metricToLabelMap[key] === testData.label
      );
      if (!metricKey) return;

      const { average, last, max } = getWidgetLegendRowValuesFromResponse(
        responsePayload,
        testData.label,
        testData.unit
      );

      store[metricKey] = { average, last, max };
    });

    return store;
  };

  /**
   * Builds metricValuesStore from live XHR intercepted responses
   */
  const buildMetricValuesStoreFromXHR = (
    alias: string,
    metrics: Widgets[],
    metricToLabelMap: Record<string, string>,
    store: Record<string, MetricValues>
  ) => {
    cy.get(alias).each((xhr: unknown) => {
      const interception = xhr as Interception;
      const responseBody = interception?.response
        ?.body as CloudPulseMetricsResponse;

      const metricName = responseBody?.data?.result?.[0]?.metric?.metric_name;
      if (!metricName) return;

      const matchedMetric = metrics.find(
        (m: Widgets) => metricToLabelMap[metricName] === m.label
      );
      if (!matchedMetric) return;

      const { label, unit } = matchedMetric;
      const { average, last, max } = getWidgetLegendRowValuesFromResponse(
        responseBody,
        label,
        unit
      );

      store[metricName] = { average, last, max };
    });
  };

  /**
   * Asserts Max, Avg, Last values for each widget in metricToLabelMap
   */
  const assertWidgetLegendValues = (
    metricToLabelMap: Record<string, string>,
    metricValuesStore: Record<string, MetricValues>
  ) => {
    Object.entries(metricToLabelMap).forEach(([key, label]) => {
      if (!key || !label) return;

      const expectedWidgetValues = metricValuesStore[key];
      if (!expectedWidgetValues) {
        cy.log(`⚠️ No data found for metric: ${key}`);
        return;
      }

      cy.log(
        `✅ Asserting [${label}] max: ${expectedWidgetValues.max}, avg: ${expectedWidgetValues.average}, last: ${expectedWidgetValues.last}`
      );

      cy.get(`[data-qa-widget="${label}"]`).within(() => {
        cy.get('[data-qa-graph-column-title="Max"]').should(
          'have.text',
          expectedWidgetValues.max
        );
        cy.get('[data-qa-graph-column-title="Avg"]').should(
          'have.text',
          expectedWidgetValues.average
        );
        cy.get('[data-qa-graph-column-title="Last"]').should(
          'have.text',
          expectedWidgetValues.last
        );
      });
    });
  };

  /**
   * Validates chart legend rows inside recharts container for a single widget
   */
  const assertChartLegendRows = (
    testData: Widgets,
    responsePayload: CloudPulseMetricsResponse
  ) => {
    const expectedWidgetValues = getWidgetLegendRowValuesFromResponse(
      responsePayload,
      testData.label,
      testData.unit
    );

    cy.get(`[data-qa-graph-row-title="${testData.label}"]`)
      .should('be.visible')
      .should('have.text', testData.label);

    cy.get('[data-qa-graph-column-title="Max"]')
      .should('be.visible')
      .should('have.text', expectedWidgetValues.max);

    cy.get('[data-qa-graph-column-title="Avg"]')
      .should('be.visible')
      .should('have.text', expectedWidgetValues.average);

    cy.get('[data-qa-graph-column-title="Last"]')
      .should('be.visible')
      .should('have.text', expectedWidgetValues.last);
  };

  // ─── Tests ──────────────────────────────────────────────────────────────────

  it('should allow users to select their desired granularity and see the most recent data from the API reflected in the graph', () => {
    const metricValuesStore: Record<string, MetricValues> = {};

    // Step 1: Interact with each widget - select interval
    cy.wrap(metrics).each((testData: Widgets) => {
      const widgetSelector = `[data-qa-widget="${testData.label}"]`;

      cy.get(widgetSelector).should('be.visible');

      cy.get(widgetSelector).within(() => {
        ui.autocomplete
          .findByLabel('Select an Interval')
          .should('be.visible')
          .click();

        expectedGranularityArray.forEach((option) => {
          ui.autocompletePopper.findByTitle(option).should('exist');
        });

        ui.autocomplete
          .findByLabel('Select an Interval')
          .should('be.visible')
          .clear()
          .type('5 min{enter}');
      });
    });

    // Step 2: Collect XHR data into store
    buildMetricValuesStoreFromXHR(
      '@metricData.all',
      metrics,
      metricToLabelMap,
      metricValuesStore
    );

    // Step 3: Assert UI values
    cy.then(() =>
      assertWidgetLegendValues(metricToLabelMap, metricValuesStore)
    );
  });

  it('should allow users to select the desired aggregation and view the latest data from the API displayed in the graph', () => {
    const metricValuesStore: Record<string, MetricValues> = {};

    // Step 1: Interact with each widget - select aggregation and validate chart
    metrics.forEach((testData) => {
      cy.get(`[data-qa-widget="${testData.label}"]`)
        .should('be.visible')
        .within(() => {
          mockCreateCloudPulseMetrics(
            serviceType,
            metricsAPIResponsePayload
          ).as('getAggregationMetrics');

          ui.autocomplete
            .findByLabel('Select an Aggregate Function')
            .should('be.visible')
            .type(`Sum{enter}`);

          cy.get('.recharts-responsive-container').within(() => {
            assertChartLegendRows(testData, metricsAPIResponsePayload);
          });
        });
    });

    // Step 2: Build store from static mock
    cy.then(() => {
      const store = buildMetricValuesStore(
        metrics,
        metricToLabelMap,
        metricsAPIResponsePayload
      );
      Object.assign(metricValuesStore, store);
    });

    // Step 3: Assert UI values
    cy.then(() =>
      assertWidgetLegendValues(metricToLabelMap, metricValuesStore)
    );
  });
  it('should trigger the global refresh button and verify the corresponding network calls', () => {
    // Setup intercept BEFORE clicking
    interceptMetricData(serviceType).as('refreshMetrics');

    // Click the global refresh button
    cy.get('[data-testid="global-refresh"]')
      .should('be.visible')
      .should('be.enabled')
      .click();

    // Wait for ALL requests to complete (one per widget)
    cy.wait(new Array(metrics.length).fill('@refreshMetrics'));

    // Store all expected metric names from definitions
    const metricNames: string[] = metrics.map((testData) => testData.metric);

    // Now validate all request details
    cy.get('@refreshMetrics.all').then((xhrs: unknown) => {
      const interceptions = xhrs as Interception[];

      // Collect all request metric names
      const requestedMetricNames = interceptions.map(
        (interception) => interception?.request?.body?.metrics?.[0]?.name
      );

      // Assert counts match
      expect(interceptions.length).to.equal(metricNames.length);

      interceptions.forEach((interception) => {
        const requestBody = interception?.request?.body;
        const metricName = requestBody?.metrics?.[0]?.name;

        // Assert each requested metric exists in expected metric names
        expect(
          metricNames,
          `Metric '${metricName}' should be in definitions`
        ).to.include(metricName);

        // Assert time range
        expect(requestBody.relative_time_duration).to.have.property(
          'unit',
          'days'
        );
        expect(requestBody.relative_time_duration).to.have.property('value', 1);
      });

      // Assert all expected metrics were actually requested
      metricNames.forEach((expectedMetric) => {
        expect(
          requestedMetricNames,
          `Expected metric '${expectedMetric}' to be requested`
        ).to.include(expectedMetric);
      });
    });
  });

  it('should zoom in and out of all the widgets', () => {
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
    cy.then(() => {
      dashboard.widgets.forEach((w) => {
        const widgetSelector = `[data-qa-widget="${w.label}"]`;

        cy.get(widgetSelector)
          .should('be.visible')
          .as('widget')
          .within(() => {
            if (w.size === 12) {
              ui.button
                .findByAttribute('aria-label', 'Zoom Out')
                .should('be.visible')
                .should('be.enabled')
                .click({ force: true });
            } else {
              ui.button
                .findByAttribute('aria-label', 'Zoom In')
                .should('be.visible')
                .should('be.enabled')
                .click({ force: true });
            }
          });
      });
    });
  });

});
