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

import type {
  CloudPulseServiceType,
  Dashboard,
  Database,
  DimensionFilter,
  Widgets,
} from '@linode/api-v4';
import type { Interception } from 'support/cypress-exports';

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
  region,
} = widgetDetails.dbaas;

const SHARED_DIMENSIONS = [
  { dimension_label: 'entity_id', label: 'Entity Id' }, // add this
  { dimension_label: 'node_type', label: 'Node Type', value: 'secondary' },
  { dimension_label: 'region', label: 'Region', value: 'us-ord' },
  { dimension_label: 'engine', label: 'Engine', value: 'mysql' },
];
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

const cloudPulseDashboard = dashboardFactory.build({
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

const mockRegionWithoutMonitors = regionFactory.build({
  capabilities: ['Managed Databases'],
  id: 'us-east',
  label: 'Newark, NJ',
});

// Fixed: timeDurationToSelect matches the actual preset label used in the UI
const timeDurationToSelect = 'Last 24 Hours';

// Fixed: named constants used instead of raw hardcoded numbers
const startTime = 1753939800; // Jul 31, 2025, 5:30 AM UTC
const endTime = 1754026200;   // Aug 1, 2025, 5:30 AM UTC
const interval = 5 * 60;     // 5 min scrape interval in seconds

const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: {
    result: generateRandomMetricsData(timeDurationToSelect, '5 min').result.map(
      (metricResult) => ({
        ...metricResult,
        values: [
          [startTime, '10000000.00'],
          [startTime + interval, '30000000.00'],
          [startTime + interval * 2, '50000000.00'],
          [startTime + interval * 3, '70000000.00'],
          [startTime + interval * 4, '90000000.00'],
          [endTime, '10.10'],
        ],
      })
    ),
  },
});

// Helper to extract key/value from a CSV metadata row
const getValue = (
  lines: string[],
  key: string
): { key: string; value: string } => {
  const line = lines.find((l) => l.startsWith(`"${key}"`));
  const [parsedKey, parsedValue] = line?.split('","') ?? [];
  return {
    key: parsedKey?.replace(/^"/, '').trim(),
    value: parsedValue?.replace(/"$/, '').trim(),
  };
};

/**
 * Reads and asserts the CSV file content against the API request and response.
 */
const validateCSV = (
  csvFilePath: string,
  widgetConfig: (typeof metrics)[0],
  interception: Interception
) => {
  const requestBody = interception.request.body;
  const responseValues =
    interception.response?.body?.data?.result?.[0]?.values ?? [];

  cy.readFile(csvFilePath).then((csvContent: string) => {
    const lines = csvContent.split('\n').map((l) => l.trim());

    // --- Dashboard ---
    const dashboardRow = getValue(lines, 'Dashboard');
    expect(dashboardRow.key).to.equal('Dashboard');
    expect(dashboardRow.value).to.equal(dashboardName);

    // --- Time Range ---
    const csvStartTime = getValue(lines, 'Start Time');
    expect(csvStartTime.key).to.equal('Start Time');
    expect(csvStartTime.value).to.equal(widgetConfig.startDate);

    const csvEndTime = getValue(lines, 'End Time');
    expect(csvEndTime.key).to.equal('End Time');
    expect(csvEndTime.value).to.equal(widgetConfig.endDate);

    // --- Database Metadata (from request filters array) ---
    const getFilter = (label: string) =>
      requestBody.filters.find(
        (f: { dimension_label: string }) => f.dimension_label === label
      )?.value;

    const dbEngine = getValue(lines, 'Database Engine');
    expect(dbEngine.key).to.equal('Database Engine');
    expect(dbEngine.value.toLowerCase()).to.equal('mysql');

    const regionkey = getValue(lines, 'Region');
     expect(regionkey.key).to.equal('Region');
    expect(regionkey.value).to.include(region);

    const dbClusters = getValue(lines, 'Database Clusters');
    expect(dbClusters.key).to.equal('Database Clusters');
    expect(dbClusters.value).to.equal(clusterName);

    const nodeTypeRow = getValue(lines, 'Node Type');
    expect(nodeTypeRow.key).to.equal('Node Type');
    expect(nodeTypeRow.value.toLowerCase()).to.equal(
      getFilter('node_type')?.toLowerCase()
    );

// --- Group By ---
const allDimensions = [
  ...SHARED_DIMENSIONS,
  ...widgetConfig.filters.map((f) => ({
    dimension_label: f.dimension_label,
    label: f.dimension_label, // filters don't have a label, use dimension_label as-is
  })),
];

const groupByRow = getValue(lines, 'Group By');
expect(groupByRow.key).to.equal('Group By');
expect(groupByRow.value).to.equal(
  requestBody.group_by
    .map((g: string) => {
      const match = allDimensions.find((d) => d.dimension_label === g);
      return match ? match.label : g;
    })
    .join(', ')
);

    // --- Aggregation Function (from request metrics[0]) ---
    const aggregationRow = getValue(lines, 'Aggregation Function');
    expect(aggregationRow.key).to.equal('Aggregation Function');
    expect(aggregationRow.value.toLowerCase()).to.equal(
      requestBody.metrics[0].aggregate_function.toLowerCase()
    );

    // --- Scrape Interval (from request time_granularity) ---
    const granularityRow = getValue(lines, 'Scrape Interval');
    expect(granularityRow.key).to.equal('Scrape Interval');
    expect(granularityRow.value).to.equal(
      `${requestBody.time_granularity.value} ${requestBody.time_granularity.unit}`
    );

    // --- Widget Metadata ---
    const metricRow = getValue(lines, 'Metric');
    expect(metricRow.key).to.equal('Metric');
    expect(metricRow.value).to.equal(widgetConfig.title);

    const unitRow = getValue(lines, 'Unit');
    expect(unitRow.key).to.equal('Unit');
    expect(unitRow.value).to.equal(widgetConfig.unit);

    // --- Timestamp header ---
    const timestampHeader = lines.find((l) => l.startsWith('"timestamp"'));
    expect(timestampHeader).to.equal(`"timestamp","${widgetConfig.title}"`);

    // --- Data rows from response values ---
    responseValues.forEach(([epoch, value]: [number, string]) => {
      const formattedDate = new Date(epoch * 1000).toLocaleString('en-US', {
        day: 'numeric',
        hour: 'numeric',
        hour12: true,
        minute: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      expect(csvContent).to.include(formattedDate);

      if (value !== 'NaN') {
        expect(csvContent).to.include(String(parseFloat(value)));
      }
    });
  });
};

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

// Fixed: MOCK_START_DATE moved to module level so cy.clock() 
// can be called before cy.visitWithLogin() in beforeEach
const MOCK_START_DATE = new Date('2025-08-01');

describe('DBaaS Widget CSV Download', () => {
  beforeEach(() => {
    const downloadsFolder = Cypress.config('downloadsFolder');
    const serviceTypeTitleCase =
      serviceType.charAt(0).toUpperCase() + serviceType.slice(1);

    cy.exec(
      `find "${downloadsFolder}" -maxdepth 1 -name "${serviceTypeTitleCase} Dashboard*" -exec rm -f {} \\;`,
      { failOnNonZeroExit: false }
    );

    // Fixed: cy.clock() called before cy.visitWithLogin() so the
    // mocked date is active when the app boots
    cy.clock(MOCK_START_DATE.getTime(), ['Date']);

    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount);
    mockGetLinodes([mockLinode]);
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions);
    mockGetCloudPulseDashboards(serviceType, [cloudPulseDashboard]).as('fetchDashboards');
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetCloudPulseDashboard(id, cloudPulseDashboard).as('fetchDashboard');
    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    mockGetRegions([mockRegion, mockRegionWithoutMonitors]);
    mockGetUserPreferences({});
    mockGetDatabases([databaseMock]).as('getDatabases');

    cy.visitWithLogin('/metrics');

    cy.wait('@fetchServices');

    cy.wait('@fetchDashboards').then((interception: Interception) => {
      const dashboards = interception.response?.body?.data as Dashboard[];
      const firstDashboard = dashboards[0];
      expect(firstDashboard.widgets).to.have.length(4);
      firstDashboard.widgets.forEach((widget: Widgets) => {
        validateWidgetFilters(widget, 'node_type', ['secondary']);
      });
    });

    ui.autocomplete
      .findByLabel('Dashboard')
      .should('be.visible')
      .type(dashboardName);

    ui.autocompletePopper
      .findByTitle(dashboardName)
      .should('be.visible')
      .click();

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

    ui.autocomplete
      .findByLabel('Database Clusters')
      .should('be.visible')
      .type(clusterName);

    ui.autocompletePopper.findByTitle(clusterName).should('be.visible').click();

    ui.button
      .findByAttribute('aria-label', 'Close')
      .should('be.visible')
      .click();

    ui.autocomplete
      .findByLabel('Node Type')
      .should('be.visible')
      .type(`${nodeType}{enter}`);

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

    cy.get('body').type('{esc}');
    cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

    ui.button
      .findByAttribute('aria-label', 'Group By Dashboard Metrics')
      .should('have.attr', 'data-qa-selected', 'true');

    const widgetConfig = metrics.find((m) => m.title === 'CPU Utilization');

    if (!widgetConfig) {
      throw new Error('CPU Utilization widget not found');
    }

    const widgetSelector = `[data-qa-widget="${widgetConfig.title}"]`;

    cy.get(widgetSelector).should('be.visible').as('widget');

    cy.get('@widget').within(() => {
      ui.button
        .findByAttribute('aria-label', 'Group By Dashboard Metrics')
        .scrollIntoView()
        .click();
    });

    cy.get('[data-testid="drawer-title"]')
      .should('be.visible')
      .and('have.text', 'Group By');

    cy.get('[data-qa-id="groupby-drawer-subtitle"]').should(
      'have.text',
      widgetConfig.title
    );

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
    cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

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

          ui.autocompletePopper.findByTitle(filter.dimension_label).click();

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

    ui.button.findByAttribute('label', 'Apply').should('be.visible').click();
  });

  it('should download CSV and validate content for all widgets', () => {
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'refreshMetrics'
    );
  
    const widgetConfig = metrics.find((m) => m.title === 'CPU Utilization');
  
    if (!widgetConfig) {
      throw new Error('CPU Utilization widget not found');
    }
  
    const { dateSelection } = widgetConfig;
    const widgetSelector = `[data-qa-widget="${widgetConfig.title}"]`;
  
    // --- Open date picker and select preset ---
    ui.button.findByTitle('Last hour').click();
    ui.button.findByTitle(dateSelection).click();
  
    cy.get('[data-qa-buttons="apply"]')
      .should('be.visible')
      .should('be.enabled')
      .click();
  
    // --- Wait for metrics to reload after date change ---
    cy.wait('@getMetrics');
  
    cy.get(widgetSelector)
      .should('be.visible')
      .find('h2')
      .should('contain.text', widgetConfig.title);
  
    // --- Set interval, aggregation, download CSV ---
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
  
        cy.get('[aria-label="Download CSV"]').click();
      });
  
    // --- Build CSV file path ---
    const serviceTypeTitleCase =
      serviceType.charAt(0).toUpperCase() + serviceType.slice(1);
    const downloadsFolder = Cypress.config('downloadsFolder');
    const csvFilePath = `${downloadsFolder}/${serviceTypeTitleCase} Dashboard-${widgetConfig.title}.csv`;
  
    // --- Wait for API and validate CSV ---
    cy.get('@getMetrics.all').then((calls) => {
      const interceptions = (calls as unknown as Interception[]).slice(-4);
    
      const interception = interceptions.find(
        (i) => i.request.body.metrics[0].name === widgetConfig.name
      );
    
      if (!interception) {
        throw new Error(`No interception found for widget: ${widgetConfig.name}`);
      }
    
      validateCSV(csvFilePath, widgetConfig, interception);
    });
  });
});