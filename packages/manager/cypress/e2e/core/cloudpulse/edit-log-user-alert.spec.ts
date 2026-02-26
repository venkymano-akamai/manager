/**
 * @file Integration Tests for the CloudPulse Edit Alert Page.
 *
 * This file contains Cypress tests for the Edit Alert page of the CloudPulse application.
 * It verifies that alert details are correctly displayed, interactive, and editable.
 */

import { profileFactory } from '@linode/utilities';
import {
  EVALUATION_PERIOD_DESCRIPTION,
  METRIC_DESCRIPTION_DATA_FIELD,
  POLLING_INTERVAL_DESCRIPTION,
  SEVERITY_LEVEL_DESCRIPTION,
} from 'support/constants/cloudpulse';
import { widgetDetails } from 'support/constants/widgets';
import { mockGetAccount } from 'support/intercepts/account';
import {
  mockCreateAlertDefinition,
  mockGetAlertChannels,
  mockGetAlertDefinitions,
  mockGetAllAlertDefinitions,
  mockGetCloudPulseMetricDefinitions,
  mockGetCloudPulseServiceByType,
  mockGetCloudPulseServices,
  mockGetStreams,
  mockUpdateAlertDefinitions,
} from 'support/intercepts/cloudpulse';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetProfile } from 'support/intercepts/profile';
import { ui } from 'support/ui';

import {
  accountFactory,
  alertFactory,
  dashboardMetricFactory,
  flagsFactory,
  logAlertRulesFactory,
  notificationChannelFactory,
  serviceAlertFactory,
  serviceTypesFactory,
  streamFactory,
  triggerConditionFactory,
} from 'src/factories';
import { UPDATE_ALERT_SUCCESS_MESSAGE } from 'src/features/CloudPulse/Alerts/constants';
import { formatDate } from 'src/utilities/formatDate';

import type {
  AlertDefinitionDimensionFilter,
  DimensionFilterOperatorType,
} from '@linode/api-v4';

const mockAccount = accountFactory.build();

const serviceType = 'logs';
const now = new Date();

const updated = `${now.toISOString().substring(0, 11)}10:41:00.000Z`;

const statusCodeFilter = (
  operator: DimensionFilterOperatorType,
  value: string
) => ({
  dimension_label: 'status_code',
  label: 'Status Code',
  operator,
  value,
});

const alertDetails = alertFactory.build({
  alert_channels: [{ id: 1 }],
  created_by: 'user1',
  description: 'My Custom Description',
  entity_ids: ['2'],
  label: 'Alert-2',
  rule_criteria: {
    rules: [
      logAlertRulesFactory.build(),
      logAlertRulesFactory.build({
        dimension_filters: [
          statusCodeFilter('in', '200,500'),
          statusCodeFilter('eq', '200'),
          statusCodeFilter('neq', '20'),
          statusCodeFilter('endswith', '200'),
          statusCodeFilter('startswith', '179'),
        ],
      }),
    ],
  },
  service_type: 'logs',
  severity: 0,
  tags: [],
  trigger_conditions: triggerConditionFactory.build(),
  type: 'user',
  updated,
  scope: 'entity',
});
const { description, id, label, service_type } = alertDetails;

// Mock metric definitions
const { metrics } = widgetDetails.logs;
const metricDefinitions = metrics.map(({ name, title, unit }) =>
  dashboardMetricFactory.build({
    label: title,
    metric: name,
    unit,
    dimensions: [
      {
        dimension_label: 'status_code',
        label: 'StatusCode',
        values: ['200', '500'],
      },
    ],
  })
);

// Mock notification channels
const notificationChannels = notificationChannelFactory.build({
  channel_type: 'email',
  id: 1,
  label: 'Channel-1',
  type: 'user',
});
const mockProfile = profileFactory.build({
  timezone: 'gmt',
});
const services = serviceTypesFactory.build({
  service_type: serviceType,
  label: serviceType,
  alert: serviceAlertFactory.build(),
});
const streams = streamFactory.buildList(5);

describe('Integration Tests for Edit Alert', () => {
  /*
   * - Confirms that the Edit Alert page loads with the correct alert details.
   * - Verifies that the alert form contains the appropriate pre-filled data from the mock alert.
   * - Confirms that rule criteria values are correctly displayed.
   * - Verifies that the correct notification channel details are displayed.
   * - Ensures the tooltip descriptions for the alert configuration are visible and contain the correct content.
   * - Confirms that the correct regions, Logs, and metrics are available for selection in the form.
   * - Verifies that the user can successfully edit and submit changes to the alert.
   * - Confirms that the UI handles updates to alert data correctly and submits them via the API.
   * - Confirms that the API request matches the expected data structure and values upon saving the updated alert.
   * - Verifies that the user is redirected back to the Alert Definitions List page after saving changes.
   * - Ensures a success toast notification appears after the alert is updated.
   * - Confirms that the alert is listed correctly with the updated configuration on the Alert Definitions List page.
   */
  beforeEach(() => {
    // Mocking various API responses
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount);
    mockGetProfile(mockProfile);
    mockGetCloudPulseServiceByType(serviceType, services);
    mockGetCloudPulseMetricDefinitions(service_type, metricDefinitions);
    mockGetAlertChannels([notificationChannels]);
    mockGetStreams(streams);
  });

  // Define an interface for rule values
  interface RuleCriteria {
    aggregationType: string;
    dataField: string;
    operator: string;
    threshold: string;
  }

  // Mapping of interface keys to data attributes
  const fieldSelectors: Record<keyof RuleCriteria, string> = {
    aggregationType: 'aggregation-type',
    dataField: 'data-field',
    operator: 'operator',
    threshold: 'threshold',
  };
  /**
   * Assert that a table row corresponding to a specific alert label
   * contains all expected values including status, service type, user, and timestamp.
   *
   * @param {string} label - The alert label to find in the table row.
   * @param {string | Date} updated - The last updated timestamp (ISO string or Date object).
   */
  const assertAlertRow = (label: string, updated: string): void => {
    const formattedDate = formatDate(updated, {
      format: 'MMM dd, yyyy, h:mm a',
      timezone: 'GMT',
    });
    cy.findByText(label)
      .closest('tr')
      .within(() => {
        cy.findByText(label).should('be.visible');
        cy.findByText('Provisioning').should('be.visible');
        cy.findByText('Logs').should('be.visible');
        cy.findByText('user1').should('be.visible');
        cy.findByText(formattedDate).should('be.visible');
      });
  };

  // Function to assert rule values
  const assertRuleValues = (ruleIndex: number, rule: RuleCriteria) => {
    cy.get(`[data-testid="rule_criteria.rules.${ruleIndex}-id"]`).within(() => {
      (Object.keys(rule) as (keyof RuleCriteria)[]).forEach((key) => {
        cy.get(
          `[data-qa-metric-threshold="rule_criteria.rules.${ruleIndex}-${fieldSelectors[key]}"]`
        )
          .should('be.visible')
          .find('input')
          .should('have.value', rule[key]);
      });
    });
  };

  it.only('should correctly display the details of the alert in the Edit Alert page', () => {
    mockGetCloudPulseServices([alertDetails.service_type]);
    mockGetAllAlertDefinitions([alertDetails]).as('getAlertDefinitionsList');
    mockGetAlertDefinitions(service_type, id, alertDetails).as(
      'getAlertDefinitions'
    );
    mockUpdateAlertDefinitions(service_type, id, alertDetails).as(
      'updateDefinitions'
    );
    mockCreateAlertDefinition(service_type, alertDetails).as(
      'createAlertDefinition'
    );
    cy.visitWithLogin(`/alerts/definitions/edit/${service_type}/${id}`);
    cy.wait('@getAlertDefinitions');

    // Verify form fields
    cy.findByLabelText('Name').should('have.value', label);
    cy.findByLabelText('Description (optional)').should(
      'have.value',
      description
    );
    cy.findByLabelText('Service')
      .should('be.disabled')
      .should('have.value', 'Logs');

    cy.findByLabelText('Severity').should('have.value', 'Severe');
    cy.findByLabelText('Scope').should('have.value', 'Entity');

    // Verify alert entity selection
    cy.contains('[data-qa-alert-cell$="_entity"]', 'Stream 2')
      .should('be.visible')
      .closest('tr')
      .find('input[type="checkbox"]')
      .should('be.checked');
    // Verify alert entity selection count message
    cy.get('[data-testid="selection_notice"]').should(
      'contain',
      '1 of 5 entities are selected.'
    );

    // Assert rule values 1
    assertRuleValues(0, {
      aggregationType: 'Avg',
      dataField: 'Success Upload Count',
      operator: '=',
      threshold: '60',
    });

    // Verify that tooltip messages are displayed correctly with accurate content.
    ui.tooltip.findByText(METRIC_DESCRIPTION_DATA_FIELD).should('be.visible');
    ui.tooltip.findByText(SEVERITY_LEVEL_DESCRIPTION).should('be.visible');
    ui.tooltip.findByText(EVALUATION_PERIOD_DESCRIPTION).should('be.visible');
    ui.tooltip.findByText(POLLING_INTERVAL_DESCRIPTION).should('be.visible');

    const dimensionFilters = [
      { field: 'StatusCode', operator: 'Equal', value: '200' },
    ];

    const dimensionFiltersForRule1 = [
      { field: 'StatusCode', operator: 'In', value: '200,500' },
      { field: 'StatusCode', operator: 'Equal', value: '200' },
      { field: 'StatusCode', operator: 'Not Equal', value: '20' },
      { field: 'StatusCode', operator: 'Ends with', value: '200' },
      { field: 'StatusCode', operator: 'Starts with', value: '179' },
    ];

    dimensionFilters.forEach((filter, index) => {
      cy.get(
        `[data-qa-dimension-filter="rule_criteria.rules.0.dimension_filters.${index}-data-field"]`
      )
        .should('be.visible')
        .find('input')
        .should('have.value', filter.field);

      cy.get(
        `[data-qa-dimension-filter="rule_criteria.rules.0.dimension_filters.${index}-operator"]`
      )
        .should('be.visible')
        .find('input')
        .should('have.value', filter.operator);

      cy.get(
        `[data-qa-dimension-filter="rule_criteria.rules.0.dimension_filters.${index}-value"]`
      )
        .should('be.visible')
        .find('input')
        .should('have.value', filter.value);
    });

    dimensionFiltersForRule1.forEach((filter, index) => {
      cy.get(
        `[data-qa-dimension-filter="rule_criteria.rules.1.dimension_filters.${index}-data-field"]`
      )
        .should('be.visible')
        .find('input')
        .should('have.value', filter.field);

      cy.get(
        `[data-qa-dimension-filter="rule_criteria.rules.1.dimension_filters.${index}-operator"]`
      )
        .should('be.visible')
        .find('input')
        .should('have.value', filter.operator);

      cy.get(
        `[data-qa-dimension-filter="rule_criteria.rules.1.dimension_filters.${index}-value"]`
      )
        .should('be.visible')
        .find('input')
        .should('have.value', filter.value);
    });
    // Verify notification details
    cy.get('[data-qa-notification="notification-channel-0"]').within(() => {
      cy.get('[data-qa-channel]').should('have.text', 'Channel-1');
      cy.get('[data-qa-type]').next().should('have.text', 'Email');
      cy.get('[data-qa-channel-details]').should(
        'have.text',
        'test@test.comtest2@test.com'
      );
    });
  });

  it('successfully updates alert details and verifies the API request matches the expected data for the Enity group', () => {
    const alertDetails = alertFactory.build({
      alert_channels: [{ id: 1 }],
      created_by: 'user1',
      description: 'My Custom Description',
      entity_ids: ['2'],
      label: 'Alert-2',
      rule_criteria: {
        rules: [
          logAlertRulesFactory.build({
            dimension_filters: [
              {
                label: 'Status Code',
                dimension_label: 'status_code',
                operator: 'eq',
                value: '500',
              },
            ],
          }),
        ],
      },
      service_type: serviceType,
      severity: 0,
      tags: [''],
      trigger_conditions: triggerConditionFactory.build(),
      type: 'user',
      updated,
      scope: 'entity',
      id: 1,
      status: 'provisioning',
    });
    mockGetCloudPulseServiceByType(serviceType, services);
    mockGetCloudPulseServices([alertDetails.service_type]);
    mockGetAllAlertDefinitions([alertDetails]).as('getAlertDefinitionsList');
    mockGetAlertDefinitions(service_type, id, alertDetails).as(
      'getAlertDefinitions'
    );
    mockUpdateAlertDefinitions(service_type, id, alertDetails).as(
      'updateDefinitions'
    );
    mockCreateAlertDefinition(service_type, alertDetails).as(
      'createAlertDefinition'
    );
    cy.visitWithLogin(`/alerts/definitions/edit/${service_type}/${id}`);
    cy.wait('@getAlertDefinitions');
    cy.findByLabelText('Name').clear();
    cy.findByLabelText('Name').type('Alert-2');
    cy.findByLabelText('Description (optional)').clear();
    cy.findByLabelText('Description (optional)').type('update-description');
    cy.findByLabelText('Service').should('be.disabled');
    ui.autocomplete.findByLabel('Severity').clear();
    ui.autocomplete.findByLabel('Severity').type('Info');
    ui.autocompletePopper.findByTitle('Info').should('be.visible').click();
    // Execute the appropriate validation logic based on the alert's grouping label (e.g., 'Region' or 'Account' or 'Entity')
    // Validate headings
    ui.heading
      .findByText('entity')
      .scrollIntoView()
      .should('be.visible')
      .should('have.text', 'Entity');

    // Validate search inputs
    const searchPlaceholder = 'Search for an Entity';

    cy.findByPlaceholderText(searchPlaceholder).should('be.visible');

    // Assert row count
    cy.get('[data-qa-alert-row]').should('have.length', 5);

    // Entity search
    cy.findByPlaceholderText(searchPlaceholder).type('Stream 1');

    cy.get('[data-qa-alert-table="true"]')
      .find('[data-qa-alert-row]')
      .should('have.length', 1);

    // Region filter
    cy.get('[data-qa-debounced-search="true"]').within(() => {
      cy.get('[aria-label="Clear"]').click();
    });
    cy.get(
      '[data-qa-metric-threshold="rule_criteria.rules.0-data-field"]'
    ).within(() => {
      ui.button.findByAttribute('aria-label', 'Clear').click();
    });
    cy.get('[data-testid="rule_criteria.rules.0-id"]').within(() => {
      ui.autocomplete.findByLabel('Data Field').type('Success Upload Count');
      ui.autocompletePopper.findByTitle('Success Upload Count').click();
      ui.autocomplete.findByLabel('Aggregation Type').type('Min');
      ui.autocompletePopper.findByTitle('Min').click();
      ui.autocomplete.findByLabel('Operator').type('>');
      ui.autocompletePopper.findByTitle('>').click();
      cy.get('[data-qa-threshold]').should('be.visible').clear();
      cy.get('[data-qa-threshold]').should('be.visible').type('2000');
    });

    // click on the submit button
    ui.buttonGroup
      .find()
      .find('button')
      .filter('[type="submit"]')
      .should('be.visible')
      .should('be.enabled')
      .click();

    cy.wait('@updateDefinitions').then(({ request }) => {
      // Assert the API request data
      expect(request.body.label).to.equal('Alert-2');
      expect(request.body.description).to.equal('update-description');
      expect(request.body.severity).to.equal(3);
      expect(request.body.channel_ids[0]).to.equal(1);
      expect(request.body).to.have.property('trigger_conditions');
      expect(request.body.trigger_conditions.criteria_condition).to.equal(
        'ALL'
      );
      expect(
        request.body.trigger_conditions.evaluation_period_seconds
      ).to.equal(300);
      expect(request.body.trigger_conditions.polling_interval_seconds).to.equal(
        300
      );
      expect(request.body.trigger_conditions.trigger_occurrences).to.equal(5);
      expect(request.body.rule_criteria.rules[0].threshold).to.equal(2000);
      expect(request.body.rule_criteria.rules[0].operator).to.equal('gt');
      expect(request.body.rule_criteria.rules[0].aggregate_function).to.equal(
        'min'
      );
      expect(request.body.rule_criteria.rules[0].metric).to.equal(
        'success_upload_count'
      );
      // Verify URL redirection and toast notification
      cy.url().should('endWith', 'alerts/definitions');
      ui.toast.assertMessage(UPDATE_ALERT_SUCCESS_MESSAGE);

      // Confirm that Alert is listed on landing page with expected configuration.
      assertAlertRow('Alert-2', updated);
    });
  });
});
