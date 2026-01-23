/* eslint-disable cypress/no-unnecessary-waiting */
/* eslint-disable cypress/unsafe-to-chain-command */

/**
 * @file Integration Tests for CloudPulse Custom and Preset Verification
 */
import '@4tw/cypress-drag-drop';
import 'cypress-real-events/support';
import { profileFactory, regionFactory } from '@linode/utilities';
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
  widgetFactory,
} from 'src/factories';

import type { Database } from '@linode/api-v4';

const mockRegion = regionFactory.build({
  capabilities: ['Managed Databases'],
  id: 'us-ord',
  label: 'Chicago, IL',
  monitors: {
    metrics: ['Managed Databases'],
    alerts: [],
  },
});

const { dashboardName, engine, id, metrics } = widgetDetails.dbaas;
const serviceType = 'dbaas';
const dashboard = dashboardFactory.build({
  label: dashboardName,
  service_type: serviceType,
  widgets: metrics.map(({ name, title, unit, yLabel }) => {
    return widgetFactory.build({
      label: title,
      metric: name,
      unit,
      y_label: yLabel,
      group_by: ['entity_id', 'node_type'],
    });
  }),
});

const metricDefinitions = {
  data: metrics.map(({ name, title, unit }) =>
    dashboardMetricFactory.build({
      label: title,
      metric: name,
      unit,
    })
  ),
};
const mockProfile = profileFactory.build({
  timezone: 'gmt',
});

const mockAccount = accountFactory.build();

const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: generateRandomMetricsData('Last 24 Hours', '1 hr'),
});

const databaseMock: Database = databaseFactory.build({
  region: mockRegion.id,
  type: engine,
});
/**
 * Extracts tooltip text values from all data points in a Recharts area chart.
 *
 * Scrolls the widget into view, iterates over each
 * `circle.recharts-area-dot`, triggers a mouseover to display the tooltip,
 * waits for the tooltip to become visible, and collects the tooltip text
 * for every data point in render order.
 *
 * @param widgetSelector - Selector for the chart widget container
 * @returns Chainable array of tooltip text values for each chart point
 */

const getRechartsPointValues = (
  widgetSelector: string
): Cypress.Chainable<string[]> => {
  const actualList: string[] = [];

  return cy
    .get(widgetSelector)
    .scrollIntoView()
    .within(() => {
      cy.get('circle.recharts-area-dot').each(($dot) => {
        cy.wrap($dot)
          .trigger('mouseover', { force: true })
          .should('have.css', 'opacity', '1')
          .wait(500)
          .get('.recharts-tooltip-wrapper', { timeout: 10000 })
          .should('be.visible')
          .invoke('text')
          .then((text) => actualList.push(text.trim()));
      });
    })
    .then(() => actualList);
};
/**
 * Simulates a zoom-in interaction on a Recharts area chart by dragging
 * between two data points.
 *
 * Scrolls the widget into view, finds all `circle.recharts-area-dot`
 * elements within the chart, and performs a mouse drag starting from
 * `fromIndex` to `toIndex` to trigger the chart’s zoom behavior.
 *
 * @param widgetSelector - Selector for the chart widget container
 * @param fromIndex - Zero-based index of the starting data point (mousedown)
 * @param toIndex - Zero-based index of the ending data point (mousemove + mouseup)
 */

const zoomInOnChart = (
  widgetSelector: string,
  fromIndex = 3,
  toIndex = 6
): void => {
  cy.get(widgetSelector)
    .scrollIntoView()
    .within(() => {
      cy.get('circle.recharts-area-dot').as('rechartsDots');
      cy.get('@rechartsDots')
        .eq(fromIndex)
        .trigger('mousedown', { force: true });
      cy.get('@rechartsDots').eq(toIndex).trigger('mousemove', { force: true });
      cy.get('@rechartsDots').eq(toIndex).trigger('mouseup', { force: true });
    });
};
/**
 * Asserts the number of visible Recharts area chart dots inside a widget.
 *
 * Scrolls the widget into view, scopes all queries to the widget container,
 * and verifies that the rendered area chart contains the expected number
 * of `circle.recharts-area-dot` elements.
 *
 * @param widgetSelector - Selector for the chart widget container
 * @param expectedDotCount - Exact number of area chart data points expected
 */
const assertRechartsDotsCount = (
  widgetSelector: string,
  expectedDotCount: number
) => {
  cy.get(widgetSelector)
    .scrollIntoView()
    .within(() => {
      cy.get('circle.recharts-area-dot').should(
        'have.length',
        expectedDotCount
      );
    });
};

describe('Integration tests for verifying Cloudpulse Zoom in', () => {
  const now = new Date();
  const end = new Date(now.getTime() + 5.5 * 60 * 60 * 1000); // IST
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const widgetSelector = '[data-qa-widget="Disk I/O"]';

  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount);
    mockGetProfile(mockProfile);
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions.data);
    mockGetCloudPulseDashboards(serviceType, [dashboard]);
    mockGetCloudPulseServices([serviceType]);
    mockGetCloudPulseDashboard(id, dashboard);
    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    mockGetRegions([mockRegion]);
    mockGetUserPreferences({
      aclpPreference: {
        dashboardId: id,
        engine: engine.toLowerCase(),
        region: mockRegion.id,
        resources: ['1'],
        node_type: 'secondary',
        dateTimeDuration: {
          end: end.toISOString(),
          preset: 'Last day',
          start: start.toISOString(),
          timeZone: 'Etc/GMT',
        },
        widgets: {
          'Disk I/O': {
            label: 'Disk I/O',
            timeGranularity: {
              unit: 'hr',
              value: 1,
            },
            aggregateFunction: 'min',
          },
        },
      },
    }).as('fetchPreferences');

    mockGetDatabases([databaseMock]);
    cy.visitWithLogin('/metrics');

    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );

    cy.wait(['@getMetrics', '@getMetrics', '@getMetrics', '@getMetrics']);

    getRechartsPointValues(widgetSelector).as('expectedValues');

    zoomInOnChart(widgetSelector, 3, 6);
    ui.buttonGroup.findButtonByTitle('Reset Zoom').should('be.visible');

    getRechartsPointValues(widgetSelector).as('actualValues');

    cy.get('@expectedValues').then((expectedRaw) => {
      const expectedValues = expectedRaw as unknown as string[];
      cy.get('@actualValues').then((actualRaw) => {
        const actualValues = actualRaw as unknown as string[];
        actualValues.forEach((val) => expect(expectedValues).to.include(val));
      });
    });
  });

  it('should reset zoom and validate widget contents', () => {
    ui.buttonGroup.findButtonByTitle('Reset Zoom').should('be.visible').click();
    assertRechartsDotsCount(widgetSelector, 25);
    cy.contains('button', 'Reset Zoom').should('not.exist');
  });

  it('restores the widget to its default view after the user changes the date and time and resets zoom', () => {
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getResetMetrics'
    );
    ui.button.findByTitle('Last day').as('startDateInput');
    cy.get('@startDateInput').click();

    ui.button.findByTitle('Last hour').click();

    cy.get('[data-qa-buttons="apply"]')
      .should('be.visible')
      .should('be.enabled')
      .click();

    assertRechartsDotsCount(widgetSelector, 25);
    cy.contains('button', 'Reset Zoom').should('not.exist');

    cy.get('@getResetMetrics.all').should('have.length', 4);
  });

  it('maintains zoom view after global refresh and clearing mandatory filters', () => {
    cy.get('[data-testid="global-refresh"]')
      .should('be.visible')
      .should('be.enabled')
      .click();

    assertRechartsDotsCount(widgetSelector, 4);

    cy.contains('button', 'Reset Zoom').should('be.visible');
  });
});
