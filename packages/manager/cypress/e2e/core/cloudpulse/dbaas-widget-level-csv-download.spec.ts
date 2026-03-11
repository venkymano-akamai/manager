import { linodeFactory, regionFactory } from '@linode/utilities';
import { widgetDetails } from 'support/constants/widgets';
import { mockGetAccount } from 'support/intercepts/account';
import {
  mockCreateCloudPulseJWEToken,
  mockCreateCloudPulseMetrics,
  mockCreateCloudPulseMetricsError,
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
  CloudPulseMetricsResponseData,
  CloudPulseServiceType,
  Dashboard,
  Database,
  DimensionFilter,
  Linode,
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

const SHARED_DIMENSIONS = [
  { dimension_label: 'entity_id', label: 'Entity Id' },
  { dimension_label: 'node_type', label: 'Node Type', value: 'secondary' },
  { dimension_label: 'region', label: 'Region', value: 'us-ord' },
  { dimension_label: 'engine', label: 'Engine', value: 'mysql' },
];

// Named epoch constants for mock data (5 min scrape interval)
const MOCK_START_TIME = 1753939800; // Jul 31, 2025, 5:30 AM UTC
const MOCK_END_TIME = 1754026200; // Aug 1, 2025, 5:30 AM UTC
const MOCK_INTERVAL = 5 * 60; // 5 min in seconds

const MOCK_CLOCK_DATE = new Date('2025-08-01');

// ─── Widget Details ────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
 * Extracts a key/value pair from a CSV metadata row.
 * Throws a clear error if the row is missing, preventing silent undefined failures.
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

/** Formats an epoch (seconds) to match the CSV date format: "Jul 31, 2025, 5:30 AM" */
const formatDate = (epoch: number): string =>
  new Date(epoch * 1000).toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
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

/**
 * Reads and validates the downloaded CSV file against the API request/response.
 * widgetConfig is a single metric entry from the metrics array.
 */
const validateCSV = (
  csvFilePath: string,
  widgetConfig: (typeof metrics)[number],
  interception: Interception
) => {
  const requestBody = interception.request.body;

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

    // --- Database Metadata ---
    const nodeTypeValue = requestBody.filters.find(
      (f: { dimension_label: string }) => f.dimension_label === 'node_type'
    )?.value;

    const dbEngine = getValue(lines, 'Database Engine');
    expect(dbEngine.key).to.equal('Database Engine');
    expect(dbEngine.value.toLowerCase()).to.equal('mysql');

    const regionRow = getValue(lines, 'Region');
    expect(regionRow.key).to.equal('Region');
    expect(regionRow.value).to.include(region);

    const dbClusters = getValue(lines, 'Database Clusters');
    expect(dbClusters.key).to.equal('Database Clusters');
    expect(dbClusters.value).to.equal('mysql-cluster, mysql-cluster-2');

    const nodeTypeRow = getValue(lines, 'Node Type');
    expect(nodeTypeRow.key).to.equal('Node Type');
    expect(nodeTypeRow.value.toLowerCase()).to.equal(
      nodeTypeValue?.toLowerCase()
    );

    // --- Group By ---
    const allDimensions = [
      ...SHARED_DIMENSIONS,
      ...widgetConfig.filters.map((f) => ({
        dimension_label: f.dimension_label,
        label: f.dimension_label,
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

    const timestampHeader = lines.find((l) => l.startsWith('"time"'));
    expect(timestampHeader).to.equal(
      '"time","mysql-cluster | Secondary | Secondary-1"'
    );
    // --- Data rows from mock response ---
    const responseData = interception.response?.body
      ?.data as CloudPulseMetricsResponseData;
    const allResults = responseData?.result ?? [];

    expect(allResults.length).to.be.greaterThan(
      0,
      'Response should have at least one result'
    );

    allResults.forEach((result, resultIndex) => {
      result.values.forEach(([epoch, value], valueIndex) => {
        const formattedDate = formatDate(epoch);

        expect(csvContent).to.include(
          formattedDate,
          `Result[${resultIndex}] value[${valueIndex}] timestamp should appear in CSV`
        );

        if (value !== 'NaN') {
          const parsedValue = String(parseFloat(value));
          expect(csvContent).to.include(
            parsedValue,
            `Result[${resultIndex}] value[${valueIndex}] metric value should appear in CSV`
          );
        }
      });
    });
  });
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

// ─── Factories ────────────────────────────────────────────────────────────────

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

const mockLinodes: Linode[] = linodeFactory
  .buildList(2, {
    region: 'us-ord',
  })
  .map((linode, index) => {
    const kubeInstance = kubeLinodeFactory.build();

    return {
      ...linode,
      id: kubeInstance.instance_id ?? linode.id,
      label: index === 0 ? clusterName : `${clusterName}-2`,
    };
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

const databaseMocks: Database[] = databaseFactory
  .buildList(2, {
    cluster_size: 2,
    engine: 'mysql',
    hosts: { primary: undefined, secondary: undefined },
    region: mockRegion.id,
    status: 'provisioning',
    type: engine,
    version: '1',
  })
  .map((db, index) => ({
    ...db,
    label: index === 0 ? clusterName : `${clusterName}-${index + 1}`,
  }));

const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: {
    result: generateRandomMetricsData('Last 24 Hours', '5 min').result.map(
      (metricResult) => ({
        ...metricResult,
        values: [
          [MOCK_START_TIME, '10.00'],
          [MOCK_START_TIME + MOCK_INTERVAL, '20.00'],
          [MOCK_START_TIME + MOCK_INTERVAL * 2, '30.00'],
          [MOCK_START_TIME + MOCK_INTERVAL * 3, '40.00'],
          [MOCK_START_TIME + MOCK_INTERVAL * 4, '50.00'],
          [MOCK_END_TIME, '60.00'],
        ],
      })
    ),
  },
});
const downloadsFolder = Cypress.config('downloadsFolder');

describe('DBaaS Widget CSV Download', () => {
  beforeEach(() => {
    cy.exec(
      `find "${downloadsFolder}" -maxdepth 1 -type f \\( \
      -name "CPU Utilization*" -o \
      -name "Disk I_O*" -o \
      -name "Memory Usage*" -o \
      -name "Network*" \
      \\) -delete`,
      { failOnNonZeroExit: false }
    );

    cy.clock(MOCK_CLOCK_DATE.getTime(), ['Date']);

    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount);
    mockGetLinodes(mockLinodes);
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions);
    mockGetCloudPulseDashboards(serviceType, [cloudPulseDashboard]).as(
      'fetchDashboards'
    );
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetCloudPulseDashboard(id, cloudPulseDashboard).as('fetchDashboard');
    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    mockGetRegions([mockRegion, mockRegionWithoutMonitors]);
    mockGetUserPreferences({});
    mockGetDatabases(databaseMocks).as('getDatabases');

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

    // Select dashboard
    ui.autocomplete
      .findByLabel('Dashboard')
      .should('be.visible')
      .type(dashboardName);
    ui.autocompletePopper
      .findByTitle(dashboardName)
      .should('be.visible')
      .click();

    // Select database engine
    ui.autocomplete
      .findByLabel('Database Engine')
      .should('be.visible')
      .type(engine);
    ui.autocompletePopper.findByTitle(engine).should('be.visible').click();

    // Select region
    ui.regionSelect.find().click();
    ui.regionSelect.find().clear();
    ui.regionSelect
      .findItemByRegionId(mockRegion.id, [mockRegion])
      .should('be.visible')
      .click();

    // Select cluster
    ui.autocomplete
      .findByLabel('Database Clusters')
      .should('be.visible')
      .type('Select All{enter}');

    ui.button
      .findByAttribute('aria-label', 'Close')
      .should('be.visible')
      .click();

    // Select node type
    ui.autocomplete
      .findByLabel('Node Type')
      .should('be.visible')
      .type(`${nodeType}{enter}`);
  });

  metrics.forEach((widgetConfig) => {
    it(`should download CSV and validate content for ${widgetConfig.title}`, () => {
      mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload, {
        entity_id: '1',
        node_id: `${nodeType}-1`,
        node_type: nodeType,
      }).as('getMetrics');

      const { dateSelection, filters, title, name } = widgetConfig;
      const widgetSelector = `[data-qa-widget="${title}"]`;

      // ── Dashboard-level Group By ──────────────────────────────────────────
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
      ui.autocompletePopper
        .findByTitle('Node Type')
        .should('be.visible')
        .click();

      cy.get('body').type('{esc}');
      cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

      ui.button
        .findByAttribute('aria-label', 'Group By Dashboard Metrics')
        .should('have.attr', 'data-qa-selected', 'true');

      // ── Widget-level Group By ─────────────────────────────────────────────
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
        title
      );

      (filters || []).forEach((filter) => {
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

      // ── Widget Dimension Filters ──────────────────────────────────────────
      cy.get('@widget').within(() => {
        ui.button
          .findByAttribute('aria-label', `Widget Dimension Filter ${title}`)
          .click();
      });

      (filters || []).forEach((filter, index) => {
        const uiOperator =
          OPERATOR_LABEL_MAP[filter.operator] ?? filter.operator;

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

      // ── Date Selection ────────────────────────────────────────────────────
      ui.button.findByTitle('Last hour').click();
      ui.button.findByTitle(dateSelection).click();

      cy.get('[data-qa-buttons="apply"]')
        .should('be.visible')
        .should('be.enabled')
        .click();

      cy.wait('@getMetrics');

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
          ui.tooltip.findByText('CSV Download').should('be.visible');

          cy.get('[aria-label="CSV Download"]').click();
        });
      ui.toast.assertMessage('Downloaded CSV.');

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

  it('CSV button should be disabled when no data', () => {
    const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build();
    metricsAPIResponsePayload.data.result.forEach((m) => {
      m.values = [];
    });

    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );

    cy.get('[data-qa-widget="Disk I/O"]')
      .find('[aria-label="CSV Download"] button')
      .should('be.disabled');
  });

  it('should show error when aggregation interval is invalid', () => {
    mockCreateCloudPulseMetricsError(serviceType).as('getMetrics');

    cy.wait('@getMetrics');

    cy.get('[data-testid="error-state"]')
      .should('be.visible')
      .and('contain.text', 'Error while rendering graph');

    cy.get('[data-qa-widget="Disk I/O"]')
      .find('[aria-label="CSV Download"] button')
      .should('be.disabled');
  });
});
