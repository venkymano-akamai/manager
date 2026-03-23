import { linodeFactory, profileFactory } from '@linode/utilities';
/**
 * @file Integration Tests for contextualview of Dbass Dashboard.
 */
import { mockDatabaseNodeTypes } from 'support/constants/databases';
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
import {
  mockGetDatabase,
  mockGetDatabases,
  mockGetDatabaseTypes,
} from 'support/intercepts/databases';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetLinodes } from 'support/intercepts/linodes';
import { mockGetProfile } from 'support/intercepts/profile';
import { ui } from 'support/ui';
import { generateRandomMetricsData } from 'support/util/cloudpulse';

import {
  accountFactory,
  cloudPulseMetricsResponseFactory,
  dashboardFactory,
  dashboardMetricFactory,
  databaseFactory,
  flagsFactory,
  widgetFactory,
} from 'src/factories';
import { generateGraphData } from 'src/features/CloudPulse/Utils/CloudPulseWidgetUtils';
import { formatToolTip } from 'src/features/CloudPulse/Utils/unitConversion';

import type {
  CloudPulseMetricsResponse,
  CloudPulseServiceType,
  Database,
} from '@linode/api-v4';
import type { Labels } from 'src/features/CloudPulse/shared/CloudPulseTimeRangeSelect';
import type { Interception } from 'support/cypress-exports';

const expectedGranularityArray = ['1 day', '1 hr', '5 min'];

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
const {
  clusterName,
  dashboardName,
  engine,
  id,
  metrics,
  nodeType,
  serviceType,
} = widgetDetails.dbaas;
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

const dashboard = dashboardFactory.build({
  label: dashboardName,
  group_by: ['entity_id'],
  service_type: serviceType as CloudPulseServiceType,
  id,
  widgets: metrics.map(({ name, title, unit, yLabel }) =>
    widgetFactory.build({
      entity_ids: ['1'],
      filters: [...dimensions],
      label: title,
      metric: name,
      unit,
      y_label: yLabel,
      service_type: serviceType as CloudPulseServiceType,
    })
  ),
});
const getFiltersForMetric = (metricName: string) => {
  const metric = metrics.find((m) => m.name === metricName);
  if (!metric) return [];

  return metric.filters.map((f) => ({
    dimension_label: f.dimension_label,
    label: f.dimension_label,
    values: f.value ? [f.value] : undefined,
  }));
};
const metricDefinitions = {
  data: metrics.map(({ name, title, unit }) =>
    dashboardMetricFactory.build({
      label: title,
      metric: name,
      unit,
      dimensions: [...dimensions, ...getFiltersForMetric(name)],
    })
  ),
};

const mockAccount = accountFactory.build();

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
const downloadCSV = 'Download CSV';

const databaseMock: Database = databaseFactory.build({
  cluster_size: 3,
  engine: 'mysql',
  id: 100,
  label: clusterName,
  region: 'us-ord',
  status: 'active',
  type: engine,
  version: '5.8.13',
});

const SHARED_DIMENSIONS = [
  { dimension_label: 'entity_id', label: 'Entity Id' },
  { dimension_label: 'node_type', label: 'Node Type', value: 'secondary' },
  { dimension_label: 'region', label: 'Region', value: 'us-ord' },
  { dimension_label: 'engine', label: 'Engine', value: 'mysql' },
];

const mockLinode = linodeFactory.build({
  id: 100,
  label: clusterName,
  region: 'us-ord',
});

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

// Build payload FROM metricValues so both are always in sync
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
const getTimeDuration = (widgetConfig: (typeof metrics)[number]) => {
  const durationMap: Record<Labels, object> = {
    'Last 30 Minutes': { relative_time_duration: { unit: 'min', value: 30 } },
    'Last 12 Hours': { relative_time_duration: { unit: 'hr', value: 12 } },
    'Last 24 Hours': { relative_time_duration: { unit: 'hr', value: 24 } },
    'Last 7 Days': { relative_time_duration: { unit: 'days', value: 7 } },
    'Last 30 Days': { relative_time_duration: { unit: 'days', value: 30 } },
  };

  if (widgetConfig.dateSelection === 'Reset') {
    return {
      absolute_time_duration: {
        end: new Date(widgetConfig.endDate).toISOString().replace('.000Z', 'Z'),
        start: new Date(widgetConfig.startDate)
          .toISOString()
          .replace('.000Z', 'Z'),
      },
    };
  }

  return durationMap[widgetConfig.dateSelection as Labels];
};
const MOCK_CLOCK_DATE = new Date('2025-08-01');
const mockProfile = profileFactory.build({
  timezone: 'UTC',
});
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

    // --- Time Range: custom (Reset) vs preset ---
    if (widgetConfig.dateSelection === 'Reset') {
      const csvStartDate = getValue(lines, 'Start Time');
      const csvEndDate = getValue(lines, 'End Time');

      const csvStart = new Date(csvStartDate.value)
        .toISOString()
        .replace('.000Z', 'Z');
      const csvEnd = new Date(csvEndDate.value)
        .toISOString()
        .replace('.000Z', 'Z');

      expect(requestBody.absolute_time_duration.start).to.equal(csvStart);
      expect(requestBody.absolute_time_duration.end).to.equal(csvEnd);
    } else {
      const csvDuration = getValue(lines, 'Time Range');
      expect(csvDuration.key).to.equal('Time Range');
      expect(csvDuration.value).to.equal(widgetConfig.dateSelection);
    }

    // --- Database Metadata ---
    const nodeTypeValue = requestBody.filters.find(
      (f: { dimension_label: string }) => f.dimension_label === 'node_type'
    )?.value;

    const dbClusters = getValue(lines, 'Database Clusters');
    expect(dbClusters.key).to.equal('Database Clusters');
    expect(dbClusters.value).to.equal(clusterName);

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

    const timestampHeader = lines.find((l) => l.startsWith('"time (UTC)"'));
    expect(timestampHeader).to.equal(
      '"time (UTC)","1 | Secondary | Secondary-1"'
    );

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

const downloadsFolder = Cypress.config('downloadsFolder');

const databaseMocks: Database[] = databaseFactory
  .buildList(1, {
    cluster_size: 2,
    engine: 'mysql',
    hosts: { primary: undefined, secondary: undefined },
    region: 'us-ord',
    status: 'provisioning',
    type: engine,
    version: '1',
    id: 100,
  })
  .map((db, index) => ({
    ...db,
    label: index === 0 ? clusterName : `${clusterName}-${index + 1}`,
  }));

before(() => {
  cy.exec(
    `find "${downloadsFolder}" -maxdepth 1 -type f \\( \
      -name "CPU Utilization*" -o \
      -name "Disk I_O*" -o \
      -name "Memory Usage*" -o \
      -name "Network*" \
      \\) -delete`,
    { failOnNonZeroExit: false }
  );
});
// It needs to be fixed
describe('Integration Tests for DBaaS Dashboard ', () => {
  beforeEach(() => {
    cy.clock(MOCK_CLOCK_DATE.getTime(), ['Date']);
    mockGetProfile(mockProfile);
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount);
    mockGetLinodes([mockLinode]);
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions.data);
    mockGetCloudPulseDashboard(id, dashboard).as('getDashboard');
    mockCreateCloudPulseJWEToken(serviceType).as('getServiceType');
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    mockGetCloudPulseDashboards(serviceType, [dashboard]).as('fetchDashboard');
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetDatabase(databaseMock).as('getDatabase');
    mockGetDatabaseTypes(mockDatabaseNodeTypes).as('getDatabaseTypes');
    mockGetDatabases(databaseMocks).as('getDatabases');

    // navigate to the databases page
    cy.visitWithLogin('/databases');

    // navigate to the Databases
    cy.get('[data-testid="menu-item-Databases"]').should('be.visible').click();

    // navigate to the Monitor
    cy.visitWithLogin(
      `/databases/${databaseMock.engine}/${databaseMock.id}/metrics`
    );

    cy.wait(['@getDashboard', '@getServiceType', '@getDatabase']);

    // Use findByPlaceholderText to locate the input field
    cy.findByPlaceholderText('Select a Dashboard')
      .should('be.visible')
      .and('be.disabled') // Check if disabled
      .and('have.value', 'Dbaas Dashboard'); // Ensure value is set

    // Select a time duration from the autocomplete input.
    ui.button.findByTitle('Last hour').as('timeRangeTrigger');
    cy.get('@timeRangeTrigger').click();

    // select a different preset but cancel
    ui.button.findByTitle('Last day').click();

    cy.get('[data-qa-buttons="apply"]')
      .should('be.visible')
      .should('be.enabled')
      .click();

    // Select a Node from the autocomplete input.
    ui.autocomplete
      .findByLabel('Node Type')
      .should('be.visible')
      .type('Primary{enter}');

    // Collapse the Filters section
    ui.button.findByTitle('Filters').should('be.visible').click();

    cy.get('[data-testid="applied-filter"]').within(() => {
      cy.get(`[data-qa-value="Node Type Primary"]`)
        .should('be.visible')
        .should('have.text', 'Primary');
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
  });

  it('should allow users to select their desired granularity and see the most recent data from the API reflected in the graph', () => {
    // validate the widget level granularity selection and its metrics
    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector)
        .should('be.visible')
        .find('h2')
        .should('have.text', `${testData.title} (${testData.unit.trim()})`);
      cy.get(widgetSelector)
        .should('be.visible')
        .within(() => {
          // check for all available granularity in popper
          ui.autocomplete
            .findByLabel('Select an Interval')
            .should('be.visible')
            .click();

          // Verify tooltip message for granularity selection

          ui.tooltip
            .findByText('Data aggregation interval')
            .should('be.visible');

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

            cy.get(`[data-qa-graph-column-title="Max"]`)
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.max}`);

            cy.get(`[data-qa-graph-column-title="Avg"]`)
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.average}`);

            cy.get(`[data-qa-graph-column-title="Last"]`)
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

          // Verify tooltip message for aggregation selection

          ui.tooltip.findByText('Aggregation function').should('be.visible');

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

            cy.get(`[data-qa-graph-column-title="Max"]`)
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.max}`);

            cy.get(`[data-qa-graph-column-title="Avg"]`)
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.average}`);

            cy.get(`[data-qa-graph-column-title="Last"]`)
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

          // Verify tooltip message for Zoom-in

          ui.tooltip.findByText('Maximize').should('be.visible');

          cy.get('@widget').should('be.visible');

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

            cy.get(`[data-qa-graph-column-title="Max"]`)
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.max}`);

            cy.get(`[data-qa-graph-column-title="Avg"]`)
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.average}`);

            cy.get(`[data-qa-graph-column-title="Last"]`)
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

          // Verify tooltip message for Zoom-out

          ui.tooltip.findByText('Minimize').should('be.visible');

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

            cy.get(`[data-qa-graph-column-title="Max"]`)
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.max}`);

            cy.get(`[data-qa-graph-column-title="Avg"]`)
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.average}`);

            cy.get(`[data-qa-graph-column-title="Last"]`)
              .should('be.visible')
              .should('have.text', `${expectedWidgetValues.last}`);
          });
        });
    });
  });

  metrics.forEach((widgetConfig) => {
    it(`should download CSV and validate content for ${widgetConfig.title}`, () => {
      mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload, {
        entity_id: '1',
        node_id: `${nodeType}-1`,
        node_type: nodeType,
        ...getTimeDuration(widgetConfig),
      }).as('getMetrics');

      const { dateSelection, title, name } = widgetConfig;
      const widgetSelector = `[data-qa-widget="${title}"]`;

      // ── Date Selection ────────────────────────────────────────────────────
      ui.button.findByTitle('Last day').click();
      if (dateSelection === 'Reset') {
        const startDayOfMonth = 1;
        const endDayOfMonth = 3;
        const startHour = 1;
        const startMinute = 15;
        const endHour = 2;
        const endMinute = 45;
        // --- Open the date picker dialog and select start/end days ---

        cy.get('[role="dialog"]').within(() => {
          // --- Select start and end day ---
          cy.findAllByText(startDayOfMonth).first().click();
          cy.findAllByText(endDayOfMonth).first().click();
        });
        // --- Select start time (hours and minutes) in the time picker ---

        ui.button
          .findByAttribute('aria-label^', 'Choose time')
          .first()
          .should('be.visible', { timeout: 10000 })
          .as('timePickerButton');

        cy.get('@timePickerButton').scrollIntoView({ easing: 'linear' });

        cy.get('@timePickerButton', { timeout: 15000 })
          .should('be.enabled')
          .click();

        // Selects the start hour, minute, and meridiem (AM/PM) in the time picker.
        cy.get(`[aria-label="${startHour} hours"]`).click();

        ui.button
          .findByAttribute('aria-label^', 'Choose time')
          .first()
          .should('be.visible', { timeout: 10000 })
          .as('timePickerButton');

        cy.get('@timePickerButton', { timeout: 15000 })
          .should('be.enabled')
          .click();

        cy.get('@timePickerButton', { timeout: 15000 })
          .should('be.enabled')
          .click();

        cy.get(`[aria-label="${startMinute} minutes"]`).first().click();

        ui.button
          .findByAttribute('aria-label^', 'Choose time')
          .first()
          .should('be.visible', { timeout: 10000 })
          .as('timePickerButton');

        cy.get('@timePickerButton').scrollIntoView({ easing: 'linear' });

        cy.get('@timePickerButton', { timeout: 15000 }).click();

        cy.findByLabelText('Select meridiem')
          .as('startMeridiemSelect')
          .scrollIntoView();
        cy.get('@startMeridiemSelect').find('[aria-label="AM"]').click();
        cy.get('@timePickerButton', { timeout: 15000 })
          .should('be.enabled')
          .click();
        // --- Select end time (hours and minutes) in the time picker ---
        ui.button
          .findByAttribute('aria-label^', 'Choose time')
          .last()
          .should('be.visible', { timeout: 10000 })
          .as('timePickerButton');

        cy.get('@timePickerButton').scrollIntoView({ easing: 'linear' });

        ui.button
          .findByAttribute('aria-label^', 'Choose time')
          .last()
          .should('be.visible', { timeout: 10000 })
          .as('timePickerButton');

        cy.get('@timePickerButton', { timeout: 15000 }).click();

        // Selects the start hour, minute, and meridiem (AM/PM) in the time picker.
        cy.get(`[aria-label="${endHour} hours"]`).last().click();

        ui.button
          .findByAttribute('aria-label^', 'Choose time')
          .last()
          .should('be.visible', { timeout: 10000 })
          .as('timePickerButton');

        cy.get('@timePickerButton').scrollIntoView({ easing: 'linear' });

        cy.get('@timePickerButton', { timeout: 15000 }).last().click();

        cy.get(`[aria-label="${endMinute} minutes"]`).last().click();

        ui.button
          .findByAttribute('aria-label^', 'Choose time')
          .last()
          .should('be.visible', { timeout: 10000 })
          .as('timePickerButton');

        cy.get('@timePickerButton').scrollIntoView({ easing: 'linear' });

        cy.get('@timePickerButton', { timeout: 15000 }).click();

        cy.findByLabelText('Select meridiem')
          .as('endMeridiemSelect')
          .scrollIntoView();
        cy.get('@endMeridiemSelect').find('[aria-label="AM"]').click();

        // --- Apply date/time range ---
        cy.get('[data-qa-buttons="apply"]')
          .should('be.visible')
          .and('be.enabled')
          .click();
      } else {
        ui.button.findByTitle(dateSelection).click();
        cy.get('[data-qa-buttons="apply"]')
          .should('be.visible')
          .should('be.enabled')
          .click();
      }

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
  it('CSV button should be disabled when no data', () => {
    const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build();
    metricsAPIResponsePayload.data.result.forEach((m) => {
      m.values = [];
    });

    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    // navigate to the databases page
    cy.visitWithLogin('/databases');

    // navigate to the Databases
    cy.get('[data-testid="menu-item-Databases"]').should('be.visible').click();

    // navigate to the Monitor
    cy.visitWithLogin(
      `/databases/${databaseMock.engine}/${databaseMock.id}/metrics`
    );

    cy.wait(['@getDashboard', '@getServiceType', '@getDatabase']);

    cy.get('[data-qa-widget="Disk I/O"]')
      .find(`[aria-label="${downloadCSV}"] button`)
      .should('be.disabled');
  });

  it('should show error when aggregation interval is invalid', () => {
    mockCreateCloudPulseMetricsError(serviceType).as('getMetrics');
    // navigate to the databases page
    cy.visitWithLogin('/databases');

    // navigate to the Databases
    cy.get('[data-testid="menu-item-Databases"]').should('be.visible').click();

    // navigate to the Monitor
    cy.visitWithLogin(
      `/databases/${databaseMock.engine}/${databaseMock.id}/metrics`
    );

    cy.wait(['@getDashboard', '@getServiceType', '@getDatabase']);

    cy.wait('@getMetrics');

    cy.get('[data-testid="error-state"]')
      .should('be.visible')
      .and('contain.text', 'Error while rendering graph');

    cy.get('[data-qa-widget="Disk I/O"]')
      .find(`[aria-label="${downloadCSV}"] button`)
      .should('be.disabled');
  });
});
