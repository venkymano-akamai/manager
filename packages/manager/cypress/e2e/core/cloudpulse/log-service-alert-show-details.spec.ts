/**
 * @file Integration Tests for the Log Service CloudPulse Alerts Show Detail Page.
 *
 * This file contains Cypress tests that validate the display and content of the Alerts Show Detail Page in the CloudPulse application.
 * It ensures that all alert details, criteria, and entity information are displayed correctly.
 */
import { capitalize, profileFactory } from '@linode/utilities';
import {
  aggregationTypeMap,
  dimensionOperatorTypeMap,
  metricOperatorTypeMap,
  severityMap,
} from 'support/constants/alert';
import { mockGetAccount } from 'support/intercepts/account';
import {
  mockGetAlertChannels,
  mockGetAlertDefinitions,
  mockGetAllAlertDefinitions,
  mockGetCloudPulseServices,
  mockGetStreams,
} from 'support/intercepts/cloudpulse';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetProfile } from 'support/intercepts/profile';
import { ui } from 'support/ui';

import {
  accountFactory,
  alertFactory,
  flagsFactory,
  logAlertRulesFactory,
  notificationChannelFactory,
  streamFactory,
} from 'src/factories';
import {
  ACCOUNT_GROUP_INFO_MESSAGE,
  entityGroupingOptions,
} from 'src/features/CloudPulse/Alerts/constants';
import { formatDate } from 'src/utilities/formatDate';

import type {
  AlertDefinitionDimensionFilter,
  AlertDefinitionMetricCriteria,
} from '@linode/api-v4';

const mockAccount = accountFactory.build();

const alertDetails = alertFactory.build({
  entity_ids: ['1', '2', '3', '4'],
  rule_criteria: { rules: logAlertRulesFactory.buildList(2) },
  service_type: 'logs',
  severity: 1,
  status: 'enabled',
  type: 'user',
  created_by: 'user1',
  updated_by: 'user2',
  created: '2023-10-01T12:00:00Z',
  updated: new Date().toISOString(),
});

const { id, label, service_type } = alertDetails;
const notificationChannels = notificationChannelFactory.build();
const streams = streamFactory.buildList(3);

const mockProfile = profileFactory.build({
  timezone: 'gmt',
});

const verifyRowOrder = (expectedIds: string[]) => {
  cy.get('[data-qa-alert-row]').then(($rows) => {
    const alertRowIds = $rows
      .map((index, row) => row.getAttribute('data-qa-alert-row'))
      .get();
    expectedIds.forEach((expectedId, index) => {
      expect(alertRowIds[index]).to.equal(expectedId);
    });
  });
};

/**
 * Asserts that the given dimension filter's label, operator, and value
 * are correctly displayed in the UI as visible chips.
 */
const assertDimensionFilter = (filter: AlertDefinitionDimensionFilter) => {
  cy.get(`[data-qa-chip="${filter.label}"]`)
    .should('be.visible')
    .should('have.text', filter.label);

  cy.get(`[data-qa-chip="${dimensionOperatorTypeMap[filter.operator]}"]`)
    .should('be.visible')
    .should('have.text', dimensionOperatorTypeMap[filter.operator]);

  cy.get(`[data-qa-chip="${capitalize(filter.value)}"]`)
    .should('be.visible')
    .should('have.text', capitalize(filter.value));
};

/**
 * Asserts metric threshold chips for a single rule at a given index.
 */
const assertMetricThreshold = (
  rule: AlertDefinitionMetricCriteria,
  index: number
) => {
  cy.get('[data-qa-item="Metric Threshold"]')
    .eq(index)
    .within(() => {
      cy.get(`[data-qa-chip="${aggregationTypeMap[rule.aggregate_function]}"]`)
        .should('be.visible')
        .should('have.text', aggregationTypeMap[rule.aggregate_function]);

      cy.get(`[data-qa-chip="${rule.label}"]`)
        .should('be.visible')
        .should('have.text', rule.label);

      cy.get(`[data-qa-chip="${metricOperatorTypeMap[rule.operator]}"]`)
        .should('be.visible')
        .should('have.text', metricOperatorTypeMap[rule.operator]);

      cy.get(`[data-qa-chip="${rule.threshold}"]`)
        .should('be.visible')
        .should('have.text', rule.threshold);

      cy.get(`[data-qa-chip="${rule.unit}"]`)
        .should('be.visible')
        .should('have.text', rule.unit);
    });
};

/**
 * Asserts dimension filters for a single rule at a given index.
 */
const assertDimensionFilters = (
  rule: AlertDefinitionMetricCriteria,
  index: number
) => {
  cy.get('[data-qa-item="Dimension Filter"]')
    .eq(index)
    .within(() => {
      (rule.dimension_filters ?? []).forEach(assertDimensionFilter);
    });
};

/**
 * Validates the UI display of an array of metric criteria rules.
 *
 * @param {AlertDefinitionMetricCriteria[]} rules - Array of metric criteria objects.
 */
const assertRuleBlock = (rules: AlertDefinitionMetricCriteria[]) => {
  cy.get('[data-qa-section="Criteria"]').within(() => {
    rules.forEach((rule, index) => {
      assertMetricThreshold(rule, index);
      assertDimensionFilters(rule, index);
    });
  });
};

/**
 * Validates the Account scope notice message.
 */
const assertAccountScopeResources = () => {
  cy.get('[data-qa-notice="true"]')
    .find('[data-testid="alert_message_notice"]')
    .should('have.text', ACCOUNT_GROUP_INFO_MESSAGE);
};

/**
 * Validates stream rows within the Resources section for Entity scope.
 */
const assertStreamRows = (
  streams: ReturnType<typeof streamFactory.buildList>
) => {
  cy.get('[data-qa-alert-table="true"]')
    .find('[data-qa-alert-row]')
    .should('have.length', streams.length);

  streams.forEach((stream) => {
    cy.get(`[data-qa-alert-row="${stream.id}"]`).should('be.visible');
    cy.get(`[data-qa-alert-cell="${stream.id}_entity"]`)
      .should('be.visible')
      .should('have.text', stream.label);
  });
};

/**
 * Validates the Entity scope Resources section including heading, search, rows, and sorting.
 */
const assertEntityScopeResources = (
  streams: ReturnType<typeof streamFactory.buildList>
) => {
  const searchPlaceholder = 'Search for an Entity';

  cy.get('[data-qa-section="Resources"]').within(() => {
    ui.heading
      .findByText('entity')
      .scrollIntoView()
      .should('be.visible')
      .should('have.text', 'Entity');

    cy.findByPlaceholderText(searchPlaceholder).should('be.visible');

    assertStreamRows(streams);

    ui.heading.findByText('entity').click();
    verifyRowOrder([...streams].map((s) => String(s.id)).reverse());

    ui.heading.findByText('entity').click();
    verifyRowOrder([...streams].map((s) => String(s.id)));
  });
};

/**
 * Validates the Notification Channels section.
 */
const assertNotificationChannels = () => {
  cy.get('[data-qa-section="Notification Channels"]').within(() => {
    cy.findByText('Type:').should('be.visible');
    cy.findByText('Email').should('be.visible');
    cy.findByText('Channel:').should('be.visible');
    cy.findByText('Channel-1').should('be.visible');
    cy.findByText('To:').should('be.visible');
    cy.findByText('test@test.com').should('be.visible');
    cy.findByText('test2@test.com').should('be.visible');
  });
};

/**
 * Validates the Overview section fields.
 */
const assertOverviewSection = (params: {
  created: string;
  created_by: string;
  description: string;
  groupLabel: string;
  label: string;
  severity: number;
  updated: string;
}) => {
  const {
    created,
    created_by,
    description,
    groupLabel,
    label,
    severity,
    updated,
  } = params;

  cy.get('[data-qa-section="Overview"]').within(() => {
    cy.findByText('Name:').should('be.visible');
    cy.findByText(label).should('be.visible');

    cy.findByText('Description:').should('be.visible');
    cy.findByText(description).should('be.visible');

    cy.findByText('Status:').should('be.visible');
    cy.findByText('Enabled').should('be.visible');

    cy.findByText('Severity:').should('be.visible');
    cy.findByText(severityMap[severity as keyof typeof severityMap]).should(
      'be.visible'
    );
    cy.findByText('Service:').should('be.visible');
    cy.findByText('Logs').should('be.visible');

    cy.findByText('Type:').should('be.visible');
    cy.findByText('User').should('be.visible');

    cy.findByText('Created By:').should('be.visible');
    cy.findByText(created_by).should('be.visible');

    cy.findByText('Last Modified:').should('be.visible');
    cy.findByText(
      formatDate(updated, { format: 'MMM dd, yyyy, h:mm a', timezone: 'GMT' })
    ).should('be.visible');
    cy.findByText(
      formatDate(created, { format: 'MMM dd, yyyy, h:mm a', timezone: 'GMT' })
    ).should('be.visible');

    cy.findByText('Scope:').should('be.visible');
    cy.findByText(groupLabel).should('be.visible');
  });
};

/**
 * Validates the Trigger conditions section.
 */
const assertTriggerConditions = () => {
  cy.get('[data-qa-item="Polling Interval"]')
    .find('[data-qa-chip]')
    .should('be.visible')
    .should('have.text', '10 min');

  cy.get('[data-qa-item="Evaluation Period"]')
    .find('[data-qa-chip]')
    .should('be.visible')
    .should('have.text', '5 min');

  cy.get('[data-qa-chip="All"]')
    .should('be.visible')
    .should('have.text', 'All');
  cy.get('[data-qa-chip="5 min"]')
    .should('be.visible')
    .should('have.text', '5 min');

  cy.get('[data-qa-item="criteria are met for"]')
    .should('be.visible')
    .should('have.text', 'criteria are met for');

  cy.get('[data-qa-item="consecutive occurrences"]')
    .should('be.visible')
    .should('have.text', 'consecutive occurrences.');
};

/** Map of scope label to its resource section validation function. */
const scopeActions: Record<string, () => void> = {
  Account: assertAccountScopeResources,
  Entity: () => assertEntityScopeResources(streams),
};

/**
 * Integration tests for the CloudPulse Alerts Detail Page, ensuring that the alert details,
 * criteria, and entity information are correctly displayed and validated, including various
 * fields like name, description, status, severity, and trigger conditions.
 */
describe('Log Service Integration Tests for Alert Show Detail Page', () => {
  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount);
    mockGetProfile(mockProfile);
    mockGetAllAlertDefinitions([alertDetails]).as('getAlertDefinitionsList');
    mockGetAlertDefinitions(service_type, id, alertDetails);
    mockGetAlertChannels([notificationChannels]);
    mockGetCloudPulseServices([service_type]);
    mockGetStreams(streams);
  });

  it('navigates to the Show Details page from the list page', () => {
    cy.visitWithLogin('/alerts/definitions');
    cy.wait('@getAlertDefinitionsList');

    cy.findByText(label)
      .should('be.visible')
      .closest('tr')
      .within(() => {
        ui.actionMenu
          .findByTitle(`Action menu for Alert ${label}`)
          .should('be.visible')
          .click();
        ui.actionMenuItem
          .findByTitle('Show Details')
          .should('be.visible')
          .click();
      });

    cy.url().should('endWith', `/detail/${service_type}/${id}`);
  });

  entityGroupingOptions
    .filter(({ label: groupLabel }) => groupLabel.toLowerCase() !== 'region')
    .forEach(({ label: groupLabel, value }) => {
      it(`should correctly display the details of the Logs Service alert in the alert details view for ${groupLabel} level`, () => {
        const builtAlert = alertFactory.build({
          id: 2,
          label: 'Alert-1',
          entity_ids: ['1', '2', '3', '4'],
          rule_criteria: { rules: logAlertRulesFactory.buildList(2) },
          service_type: 'logs',
          severity: 1,
          status: 'enabled',
          type: 'user',
          created_by: 'user1',
          updated_by: 'user2',
          created: '2023-10-01T12:00:00Z',
          updated: new Date().toISOString(),
          scope: value,
        });

        const {
          created,
          created_by,
          description,
          id,
          label,
          rule_criteria,
          service_type,
          severity,
          updated,
        } = builtAlert;

        const { rules } = rule_criteria;

        mockGetAllAlertDefinitions([builtAlert]).as('getAlertDefinitionsList');
        mockGetAlertDefinitions(service_type, id, builtAlert).as(
          'getLogAlertDefinitions'
        );

        cy.visitWithLogin(`/alerts/definitions/detail/${service_type}/${id}`);
        cy.wait(['@getLogAlertDefinitions']);

        assertOverviewSection({
          created,
          created_by,
          description,
          groupLabel,
          label,
          severity,
          updated,
        });

        assertRuleBlock(rules);
        assertTriggerConditions();
        scopeActions[groupLabel]?.();

        assertNotificationChannels();
      });
    });
});
