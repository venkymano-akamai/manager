/* eslint-disable cypress/no-unnecessary-waiting */
/**
 * @file Integration Tests for CloudPulse netloadbalancer Dashboard.
 */
import { accountAvailabilityFactory, regionFactory } from '@linode/utilities';
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
import { mockGetNetLoadBalancers } from 'support/intercepts/nodebalancers';
import { mockGetUserPreferences } from 'support/intercepts/profile';
import { mockGetRegions } from 'support/intercepts/regions';
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
  networkLoadBalancerFactory,
  widgetFactory,
} from 'src/factories';

import type { CloudPulseServiceType } from '@linode/api-v4';
import type { Interception } from 'support/cypress-exports';

/**
 * This test ensures that widget titles are displayed correctly on the dashboard.
 * This test suite is dedicated to verifying the functionality and display of widgets on the Cloudpulse dashboard.
 *  It includes:
 * Validating that widgets are correctly loaded and displayed.
 * Ensuring that widget titles and data match the expected values.
 * Verifying that widget settings, such as granularity and aggregation, are applied correctly.
 * Testing widget interactions, including zooming and filtering, to ensure proper behavior.
 * Each test ensures that widgets on the dashboard operate correctly and display accurate information.
 */
const timeDurationToSelect = 'Last 24 Hours';
const capabilities = 'Network LoadBalancer';
const {
  dashboardName,
  metrics,
  serviceType,
  id,
  clusterName,
  region_id,
  region_name,
} = widgetDetails.netloadbalancer;

// Build a shared dimension object
const dimensions = [
  {
    label: 'Protocol',
    dimension_label: 'Protocol',
    values: [],
  },
  {
    label: 'ip_version',
    dimension_label: 'IP Version',
    values: ['v4', 'v6'],
  },
];

const getFiltersForMetric = (metricName: string) => {
  const metric = metrics.find((m) => m.name === metricName);
  if (!metric) return [];

  return metric.filters.map((f) => ({
    dimension_label: f.dimension_label,
    label: f.dimension_label,
    values: f.value ? [f.value] : undefined,
  }));
};

const dashboard = dashboardFactory.build({
  label: dashboardName,
  group_by: ['entity_id'],
  service_type: serviceType as CloudPulseServiceType,
  id,
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

const mockAccount = accountFactory.build({
  capabilities: [capabilities],
});

const mockRegion = regionFactory.build({
  capabilities: [capabilities],
  id: region_id,
  label: region_name,
  monitors: {
    metrics: [capabilities],
    alerts: [],
  },
});
const mockNetLoadBalancers = networkLoadBalancerFactory.build({
  label: clusterName,
  region: region_id,
  id: 1,
});

const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: generateRandomMetricsData(timeDurationToSelect, '5 min'),
});

const mockAvailability = accountAvailabilityFactory.build({
  region: region_id,
});

describe('Integration Tests for netloadbalancer Dashboard ', () => {
  /**
   * Integration Tests for netloadbalancer Dashboard
   *
   * This suite validates end-to-end functionality of the CloudPulse netloadbalancer Dashboard.
   * It covers:
   * - Loading and rendering of widgets with correct filters.
   * - Applying, clearing, and verifying "Group By" at dashboard and widget levels.
   * - Selecting time ranges, granularities, and aggregation functions.
   * - Triggering dashboard refresh and validating API calls.
   * - Performing widget interactions (zoom in/out) and verifying graph data.
   *
   * Actions focus on user flows (selecting dashboards, filters, group by, zoom, etc.)
   * and Verifications ensure correct API payloads, widget states, applied filters,
   * and accurate graph/legend values.
   */

  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount); // Enables the account to have capability for Akamai Cloud Pulse
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions);
    mockGetCloudPulseDashboards(serviceType, [dashboard]).as('fetchDashboard');
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetCloudPulseDashboard(id, dashboard).as('fetchDashboard');
    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    mockGetAccountAvailability([mockAvailability]);
    mockGetRegions([mockRegion]);
    mockGetNetLoadBalancers([mockNetLoadBalancers]);
    mockGetUserPreferences({
      aclpPreference: {
        dashboardId: 5,
        dateTimeDuration: {
          preset: 'Last day',
          timeZone: 'Etc/GMT',
        },
        widgets: {
          'Ingress Traffic Rate': {
            label: 'Ingress Traffic Rate',
            timeGranularity: {
              unit: 'min',
              value: 1,
            },
            aggregateFunction: 'max',
          },
        },
        resources: ['1'],
        region: 'us-ord',
        port: '80',
        ip_version: ['v6'],
      },
    }).as('fetchPreferences');

    // navigate to the metrics page
    cy.visitWithLogin('/metrics');

    // Wait for the services and dashboard API calls to complete before proceeding
    cy.wait(['@fetchServices', '@fetchDashboard', '@fetchPreferences']);

    // Expand the applied filters section
    ui.button.findByTitle('Filters').should('be.visible').click();

    // Verify that the applied filters
    cy.get('[data-qa-applied-filter-id="applied-filter"]').within(() => {
      cy.get('[data-qa-value="Region US, Chicago, IL"]')
        .should('be.visible')
        .should('have.text', 'US, Chicago, IL');

      cy.get(`[data-qa-value="Network Load Balancers ${clusterName}"]`)
        .should('be.visible')
        .should('have.text', clusterName);

      cy.get('[data-qa-value="Ports 80"]')
        .should('be.visible')
        .should('have.text', '80');

      cy.get('[data-qa-value="IP Versions IPv6"]')
        .should('be.visible')
        .should('have.text', 'IPv6');
    });
    // Wait for all metrics query requests to resolve.
    cy.wait(['@getMetrics', '@getMetrics']).then((calls) => {
      const interceptions = calls as unknown as Interception[];

      expect(interceptions).to.have.length(2);
    });
    ui.button.findByTitle('Filters').click();
    cy.get('[aria-label="Content is loading"]', { timeout: 30000 }).should(
      'not.exist'
    );
    cy.wait(1000);
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

      cy.get('[data-qa-autocomplete="Network Load Balancers"]').within(() => {
        // get the first chip using only data attributes
        cy.get('[data-tag-index="0"]').should('have.text', clusterName);

        // check the helper text
        cy.get('[data-qa-textfield-helper-text="true"]').should(
          'contain.text',
          'Select up to 10 Network Load Balancers'
        );
      });
      // Region autocomplete
      cy.get(
        '[data-qa-autocomplete="Region"] input[data-testid="textfield-input"]'
      ).should('have.value', 'US, Chicago, IL (us-ord)');

      // Refresh button (tooltip)
      cy.get('[data-qa-tooltip="Refresh"]').should('exist');

      // Group By button
      cy.get('[data-testid="group-by"]').should(
        'have.attr',
        'data-qa-selected',
        'true'
      );
      cy.get('#ports').should('have.value', '80');
    });
    // Select a time duration from the autocomplete input.
    ui.button.findByTitle('Last day').as('timeRangeTrigger');
    cy.get('@timeRangeTrigger').click();

    ui.buttonGroup
      .findButtonByTitle('Cancel')
      .should('be.visible')
      .and('be.enabled')
      .click();
  });

  it('clears the Dashboard filters and verifies updated user preferences', () => {
    cy.intercept('PUT', apiMatcher('profile/preferences')).as(
      'updateDashbaordPreference'
    );
    // clear Dashboard filter
    cy.get('[data-qa-autocomplete="Dashboard"]')
      .find('button[aria-label="Clear"]')
      .click();

    // Verify none of these applied filters exist after clear
    cy.get('[data-qa-applied-filter-id="applied-filter"]').should('not.exist');
    cy.wait('@updateDashbaordPreference').then(({ request, response }) => {
      const responseBody =
        response?.body &&
        (typeof response.body === 'string'
          ? JSON.parse(response.body)
          : response.body);

      const expectedAclpPreference = { widgets: {} };

      comparePreferences(responseBody?.aclpPreference, expectedAclpPreference);
      comparePreferences(request.body.aclpPreference, expectedAclpPreference);
    });
  });

  it('clears the Region filter and verifies updated user preferences', () => {
    cy.intercept('PUT', apiMatcher('profile/preferences')).as(
      'updateRegionPreference'
    );
    // clear the Region filter
    cy.get('[data-qa-autocomplete="Region"]')
      .find('button[aria-label="Clear"]')
      .click();

    ui.button.findByTitle('Filters').should('be.visible').click();

    // Verify none of these applied filters exist after clear
    cy.get('[data-qa-applied-filter-id="applied-filter"]').within(() => {
      cy.get('[data-qa-value="Region US, Chicago, IL"]').should('not.exist');
      cy.get('[data-qa-value="Ports 80"]').should('exist');
      cy.get('[data-qa-value="IP Versions IPv6"]').should('exist');
      cy.get(`[data-qa-value="Network Load Balancers ${clusterName}"]`).should(
        'not.exist'
      );
    });
    cy.wait('@updateRegionPreference').then(({ request, response }) => {
      const responseBody =
        response?.body &&
        (typeof response.body === 'string'
          ? JSON.parse(response.body)
          : response.body);

      const expectedAclpPreference = {
        dashboardId: 5,
        dateTimeDuration: {
          preset: 'Last day',
          timeZone: 'Etc/GMT',
        },
        port: '80',
        ip_version: ['v6'],
        widgets: {
          'Ingress Traffic Rate': {
            label: 'Ingress Traffic Rate',
            timeGranularity: {
              unit: 'min',
              value: 1,
            },
            aggregateFunction: 'max',
          },
        },
      };

      comparePreferences(responseBody?.aclpPreference, expectedAclpPreference);
      comparePreferences(request.body.aclpPreference, expectedAclpPreference);
    });
  });

  it('clears the net nodebalancer Clusters filter and verifies updated user preferences', () => {
    cy.intercept('PUT', apiMatcher('profile/preferences')).as(
      'updateDBClustersPreference'
    );
    // clear the Region filter
    cy.get('[data-qa-autocomplete="Network Load Balancers"]')
      .find('button[aria-label="Clear"]')
      .click();

    ui.button.findByTitle('Filters').should('be.visible').click();

    cy.get('[data-qa-applied-filter-id="applied-filter"]').within(() => {
      cy.get('[data-qa-value="Region US, Chicago, IL"]').should('be.visible');
      cy.get('[data-qa-value="Ports 80"]').should('exist');
      cy.get('[data-qa-value="IP Versions IPv6"]').should('exist');
      cy.get(`[data-qa-value="Network Load Balancers ${clusterName}"]`).should(
        'not.exist'
      );
    });
    cy.wait('@updateDBClustersPreference').then(({ request, response }) => {
      const responseBody =
        response?.body &&
        (typeof response.body === 'string'
          ? JSON.parse(response.body)
          : response.body);

      const expectedAclpPreference = {
        dashboardId: 5,
        region: 'us-ord',
        port: '80',
        ip_version: ['v6'],
        dateTimeDuration: {
          preset: 'Last day',
          timeZone: 'Etc/GMT',
        },
        widgets: {
          'Ingress Traffic Rate': {
            label: 'Ingress Traffic Rate',
            timeGranularity: {
              unit: 'min',
              value: 1,
            },
            aggregateFunction: 'max',
          },
        },
      };

      comparePreferences(responseBody?.aclpPreference, expectedAclpPreference);
      comparePreferences(request.body.aclpPreference, expectedAclpPreference);
    });
  });
  it('clears the Port Filter and verifies updated user preferences', () => {
    cy.intercept('PUT', apiMatcher('profile/preferences')).as(
      'updateDBClustersPreference'
    );
    // clear the Region filter
    cy.findByPlaceholderText('e.g., 80,443,3000').clear();

    ui.button.findByTitle('Filters').should('be.visible').click();

    cy.get('[data-qa-applied-filter-id="applied-filter"]').within(() => {
      cy.get('[data-qa-value="Region US, Chicago, IL"]').should('be.visible');
      cy.get('[data-qa-value="Ports 80"]').should('not.exist');
      cy.get('[data-qa-value="IP Versions IPv6"]').should('exist');
      cy.get(`[data-qa-value="Network Load Balancers ${clusterName}"]`)
        .should('be.visible')
        .should('have.text', clusterName);
    });
    cy.wait('@updateDBClustersPreference').then(({ request, response }) => {
      const responseBody =
        response?.body &&
        (typeof response.body === 'string'
          ? JSON.parse(response.body)
          : response.body);

      const expectedAclpPreference = {
        dashboardId: 5,
        region: 'us-ord',
        ip_version: ['v6'],
        resources: ['1'],
        dateTimeDuration: {
          preset: 'Last day',
          timeZone: 'Etc/GMT',
        },
        widgets: {
          'Ingress Traffic Rate': {
            label: 'Ingress Traffic Rate',
            timeGranularity: {
              unit: 'min',
              value: 1,
            },
            aggregateFunction: 'max',
          },
        },
      };

      comparePreferences(responseBody?.aclpPreference, expectedAclpPreference);
      comparePreferences(request.body.aclpPreference, expectedAclpPreference);
    });
  });

  it('clears the IP Versions Filter and verifies updated user preferences', () => {
    cy.intercept('PUT', apiMatcher('profile/preferences')).as(
      'updateDBClustersPreference'
    );
    // clear the Region filter
    cy.get('[data-qa-autocomplete="IP Versions"]')
      .find('button[aria-label="Clear"]')
      .click();

    ui.button.findByTitle('Filters').should('be.visible').click();

    cy.get('[data-qa-applied-filter-id="applied-filter"]').within(() => {
      cy.get('[data-qa-value="Region US, Chicago, IL"]').should('be.visible');
      cy.get('[data-qa-value="Ports 80"]').should('be.visible');
      cy.get(`[data-qa-value="Network Load Balancers ${clusterName}"]`)
        .should('be.visible')
        .should('have.text', clusterName);
      cy.get('[data-qa-value="IP Versions IPv6"]').should('not.exist');
    });

    cy.wait('@updateDBClustersPreference').then(({ request, response }) => {
      const responseBody =
        response?.body &&
        (typeof response.body === 'string'
          ? JSON.parse(response.body)
          : response.body);

      const expectedAclpPreference = {
        dashboardId: 5,
        region: 'us-ord',
        port: '80',
        resources: ['1'],
        dateTimeDuration: {
          preset: 'Last day',
          timeZone: 'Etc/GMT',
        },
        widgets: {
          'Ingress Traffic Rate': {
            label: 'Ingress Traffic Rate',
            timeGranularity: {
              unit: 'min',
              value: 1,
            },
            aggregateFunction: 'max',
          },
        },
      };

      comparePreferences(responseBody?.aclpPreference, expectedAclpPreference);
      comparePreferences(request.body.aclpPreference, expectedAclpPreference);
    });
  });
});
