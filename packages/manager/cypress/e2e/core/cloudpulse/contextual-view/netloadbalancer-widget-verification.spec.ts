/**
 * @file Integration Tests for CloudPulse netloadbalancer Dashboard.
 */
import { accountAvailabilityFactory, regionFactory } from '@linode/utilities';
import { widgetDetails } from 'support/constants/widgets';
import {
  mockGetAccount,
  mockGetAccountAvailability,
} from 'support/intercepts/account';
import {
  mockCreateCloudPulseJWEToken,
  mockCreateCloudPulseMetrics,
  mockGetCloudPulseDashboard,
  mockGetCloudPulseDashboards,
  mockGetCloudPulseMetricDefinitions,
  mockGetCloudPulseServices,
} from 'support/intercepts/cloudpulse';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetNetLoadBalancer, mockGetNetLoadBalancers } from 'support/intercepts/nodebalancers';
import { mockGetUserPreferences } from 'support/intercepts/profile';
import { mockGetRegions } from 'support/intercepts/regions';
import { ui } from 'support/ui';
import { generateRandomMetricsData } from 'support/util/cloudpulse';

import {
  accountFactory,
  cloudPulseMetricsResponseFactory,
  dashboardFactory,
  dashboardMetricFactory,
  flagsFactory,
  networkLoadBalancerFactory,
  widgetFactory,
} from 'src/factories';
import { generateGraphData } from 'src/features/CloudPulse/Utils/CloudPulseWidgetUtils';
import { formatToolTip } from 'src/features/CloudPulse/Utils/unitConversion';

import type {
  CloudPulseMetricsResponse,
  CloudPulseServiceType,
  DimensionFilter,
} from '@linode/api-v4';
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
const expectedGranularityArray = ['Auto', '1 day', '1 hr', '5 min'];
const timeDurationToSelect = 'Last 24 Hours';
const capabilities = 'Network LoadBalancer';
const {
  dashboardName,
  metrics,
  serviceType,
  id,
  clusterName,
  region_id,
  region_name,
} = widgetDetails.netloadbalancer;

// Build a shared dimension object
const dimensions = [
  {
    label: 'Protocol',
    dimension_label: 'Protocol',
    values: [],
  },
  {
    label: 'ip_version',
    dimension_label: 'IP Version',
    values: ['v4', 'v6'],
  },
];

const getFiltersForMetric = (metricName: string) => {
  const metric = metrics.find((m) => m.name === metricName);
  if (!metric) return [];

  return metric.filters.map((f) => ({
    dimension_label: f.dimension_label,
    label: f.dimension_label,
    values: f.value ? [f.value] : undefined,
  }));
};

const dashboard = dashboardFactory.build({
  label: dashboardName,
  group_by: ['entity_id'],
  service_type: serviceType as CloudPulseServiceType,
  id,
  widgets: metrics.map(({ name, title, unit, yLabel }) =>
    widgetFactory.build({
      entity_ids: [String(id)],
      filters: [],
      label: title,
      metric: name,
      unit,
      y_label: yLabel,
      namespace_id: id,
      service_type: serviceType as CloudPulseServiceType,
    })
  ),
});

// Metric definitions
const metricDefinitions = metrics.map(({ name, title, unit }) =>
  dashboardMetricFactory.build({
    label: title,
    metric: name,
    unit,
    dimensions: [...dimensions, ...getFiltersForMetric(name)],
  })
);

const mockAccount = accountFactory.build({
  capabilities: [capabilities],
});

const mockRegion = regionFactory.build({
  capabilities: [capabilities],
  id: region_id,
  label: region_name,
  monitors: {
    metrics: [capabilities],
    alerts: [],
  },
});
const mockNetLoadBalancers = networkLoadBalancerFactory.build({
  label: clusterName,
  region: region_id,
  id: 1,
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
        region: region_id,
      },
    ],
    status: 'success',
    unit,
    serviceType: serviceType as CloudPulseServiceType,
    groupBy: ['entity_id'],
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

const mockAvailability = accountAvailabilityFactory.build({
  region: region_id,
});

describe('Integration Tests for netloadbalancer Dashboard ', () => {
  /**
   * Integration Tests for netloadbalancer Dashboard
   *
   * This suite validates end-to-end functionality of the CloudPulse netloadbalancer Dashboard.
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
    mockGetAccount(mockAccount); // Enables the account to have capability for Akamai Cloud Pulse
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions);
    mockGetCloudPulseDashboards(serviceType, [dashboard]).as('fetchDashboard');
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetCloudPulseDashboard(id, dashboard).as('fetchDashboard');
    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    mockGetAccountAvailability([mockAvailability]);
    mockGetRegions([mockRegion]);
    mockGetNetLoadBalancers([mockNetLoadBalancers]);
    mockGetNetLoadBalancer(mockNetLoadBalancers);
    mockGetUserPreferences({});

    // navigate to the metrics page
    cy.visitWithLogin('/netloadbalancers/1/listeners');

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


    cy.findByPlaceholderText('e.g., 80,443,3000')
      .should('be.visible')
      .type('80');

    ui.autocomplete
      .findByLabel('IP Versions')
      .should('be.visible')
      .type('IPv6{enter}');

    // Expand the applied filters section
    ui.button.findByTitle('Filters').should('be.visible').click();

    // Verify that the applied filters
    cy.get('[data-qa-applied-filter-id="applied-filter"]').within(() => {

      cy.get('[data-qa-value="Ports 80"]')
        .should('be.visible')
        .should('have.text', '80');

      cy.get('[data-qa-value="IP Versions IPv6"]')
        .should('be.visible')
        .should('have.text', 'IPv6');
    });
    // Wait for all metrics query requests to resolve.
    cy.wait(['@getMetrics', '@getMetrics']).then((calls) => {
      const interceptions = calls as unknown as Interception[];

      expect(interceptions).to.have.length(2);
    });
  });
  it('should apply group by at the dashboard level and verify the metrics API calls', () => {
    // Stub metrics API calls for dashboard group by changes
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload, {
      entity_id: '1',
      Protacal: 'IPV6-1',
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

    // Verify the drawer body contains "netloadbalancer Dashboard"
    cy.get('[data-testid="drawer"]')
      .find('p')
      .first()
      .and('have.text', 'Network Load Balancer');

    // Type "Protocol" in Dimensions autocomplete field
    ui.autocomplete
      .findByLabel('Dimensions')
      .should('be.visible')
      .type('Protocol');

    // Select "Node Type" from the popper options
    ui.autocompletePopper.findByTitle('Protocol').should('be.visible').click();

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
      .should('have.length', 2)
      .each((xhr: unknown) => {
        const interception = xhr as Interception;
        const { body: requestPayload } = interception.request;

        // Extract filters from payload
        const { filters } = requestPayload;
        expect(filters).to.have.length(2);

        const portFilter = filters.find(
          (f: DimensionFilter) => f.dimension_label === 'port'
        );

        expect(portFilter && portFilter.operator).to.equal('in');
        expect(portFilter && portFilter.value).to.equal('80');

        const ipVersionFilter = filters.find(
          (f: DimensionFilter) => f.dimension_label === 'ip_version'
        );
        expect(ipVersionFilter && ipVersionFilter.operator).to.equal('in');
        expect(ipVersionFilter && ipVersionFilter.value).to.equal('v6');

        // Ensure group_by contains entity_id and node_type in correct order
        expect(requestPayload.group_by).to.have.ordered.members([
          'entity_id',
          'Protocol',
        ]);
      });

    // Validate legend rows (post "Group By")
    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector)
        .should('be.visible')
        .within(() => {
          cy.get('[data-qa-graph-row-title="netloadbalancer-cluster | IPV6-1"]')
            .should('be.visible')
            .and('have.text', 'netloadbalancer-cluster | IPV6-1');
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
      .should('have.length', 2)
      .each((xhr: unknown) => {
        const interception = xhr as Interception;
        const { body: requestPayload } = interception.request;

        // Ensure group_by is cleared (null, undefined, or empty array)
        expect(requestPayload.group_by).to.be.oneOf([null, undefined, []]);

        // Extract filters from payload
        const { filters } = requestPayload;

        // Ensure port filter is still applied correctly
        const portFilters = filters.filter(
          (filter: DimensionFilter) => filter.dimension_label === 'port'
        );
        expect(portFilters).to.have.length(1);
        expect(portFilters[0].operator).to.equal('in');
        expect(portFilters[0].value).to.equal('80');
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
    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector)
        .should('be.visible')
        .within(() => {
          mockCreateCloudPulseMetrics(
            serviceType,
            metricsAPIResponsePayload
          ).as('getAggregationMetrics');

          // find the interval component and select the expected granularity
          ui.autocomplete
            .findByLabel('Select an Aggregate Function')
            .should('be.visible')
            .type(`${testData.expectedAggregation}{enter}`); // type expected granularity

          // check if the API call is made correctly with time granularity value selected
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

  it('Add and Remove widget level dimension filter and validate  api rewsponse', () => {
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getFilterMetrics'
    );
    const widgetSelector = '[data-qa-widget="Ingress Traffic Rate"]';
    // Add Dimension Filter
    cy.get(widgetSelector)
      .should('be.visible')
      .within(() => {
        ui.button
          .findByAttribute(
            'aria-label',
            'Widget Dimension Filter Ingress Traffic Rate'
          )
          .should('be.visible')
          .click();
      });

    ui.button.findByTitle('Add Filter').click();
    cy.get('[data-testid="dimension_filters.0-id"]').within(() => {
      ui.autocomplete.findByLabel('Dimension').should('be.visible').click();
      ui.autocomplete.findByLabel('Dimension').type('Protocol');

      ui.autocompletePopper
        .findByTitle('Protocol')
        .should('be.visible')
        .click();

      // Select operator
      ui.autocomplete
        .findByLabel('Operator')
        .should('be.visible')
        .type('Starts with');

      ui.autocompletePopper
        .findByTitle('Starts with')
        .should('be.visible')
        .click();

      cy.findByPlaceholderText('Enter a Value').as('input');

      cy.get('@input').type('User');
      cy.get('@input').click();
    });
    ui.button.findByAttribute('label', 'Apply').click();
    cy.wait('@getFilterMetrics').then((interception) => {
      const { filters } = interception.request.body;

      const [lastFilter] = filters.slice(-1);

      expect(lastFilter).to.deep.equal({
        dimension_label: 'Protocol',
        operator: 'startswith',
        value: 'User',
      });
    });

    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getRemoveFilterMetrics'
    );

    // Remove Dimension Filter
    cy.get(widgetSelector)
      .should('be.visible')
      .within(() => {
        ui.button
          .findByAttribute(
            'aria-label',
            'Widget Dimension Filter Ingress Traffic Rate'
          )
          .should('be.visible')
          .click();
      });
    cy.get('[data-qa-id="filter-drawer-clear-all"]').click();

    ui.button.findByAttribute('label', 'Apply').click();
  });
});
