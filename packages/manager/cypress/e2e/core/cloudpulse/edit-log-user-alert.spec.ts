/**
 * @file Integration Tests for the CloudPulse Edit Alert Page.
 *
 * This file contains Cypress tests for the Edit Alert page of the CloudPulse application.
 * It verifies the following:
 * - Alert details are correctly pre-filled and displayed on the Edit Alert page.
 * - Rule criteria (data field, aggregation type, operator, threshold) are correctly rendered.
 * - Dimension filters for multiple rules are correctly displayed with accurate field, operator, and value.
 * - Tooltip descriptions for severity, evaluation period, polling interval, and metric data field are visible.
 * - Notification channel details (label, type, recipients) are correctly shown.
 * - Alert entity selection and selection count message are accurate.
 * - The user can successfully edit alert fields (name, description, severity, rule criteria).
 * - The API request payload matches the expected structure and values upon saving.
 * - The user is redirected to the Alert Definitions List page after a successful update.
 * - A success toast notification is displayed after the alert is updated.
 * - The updated alert is correctly listed on the Alert Definitions List page.
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

import type { DimensionFilterOperatorType } from '@linode/api-v4';

// Constants
const OPERATOR_LABELS: Record<DimensionFilterOperatorType, string> = {
  eq: 'Equal',
  neq: 'Not Equal',
  in: 'In',
  endswith: 'Ends with',
  startswith: 'Starts with',
};

const mockAccount = accountFactory.build();
const serviceType = 'logs';
const now = new Date();
const updated = `${now.toISOString().substring(0, 11)}10:41:00.000Z`;

// Helper to build a status code dimension filter
const statusCodeFilter = (
  operator: DimensionFilterOperatorType,
  value: string
) => ({
  dimension_label: 'status_code',
  label: 'Status Code',
  operator,
  value,
});

// Static dimension filter data for assertions
const dimensionFilters = [
  { field: 'StatusCode', operator: OPERATOR_LABELS.eq, value: '200' },
];

const dimensionFiltersForRule1 = [
  { field: 'StatusCode', operator: OPERATOR_LABELS.in, value: '200,500' },
  { field: 'StatusCode', operator: OPERATOR_LABELS.eq, value: '200' },
  { field: 'StatusCode', operator: OPERATOR_LABELS.neq, value: '20' },
  { field: 'StatusCode', operator: OPERATOR_LABELS.endswith, value: '200' },
  { field: 'StatusCode', operator: OPERATOR_LABELS.startswith, value: '179' },
];

const alertDetails = alertFactory.build({
  alert_channels: [{ id: 1 }],
  created_by: 'user1',
  description: 'My Custom Description',
  entity_ids: ['2'],
  label: 'Alert-2',
  rule_criteria: {
    rules: [
      logAlertRulesFactory.build({
        dimension_filters: [statusCodeFilter('eq', '200')],
      }),
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

const { description, id: alertId = 1, label, service_type } = alertDetails;

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

const mockProfile = profileFactory.build({ timezone: 'gmt' });

const services = serviceTypesFactory.build({
  service_type: serviceType,
  label: serviceType,
  alert: serviceAlertFactory.build(),
});

const streams = streamFactory.buildList(5);

// Interface for rule criteria assertions
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

// Assert rule criteria values
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

// Assert dimension filter values for a given rule index
const assertDimensionFilters = (
  ruleIndex: number,
  filters: { field: string; operator: string; value: string }[]
) => {
  filters.forEach((filter, index) => {
    cy.get(
      `[data-qa-dimension-filter="rule_criteria.rules.${ruleIndex}.dimension_filters.${index}-data-field"]`
    )
      .should('be.visible')
      .find('input')
      .should('have.value', filter.field);

    cy.get(
      `[data-qa-dimension-filter="rule_criteria.rules.${ruleIndex}.dimension_filters.${index}-operator"]`
    )
      .should('be.visible')
      .find('input')
      .should('have.value', filter.operator);

    cy.get(
      `[data-qa-dimension-filter="rule_criteria.rules.${ruleIndex}.dimension_filters.${index}-value"]`
    )
      .should('be.visible')
      .find('input')
      .should('have.value', filter.value);
  });
};

describe('Integration Tests for Edit Alert', () => {
  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount);
    mockGetProfile(mockProfile);
    mockGetCloudPulseServiceByType(serviceType, services);
    mockGetCloudPulseMetricDefinitions(service_type, metricDefinitions);
    mockGetAlertChannels([notificationChannels]);
    mockGetStreams(streams);
  });

  it('should correctly display the details of the alert in the Edit Alert page', () => {
    mockGetCloudPulseServices([alertDetails.service_type]);
    mockGetAllAlertDefinitions([alertDetails]).as('getAlertDefinitionsList');
    mockGetAlertDefinitions(service_type, alertId, alertDetails).as(
      'getAlertDefinitions'
    );
    mockUpdateAlertDefinitions(service_type, alertId, alertDetails).as(
      'updateDefinitions'
    );
    mockCreateAlertDefinition(service_type, alertDetails).as(
      'createAlertDefinition'
    );

    cy.visitWithLogin(`/alerts/definitions/edit/${service_type}/${alertId}`);
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

    cy.get('[data-testid="selection_notice"]').should(
      'contain',
      '1 of 5 entities are selected.'
    );

    // Assert rule 0 values
    assertRuleValues(0, {
      aggregationType: 'Avg',
      dataField: 'Success Upload Count',
      operator: '=',
      threshold: '60',
    });

    // Verify tooltips
    ui.tooltip.findByText(METRIC_DESCRIPTION_DATA_FIELD).should('be.visible');
    ui.tooltip.findByText(SEVERITY_LEVEL_DESCRIPTION).should('be.visible');
    ui.tooltip.findByText(EVALUATION_PERIOD_DESCRIPTION).should('be.visible');
    ui.tooltip.findByText(POLLING_INTERVAL_DESCRIPTION).should('be.visible');

    // Assert dimension filters
    assertDimensionFilters(0, dimensionFilters);
    assertDimensionFilters(1, dimensionFiltersForRule1);

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

  it('successfully updates alert details and verifies the API request matches the expected data for the Entity group', () => {
    const updatedAlertDetails = alertFactory.build({
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
    mockGetCloudPulseServices([updatedAlertDetails.service_type]);
    mockGetAllAlertDefinitions([updatedAlertDetails]).as(
      'getAlertDefinitionsList'
    );
    mockGetAlertDefinitions(service_type, alertId, updatedAlertDetails).as(
      'getAlertDefinitions'
    );
    mockUpdateAlertDefinitions(service_type, alertId, updatedAlertDetails).as(
      'updateDefinitions'
    );
    mockCreateAlertDefinition(service_type, updatedAlertDetails).as(
      'createAlertDefinition'
    );

    cy.visitWithLogin(`/alerts/definitions/edit/${service_type}/${alertId}`);
    cy.wait('@getAlertDefinitions');

    cy.findByLabelText('Name').clear();
    cy.findByLabelText('Name').type('Alert-2');
    cy.findByLabelText('Description (optional)').clear();
    cy.findByLabelText('Description (optional)').type('update-description');
    cy.findByLabelText('Service').should('be.disabled');

    ui.autocomplete.findByLabel('Severity').clear();
    ui.autocomplete.findByLabel('Severity').type('Info');
    ui.autocompletePopper.findByTitle('Info').should('be.visible').click();

    ui.heading
      .findByText('entity')
      .scrollIntoView()
      .should('be.visible')
      .should('have.text', 'Entity');

    const searchPlaceholder = 'Search for an Entity';
    cy.findByPlaceholderText(searchPlaceholder).should('be.visible');
    cy.get('[data-qa-alert-row]').should('have.length', 5);

    cy.findByPlaceholderText(searchPlaceholder).type('Stream 1');
    cy.get('[data-qa-alert-table="true"]')
      .find('[data-qa-alert-row]')
      .should('have.length', 1);

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

    ui.buttonGroup
      .find()
      .find('button')
      .filter('[type="submit"]')
      .should('be.visible')
      .should('be.enabled')
      .click();

    cy.wait('@updateDefinitions').then(({ request }) => {
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

      cy.url().should('endWith', 'alerts/definitions');
      ui.toast.assertMessage(UPDATE_ALERT_SUCCESS_MESSAGE);
      assertAlertRow('Alert-2', updated);
    });
  });
});
