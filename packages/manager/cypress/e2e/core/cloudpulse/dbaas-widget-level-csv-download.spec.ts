/* eslint-disable cypress/no-unnecessary-waiting */
import {
  linodeFactory,
  profileFactory,
  regionFactory,
} from '@linode/utilities';
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
import {
  mockGetProfile,
  mockGetUserPreferences,
} from 'support/intercepts/profile';
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

import type { CloudPulseServiceType, Database, Linode } from '@linode/api-v4';
import type { Interception } from 'support/cypress-exports';

// ─── Constants ────────────────────────────────────────────────────────────────

const downloadCSV = 'Download CSV';
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

const expectedRows = [
  '"Jul 31, 2025, 5:30 AM","10"',
  '"Jul 31, 2025, 5:35 AM","20"',
  '"Jul 31, 2025, 5:40 AM","30"',
  '"Jul 31, 2025, 5:45 AM","40"',
  '"Jul 31, 2025, 5:50 AM","50"',
  '"Aug 1, 2025, 5:30 AM","60"',
];

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

// Profile timezone is set to 'UTC'
const mockProfile = profileFactory.build({
  timezone: 'UTC',
});

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

    // --- Time Range: custom (Reset) vs preset ---
    if (widgetConfig.dateSelection === 'Reset') {
      const csvStartTime = getValue(lines, 'Start Time');
      expect(csvStartTime.key).to.equal('Start Time');

      expect(new Date(csvStartTime.value).getTime()).to.equal(
        new Date(widgetConfig.startDate).getTime()
      );

      const csvEndTime = getValue(lines, 'End Time');
      expect(csvEndTime.key).to.equal('End Time');

      expect(new Date(csvEndTime.value).getTime()).to.equal(
        new Date(widgetConfig.endDate).getTime()
      );
    } else {
      const csvDuration = getValue(lines, 'Time Range');
      expect(csvDuration.key).to.equal('Time Range');
      expect(csvDuration.value).to.equal(widgetConfig.dateSelection);
    }

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

    const timestampHeader = lines.find((l) => l.startsWith('"time (UTC)"'));
    expect(timestampHeader).to.equal(
      '"time (UTC)","mysql-cluster | Secondary | Secondary-1"'
    );

    // find where data rows start
    const headerIndex = lines.findIndex((l) => l.startsWith('"time (UTC)"'));

    // actual CSV metric rows
    const csvRows = lines.slice(headerIndex + 2); // skip header + blank line

    expect(csvRows.length).to.equal(expectedRows.length);

    expectedRows.forEach((row, index) => {
      expect(csvRows[index]).to.equal(
        row,
        `CSV row ${index} should match expected value`
      );
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
const mockUserPreferences = {
  aclpPreference: {
    dashboardId: id,
    dateTimeDuration: {
      end: '2025-08-01T00:00:00.000+00:00',
      preset: 'Last hour',
      start: '2025-07-31T23:00:00.000+00:00',
      timeZone: 'Etc/GMT',
    },
    engine: engine.toLowerCase(),
    groupBy: ['entity_id', 'node_type'],
    node_type: nodeType.toLowerCase(),
    region: mockRegion.id,
    resources: ['1', '2'],
    widgets: {
      'Disk I/O': {
        aggregateFunction: 'max',
        filters: [
          { dimension_label: 'device', operator: 'in', value: 'loop0' },
          { dimension_label: 'direction', operator: 'neq', value: 'write' },
          { dimension_label: 'Linode', operator: 'eq', value: '1' },
        ],
        groupBy: ['device', 'direction', 'Linode'],
        label: 'Disk I/O',
        timeGranularity: { unit: 'hr', value: 1 },
      },
      'CPU Utilization': {
        aggregateFunction: 'max',
        filters: [
          { dimension_label: 'cpu', operator: 'eq', value: 'cpu' },
          { dimension_label: 'state', operator: 'eq', value: 'user' },
        ],
        groupBy: ['cpu', 'state'],
        label: 'CPU Utilization',
        timeGranularity: { unit: 'hr', value: 1 },
      },
      'Memory Usage': {
        aggregateFunction: 'max',
        filters: [{ dimension_label: 'state', operator: 'eq', value: 'used' }],
        groupBy: ['state'],
        label: 'Memory Usage',
        timeGranularity: { unit: 'hr', value: 1 },
      },
      'Network Traffic': {
        aggregateFunction: 'max',
        filters: [
          { dimension_label: 'device', operator: 'eq', value: 'lo' },
          {
            dimension_label: 'direction',
            operator: 'eq',
            value: 'transmit',
          },
        ],
        groupBy: ['device', 'direction'],
        label: 'Network Traffic',
        timeGranularity: { unit: 'hr', value: 1 },
      },
    },
  },
};

const downloadsFolder = Cypress.config('downloadsFolder');

describe('DBaaS Widget CSV Download', () => {
  beforeEach(() => {
    // cy.exec(
    //   `find "${downloadsFolder}" -maxdepth 1 -type f \\( \
    //   -name "CPU Utilization*" -o \
    //   -name "Disk I_O*" -o \
    //   -name "Memory Usage*" -o \
    //   -name "Network*" \
    //   \\) -delete`,
    //   { failOnNonZeroExit: false }
    // );

    cy.clock(MOCK_CLOCK_DATE.getTime(), ['Date']);

    mockAppendFeatureFlags(flagsFactory.build());
    mockGetProfile(mockProfile);
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
    mockGetDatabases(databaseMocks).as('getDatabases');
    mockGetUserPreferences(mockUserPreferences).as('getUserPreferences');

    cy.visitWithLogin('/metrics');
    cy.wait(['@fetchServices', '@fetchDashboard', '@getUserPreferences']);
  });

  metrics.forEach((widgetConfig) => {
    it(`should download CSV and validate content for ${widgetConfig.title}`, () => {
      mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload, {
        entity_id: '1',
        node_id: `${nodeType}-1`,
        node_type: nodeType,
      }).as('getMetrics');

      const { dateSelection, title, name } = widgetConfig;
      const widgetSelector = `[data-qa-widget="${title}"]`;

      // ── Date Selection ────────────────────────────────────────────────────
      ui.button.findByTitle('Last hour').click();
      if (dateSelection === 'Reset') {
        const startDayOfMonth = 1;
        const endDayOfMonth = 3;
        const startHour = 1;
        const startMinute = 15;
        const endHour = 2;
        const endMinute = 45;

        ui.button.findByTitle('Reset').should('be.visible').click();

        cy.get('[data-qa-preset="Reset"]').should(
          'have.attr',
          'aria-selected',
          'true'
        );

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

        cy.get('@timePickerButton', { timeout: 15000 }).wait(300).click();

        // Selects the start hour, minute, and meridiem (AM/PM) in the time picker.
        cy.get(`[aria-label="${startHour} hours"]`).click();

        ui.button
          .findByAttribute('aria-label^', 'Choose time')
          .first()
          .should('be.visible', { timeout: 10000 })
          .as('timePickerButton');

        cy.get('@timePickerButton').scrollIntoView({ easing: 'linear' });

        cy.get('@timePickerButton', { timeout: 15000 })
          .wait(300)
          .first()
          .click();

        cy.get(`[aria-label="${startMinute} minutes"]`).first().click();

        ui.button
          .findByAttribute('aria-label^', 'Choose time')
          .first()
          .should('be.visible', { timeout: 10000 })
          .as('timePickerButton');

        cy.get('@timePickerButton').scrollIntoView({ easing: 'linear' });

        cy.get('@timePickerButton', { timeout: 15000 }).wait(300).click();

        cy.findByLabelText('Select meridiem')
          .as('startMeridiemSelect')
          .scrollIntoView();
        cy.get('@startMeridiemSelect').find('[aria-label="AM"]').click();

        // --- Select end time (hours and minutes) in the time picker ---
        ui.button
          .findByAttribute('aria-label^', 'Choose time')
          .last()
          .should('be.visible', { timeout: 10000 })
          .as('timePickerButton');

        cy.get('@timePickerButton').scrollIntoView({ easing: 'linear' });

        cy.get('@timePickerButton', { timeout: 15000 }).wait(300).click();

        // Selects the start hour, minute, and meridiem (AM/PM) in the time picker.
        cy.get(`[aria-label="${endHour} hours"]`).last().click();

        ui.button
          .findByAttribute('aria-label^', 'Choose time')
          .last()
          .should('be.visible', { timeout: 10000 })
          .as('timePickerButton');

        cy.get('@timePickerButton').scrollIntoView({ easing: 'linear' });

        cy.get('@timePickerButton', { timeout: 15000 })
          .wait(300)
          .last()
          .click();

        cy.get(`[aria-label="${endMinute} minutes"]`).last().click();

        ui.button
          .findByAttribute('aria-label^', 'Choose time')
          .last()
          .should('be.visible', { timeout: 10000 })
          .as('timePickerButton');

        cy.get('@timePickerButton').scrollIntoView({ easing: 'linear' });

        cy.get('@timePickerButton', { timeout: 15000 }).wait(300).click();

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

    cy.get('[data-qa-widget="Disk I/O"]')
      .find(`[aria-label="${downloadCSV}"] button`)
      .should('be.disabled');
  });

  it('should show error when aggregation interval is invalid', () => {
    mockCreateCloudPulseMetricsError(serviceType).as('getMetrics');

    cy.wait('@getMetrics');

    cy.get('[data-testid="error-state"]')
      .should('be.visible')
      .and('contain.text', 'Error while rendering graph');

    cy.get('[data-qa-widget="Disk I/O"]')
      .find(`[aria-label="${downloadCSV}"] button`)
      .should('be.disabled');
  });
});
