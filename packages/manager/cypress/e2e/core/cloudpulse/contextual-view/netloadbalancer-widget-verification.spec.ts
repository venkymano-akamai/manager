/* eslint-disable cypress/no-unnecessary-waiting */
/**
 * @file Integration tests for the CloudPulse NodeBalancer dashboard.
 * @todo Rename this file to `nodebalancer-widget-verification.spec.ts` to match the service under test.
 */
import {
  accountAvailabilityFactory,
  linodeFactory,
  nodeBalancerFactory,
  profileFactory,
  regionFactory,
} from '@linode/utilities';
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
import { mockGetLinodes } from 'support/intercepts/linodes';
import {
  mockGetNodeBalancer,
  mockGetNodeBalancers,
} from 'support/intercepts/nodebalancers';
import { mockGetProfile, mockGetUserPreferences } from 'support/intercepts/profile';
import { mockGetRegions } from 'support/intercepts/regions';
import { ui } from 'support/ui';
import { generateRandomMetricsData } from 'support/util/cloudpulse';
import { randomNumber } from 'support/util/random';

import {
  accountFactory,
  cloudPulseMetricsResponseFactory,
  dashboardFactory,
  dashboardMetricFactory,
  flagsFactory,
  kubeLinodeFactory,
  widgetFactory,
} from 'src/factories';
import { generateGraphData } from 'src/features/CloudPulse/Utils/CloudPulseWidgetUtils';
import { formatToolTip } from 'src/features/CloudPulse/Utils/unitConversion';

import type { CloudPulseMetricsResponse } from '@linode/api-v4';
import type { Interception } from 'support/cypress-exports';

// ─── Constants ────────────────────────────────────────────────────────────────

const expectedGranularityArray = ['Auto', '1 day', '1 hr', '5 min'];
const timeDurationToSelect = 'Last 24 Hours';
const { dashboardName, id, metrics, resource } = widgetDetails.nodebalancer;
const serviceType = 'nodebalancer';
const downloadCSV = 'Download CSV';
const downloadsFolder = Cypress.config('downloadsFolder');

// ─── Mock Data ────────────────────────────────────────────────────────────────

const BASE_TIMESTAMP = 1753939800; // Jul 31, 2025, 5:30 AM UTC
const INTERVAL_SECONDS = 300; // 5 min
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

// ─── Dashboard & Metric Definitions ──────────────────────────────────────────

const dashboard = dashboardFactory.build({
  label: dashboardName,
  service_type: serviceType,
  id,
  widgets: metrics.map(({ name, title, unit, yLabel }) =>
    widgetFactory.build({
      label: title,
      metric: name,
      unit,
      y_label: yLabel,
    })
  ),
});

const metricDefinitions = metrics.map(({ name, title, unit }) =>
  dashboardMetricFactory.build({
    label: title,
    metric: name,
    unit,
  })
);

const mockRegion = regionFactory.build({
  capabilities: ['NodeBalancers'],
  id: 'us-east',
  label: 'Newark, NJ, USA',
  monitors: {
    metrics: ['NodeBalancers'],
    alerts: [],
  },
});

const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: {
    result: generateRandomMetricsData(timeDurationToSelect, '5 min').result.map(
      (metricResult) => ({
        ...metricResult,
        values: metricValues,
      })
    ),
  },
});

const mockLinode = linodeFactory.build({
  id: kubeLinodeFactory.build().instance_id ?? undefined,
  label: resource,
  region: 'us-east',
});

const mockNodeBalancer = nodeBalancerFactory.build({
  label: resource,
  region: 'us-east',
  id: 1,
});
const mockProfile = profileFactory.build({
  timezone: 'UTC',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getWidgetLegendRowValuesFromResponse = (
  responsePayload: CloudPulseMetricsResponse,
  label: string,
  unit: string
) => {
  const graphData = generateGraphData({
    label,
    metricsList: responsePayload,
    resources: [{ id: '1', label: resource, region: 'us-east' }],
    status: 'success',
    unit,
    serviceType,
    groupBy: ['entity_id'],
  });

  const { average, last, max } = graphData.legendRowsData[0].data;

  return {
    average: formatToolTip(average, unit),
    last: formatToolTip(last, unit),
    max: formatToolTip(max, unit),
  };
};

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

const validateCSV = (
  csvFilePath: string,
  widgetConfig: (typeof metrics)[number],
  _interception: Interception
) => {
  cy.readFile(csvFilePath).then((csvContent: string) => {
    const lines = csvContent.split('\n').map((l) => l.trim());

    // --- Dashboard ---
    const dashboardRow = getValue(lines, 'Dashboard');
    expect(dashboardRow.key).to.equal('Dashboard');
    expect(dashboardRow.value).to.equal(dashboardName);

    // --- Time Range ---
    const csvDuration = getValue(lines, 'Time Range');
    expect(csvDuration.key).to.equal('Time Range');
    expect(csvDuration.value).to.equal('Last day');

    // --- NodeBalancer ---
    const nbRow = getValue(lines, 'Nodebalancers');
    expect(nbRow.key).to.equal('Nodebalancers');
    expect(nbRow.value).to.equal(resource);

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

    // --- Timestamp header ---
    const timestampHeader = lines.find((l) => l.startsWith('"time (UTC)"'));
    expect(timestampHeader).to.equal('"time (UTC)","NodeBalancer-resource"');

    // --- Data rows ---
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
const mockAvailability = accountAvailabilityFactory.build({
  region: 'us-east',
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Integration Tests for Nodebalancer Dashboard ', () => {
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
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetProfile(mockProfile);
    mockGetAccount(accountFactory.build({}));
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions);
    mockGetCloudPulseDashboards(serviceType, [dashboard]).as('fetchDashboard');
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetCloudPulseDashboard(id, dashboard);
    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    mockGetAccountAvailability([mockAvailability]);
    mockGetRegions([mockRegion]);
    mockGetLinodes([mockLinode]);
    mockGetNodeBalancer(mockNodeBalancer);
    mockGetNodeBalancers([mockNodeBalancer]);
    mockGetUserPreferences({});

    cy.visitWithLogin('/nodebalancers/1/metrics');

    ui.button.findByTitle('Last hour').as('timeRangeTrigger');
    cy.get('@timeRangeTrigger').click();

    ui.button.findByTitle('Last day').click();

    cy.get('[data-qa-buttons="apply"]')
      .should('be.visible')
      .should('be.enabled')
      .click();

    ui.button
      .findByAttribute('aria-label', 'Group By Dashboard Metrics')
      .should('be.visible')
      .first()
      .as('dashboardGroupByBtn');

    cy.get('@dashboardGroupByBtn').scrollIntoView();

    ui.tooltip.findByText('Group By');
    cy.get('@dashboardGroupByBtn')
      .invoke('attr', 'data-qa-selected')
      .should('eq', 'false');

    cy.wait(['@getMetrics', '@getMetrics', '@getMetrics', '@getMetrics']);
    cy.wait(1000);
    cy.scrollTo('top');
  });

  it('should apply optional filter (port) and verify API request payloads', () => {
    cy.wait(1000);
    const randomPort = randomNumber(1, 65535).toString();

    cy.findByPlaceholderText('e.g., 80,443,3000')
      .should('be.visible')
      .type(randomPort);

    cy.wait(['@getMetrics', '@getMetrics', '@getMetrics', '@getMetrics']);

    cy.get('@getMetrics.all').then((calls) => {
      const lastFourCalls = (calls as unknown as Interception[]).slice(-4);

      lastFourCalls.forEach((call) => {
        const filters = call.request.body.filters;
        expect(filters).to.deep.include({
          dimension_label: 'port',
          operator: 'in',
          value: randomPort,
        });
      });
    });
  });

  it('should allow users to select their desired granularity and see the most recent data from the API reflected in the graph', () => {
    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector)
        .should('be.visible')
        .find('h2')
        .should('have.text', `${testData.title} (${testData.unit.trim()})`);
      cy.get(widgetSelector)
        .should('be.visible')
        .within(() => {
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

          ui.autocomplete
            .findByLabel('Select an Interval')
            .should('be.visible')
            .type(`${testData.expectedGranularity}{enter}`);

          cy.wait('@getGranularityMetrics').then((interception) => {
            expect(interception)
              .to.have.property('response')
              .with.property('statusCode', 200);
            expect(testData.expectedGranularity).to.include(
              interception.request.body.time_granularity.value
            );
          });

          cy.get('.recharts-responsive-container').within(() => {
            const expectedWidgetValues = getWidgetLegendRowValuesFromResponse(
              metricsAPIResponsePayload,
              testData.title,
              testData.unit
            );

            cy.get(`[data-qa-graph-row-title="${testData.title}"]`)
              .should('be.visible')
              .should('have.text', testData.title);

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

          ui.autocomplete
            .findByLabel('Select an Aggregate Function')
            .should('be.visible')
            .type(`${testData.expectedAggregation}{enter}`);

          cy.wait('@getAggregationMetrics').then((interception) => {
            expect(interception)
              .to.have.property('response')
              .with.property('statusCode', 200);
            expect(testData.expectedAggregation).to.equal(
              interception.request.body.metrics[0].aggregate_function
            );
          });

          cy.get('.recharts-responsive-container').within(() => {
            const expectedWidgetValues = getWidgetLegendRowValuesFromResponse(
              metricsAPIResponsePayload,
              testData.title,
              testData.unit
            );

            cy.get(`[data-qa-graph-row-title="${testData.title}"]`)
              .should('be.visible')
              .should('have.text', testData.title);

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

            cy.get(`[data-qa-graph-row-title="${testData.title}"]`)
              .should('be.visible')
              .should('have.text', testData.title);

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

            cy.get(`[data-qa-graph-row-title="${testData.title}"]`)
              .should('be.visible')
              .should('have.text', testData.title);

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

  metrics.forEach((widgetConfig) => {
    it(`should download CSV and validate content for ${widgetConfig.title}`, () => {
      mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload, {
        entity_id: '1',
      }).as('getMetrics');

      const { title, name } = widgetConfig;
      const widgetSelector = `[data-qa-widget="${title}"]`;

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
});
