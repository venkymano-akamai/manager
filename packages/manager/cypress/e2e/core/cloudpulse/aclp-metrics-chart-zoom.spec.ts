/* eslint-disable cypress/no-unnecessary-waiting */

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
  data: {
    result_type: 'matrix',
    result: [
      {
        metric: {
          metric_name: 'system_disk_OPS_total',
        },
        values: [
          [1769097437, '28.76'],
          [1769101037, '8.71'],
          [1769104637, '46.31'],
          [1769108237, '50.19'],
          [1769111837, '37.17'],
          [1769115437, '89.50'],
          [1769119037, '65.45'],
          [1769122637, '45.11'],
          [1769126237, '84.03'],
          [1769129837, '73.04'],
          [1769133437, '36.44'],
          [1769137037, '98.57'],
          [1769140637, '91.49'],
          [1769144237, '74.01'],
          [1769147837, '74.00'],
          [1769151437, '28.30'],
          [1769155037, '76.37'],
          [1769158637, '8.17'],
          [1769162237, '53.51'],
          [1769165837, '88.35'],
          [1769169437, '85.80'],
          [1769173037, '66.69'],
          [1769176637, '48.55'],
          [1769180237, '51.13'],
          [1769183837, '27.41'],
        ],
      },
    ],
  },
  isPartial: false,
  stats: {
    series_fetched: 2,
  },
  status: 'success',
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

  // chain 1: scroll only
  cy.get(widgetSelector).scrollIntoView();

  // chain 2: all interactions
  cy.get(widgetSelector).then(($widget) => {
    cy.wrap($widget)
      .find('circle.recharts-area-dot')
      .each(($dot) => {
        cy.wrap($dot).trigger('mouseover', { force: true });
        cy.wait(250);
        cy.wrap($widget)
          .find('.recharts-tooltip-wrapper', { timeout: 10000 })
          .should('be.visible')
          .invoke('text')
          .then((text) => {
            actualList.push(text.trim());
          });
      });
  });

  return cy.then(() => actualList);
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
  cy.get(widgetSelector).within(() => {
    cy.get('circle.recharts-area-dot').as('rechartsDots');
    cy.get('@rechartsDots').eq(fromIndex).trigger('mousedown', { force: true });
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
  // chain 1: scroll only
  cy.get(widgetSelector).scrollIntoView();

  // chain 2: assertion
  cy.get(widgetSelector).then(($widget) => {
    cy.wrap($widget)
      .find('circle.recharts-area-dot')
      .should('have.length', expectedDotCount);
  });
};

/**
 * Asserts legend row values (Max, Avg, Last) for a widget area chart.
 *
 * Scopes assertions to the widget container and validates that the
 * legend values match the expected numbers exactly.
 *
 * @param widgetSelector - Selector for the widget container
 * @param max - Expected Max value
 * @param avg - Expected Avg value
 * @param last - Expected Last value
 */
const getLegendRow = (
  widgetSelector: string,
  max: string,
  avg: string,
  last: string
): void => {
  cy.get(widgetSelector)
    .should('be.visible')
    .within(() => {
      cy.get('.recharts-responsive-container').within(() => {
        cy.get('[data-qa-graph-column-title="Max"]')
          .should('be.visible')
          .and('have.text', String(max));

        cy.get('[data-qa-graph-column-title="Avg"]')
          .should('be.visible')
          .and('have.text', String(avg));

        cy.get('[data-qa-graph-column-title="Last"]')
          .should('be.visible')
          .and('have.text', String(last));
      });
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

    // Validate data points Before zoom-in

    getRechartsPointValues(widgetSelector).as('expectedValues');
    getLegendRow(widgetSelector, '98.57 OPS', '57.48 OPS', '27.41 OPS');

    // Validate data points after zoom-in
    zoomInOnChart(widgetSelector, 3, 6);
    ui.buttonGroup.findButtonByTitle('Reset Zoom').should('be.visible');

    getRechartsPointValues(widgetSelector).as('actualValues');

    getLegendRow(widgetSelector, '89.5 OPS', '60.58 OPS', '65.45 OPS');

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
  it('should not change the zoomed view when widget-level groupBy is applied or cleared', () => {
    ui.button
      .findByAttribute('aria-label', 'Group By Dashboard Metrics')
      .should('be.visible')
      .first()
      .as('dashboardGroupByBtn');

    // Ensure the button is scrolled into view
    cy.get('@dashboardGroupByBtn').scrollIntoView();

    // Click the Group By button to open the drawer
    cy.get('@dashboardGroupByBtn').should('be.visible').click();

    ui.autocomplete
      .findByLabel('Dimensions')
      .should('be.visible')
      .type('State of CPU');

    ui.autocompletePopper
      .findByTitle('State of CPU')
      .should('be.visible')
      .click();

    // Close the drawer using ESC
    cy.get('body').type('{esc}');

    // Click Apply to confirm the Group By selection
    cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

    ui.buttonGroup.findButtonByTitle('Reset Zoom').should('be.visible');
    assertRechartsDotsCount(widgetSelector, 4);

    cy.get('@dashboardGroupByBtn').should('be.visible').click();
    cy.get('[data-qa-autocomplete="Dimensions"]').within(() => {
      cy.get('button[aria-label="Clear"]').should('be.visible').click({});
    });

    // Click Apply to confirm unselection
    cy.findByTestId('apply').should('be.visible').and('be.enabled').click();

    ui.buttonGroup.findButtonByTitle('Reset Zoom').should('be.visible');
    assertRechartsDotsCount(widgetSelector, 4);
  });

  it('should not change the zoomed view when widget-level groupBy, granularity, or aggregation is changed', () => {
    cy.get(widgetSelector)
      .should('be.visible')
      .within(() => {
        ui.autocomplete
          .findByLabel('Select an Interval')
          .should('be.visible')
          .type('5 min{enter}');
      });
    ui.buttonGroup.findButtonByTitle('Reset Zoom').should('be.visible');
    assertRechartsDotsCount(widgetSelector, 4);

    cy.get(widgetSelector)
      .should('be.visible')
      .within(() => {
        ui.autocomplete
          .findByLabel('Select an Aggregate Function')
          .should('be.visible')
          .type('min{enter}');
      });
    ui.buttonGroup.findButtonByTitle('Reset Zoom').should('be.visible');
    assertRechartsDotsCount(widgetSelector, 4);
  });

  it('does not disturb first widget zoom when second widget is added and zoomed', () => {
    const secondWidgetSelector = '[data-qa-widget="CPU Utilization"]';
    cy.get(widgetSelector).as('widget');
    cy.get('@widget')
      .should('be.visible')
      .within(() => {
        ui.button.findByAttribute('aria-label', 'Zoom Out').click();
      });
    getRechartsPointValues(widgetSelector).as('actualValues');
    cy.get('@actualValues').then((actualValues) => {
      expect(actualValues).to.have.length(4);
    });
    ui.buttonGroup.findButtonByTitle('Reset Zoom').should('be.visible');

    cy.get(secondWidgetSelector).as('widget');
    cy.get('@widget')
      .should('be.visible')
      .within(() => {
        ui.button.findByAttribute('aria-label', 'Zoom Out').click();
      });
    zoomInOnChart(secondWidgetSelector, 3, 6);
    cy.wait(300);
    getRechartsPointValues(secondWidgetSelector).should((actualValues) => {
      expect(actualValues).to.have.length(4);
    });
    ui.buttonGroup.findButtonByTitle('Reset Zoom').should('be.visible');
  });

  it('Add and Remove widget level dimension filter and validate zoom-in', () => {
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    // Add Dimension Filter
    cy.get(widgetSelector)
      .should('be.visible')
      .within(() => {
        ui.button
          .findByAttribute('aria-label', 'Widget Dimension Filter Disk I/O')
          .should('be.visible')
          .click();
      });

    ui.button.findByTitle('Add Filter').click();
    cy.get('[data-testid="dimension_filters.0-id"]').within(() => {
      ui.autocomplete.findByLabel('Dimension').should('be.visible').click();
      ui.autocomplete.findByLabel('Dimension').type('State of CPU');

      ui.autocompletePopper
        .findByTitle('State of CPU')
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
    assertRechartsDotsCount(widgetSelector, 4);
    ui.buttonGroup.findButtonByTitle('Reset Zoom').should('be.visible');
    cy.wait('@getMetrics').then((interception) => {
      const { filters } = interception.request.body;

      expect(filters).to.have.length(2);

      expect(filters).to.deep.include.members([
        {
          dimension_label: 'node_type',
          operator: 'eq',
          value: 'secondary',
        },
        {
          dimension_label: 'state',
          operator: 'startswith',
          value: 'User',
        },
      ]);
    });
    // Remove Dimension Filter
    cy.get(widgetSelector)
      .should('be.visible')
      .within(() => {
        ui.button
          .findByAttribute('aria-label', 'Widget Dimension Filter Disk I/O')
          .should('be.visible')
          .click();
      });
    cy.get('[data-qa-id="filter-drawer-clear-all"]').click();

    ui.button.findByAttribute('label', 'Apply').click();

    assertRechartsDotsCount(widgetSelector, 4);
    ui.buttonGroup.findButtonByTitle('Reset Zoom').should('be.visible');
  });
});
