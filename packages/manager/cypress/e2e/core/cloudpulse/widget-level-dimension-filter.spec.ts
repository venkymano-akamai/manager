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
import {
  mockAppendFeatureFlags,
  mockGetFeatureFlagClientstream,
} from 'support/intercepts/feature-flags';
import { mockGetLinodes } from 'support/intercepts/linodes';
import { mockGetUserPreferences } from 'support/intercepts/profile';
import { mockGetRegions } from 'support/intercepts/regions';
import { mockGetVolumes } from 'support/intercepts/volumes';
import { ui } from 'support/ui';
import { generateRandomMetricsData } from 'support/util/cloudpulse';

import {
  accountFactory,
  cloudPulseMetricsResponseFactory,
  dashboardFactory,
  dashboardMetricFactory,
  flagsFactory,
  volumeFactory,
  widgetFactory,
} from 'src/factories';

// Test data constants
const timeDurationToSelect = 'Last 24 Hours';
const { dashboardName, id, metrics } = widgetDetails.blockstorage;
const serviceType = 'blockstorage';

// Dashboard definition
const dashboard = dashboardFactory.build({
  label: dashboardName,
  service_type: serviceType,
  id,
  widgets: metrics.map(({ name, title, unit, yLabel }) =>
    widgetFactory.build({
      filters: [],
      label: title,
      metric: name,
      unit,
      y_label: yLabel,
      namespace_id: id,
      service_type: serviceType,
    })
  ),
});

// Convert widget filters to dashboard filters
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

// Metric definitions
const metricDefinitions = metrics.map(({ name, title, unit }) =>
  dashboardMetricFactory.build({
    label: title,
    metric: name,
    unit,
    dimensions: [...getFiltersForMetric(name)],
  })
);

const mockRegions = [
  regionFactory.build({
    capabilities: ['Block Storage'],
    id: 'us-ord',
    label: 'Chicago, IL',
    monitors: {
      metrics: ['Block Storage'],
      alerts: [],
    },
  }),
];

const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: generateRandomMetricsData(timeDurationToSelect, '5 min'),
});

const mockVolumesEncrypted = [
  volumeFactory.build({
    encryption: 'enabled',
    label: 'test-volume-ord',
    region: 'us-ord', // Chicago
  }),
];

const linodes = [
  linodeFactory.build({
    id: 123,
    label: 'Test-linode-1',
    region: 'us-ord',
    tags: ['tag-1'],
  }),
  linodeFactory.build({
    id: 456,
    label: 'Test-linode-2',
    region: 'us-ord',
    tags: ['tag-2'],
  }),
  linodeFactory.build({
    id: 789,
    label: 'Test-linode-3',
    region: 'us-ord',
  }),
];

describe('Widget level dimension filter ', () => {
  beforeEach(() => {
    mockGetFeatureFlagClientstream();
    const flags = flagsFactory.build();
    const mergedFlags = {
      ...flags,
      aclp: {
        ...flags.aclp,
      },
    };
    mockAppendFeatureFlags(mergedFlags).as('featureFlags');
    mockGetAccount(accountFactory.build());
    mockGetCloudPulseMetricDefinitions(serviceType, metricDefinitions);
    mockGetCloudPulseDashboards(serviceType, [dashboard]).as('fetchDashboard');
    mockGetCloudPulseServices([serviceType]).as('fetchServices');
    mockGetCloudPulseDashboard(id, dashboard).as('fetchDashboard');
    mockCreateCloudPulseJWEToken(serviceType);
    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
    mockGetRegions(mockRegions);
    mockGetLinodes(linodes).as('getLinodes');
    mockGetVolumes(mockVolumesEncrypted);
    mockGetUserPreferences({});
    // Navigate to the metrics page
    cy.visitWithLogin('/metrics');
    cy.wait(['@fetchServices']);
    cy.wait('@fetchDashboard');

    // Select dashboard and resources
    ui.autocomplete
      .findByLabel('Dashboard')
      .should('be.visible')
      .type(dashboardName);
    ui.autocompletePopper
      .findByTitle(dashboardName)
      .should('be.visible')
      .click();

    ui.regionSelect.find().clear();
    ui.regionSelect.find().click();
    ui.regionSelect.find().click().type(`${mockRegions[0].label}{enter}`);

    ui.autocomplete
      .findByLabel('Volumes')
      .should('be.visible')
      .type(mockVolumesEncrypted[0].label);
    ui.autocompletePopper
      .findByTitle(mockVolumesEncrypted[0].label)
      .should('be.visible')
      .click();
    ui.autocomplete.findByLabel('Volumes').type('{esc}');

    cy.wait(Array(6).fill('@getMetrics'));
    cy.get('[data-qa-widget]').should('have.length.at.least', 1);
  });

  it('should verify the widget level dimension filter and validate the API response', () => {
    const globalFilters = ['region', 'volume_id', 'Port'];

    // Verify tooltip message on hover of filter icon
    ui.tooltip.findByText('Dimension Filters').should('be.visible');
    ui.drawer.find().should('not.exist');

    // Open the filter drawer
    ui.button
      .findByAttribute(
        'aria-label',
        `Widget Dimension Filter${dashboard.widgets[0].label}`
      )
      .should('be.visible')
      .click();
    cy.get('[data-testid="drawer"]').should('be.visible');

    // Verify drawer content
    ui.drawer
      .find()
      .should('be.visible')
      .within(() => {
        cy.get('[data-testid="drawer-title"]')
          .should('be.visible')
          .and('contain.text', 'Dimension Filters');
        cy.get('[data-qa-id="filter-drawer-subtitle"]')
          .should('be.visible')
          .and('contain.text', dashboard.widgets[0].label);
        cy.get('[data-qa-id="filter-drawer-selection-title"]')
          .should('be.visible')
          .and('contain.text', 'Select up to 5 filters');
        ui.button
          .findByTitle('Add Filter')
          .should('be.visible')
          .and('be.enabled');
        ui.button
          .findByAttribute('label', 'Apply')
          .should('be.visible')
          .and('be.enabled')
          .and('not.have.attr', 'aria-disabled', 'true');
        ui.button
          .findByAttribute('label', 'Cancel')
          .should('be.visible')
          .and('be.enabled');
        ui.drawerCloseButton.find().should('be.visible').and('be.enabled');
        cy.get('[data-qa-dimension-filter="dimension_filters.0-id"]').should(
          'not.exist'
        );
      });

    // Define filters to add
    const filtersWithOperators = [
      {
        dimension: 'entity_id',
        operator: 'Not Equal',
        valueToSelect: '345',
        apiOperator: 'neq',
        apiValue: '345',
      },
      {
        dimension: 'response_type',
        operator: 'Starts with',
        valueToSelect: '2x',
        apiOperator: 'startswith',
        apiValue: '2x',
      },
      {
        dimension: 'response_type',
        operator: 'Ends with',
        valueToSelect: '5xx',
        apiOperator: 'endswith',
        apiValue: '5xx',
      },
      {
        dimension: 'Protocol',
        operator: 'In',
        valueToSelect: 'Select All',
        apiOperator: 'in',
        apiValue: 'TCP,UDP',
        verifyAvailableValues: ['TCP', 'UDP'],
      },
      {
        dimension: 'linode_id',
        operator: 'Equal',
        valueToSelect: ['Test-linode-3'],
        apiOperator: 'eq',
        apiValue: '789',
      },
    ];

    // Verify global filters are excluded from dimension options (verify once)
    ui.button.findByTitle('Add Filter').click();
    cy.get('[data-testid="dimension_filters.0-id"]').within(() => {
      ui.autocomplete.findByLabel('Dimension').should('be.visible').click();
    });

    globalFilters.forEach((filter) => {
      cy.findByText(filter, { timeout: 5000 }).should('not.exist');
    });

    // Close dropdown and remove the empty filter row
    cy.get('body').type('{esc}');
    ui.button
      .findByAttribute('data-testid', 'clear-icon')
      .should('be.visible')
      .click();

    // Add filters one by one
    filtersWithOperators.forEach(
      (
        { dimension, operator, valueToSelect, verifyAvailableValues },
        index
      ) => {
        // Click Add Filter button
        ui.button.findByTitle('Add Filter').click();

        cy.get(`[data-testid="dimension_filters.${index}-id"]`).within(() => {
          ui.autocomplete
            .findByLabel('Dimension')
            .should('be.visible')
            .click()
            .type(dimension);
          ui.autocompletePopper
            .findByTitle(dimension)
            .should('be.visible')
            .click();

          // Select operator
          ui.autocomplete
            .findByLabel('Operator')
            .should('be.visible')
            .type(operator);
          ui.autocompletePopper
            .findByTitle(operator)
            .should('be.visible')
            .click();

          // Handle value based on operator type
          if (valueToSelect === 'Select All') {
            cy.get(
              `[data-qa-dimension-filter="dimension_filters.${index}-value"]`
            )
              .findByPlaceholderText('Select Values')
              .should('be.visible')
              .click();

            // Verify available values
            if (verifyAvailableValues) {
              verifyAvailableValues.forEach((val) => {
                ui.autocompletePopper.findByTitle(val).should('be.visible');
              });
            }

            ui.autocompletePopper
              .findByTitle('Select All')
              .should('be.visible')
              .click();
          } else if (operator === 'In' && Array.isArray(valueToSelect)) {
            cy.get(
              `[data-qa-dimension-filter="dimension_filters.${index}-value"]`
            )
              .findByPlaceholderText('Select Values')
              .should('be.visible')
              .click();

            valueToSelect.forEach((val) => {
              ui.autocompletePopper
                .findByTitle(val)
                .should('be.visible')
                .click();
            });
          } else if (operator === 'Equal' && Array.isArray(valueToSelect)) {
            cy.get(
              `[data-qa-dimension-filter="dimension_filters.${index}-value"]`
            )
              .findByPlaceholderText('Select a Value')
              .should('be.visible')
              .click();
            ui.autocompletePopper
              .findByTitle(valueToSelect[0])
              .should('be.visible')
              .click();
          } else {
            cy.get(
              `[data-qa-dimension-filter="dimension_filters.${index}-value"]`
            )
              .findByPlaceholderText('Enter a Value')
              .should('be.visible')
              .type(valueToSelect as string);
          }
        });
      }
    );

    // Verify Add Filter button is disabled after 5 filters
    ui.button.findByTitle('Add Filter').should('be.visible').and('be.disabled');

    // Verify Apply button is enabled and click it
    ui.button
      .findByAttribute('label', 'Apply')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Verify drawer is closed
    ui.drawer.find().should('not.exist');

    // Verify badge count shows 5
    ui.button
      .findByAttribute(
        'aria-label',
        `Widget Dimension Filter${dashboard.widgets[0].label}`
      )
      .within(() => {
        cy.get('[data-qa-badge="dimension-filter-badge-content"]')
          .should('be.visible')
          .and('contain.text', '5');
      });

    // Validate API response contains all 5 filters
    cy.wait('@getMetrics').then((interception) => {
      expect(interception)
        .to.have.property('response')
        .with.property('statusCode', 200);

      expect(interception.request.body.filters).to.have.length(5);

      filtersWithOperators.forEach(
        ({ dimension, apiOperator, apiValue }, index) => {
          const appliedFilter = interception.request.body.filters[index];
          expect(appliedFilter.dimension_label).to.equal(dimension);
          expect(appliedFilter.operator).to.equal(apiOperator);
          expect(appliedFilter.value).to.equal(apiValue);
        }
      );
    });
  });

  it('should verify edit filter case - add, delete, update filter and validate API response', () => {
    // Open the filter drawer
    ui.button
      .findByAttribute(
        'aria-label',
        `Widget Dimension Filter${dashboard.widgets[0].label}`
      )
      .should('be.visible')
      .click();
    cy.get('[data-testid="drawer"]').should('be.visible');

    // Initial filters to add
    const initialFilters = [
      {
        dimension: 'entity_id',
        operator: 'Equal',
        valueToSelect: '123',
        apiOperator: 'eq',
        apiValue: '123',
      },
      {
        dimension: 'response_type',
        operator: 'Starts with',
        valueToSelect: '2x',
        apiOperator: 'startswith',
        apiValue: '2x',
      },
      {
        dimension: 'Protocol',
        operator: 'In',
        valueToSelect: 'Select All',
        apiOperator: 'in',
        apiValue: 'TCP,UDP',
        verifyAvailableValues: ['TCP', 'UDP'],
      },
    ];

    // Add 3 initial filters
    initialFilters.forEach(({ dimension, operator, valueToSelect }, index) => {
      ui.button.findByTitle('Add Filter').click();

      cy.get(`[data-testid="dimension_filters.${index}-id"]`).within(() => {
        ui.autocomplete
          .findByLabel('Dimension')
          .should('be.visible')
          .click()
          .type(dimension);
        ui.autocompletePopper
          .findByTitle(dimension)
          .should('be.visible')
          .click();

        ui.autocomplete
          .findByLabel('Operator')
          .should('be.visible')
          .type(operator);
        ui.autocompletePopper
          .findByTitle(operator)
          .should('be.visible')
          .click();

        if (valueToSelect === 'Select All') {
          cy.get(
            `[data-qa-dimension-filter="dimension_filters.${index}-value"]`
          )
            .findByPlaceholderText('Select Values')
            .should('be.visible')
            .click();

          ui.autocompletePopper
            .findByTitle('Select All')
            .should('be.visible')
            .click();
          // Close the popper
          ui.autocompletePopper.find().click('topRight');
        } else {
          cy.get(
            `[data-qa-dimension-filter="dimension_filters.${index}-value"]`
          )
            .findByPlaceholderText('Enter a Value')
            .should('be.visible')
            .type(valueToSelect as string);
        }
      });
    });

    // Apply the initial filters
    ui.button.findByAttribute('label', 'Apply').click();
    ui.drawer.find().should('not.exist');

    // Verify badge count shows 3
    ui.button
      .findByAttribute(
        'aria-label',
        `Widget Dimension Filter${dashboard.widgets[0].label}`
      )
      .within(() => {
        cy.get('[data-qa-badge="dimension-filter-badge-content"]')
          .should('be.visible')
          .and('contain.text', '3');
      });

    // Wait for API call with 3 filters
    cy.wait('@getMetrics').then((interception) => {
      expect(interception.request.body.filters).to.have.length(3);
    });

    // Re-open drawer to edit filters
    ui.button
      .findByAttribute(
        'aria-label',
        `Widget Dimension Filter${dashboard.widgets[0].label}`
      )
      .should('be.visible')
      .click();
    cy.get('[data-testid="drawer"]').should('be.visible');

    cy.get('[data-testid="dimension_filters.0-id"]').within(() => {
      cy.get('[data-qa-dimension-filter="dimension_filters.0-value"]')
        .findByPlaceholderText('Enter a Value')
        .should('be.visible')
        .clear();

      cy.get('[data-qa-dimension-filter="dimension_filters.0-value"]')
        .findByPlaceholderText('Enter a Value')
        .type('999');
    });

    // Update second filter operator from 'Starts with' to 'Ends with'
    cy.get('[data-testid="dimension_filters.1-id"]').within(() => {
      ui.autocomplete
        .findByLabel('Operator')
        .should('be.visible')
        .clear()
        .type('Ends with');
      ui.autocompletePopper
        .findByTitle('Ends with')
        .should('be.visible')
        .click();
    });

    // Update second filter value from '2x' to '5x'
    cy.get('[data-testid="dimension_filters.1-id"]').within(() => {
      cy.get('[data-qa-dimension-filter="dimension_filters.1-value"]')
        .findByPlaceholderText('Enter a Value')
        .should('be.visible')
        .clear();

      cy.get('[data-qa-dimension-filter="dimension_filters.1-value"]')
        .findByPlaceholderText('Enter a Value')
        .type('5x');
    });

    // Delete the third filter (Protocol)
    cy.get('[data-testid="dimension_filters.2-id"]').within(() => {
      ui.button
        .findByAttribute('data-testid', 'clear-icon')
        .should('be.visible')
        .click();
    });

    // Add 2 new filters
    const newFilters = [
      {
        dimension: 'entity_id',
        operator: 'Not Equal',
        valueToSelect: '456',
        apiOperator: 'neq',
        apiValue: '456',
      },
      {
        dimension: 'linode_id',
        operator: 'Equal',
        valueToSelect: ['Test-linode-1'],
        apiOperator: 'eq',
        apiValue: '123',
      },
    ];

    newFilters.forEach(({ dimension, operator, valueToSelect }, index) => {
      ui.button.findByTitle('Add Filter').click();

      cy.get(`[data-testid="dimension_filters.${index + 2}-id"]`).within(() => {
        ui.autocomplete
          .findByLabel('Dimension')
          .should('be.visible')
          .click()
          .type(dimension);
        ui.autocompletePopper
          .findByTitle(dimension)
          .should('be.visible')
          .click();

        ui.autocomplete
          .findByLabel('Operator')
          .should('be.visible')
          .type(operator);
        ui.autocompletePopper
          .findByTitle(operator)
          .should('be.visible')
          .click();

        if (Array.isArray(valueToSelect)) {
          cy.get(
            `[data-qa-dimension-filter="dimension_filters.${index + 2}-value"]`
          )
            .findByPlaceholderText('Select a Value')
            .should('be.visible')
            .click();
          ui.autocompletePopper
            .findByTitle(valueToSelect[0])
            .should('be.visible')
            .click();
        } else {
          cy.get(
            `[data-qa-dimension-filter="dimension_filters.${index + 2}-value"]`
          )
            .findByPlaceholderText('Enter a Value')
            .should('be.visible')
            .type(valueToSelect as string);
        }
      });
    });

    // Verify Add Filter button is still enabled (only 4 filters now)
    ui.button.findByTitle('Add Filter').should('be.visible').and('be.enabled');

    // Apply the updated filters
    ui.button.findByAttribute('label', 'Apply').click();
    ui.drawer.find().should('not.exist');

    // Verify badge count shows 4
    ui.button
      .findByAttribute(
        'aria-label',
        `Widget Dimension Filter${dashboard.widgets[0].label}`
      )
      .within(() => {
        cy.get('[data-qa-badge="dimension-filter-badge-content"]')
          .should('be.visible')
          .and('contain.text', '4');
      });

    // Validate API response contains all 4 updated filters
    cy.wait('@getMetrics').then((interception) => {
      expect(interception)
        .to.have.property('response')
        .with.property('statusCode', 200);

      expect(interception.request.body.filters).to.have.length(4);

      const expectedFilters = [
        { dimension: 'entity_id', operator: 'eq', value: '999' },
        { dimension: 'response_type', operator: 'endswith', value: '5x' },
        { dimension: 'entity_id', operator: 'neq', value: '456' },
        { dimension: 'linode_id', operator: 'eq', value: '123' },
      ];

      expectedFilters.forEach(({ dimension, operator, value }, index) => {
        const appliedFilter = interception.request.body.filters[index];
        expect(appliedFilter.dimension_label).to.equal(dimension);
        expect(appliedFilter.operator).to.equal(operator);
        expect(appliedFilter.value).to.equal(value);
      });
    });
  });
});
