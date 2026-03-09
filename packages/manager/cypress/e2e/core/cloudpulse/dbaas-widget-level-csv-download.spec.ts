
import { linodeFactory, regionFactory } from '@linode/utilities';
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
import { mockGetDatabases } from 'support/intercepts/databases';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetLinodes } from 'support/intercepts/linodes';
import { mockGetUserPreferences } from 'support/intercepts/profile';
import { mockGetRegions } from 'support/intercepts/regions';
import { ui } from 'support/ui';
import { generateRandomMetricsData } from 'support/util/cloudpulse';

import {
  accountFactory,
  cloudPulseMetricsResponseFactory,
  dashboardFactory,
  dashboardMetricFactory,
  databaseFactory,
  flagsFactory,
  kubeLinodeFactory,
  widgetFactory,
} from 'src/factories';
import { generateGraphData } from 'src/features/CloudPulse/Utils/CloudPulseWidgetUtils';
import { formatToolTip } from 'src/features/CloudPulse/Utils/unitConversion';

import type {
  CloudPulseMetricsResponse,
  CloudPulseServiceType,
  Dashboard,
  Database,
  DimensionFilter,
  Widgets,
} from '@linode/api-v4';
import type { Interception } from 'support/cypress-exports';

const expectedGranularityArray = ['Auto', '1 day', '1 hr', '5 min'];
const timeDurationToSelect = 'Last 24 Hours';
const {
  clusterName,
  dashboardName,
  engine,
  id,
  metrics,
  nodeType,
  serviceType,
} = widgetDetails.dbaas;

// Build a shared dimension object
const dimensions = [
  {
    label: 'Node Type',
    dimension_label: 'node_type',
    value: 'secondary',
  },
  {
    label: 'Region',
    dimension_label: 'region',
    value: 'us-ord',
  },
  {
    label: 'Engine',
    dimension_label: 'engine',
    value: 'mysql',
  },
];

// Convert widget filters to dashboard filters
const getFiltersForMetric = (metricName: string) => {
  const metric = metrics.find((m) => m.name === metricName);
  if (!metric) return [];

  return metric.filters.map((f) => ({
    dimension_label: f.dimension_label,
    label: f.dimension_label,
    values: f.value ? [f.value] : undefined,
  }));
};

// Dashboard creation
const dashboard = dashboardFactory.build({
  label: dashboardName,
  group_by: ['entity_id'],
  service_type: serviceType as CloudPulseServiceType,
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

const mockLinode = linodeFactory.build({
  id: kubeLinodeFactory.build().instance_id ?? undefined,
  label: clusterName,
  region: 'us-ord',
});

const mockAccount = accountFactory.build();

const mockRegion = regionFactory.build({
  capabilities: ['Managed Databases'],
  id: 'us-ord',
  label: 'Chicago, IL',
  monitors: {
    metrics: ['Managed Databases'],
    alerts: [],
  },
});

const extendedMockRegion = regionFactory.build({
  capabilities: ['Managed Databases'],
  id: 'us-east',
  label: 'Newark,NL',
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
        region: 'us-ord',
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

const databaseMock: Database = databaseFactory.build({
  cluster_size: 2,
  engine: 'mysql',
  hosts: {
    primary: undefined,
    secondary: undefined,
  },
  label: clusterName,
  region: mockRegion.id,
  status: 'provisioning',
  type: engine,
  version: '1',
});

const validateWidgetFilters = (
  widget: Widgets,
  expectedDimensionLabel: string,
  expectedValues: string[]
) => {
  const relevantFilters = widget.filters?.filter(
    (f: DimensionFilter) => f.dimension_label === expectedDimensionLabel
  );
  relevantFilters.forEach((filter: DimensionFilter) => {
    expect(expectedValues).to.include(filter.value);
  });
};

describe('DBaaS CPU Widget CSV Download', () => {

  afterEach(() => {
    cy.clearLocalStorage();
    cy.clearCookies();
  });

  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount); // Enables the account to have capability for Akamai Cloud Pulse
    mockGetLinodes([mockLinode]);
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions);
    mockGetCloudPulseDashboards(serviceType, [dashboard]).as('fetchDashboard');
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetCloudPulseDashboard(id, dashboard).as('fetchDashboard');
    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    mockGetRegions([mockRegion, extendedMockRegion]);
    mockGetUserPreferences({});
    mockGetDatabases([databaseMock]).as('getDatabases');

    // navigate to the metrics page
    cy.visitWithLogin('/metrics');

    // Wait for the services and dashboard API calls to complete before proceeding
    cy.wait(['@fetchServices']);
    cy.wait('@fetchDashboard').then((interception: Interception) => {
      const dashboards = interception.response?.body?.data as Dashboard[];
      const dashboard = dashboards[0];
      expect(dashboard.widgets).to.have.length(4);

      dashboard.widgets.forEach((widget: Widgets) => {
        validateWidgetFilters(widget, 'node_type', ['secondary']);
      });
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
      .findItemByRegionId(mockRegion.id, [mockRegion])
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
    .and('have.text', 'Dbaas Dashboard');

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


  });
  it('should download CSV after setting filters for all widgets', () => {

    const operatorMap: Record<string, string> = {
      eq: 'Equal',
      ne: 'Not Equal',
      contains: 'Contains',
      starts_with: 'Starts with',
      ends_with: 'Ends with'
    };
  
    metrics.forEach((widgetConfig) => {
  
        const widgetSelector = `[data-qa-widget="${widgetConfig.title}"]`;
  
      cy.get(widgetSelector)
        .should('be.visible')
        .as('widget');
  
      // -------------------------
      // GROUP BY
      // -------------------------
      cy.get('@widget').within(() => {
  
        ui.button
          .findByAttribute('aria-label', 'Group By Dashboard Metrics')
          .as('groupByButton');
  
        cy.get('@groupByButton').scrollIntoView().click();
  
      });
  
      cy.get('[data-testid="drawer-title"]')
        .should('be.visible')
        .and('have.text', 'Group By');
  
      cy.get('[data-qa-id="groupby-drawer-subtitle"]')
        .should('have.text', widgetConfig.title);
  
      (widgetConfig.filters || []).forEach((filter) => {
  
        ui.autocomplete
          .findByLabel('Dimensions')
          .should('be.visible')
          .type(filter.dimension_label);
  
        ui.autocompletePopper
          .findByTitle(filter.dimension_label)
          .should('be.visible')
          .click();
  
      });
  
      cy.get('body').type('{esc}');
  
      cy.findByTestId('apply')
        .should('be.visible')
        .click();
  
      // -------------------------
      // WIDGET DIMENSION FILTER
      // -------------------------
      cy.get('@widget').within(() => {
  
        ui.button
          .findByAttribute(
            'aria-label',
            `Widget Dimension Filter ${widgetConfig.title}`
          )
          .click();
  
      });
  
      (widgetConfig.filters || []).forEach((filter, index) => {
  
        const uiOperator = operatorMap[filter.operator] || filter.operator;
  
        ui.button.findByTitle('Add Filter').click();
  
        cy.get('[data-testid^="dimension_filters."]')
          .eq(index)
          .should('be.visible')
          .within(() => {
  
            ui.autocomplete
              .findByLabel('Dimension')
              .should('be.visible')
              .type(filter.dimension_label);
  
            ui.autocompletePopper
              .findByTitle(filter.dimension_label)
              .click();
  
            ui.autocomplete
              .findByLabel('Operator')
              .should('not.be.disabled')
              .type(uiOperator);
  
            ui.autocompletePopper
              .findByTitle(uiOperator)
              .click();
              
              ui.autocomplete
              .findByLabel('Value')
              .should('not.be.disabled')
              .click()
              .type(`${filter.value}{downarrow}{enter}`);
  
          });
  
      });
  
      ui.button
        .findByAttribute('label', 'Apply')
        .should('be.visible')
        .click();
  
    });
  
  });
});
