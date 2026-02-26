/**
 * @file Integration Tests for CloudPulse Logs Dashboard.
 */
import { widgetDetails } from 'support/constants/widgets';
import { mockGetAccount } from 'support/intercepts/account';
import {
  mockCreateCloudPulseJWEToken,
  mockCreateCloudPulseMetrics,
  mockGetCloudPulseDashboard,
  mockGetCloudPulseDashboards,
  mockGetCloudPulseMetricDefinitions,
  mockGetCloudPulseServices,
  mockGetStreams,
} from 'support/intercepts/cloudpulse';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetUserPreferences } from 'support/intercepts/profile';
import { ui } from 'support/ui';
import {
  comparePreferences,
  generateRandomMetricsData,
} from 'support/util/cloudpulse';
import { apiMatcher } from 'support/util/intercepts';

import {
  accountFactory,
  cloudPulseMetricsResponseFactory,
  dashboardFactory,
  dashboardMetricFactory,
  flagsFactory,
  streamFactory,
  widgetFactory,
} from 'src/factories';

const timeDurationToSelect = 'Last 24 Hours';
const { dashboardName, id, metrics, streamName } = widgetDetails.logs;
const serviceType = 'logs';

const initialPreference = {
  dashboardId: 11,
  groupBy: ['entity_id', 'status_code'],
  resources: ['1'],
  status_code: '200',
  widgets: {
    'Success Upload Count': {
      groupBy: ['entity_id', 'status_code'],
      label: 'Success Upload Count',
      timeGranularity: {
        unit: 'hr',
        value: 1,
      },
    },
  },
};

const getFiltersForMetric = (metricName: string) => {
  const metric = metrics.find((m) => m.name === metricName);
  if (!metric) return [];

  return metric.filters.map((filter) => ({
    dimension_label: filter.dimension_label,
    label: filter.dimension_label,
    values: filter.value
      ? Array.isArray(filter.value)
        ? filter.value
        : [filter.value]
      : undefined,
  }));
};

const dashboard = dashboardFactory.build({
  group_by: ['entity_id'],
  id,
  label: dashboardName,
  service_type: serviceType,
  widgets: metrics.map(({ name, title, unit, yLabel }) =>
    widgetFactory.build({
      label: title,
      metric: name,
      namespace_id: id,
      service_type: serviceType,
      unit,
      y_label: yLabel,
    })
  ),
});

const metricDefinitions = metrics.map(({ name, title, unit }) =>
  dashboardMetricFactory.build({
    dimensions: [...getFiltersForMetric(name)],
    label: title,
    metric: name,
    unit,
  })
);

const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: generateRandomMetricsData(timeDurationToSelect, '5 min'),
});

const streams = streamFactory.build({ id: 1, label: streamName });

const verifyFilterExists = (filterType: string, value: string) => {
  cy.get(`[data-qa-value="${filterType} ${value}"]`)
    .should('be.visible')
    .should('have.text', value);
};

const verifyFilterNotExists = (filterType: string, value: string) => {
  cy.get(`[data-qa-value="${filterType} ${value}"]`).should('not.exist');
};
// Add this helper at the top of the file with other helpers
const waitForDashboardToLoad = () => {
  // Wait for the dashboard autocomplete to be populated
  cy.get(
    '[data-qa-autocomplete="Dashboard"] input[data-testid="textfield-input"]',
    {
      timeout: 30000,
    }
  ).should('have.value', dashboardName);

  // Wait for skeleton/loading indicators to disappear
  cy.get('[aria-label="Content is loading"]', { timeout: 30000 }).should(
    'not.exist'
  );

  // Wait for widgets to be visible
  cy.get('[data-qa-widget]', { timeout: 30000 }).should('be.visible');
};

describe('Integration Tests for Logs Dashboard', () => {
  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(accountFactory.build());
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions);
    mockGetCloudPulseDashboards(serviceType, [dashboard]).as('fetchDashboards');
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetCloudPulseDashboard(id, dashboard).as('fetchDashboard');
    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    mockGetStreams([streams]);
    mockGetUserPreferences({
      aclpPreference: initialPreference,
    }).as('fetchPreferences');

    cy.visitWithLogin('/metrics');
    cy.wait(['@fetchServices', '@fetchDashboard', '@fetchPreferences']);
    waitForDashboardToLoad();
    waitForFiltersToLoad();

    ui.button.findByTitle('Filters').click();

    cy.get('[data-qa-applied-filter-id="applied-filter"]')
      .should('be.visible')
      .within(() => {
        verifyFilterExists('Stream Names', streamName);
        verifyFilterExists('Status Code', '200');
      });

    ui.button.findByTitle('Filters').click();

    cy.wait(['@getMetrics', '@getMetrics', '@getMetrics']);

    cy.get('[aria-label="Content is loading"]', { timeout: 30000 }).should(
      'not.exist'
    );

    cy.scrollTo('top');
  });

  it('reloads the page and verifies preferences are restored from API', () => {
    cy.intercept('GET', apiMatcher('profile/preferences')).as(
      'fetchPreferencesReload'
    );
    cy.reload();
    cy.wait('@fetchPreferencesReload');
    cy.get('[data-qa-paper="true"]').within(() => {
      // Dashboard autocomplete
      cy.get(
        '[data-qa-autocomplete="Dashboard"] input[data-testid="textfield-input"]'
      ).should('have.value', dashboardName);

      // Stream Names autocomplete - verify chip value
      cy.get('[data-qa-autocomplete="Stream Names"]')
        .find('[role="button"][data-tag-index="0"] .MuiChip-label')
        .should('have.text', 'logs-stream-1');

      // Status Code input
      cy.get(
        '[data-testid="status_code-input"] input[data-testid="textfield-input"]'
      ).should('have.value', '200');

      // Refresh button (tooltip)
      cy.get('[data-qa-tooltip="Refresh"]').should('exist');

      // Group By button
      cy.get('[data-testid="group-by"]').should(
        'have.attr',
        'data-qa-selected',
        'true'
      );
    });
  });
  it('clears the Dashboard filter and verifies updated user preferences', () => {
    cy.intercept('PUT', apiMatcher('profile/preferences')).as(
      'updateDashboardPreference'
    );

    cy.get('[data-qa-autocomplete="Dashboard"]')
      .find('button[aria-label="Clear"]')
      .click();

    cy.get('[data-qa-applied-filter-id="applied-filter"]').should('not.exist');

    cy.wait('@updateDashboardPreference').then(({ request, response }) => {
      const responseBody =
        response?.body &&
        (typeof response.body === 'string'
          ? JSON.parse(response.body)
          : response.body);

      const expectedAclpPreference = { widgets: {} };

      comparePreferences(responseBody?.aclpPreference, expectedAclpPreference);
      comparePreferences(request.body.aclpPreference, expectedAclpPreference);
    });

    cy.get('[aria-label="Content is loading"]', { timeout: 30000 }).should(
      'not.exist'
    );
  });

  it('clears the Stream filter and verifies updated user preferences', () => {
    cy.intercept('PUT', apiMatcher('profile/preferences')).as(
      'updatePreference'
    );

    cy.get('[data-qa-autocomplete="Stream Names"]')
      .find('button[aria-label="Clear"]')
      .click();

    ui.button.findByTitle('Filters').should('be.visible').click();

    cy.get('[data-qa-applied-filter-id="applied-filter"]')
      .should('be.visible')
      .within(() => {
        verifyFilterNotExists('Stream Names', streamName);
        verifyFilterExists('Status Code', '200');
      });

    cy.wait('@updatePreference').then(({ request, response }) => {
      const responseBody =
        response?.body &&
        (typeof response.body === 'string'
          ? JSON.parse(response.body)
          : response.body);

      const expectedAclpPreference = {
        dashboardId: 11,
        groupBy: ['entity_id', 'status_code'],
        resources: [],
        status_code: '200',
        widgets: {
          'Success Upload Count': {
            groupBy: ['entity_id', 'status_code'],
            label: 'Success Upload Count',
            timeGranularity: {
              unit: 'hr',
              value: 1,
            },
          },
        },
      };

      comparePreferences(responseBody?.aclpPreference, expectedAclpPreference);
      comparePreferences(request.body.aclpPreference, expectedAclpPreference);
    });
  });

  it('clears the Status Code filter and verifies updated user preferences', () => {
    cy.intercept('PUT', apiMatcher('profile/preferences')).as(
      'updatePreference'
    );

    cy.get('[data-testid="status_code-input"]')
      .find('input[data-testid="textfield-input"]')
      .clear();

    cy.get('[data-testid="status_code-input"]')
      .find('input[data-testid="textfield-input"]')
      .blur();
    ui.button.findByTitle('Filters').should('be.visible').click();

    cy.get('[data-qa-applied-filter-id="applied-filter"]')
      .should('be.visible')
      .within(() => {
        verifyFilterExists('Stream Names', streamName);
        verifyFilterNotExists('Status Code', '200');
      });

    cy.wait('@updatePreference').then(({ request, response }) => {
      const responseBody =
        response?.body &&
        (typeof response.body === 'string'
          ? JSON.parse(response.body)
          : response.body);

      const expectedAclpPreference = {
        dashboardId: 11,
        groupBy: ['entity_id', 'status_code'],
        resources: ['1'],
        widgets: {
          'Success Upload Count': {
            groupBy: ['entity_id', 'status_code'],
            label: 'Success Upload Count',
            timeGranularity: {
              unit: 'hr',
              value: 1,
            },
          },
        },
      };

      comparePreferences(responseBody?.aclpPreference, expectedAclpPreference);
      comparePreferences(request.body.aclpPreference, expectedAclpPreference);
    });
  });
});
