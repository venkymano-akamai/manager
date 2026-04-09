/**
 * @file Integration Tests for the CloudPulse Alerts Listing Page.
 * This file verifies the UI, functionality, and sorting/filtering of the CloudPulse Alerts Listing Page.
 */
import { profileFactory } from '@linode/utilities';
import { cloudPulseServiceMap } from 'support/constants/cloudpulse';
import { mockGetAccount } from 'support/intercepts/account';
import {
  mockDeleteAlert,
  mockGetAllAlertDefinitions,
  mockGetCloudPulseServices,
  mockUpdateAlertDefinitions,
} from 'support/intercepts/cloudpulse';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetProfile } from 'support/intercepts/profile';
import { ui } from 'support/ui';

import {
  accountFactory,
  alertFactory,
  alertRulesFactory,
  flagsFactory,
} from 'src/factories';
import {
  alertLimitMessage,
  alertToolTipText,
  metricLimitMessage,
} from 'src/features/CloudPulse/Alerts/AlertsListing/constants';
import {
  alertStatuses,
  DELETE_ALERT_SUCCESS_MESSAGE,
  DISABLE_ALERT_SUCCESS_MESSAGE,
  ENABLE_ALERT_SUCCESS_MESSAGE,
} from 'src/features/CloudPulse/Alerts/constants';
import { formatDate } from 'src/utilities/formatDate';

import type {
  Alert,
  AlertStatusType,
  CloudPulseServiceType,
} from '@linode/api-v4';
const alertDefinitionsUrl = '/alerts/definitions';

const mockProfile = profileFactory.build({
  timezone: 'gmt',
});
const mockAccount = accountFactory.build();
const now = new Date();
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 86400000).toISOString();

const serviceType: CloudPulseServiceType[] = ['dbaas', 'linode', 'logs'];
const statuses: AlertStatusType[] = ['enabled', 'disabled'];

const mockAlerts = serviceType.flatMap((serviceType, i) =>
  statuses.map((status, j) =>
    alertFactory.build({
      created_by: `user${i * 2 + j + 1}`,
      entity_ids: ['1', '2', '3', '4', '5'],
      id: i * 2 + j + 1,
      label: `Alert-${i * 2 + j + 1}`,
      service_type: serviceType,
      status,
      type: 'user',
      updated: daysAgo(i * 2 + j),
      updated_by: `updated${i * 2 + j + 1}`,
    })
  )
);
interface AlertActionOptions {
  action: 'Disable' | 'Enable';
  alertName: string;
  alias: string;
}

interface AlertToggleOptions extends AlertActionOptions {
  confirmationText: string;
  successMessage: string;
}
const statusList: AlertStatusType[] = [
  'enabled',
  'disabled',
  'provisioning',
  'failed',
];
const serviceTypes: CloudPulseServiceType[] = ['linode', 'dbaas'];

/**
 * @description
 * This code validates the presence and correct text of the table headers
 * inside the alert table. It checks if each header matches the expected
 * values as defined in the `expectedHeaders` array.
 *
 * For each header, the code performs the following actions:
 * 1. Locates the table with the `data-qa="alert-table"` attribute.
 * 2. Iterates through the `expectedHeaders` array.
 * 3. For each header, it ensures the table contains a column with the exact header text.
 *
 * @usage
 * This check is typically used in UI tests to ensure that the table headers
 * match the expected structure when displayed in the application.
 */
const expectedHeaders = [
  'Alert Name',
  'Service',
  'Status',
  'Last Modified',
  'Created By',
];

/**
 * Verifies sorting of a column in the alerts table.
 * @param {string} header - The `data-qa-header` attribute of the column to sort.
 * @param {'ascending' | 'descending'} sortOrder - Expected sorting order.
 * @param {number[]} expectedValues - Expected values in sorted order.
 */
const verifyTableSorting = (
  header: string,
  sortOrder: 'ascending' | 'descending',
  expectedValues: number[]
) => {
  // Click the th using data-qa-header attribute
  cy.get(`[data-qa-header="${header}"]`).click();

  // Assert aria-sort on the th element itself
  cy.get(`[data-qa-header="${header}"]`).should(
    'have.attr',
    'aria-sort',
    sortOrder
  );

  // Assert row order
  cy.get('[data-qa="alert-table"]').within(() => {
    cy.get('[data-qa-alert-cell]').should(($cells) => {
      const actualOrder = $cells
        .map((_, cell) =>
          parseInt(cell.getAttribute('data-qa-alert-cell') || '0', 10)
        )
        .get();
      expectedValues.forEach((value, index) => {
        expect(actualOrder[index]).to.equal(value);
      });
    });
  });
};
/**
 * @param {Alert} alert - The alert object to validate.
 */
const validateAlertDetails = (alert: Alert) => {
  const { created_by, id, label, service_type, status, updated } = alert;

  cy.get(`[data-qa-alert-cell="${id}"]`).within(() => {
    cy.findByText(cloudPulseServiceMap[service_type])
      .should('be.visible')
      .and('have.text', `${cloudPulseServiceMap[service_type]} beta`);

    cy.findByText(alertStatuses[status])
      .should('be.visible')
      .and('have.text', alertStatuses[status]);
    cy.findByText(label)
      .should('be.visible')
      .and('have.text', label)
      .and(
        'have.attr',
        'href',
        `/alerts/definitions/detail/${service_type}/${id}`
      );
    cy.findByText(
      formatDate(updated, {
        format: 'MMM dd, yyyy, h:mm a',
        timezone: 'GMT',
      })
    )
      .should('be.visible')
      .and(
        'have.text',
        formatDate(updated, { format: 'MMM dd, yyyy, h:mm a', timezone: 'GMT' })
      );
    cy.findByText(created_by).should('be.visible').and('have.text', created_by);
  });
};

describe('Integration Tests for CloudPulse Alerts Listing Page', () => {
  /*
   * - Verifies UI elements, navigation, and alert details in the listing page.
   * - Confirms sorting functionality for multiple columns (Alert Name, Service, Status, Last Modified, Created By).
   * - Validates filtering and search functionality for alerts by name, service, and status.
   * - Ensures users can disable and enable alerts successfully.
   * - Confirms UI properly updates alert statuses after enabling or disabling alerts.
   * - Ensures API calls return correct responses and status codes.
   */
  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount);
    mockGetProfile(mockProfile);
    mockGetCloudPulseServices(['linode', 'dbaas', 'logs']);
    mockGetAllAlertDefinitions(mockAlerts).as('getAlertDefinitionsList');
    mockUpdateAlertDefinitions('dbaas', 1, mockAlerts[0]).as(
      'getFirstAlertDefinitions'
    );
    mockUpdateAlertDefinitions('dbaas', 2, mockAlerts[1]).as(
      'getSecondAlertDefinitions'
    );
    cy.visitWithLogin(alertDefinitionsUrl);
    cy.get('[aria-label="Content is loading"]', { timeout: 50000 }).should(
      'not.exist'
    );
    cy.wait('@getAlertDefinitionsList');
    mockDeleteAlert('dbaas', 1).as('deleteAlert');
    mockDeleteAlert('linode', 0).as('deleteAlert2');
  });

  it('should verify sorting functionality for multiple columns in ascending and descending order', () => {
    const alerts = [...mockAlerts];

    const sortCases = [
      {
        column: 'label',
        ascending: [...alerts]
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((a) => a.id),
        descending: [...alerts]
          .sort((a, b) => b.label.localeCompare(a.label))
          .map((a) => a.id),
      },
      {
        column: 'status',
        ascending: [...alerts]
          .sort((a, b) => a.status.localeCompare(b.status))
          .map((a) => a.id),
        descending: [...alerts]
          .sort((a, b) => b.status.localeCompare(a.status))
          .map((a) => a.id),
      },
      {
        column: 'service_type_label', // ← fixed: matches data-qa-header in HTML
        ascending: [...alerts]
          .sort((a, b) => a.service_type.localeCompare(b.service_type))
          .map((a) => a.id),
        descending: [...alerts]
          .sort((a, b) => b.service_type.localeCompare(a.service_type))
          .map((a) => a.id),
      },
      {
        column: 'created_by',
        ascending: [...alerts]
          .sort((a, b) => a.created_by.localeCompare(b.created_by))
          .map((a) => a.id),
        descending: [...alerts]
          .sort((a, b) => b.created_by.localeCompare(a.created_by))
          .map((a) => a.id),
      },
      {
        column: 'updated',
        ascending: [...alerts]
          .sort(
            (a, b) =>
              new Date(a.updated).getTime() - new Date(b.updated).getTime()
          )
          .map((a) => a.id),
        descending: [...alerts]
          .sort(
            (a, b) =>
              new Date(b.updated).getTime() - new Date(a.updated).getTime()
          )
          .map((a) => a.id),
      },
      {
        column: 'updated_by', // ← added: Last Modified By column exists in HTML
        ascending: [...alerts]
          .sort((a, b) => a.updated_by.localeCompare(b.updated_by))
          .map((a) => a.id),
        descending: [...alerts]
          .sort((a, b) => b.updated_by.localeCompare(a.updated_by))
          .map((a) => a.id),
      },
    ];

    sortCases.forEach(({ ascending, column, descending }) => {
      // Verify ascending order first (default click)
      verifyTableSorting(column, 'ascending', ascending);

      // Verify descending order (second click)
      verifyTableSorting(column, 'descending', descending);
    });
  });
  it('should verify action menu items for enabling and disabling alerts', () => {
    const mockAlerts = [
      alertFactory.build({
        id: 1,
        label: 'Alert-1',
        service_type: 'dbaas',
        status: 'enabling',
        type: 'user',
      }),
      alertFactory.build({
        id: 2,
        label: 'Alert-2',
        service_type: 'dbaas',
        status: 'disabling',
        type: 'user',
      }),
    ];

    mockGetAllAlertDefinitions(mockAlerts).as('getAlertDefinitionsList');
    cy.visitWithLogin(alertDefinitionsUrl);
    cy.wait('@getAlertDefinitionsList');

    interface VerifyMenuOptions {
      alertLabel: string;
      disabledItems: string[];
      enabledItems: string[];
    }

    const verifyMenu = ({
      alertLabel,
      enabledItems,
      disabledItems,
    }: VerifyMenuOptions): void => {
      cy.findByPlaceholderText('Search for Alerts').as('searchInput');
      cy.get('@searchInput').clear();
      cy.get('@searchInput').type(alertLabel);

      cy.findByText(alertLabel)
        .should('be.visible')
        .closest('tr')
        .within(() => {
          ui.actionMenu
            .findByTitle(`Action menu for Alert ${alertLabel}`)
            .should('be.visible')
            .click();
        });

      cy.get('[data-qa-action-menu="true"]').as('menu');

      // Enabled items
      enabledItems.forEach((item: string) => {
        cy.get('@menu')
          .find(`[data-qa-action-menu-item="${item}"]`)
          .and('not.have.attr', 'aria-disabled');
      });

      // Disabled items
      disabledItems.forEach((item: string) => {
        cy.get('@menu')
          .find(`[data-qa-action-menu-item="${item}"]`)
          .and('have.attr', 'aria-disabled', 'true');
      });

      cy.get('[data-qa-action-menu="true"]').click();
    };
    verifyMenu({
      alertLabel: 'Alert-1',
      enabledItems: ['Show Details'],
      disabledItems: ['Edit', 'Disable', 'Delete'],
    });

    verifyMenu({
      alertLabel: 'Alert-2',
      enabledItems: ['Show Details'],
      disabledItems: ['Edit', 'Enable', 'Delete'],
    });
  });

  it('should validate UI elements and alert details', () => {
    // filter to main content area to avoid confusion w/ 'Alerts' nav link in left sidebar
    cy.get('main').within(() => {
      // Validate breadcrumb and buttons
      cy.findByText('Alerts', { exact: false }).should('be.visible');

      cy.findByText('Definitions')
        .should('be.visible')
        .and('have.attr', 'href', alertDefinitionsUrl);
      ui.buttonGroup.findButtonByTitle('Create Alert').should('be.visible');

      // Validate table headers
      cy.get('[data-qa="alert-table"]').within(() => {
        expectedHeaders.forEach((header) => {
          cy.findByText(header).should('have.text', header);
        });
      });

      // Validate alert details
      mockAlerts.forEach((alert) => {
        validateAlertDetails(alert);
      });
    });
  });

  it('should search and filter alerts by name, service, and status, and clear filters', () => {
    // dbaas: ids 1,2 | linode: ids 3,4 | logs: ids 5,6
    const dbaasAlerts = mockAlerts.filter((a) => a.service_type === 'dbaas');
    const linodeAlerts = mockAlerts.filter((a) => a.service_type === 'linode');
    const enabledAlerts = mockAlerts.filter((a) => a.status === 'enabled');
    const disabledAlerts = mockAlerts.filter((a) => a.status === 'disabled');

    // Search by alert name and validate the results
    cy.findByPlaceholderText('Search for Alerts')
      .should('be.visible')
      .and('not.be.disabled')
      .type(mockAlerts[0].label);

    cy.get(`[data-qa-alert-cell="${mockAlerts[0].id}"]`).should('be.visible');
    mockAlerts.slice(1).forEach((alert) => {
      cy.get(`[data-qa-alert-cell="${alert.id}"]`).should('not.exist');
    });

    // Clear the previous search
    cy.get('[data-qa-filter="alert-search"]').within(() => {
      cy.findByTestId('textfield-input').clear();
    });

    // Filter by service = Databases (dbaas) and validate
    cy.findByPlaceholderText('Select a Service')
      .should('be.visible')
      .type('Databases{enter}');
    cy.focused().click();

    cy.get('[data-qa="alert-table"]')
      .find('[data-qa-alert-cell]')
      .should('have.length', dbaasAlerts.length); // 2

    dbaasAlerts.forEach((alert) => {
      cy.get(`[data-qa-alert-cell="${alert.id}"]`).should('be.visible');
    });
    [
      ...linodeAlerts,
      ...mockAlerts.filter((a) => a.service_type === 'logs'),
    ].forEach((alert) => {
      cy.get(`[data-qa-alert-cell="${alert.id}"]`).should('not.exist');
    });

    // Clear the service filter
    cy.get('[data-qa-filter="alert-service-filter"]').within(() => {
      ui.button
        .findByAttribute('aria-label', 'Clear')
        .should('be.visible')
        .scrollIntoView();
      ui.button.findByAttribute('aria-label', 'Clear').click();
    });

    // Filter by status = Enabled and validate
    cy.findByPlaceholderText('Select a Status')
      .should('be.visible')
      .type('Enabled{enter}');
    cy.focused().click();

    cy.get('[data-qa="alert-table"]')
      .find('[data-qa-alert-cell]')
      .should('have.length', enabledAlerts.length); // 3

    enabledAlerts.forEach((alert) => {
      cy.get(`[data-qa-alert-cell="${alert.id}"]`).should('be.visible');
    });
    disabledAlerts.forEach((alert) => {
      cy.get(`[data-qa-alert-cell="${alert.id}"]`).should('not.exist');
    });
  });

  it('should disable and enable user alerts successfully', () => {
    mockUpdateAlertDefinitions('dbaas', 1, {
      ...mockAlerts[0],
      status: 'disabling',
    }).as('getFirstAlertDefinitions');
    mockUpdateAlertDefinitions('dbaas', 2, {
      ...mockAlerts[1],
      status: 'enabling',
    }).as('getSecondAlertDefinitions');
    cy.visitWithLogin(alertDefinitionsUrl);

    // Function to search for an alert
    const searchAlert = (alertName: string) => {
      cy.findByPlaceholderText('Search for Alerts')
        .should('be.visible')
        .and('not.be.disabled')
        .clear();
      cy.findByPlaceholderText('Search for Alerts').type(alertName);

      cy.focused().click();
    };

    // Function to toggle an alert's status
    const toggleAlertStatus = ({
      action,
      alertName,
      alias,
      confirmationText,
      successMessage,
    }: AlertToggleOptions) => {
      cy.findByText(alertName)
        .should('be.visible')
        .closest('tr')
        .within(() => {
          ui.actionMenu
            .findByTitle(`Action menu for Alert ${alertName}`)
            .should('be.visible')
            .click();

          ui.actionMenuItem.findByTitle(action).should('be.visible').click();
        });

      // verify dialog title
      ui.dialog
        .findByTitle(`${action} ${alertName} Alert?`)
        .should('be.visible')
        .within(() => {
          cy.findByText(confirmationText).should('be.visible');

          ui.button.findByTitle(action).should('be.enabled').click();
        });

      cy.wait(alias).then(({ request, response }) => {
        const resp = response?.body;
        const req = request?.body;

        // Alias → expected statuses
        const expectations: Record<
          string,
          { backend: string; request: string }
        > = {
          '@getFirstAlertDefinitions': {
            backend: 'disabling',
            request: 'disabled',
          },
          '@getSecondAlertDefinitions': {
            backend: 'enabling',
            request: 'enabled',
          },
        };

        // pick expectations for this alias
        const exp = expectations[alias];

        // ---- Assertions ----
        expect(resp.status, `Backend status mismatch for ${alias}`).to.equal(
          exp.backend
        );

        expect(req.status, `Request status mismatch for ${alias}`).to.equal(
          exp.request
        );

        expect(resp.label, `Alert label mismatch for ${alias}`).to.equal(
          alertName
        );

        ui.toast.assertMessage(successMessage);
      });
    };

    // Disable "Alert-1"
    const actions: Array<AlertActionOptions> = [
      {
        action: 'Disable',
        alertName: 'Alert-1',
        alias: '@getFirstAlertDefinitions',
      },
      {
        action: 'Enable',
        alertName: 'Alert-2',
        alias: '@getSecondAlertDefinitions',
      },
    ];

    actions.forEach(({ action, alertName, alias }) => {
      searchAlert(alertName);
      toggleAlertStatus({
        action,
        alertName,
        alias,
        confirmationText: `Are you sure you want to ${action.toLowerCase()} this alert definition?`,
        successMessage:
          action === 'Disable'
            ? DISABLE_ALERT_SUCCESS_MESSAGE
            : ENABLE_ALERT_SUCCESS_MESSAGE,
      });
    });
  });

  it('should allow creating alerts even if system alert count exceeds threshold', () => {
    const mockAlerts = alertFactory.buildList(105, {
      type: 'system',
    });
    mockGetAllAlertDefinitions(mockAlerts).as('getAlertDefinitionsList');
    cy.visitWithLogin(alertDefinitionsUrl);
    cy.wait('@getAlertDefinitionsList');
    ui.buttonGroup.findButtonByTitle('Create Alert').should('not.be.disabled');
  });
  it('should disable Create Alert button when user alert count reaches threshold', () => {
    const mockAlerts = Array.from({ length: 11 }, (_, index) =>
      alertFactory.build({
        label: `Alert-${index}`,
        service_type: serviceTypes[index % serviceTypes.length],
        status: statusList[index % statusList.length],
        type: 'user',
        id: index,
        created_by: `create_user-${index}`,
        updated_by: `updated_user-${index}`,
        ...(index % 2 === 0 && {
          rule_criteria: {
            rules: alertRulesFactory.buildList(0),
          },
        }),
      })
    );

    mockGetAllAlertDefinitions(mockAlerts).as('getAlertDefinitionsList');
    cy.visitWithLogin(alertDefinitionsUrl);
    cy.wait('@getAlertDefinitionsList');
    ui.buttonGroup.findButtonByTitle('Create Alert').should('be.disabled');
    cy.get('[data-alert-notice="true"]')
      .should('be.visible')
      .and('have.text', alertLimitMessage);
    ui.tooltip.findByText(alertToolTipText).should('be.visible');
  });

  it('should disable Create Alert button when metrics exceed threshold even if alerts are below limit', () => {
    const mockAlerts = Array.from({ length: 5 }, (_, index) =>
      alertFactory.build({
        label: `Alert-${index}`,
        service_type: serviceTypes[index % serviceTypes.length],
        status: statusList[index % statusList.length],
        type: 'user',
        id: index,
        created_by: `create_user-${index}`,
        updated_by: `updated_user-${index}`,
        ...(index % 2 === 0 && {
          rule_criteria: {
            rules: alertRulesFactory.buildList(5),
          },
        }),
      })
    );

    mockGetAllAlertDefinitions(mockAlerts).as('getAlertDefinitionsList');
    cy.visitWithLogin(alertDefinitionsUrl);
    cy.wait('@getAlertDefinitionsList');
    ui.buttonGroup.findButtonByTitle('Create Alert').should('be.disabled');
    cy.get('[data-alert-notice="true"]')
      .should('be.visible')
      .and('have.text', metricLimitMessage);
    ui.tooltip.findByText(alertToolTipText).should('be.visible');
  });

  it('should disable Create Alert button when both alert and metric counts exceed threshold', () => {
    const mockAlerts = Array.from({ length: 100 }, (_, index) =>
      alertFactory.build({
        label: `Alert-${index}`,
        service_type: serviceTypes[index % serviceTypes.length],
        status: statusList[index % statusList.length],
        type: 'user',
        id: index,
        created_by: `create_user-${index}`,
        updated_by: `updated_user-${index}`,
      })
    );
    mockAlerts.forEach((alert) => {
      mockDeleteAlert('dbaas', alert.id).as(`deleteAlert-${alert.label}`);
    });
    mockGetAllAlertDefinitions(mockAlerts).as('getAlertDefinitionsList');
    cy.visitWithLogin(alertDefinitionsUrl);
    cy.wait('@getAlertDefinitionsList');
    ui.buttonGroup.findButtonByTitle('Create Alert').should('be.disabled');

    cy.get('[data-alert-notice="true"]')
      .should('be.visible')
      .within(() => {
        cy.get('[data-testid="alert_notice_message_list"]')
          .first()
          .should('have.text', alertLimitMessage);

        cy.get('[data-testid="alert_notice_message_list"]')
          .last()
          .should('have.text', metricLimitMessage);
      });
    ui.tooltip.findByText(alertToolTipText).should('be.visible');
    cy.get('[data-qa-error="true"]')
      .should('be.visible')
      .should(
        'have.text',
        'Creation of 25 alerts has failed as indicated in the status column. Please open a support ticket for assistance.'
      );
  });

  it('should disable Create Alert when two alerts together use all 10 available metrics, and re-enable it after one is deleted', () => {
    const mockAlerts = Array.from({ length: 2 }, (_, index) =>
      alertFactory.build({
        label: `Alert-${index}`,
        service_type: serviceTypes[index % serviceTypes.length],
        status: statusList[index % statusList.length],
        type: 'user',
        id: index,
        created_by: `create_user-${index}`,
        updated_by: `updated_user-${index}`,
        ...(index % 2 !== 0 && {
          rule_criteria: {
            rules: alertRulesFactory.buildList(10),
          },
        }),
      })
    );
    mockGetAllAlertDefinitions(mockAlerts).as('getAlertDefinitionsList');

    cy.visitWithLogin(alertDefinitionsUrl);
    cy.wait('@getAlertDefinitionsList');

    ui.buttonGroup.findButtonByTitle('Create Alert').should('be.disabled');

    cy.get('[data-alert-notice="true"]')
      .should('be.visible')
      .and('have.text', metricLimitMessage);

    ui.tooltip.findByText(alertToolTipText).should('be.visible');

    ui.actionMenu
      .findByTitle(`Action menu for Alert ${mockAlerts[1].label}`)
      .should('be.visible')
      .click();

    ui.actionMenuItem.findByTitle('Delete').should('be.visible').click();

    ui.dialog
      .findByTitle(`Delete ${mockAlerts[1].label}? `)
      .should('be.visible')
      .within(() => {
        // Focus the "Alert Label" confirmation input
        cy.findByLabelText('Alert Label').click();

        // Type the alert label to enable the Delete button
        cy.focused().type(mockAlerts[1].label);

        // Click the Delete button to confirm
        ui.buttonGroup
          .findButtonByTitle('Delete')
          .should('be.enabled')
          .should('be.visible')
          .click();
      });
    ui.buttonGroup.findButtonByTitle('Create Alert').should('be.enabled');
  });
  /**
   * Validates the delete flow for an alert based on its label and whether deletion is allowed.
   * @param {string} label - The label of the alert to be deleted.
   * @param {boolean} canDelete - Whether the alert can be deleted.
   */
  const validateDeleteFlow = (label: string, canDelete: boolean) => {
    // Locate the alert row by label and open the action menu
    cy.findByText(label)
      .should('be.visible')
      .closest('tr')
      .within(() => {
        // Open the action menu for the alert
        ui.actionMenu
          .findByTitle(`Action menu for Alert ${label}`)
          .should('be.visible')
          .click();
      });
    if (canDelete) {
      // Click the "Delete" option from the action menu
      ui.actionMenuItem.findByTitle('Delete').should('be.visible').click();

      // Verify the delete confirmation dialog appears with the correct title
      ui.dialog
        .findByTitle(`Delete ${label}? `)
        .should('be.visible')
        .within(() => {
          // Focus the "Alert Label" confirmation input
          cy.findByLabelText('Alert Label').click();

          // Type the alert label to enable the Delete button
          cy.focused().type(label);

          // Click the Delete button to confirm
          ui.buttonGroup
            .findButtonByTitle('Delete')
            .should('be.enabled')
            .should('be.visible')
            .click();
        });

      // Wait for the DELETE request to be intercepted
      cy.wait(`@deleteAlert-${label}`);

      // Verify the user is redirected to the alerts listing page
      cy.url().should('endWith', '/alerts/definitions');

      // Confirm the success toast message is shown
      ui.toast.assertMessage(DELETE_ALERT_SUCCESS_MESSAGE);

      // Ensure the deleted alert no longer appears in the list
      cy.findByText(label).should('not.exist');
    } else {
      ui.actionMenuItem.findByTitle('Delete').should('be.disabled');
    }
  };

  statusList.forEach((status, index) => {
    // Loop through each alert status in the list
    it(`should validate the delete alert behavior based on its status: ${status} `, () => {
      const label = `Alert-${index + 1}`;
      const id = index + 1;

      const mockAlert = alertFactory.build({
        id,
        label,
        service_type: 'dbaas',
        status,
        type: 'user',
        created_by: 'user1',
        updated_by: 'user1',
      });
      // Build a mock alert object with required fields

      mockGetAllAlertDefinitions([mockAlert]).as(`getAlerts-${label}`);
      // Mock the API call to fetch alerts with this mock alert

      mockDeleteAlert('dbaas', id).as(`deleteAlert-${label}`);
      // Mock the API call to delete this alert

      cy.visitWithLogin(alertDefinitionsUrl);
      // Visit the alerts page as a logged-in user

      cy.wait(`@getAlerts-${label}`);
      // Wait for the alerts to load

      const canDelete = status === 'enabled' || status === 'disabled';
      // Determine if the alert should allow deletion

      validateDeleteFlow(label, canDelete);
      // Run the test steps to verify the delete behavior
    });
  });

  it('should validate that the delete button is not available for a system alert with status: enabled', () => {
    const label = 'system-alert';

    const mockAlert = alertFactory.build({
      id: 1,
      label,
      service_type: 'dbaas',
      status: 'enabled',
      type: 'system',
    });

    // Mock the alert list API with a system alert
    mockGetAllAlertDefinitions([mockAlert]).as('getSystemAlert');

    // Visit the Alert Definitions page as a logged-in user
    cy.visitWithLogin(alertDefinitionsUrl);

    // Wait for alerts to load and find the row containing the system alert
    cy.wait('@getSystemAlert');
    // Verify that the system alert is visible in the table
    cy.findByText(label)
      .should('be.visible')
      .closest('tr')
      .within(() => {
        // Open the action menu
        ui.actionMenu
          .findByTitle(`Action menu for Alert ${label}`)
          .should('be.visible')
          .click();
      });

    // Verify that the Delete menu item is NOT present
    cy.get('[data-qa-action-menu-item="Delete"]').should('not.exist');

    // Define the list of expected visible action menu items
    const visibleItems = ['Edit', 'Show Details'];
    // Loop through each expected item and assert that it exists and is visible in the action menu
    visibleItems.forEach((item) => {
      cy.get(`[data-qa-action-menu-item="${item}"]`)
        .should('exist')
        .and('be.visible');
    });
  });
  it('should disable Create Alert when two alerts together use all 10 available metrics, and re-enable it after one is deleted', () => {
    const mockAlerts = Array.from({ length: 2 }, (_, index) =>
      alertFactory.build({
        label: `Alert-${index}`,
        service_type: serviceTypes[index % serviceTypes.length],
        status: statusList[index % statusList.length],
        type: 'user',
        id: index,
        created_by: `create_user-${index}`,
        updated_by: `updated_user-${index}`,
        ...(index % 2 !== 0 && {
          rule_criteria: {
            rules: alertRulesFactory.buildList(10),
          },
        }),
      })
    );
    mockGetAllAlertDefinitions(mockAlerts).as('getAlertDefinitionsList');

    cy.visitWithLogin(alertDefinitionsUrl);
    cy.wait('@getAlertDefinitionsList');

    ui.buttonGroup.findButtonByTitle('Create Alert').should('be.disabled');

    cy.get('[data-alert-notice="true"]')
      .should('be.visible')
      .and('have.text', metricLimitMessage);

    ui.tooltip.findByText(alertToolTipText).should('be.visible');

    ui.actionMenu
      .findByTitle(`Action menu for Alert ${mockAlerts[1].label}`)
      .should('be.visible')
      .click();

    ui.actionMenuItem.findByTitle('Delete').should('be.visible').click();

    ui.dialog
      .findByTitle(`Delete ${mockAlerts[1].label}? `)
      .should('be.visible')
      .within(() => {
        // Focus the "Alert Label" confirmation input
        cy.findByLabelText('Alert Label').click();

        // Type the alert label to enable the Delete button
        cy.focused().type(mockAlerts[1].label);

        // Click the Delete button to confirm
        ui.buttonGroup
          .findButtonByTitle('Delete')
          .should('be.enabled')
          .should('be.visible')
          .click();
      });
    ui.buttonGroup.findButtonByTitle('Create Alert').should('be.enabled');
  });
});
