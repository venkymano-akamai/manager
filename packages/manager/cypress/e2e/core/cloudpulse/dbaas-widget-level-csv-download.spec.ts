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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_DURATION = 'Last 24 Hours';

const OPERATOR_LABEL_MAP: Record<string, string> = {
  contains: 'Contains',
  ends_with: 'Ends with',
  eq: 'Equal',
  ne: 'Not Equal',
  starts_with: 'Starts with',
};

const {
  clusterName,
  dashboardName,
  engine,
  id,
  metrics,
  nodeType,
  serviceType,
} = widgetDetails.dbaas;

// ---------------------------------------------------------------------------
// Shared dimension definitions
// ---------------------------------------------------------------------------

const SHARED_DIMENSIONS = [
  { dimension_label: 'node_type', label: 'Node Type', value: 'secondary' },
  { dimension_label: 'region',    label: 'Region',    value: 'us-ord'    },
  { dimension_label: 'engine',    label: 'Engine',    value: 'mysql'     },
];

/**
 * Returns metric-specific dimension filters for a given metric name.
 * Throws if the metric is not found, to surface misconfiguration early.
 */
const getFiltersForMetric = (metricName: string) => {
  const metric = metrics.find((m) => m.name === metricName);
  if (!metric) {
    throw new Error(
      `getFiltersForMetric: no metric found with name "${metricName}"`
    );
  }
  return metric.filters.map((f) => ({
    dimension_label: f.dimension_label,
    label: f.dimension_label,
    values: f.value ? [f.value] : undefined,
  }));
};

/**
 * Asserts that a widget's filters include the expected values for a
 * given dimension label.
 */
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


const dashboard = dashboardFactory.build({
  group_by: ['entity_id'],
  label: dashboardName,
  service_type: serviceType as CloudPulseServiceType,
  widgets: metrics.map(({ name, title, unit, yLabel }) =>
    widgetFactory.build({
      entity_ids: [String(id)],
      filters: [],
      label: title,
      metric: name,
      namespace_id: id,
      service_type: serviceType as CloudPulseServiceType,
      unit,
      y_label: yLabel,
    })
  ),
});

const metricDefinitions = metrics.map(({ name, title, unit }) =>
  dashboardMetricFactory.build({
    dimensions: [...SHARED_DIMENSIONS, ...getFiltersForMetric(name)],
    label: title,
    metric: name,
    unit,
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
  monitors: { alerts: [], metrics: ['Managed Databases'] },
});

// This region is available in the region selector but has no monitors;
// used to verify region filtering does not break the UI.
const mockRegionWithoutMonitors = regionFactory.build({
  capabilities: ['Managed Databases'],
  id: 'us-east',
  label: 'Newark, NJ',
});

const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: generateRandomMetricsData(TIME_DURATION, '5 min'),
});

const databaseMock: Database = databaseFactory.build({
  cluster_size: 2,
  engine: 'mysql',
  hosts: { primary: undefined, secondary: undefined },
  label: clusterName,
  region: mockRegion.id,
  status: 'provisioning',
  type: engine,
  version: '1',
});
describe('DBaaS  Widget CSV Download', () => {
    beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount);
    mockGetLinodes([mockLinode]);
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions);

    // Use distinct aliases for the list vs single dashboard endpoints
    mockGetCloudPulseDashboards(serviceType, [dashboard]).as('fetchDashboards');
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetCloudPulseDashboard(id, dashboard).as('fetchDashboard');

    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as('getMetrics');
    mockGetRegions([mockRegion, mockRegionWithoutMonitors]);
    mockGetUserPreferences({});
    mockGetDatabases([databaseMock]).as('getDatabases');

    cy.visitWithLogin('/metrics');

    cy.wait('@fetchServices');

    // Wait on the dashboards LIST endpoint and validate widget shape
    cy.wait('@fetchDashboards').then((interception: Interception) => {
      const dashboards = interception.response?.body?.data as Dashboard[];
      const firstDashboard = dashboards[0];
      expect(firstDashboard.widgets).to.have.length(4);
      firstDashboard.widgets.forEach((widget: Widgets) => {
        validateWidgetFilters(widget, 'node_type', ['secondary']);
      });
    });

     // -------------------------------------------------------------------------
    // Step 1: Select dashboard
    // -------------------------------------------------------------------------
    ui.autocomplete
      .findByLabel('Dashboard')
      .should('be.visible')
      .type(dashboardName);

    ui.autocompletePopper
      .findByTitle(dashboardName)
      .should('be.visible')
      .click();

    // -------------------------------------------------------------------------
    // Step 2: Select time range
    // -------------------------------------------------------------------------
    ui.button.findByTitle('Last hour').click();
    ui.button.findByTitle('Last day').click();

    cy.get('[data-qa-buttons="apply"]')
      .should('be.visible')
      .should('be.enabled')
      .click();

    // -------------------------------------------------------------------------
    // Step 3: Select database engine
    // -------------------------------------------------------------------------
    ui.autocomplete
      .findByLabel('Database Engine')
      .should('be.visible')
      .type(engine);

    ui.autocompletePopper.findByTitle(engine).should('be.visible').click();

    // -------------------------------------------------------------------------
    // Step 4: Select region
    // -------------------------------------------------------------------------
    ui.regionSelect.find().click();
    ui.regionSelect.find().clear();
    ui.regionSelect
      .findItemByRegionId(mockRegion.id, [mockRegion])
      .should('be.visible')
      .click();

    // -------------------------------------------------------------------------
    // Step 5: Select database cluster
    // -------------------------------------------------------------------------
    ui.autocomplete
      .findByLabel('Database Clusters')
      .should('be.visible')
      .type(clusterName);

    ui.autocompletePopper.findByTitle(clusterName).should('be.visible').click();

    ui.button
      .findByAttribute('aria-label', 'Close')
      .should('be.visible')
      .click();

    // -------------------------------------------------------------------------
    // Step 6: Select node type
    // -------------------------------------------------------------------------
    ui.autocomplete
      .findByLabel('Node Type')
      .should('be.visible')
      .type(`${nodeType}{enter}`);

    // -------------------------------------------------------------------------
    // Step 7: Apply global Group By
    // -------------------------------------------------------------------------
    ui.button
      .findByAttribute('aria-label', 'Group By Dashboard Metrics')
      .should('be.visible')
      .first()
      .as('dashboardGroupByBtn');

    cy.get('@dashboardGroupByBtn').scrollIntoView();

    ui.tooltip.findByText('Group By');

    cy.get('@dashboardGroupByBtn')
      .invoke('attr', 'data-qa-selected')
      .should('eq', 'true');

    cy.get('@dashboardGroupByBtn').should('be.visible').click();

    cy.get('[data-testid="drawer-title"]')
      .should('be.visible')
      .and('have.text', 'Global Group By');

    cy.get('[data-testid="drawer"]')
      .find('p')
      .first()
      .should('have.text', 'Dbaas Dashboard');

    ui.autocomplete
      .findByLabel('Dimensions')
      .should('be.visible')
      .type('Node Type');

    ui.autocompletePopper.findByTitle('Node Type').should('be.visible').click();

    // Close drawer with ESC (matches original behaviour)
    cy.get('body').type('{esc}');

    cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

    // Verify global Group By button reflects active state
    ui.button
      .findByAttribute('aria-label', 'Group By Dashboard Metrics')
      .should('have.attr', 'data-qa-selected', 'true');

    // -------------------------------------------------------------------------
    // Step 8: Per-widget Group By and Dimension Filters
    // -------------------------------------------------------------------------
    metrics.forEach((widgetConfig) => {
      const widgetSelector = `[data-qa-widget="${widgetConfig.title}"]`;

      cy.get(widgetSelector).should('be.visible').as('widget');

      // --- Per-widget Group By ---
      cy.get('@widget').within(() => {
        ui.button
          .findByAttribute('aria-label', 'Group By Dashboard Metrics')
          .scrollIntoView()
          .click();
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

      // Close drawer with ESC (matches original behaviour)
      cy.get('body').type('{esc}');

      cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

      // --- Per-widget Dimension Filter ---
      cy.get('@widget').within(() => {
        ui.button
          .findByAttribute(
            'aria-label',
            `Widget Dimension Filter ${widgetConfig.title}`
          )
          .click();
      });

      (widgetConfig.filters || []).forEach((filter, index) => {
        const uiOperator = OPERATOR_LABEL_MAP[filter.operator] ?? filter.operator;

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

            ui.autocompletePopper.findByTitle(uiOperator).click();

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

  it('should download CSV after setting filters', () => {

    metrics.forEach((testData) => {
         const widgetSelector = `[data-qa-widget="${testData.title}"]`;
         cy.get(widgetSelector)
           .should('be.visible')
           .find('h2')
           .should('have.text', `${testData.title} (${testData.unit})`);
         cy.get(widgetSelector)
           .should('be.visible')
           .within(() => {
    
               ui.autocomplete
               .findByLabel('Select an Interval')
               .should('be.visible')
               .type(`${testData.expectedGranularity}{enter}`);

               ui.autocomplete
               .findByLabel('Select an Aggregate Function')
               .should('be.visible')
               .type(`${testData.expectedAggregation}{enter}`); 

               cy.get('[aria-label="Download CSV"]').click({ multiple: true });
   
    });
});
  });
});