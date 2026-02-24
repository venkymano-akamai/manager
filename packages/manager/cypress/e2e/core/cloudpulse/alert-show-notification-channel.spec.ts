import { profileFactory } from '@linode/utilities';
/**
 * @file Integration Tests for the CloudPulse Alerts Notification Channel Show Detail Page.
 *
 * This file contains Cypress tests that validate the display and content of the  Alerts Notification channel Show Detail Page in the CloudPulse application.
 * It ensures that all alert details, criteria, and entity information are displayed correctly.
 */
import { cloudPulseServiceMapNotificationChannel } from 'support/constants/cloudpulse';
import { mockGetAccount } from 'support/intercepts/account';
import {
  mockGetAlertChannelById,
  mockGetAlertChannelByIdError,
  mockGetAlertChannels,
  mockGetAlertsForChannelId,
  mockGetAlertsForChannelIdError,
} from 'support/intercepts/cloudpulse';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetProfile } from 'support/intercepts/profile';
import { ui } from 'support/ui';

import { notificationChannelAlertsFactory } from 'src/factories';
import {
  accountFactory,
  flagsFactory,
  notificationChannelFactory,
} from 'src/factories';
import { formatDate } from 'src/utilities/formatDate';

// Define mock data for the test.

const mockAccount = accountFactory.build();
const mockProfile = profileFactory.build({
  restricted: false,
  timezone: 'gmt',
});

const notificationChannelDetails = notificationChannelFactory.buildList(1, {
  label: 'Notification channel 1',
  channel_type: 'email',
  type: 'user',
  details: {
    email: {
      recipient_type: 'user',
      usernames: ['admin-user', 'john-doe', 'jane-smith'],
    },
  },
  created_by: 'user1',
  updated_by: 'user2',
  created: '2026-01-27T06:18:00Z',
  updated: new Date().toISOString(),
});
const {
  label,
  id,
  type,
  channel_type,
  details,
  created_by,
  created,
  updated,
  updated_by,
} = notificationChannelDetails[0];

const mockAlerts = [
  ...notificationChannelAlertsFactory.buildList(2, {
    service_type: 'linode',
  }),
  ...notificationChannelAlertsFactory.buildList(2, {
    service_type: 'dbaas',
  }),
  ...notificationChannelAlertsFactory.buildList(2, {
    service_type: 'nodebalancer',
  }),
  ...notificationChannelAlertsFactory.buildList(2, {
    service_type: 'lke',
  }),
  ...notificationChannelAlertsFactory.buildList(2, {
    service_type: 'firewall',
  }),
  ...notificationChannelAlertsFactory.buildList(2, {
    service_type: 'objectstorage',
  }),
  ...notificationChannelAlertsFactory.buildList(2, {
    service_type: 'blockstorage',
  }),
];
/**
 * Verifies that alert rows are displayed in the expected order.
 * @param expectedAlerts - Alerts sorted into their expected display order.
 */
const verifyAlertOrder = (expectedAlerts: { id: number }[]): void => {
  cy.get('[data-qa-alert-cell]').then(($cells) => {
    const alertRowIds = $cells
      .map((_, cell) =>
        parseInt(cell.getAttribute('data-qa-alert-cell') || '0', 10)
      )
      .get();
    expectedAlerts.forEach((alert, index) => {
      expect(alertRowIds[index]).to.equal(alert.id);
    });
  });
};

describe('CloudPulse Alerting - Notification Channel Show details Validation', () => {
  beforeEach(() => {
    // Setup all mock APIs - tests will navigate directly to detail page
    const mockflags = flagsFactory.build({
      aclpAlerting: {
        notificationChannels: true,
      },
    });
    mockAppendFeatureFlags(mockflags);
    mockGetAccount(mockAccount);
    mockGetProfile(mockProfile);
    mockGetAlertChannels(notificationChannelDetails).as(
      'getAlertNotificationChannels'
    );
    mockGetAlertChannelById(id, notificationChannelDetails[0]).as(
      'getAlertNotificationChannelById'
    );
    mockGetAlertsForChannelId(id, mockAlerts).as('getAlertsForChannelId');
  });

  it('should navigate to the Show Details page from the notification channels list page', () => {
    // Navigate to the notification channels list page with login
    cy.visitWithLogin('/alerts/notification-channels');

    // Wait for the notification channels list API call to complete
    cy.wait('@getAlertNotificationChannels');

    // Locate the notification channel with the specified label in the table
    cy.findByText(label).should('be.visible');
    cy.findByText(label)
      .closest('tr')
      .within(() => {
        ui.actionMenu
          .findByTitle(`Action menu for Notification Channel ${label}`)
          .should('be.visible')
          .click();
        // Select the "Show Details" option from the action menu
        ui.actionMenuItem
          .findByTitle('Show Details')
          .should('be.visible')
          .click();
      });

    // Verify the URL navigates to the correct details page
    cy.url().should('include', `/alerts/notification-channels/detail/${id}`);
  });

  it('should display correct notification channel details', () => {
    // Navigate directly to the notification channel detail page
    cy.visitWithLogin(`/alerts/notification-channels/detail/${id}`);
    cy.wait('@getAlertNotificationChannelById');
    cy.wait('@getAlertsForChannelId');

    // Verify breadcrumb heading
    ui.breadcrumb.find().within(() => {
      cy.contains('Notification Channels').should('be.visible');
      cy.contains('Details').should('be.visible');
    });

    // Verify url correctness
    cy.url().should('include', `/alerts/notification-channels/detail/${id}`);

    // Validating contents of Overview Section
    cy.get('[data-qa-section="Overview"]').within(() => {
      // Validate Name field
      cy.findByText('Name:').should('be.visible');
      cy.findByText(label).should('be.visible');

      // Validate Description field
      cy.findByText('Channel Type:').should('be.visible');
      cy.findByText(
        `${channel_type[0].toUpperCase()}${channel_type.slice(1)}`
      ).should('be.visible');

      // Validate Created By field
      cy.findByText('Created by:').should('be.visible');
      cy.findByText(created_by).should('be.visible');

      // Validate Created Time field
      cy.findByText('Creation Time:').should('be.visible');

      cy.findByText(
        formatDate(created, {
          format: 'MMM dd, yyyy, h:mm a',
          timezone: 'GMT',
        })
      ).should('be.visible');

      // Validate Last Modified field
      cy.findByText('Last Modified:').should('be.visible');

      cy.findByText(
        formatDate(updated, {
          format: 'MMM dd, yyyy, h:mm a',
          timezone: 'GMT',
        })
      ).should('be.visible');

      cy.findByText('Last Modified by:').should('be.visible');
      cy.findByText(updated_by).should('be.visible');
    });
    cy.get('[data-qa-section="Details"]').within(() => {
      // Validate Recipient type field
      cy.findByText('Recipient Type:').should('be.visible');
      cy.get('[data-qa-chip="user"]').should('have.text', type);

      // Validate Recipients field
      if (channel_type === 'email' && details && 'email' in details) {
        const usernames = details.email.usernames;
        usernames.forEach((username) => {
          cy.get(`[data-qa-chip="${username}"]`)
            .should('have.text', username)
            .should('be.visible');
        });
      }
    });

    cy.get('[data-qa-section="Associated Alerts"]').within(() => {
      // Validate for search box
      cy.findByPlaceholderText('Search for Alerts').should('be.visible');

      // Validate for search a service type
      cy.findByPlaceholderText('Select a Service').should('be.visible');

      const expectedHeaders = ['Alert Name', 'Service'];

      // Validate table headers
      cy.get('[data-qa="associated-alerts-table"]').within(() => {
        expectedHeaders.forEach((header) => {
          cy.findByText(header).should('have.text', header);
        });
      });

      // Validate alert details
      mockAlerts.forEach((alert) => {
        cy.get(`[data-qa-alert-cell="${alert.id}"]`)
          .contains(cloudPulseServiceMapNotificationChannel[alert.service_type])
          .should('be.visible')
          .and(
            'have.text',
            `${cloudPulseServiceMapNotificationChannel[alert.service_type]} beta`
          );
      });
    });
  });

  it('should verify search and sort functionality in Associated Alerts table', () => {
    // Navigate directly to the notification channel detail page
    cy.visitWithLogin(`/alerts/notification-channels/detail/${id}`);
    cy.wait('@getAlertNotificationChannelById');
    cy.wait('@getAlertsForChannelId');
    cy.get('[data-qa-section="Associated Alerts"]').within(() => {
      cy.findByPlaceholderText('Search for Alerts').as('searchInput');
      cy.get('@searchInput').clear();
      cy.get('@searchInput').type(mockAlerts[0].label);
      // Dynamically get the length based on filtered results
      const filteredAlertsLen = mockAlerts.filter((alert) =>
        alert.label.toLowerCase().includes(mockAlerts[0].label.toLowerCase())
      ).length;
      cy.get('[data-qa="associated-alerts-table"]')
        .find('tbody')
        .last()
        .find('tr')
        .should('have.length', filteredAlertsLen);
      cy.get(`[data-qa-alert-cell="${mockAlerts[0].id}"]`).should('be.visible');
      cy.get('@searchInput').clear();
      // Validate for search a service type
      cy.findByPlaceholderText('Select a Service').as('searchServiceType');
      cy.get('@searchServiceType').type('Databases');
      cy.get('[data-qa-option="true"]').contains('Databases').click();

      // Verify that the table displays only alerts related to 'dbaas' service type
      const dbaasAlerts = mockAlerts.filter(
        (alert) => alert.service_type === 'dbaas'
      );
      cy.get('[data-qa="associated-alerts-table"]')
        .find('tbody')
        .last()
        .find('tr')
        .should('have.length', dbaasAlerts.length);
      dbaasAlerts.forEach((alert) => {
        cy.get(`[data-qa-alert-cell="${alert.id}"]`).should('be.visible');
      });

      // Clear the service filter
      ui.button
        .findByAttribute('aria-label', 'Clear')
        .should('be.visible')
        .click();

      // Validate the sorting functionality for Alert Name
      cy.get('[data-qa="associated-alerts-table"]').within(() => {
        // Click on the 'Alert Name' header to sort
        ui.heading.findByText('label').click();

        // Get the sort order and verify data matches
        const AlertNameHeading = ui.heading.findByText('label');
        AlertNameHeading.should('have.attr', 'aria-sort').then((sortOrder) => {
          let expectedAlerts;
          if (sortOrder === 'ascending') {
            expectedAlerts = [...mockAlerts].sort((a, b) =>
              a.label.localeCompare(b.label)
            );
          } else {
            expectedAlerts = [...mockAlerts].sort((a, b) =>
              b.label.localeCompare(a.label)
            );
          }
          verifyAlertOrder(expectedAlerts);
        });

        // Click again to toggle sort order
        ui.heading.findByText('label').click();

        // Get the new sort order and verify data matches
        const AlertNameHeadingAfterToggle = ui.heading.findByText('label');
        AlertNameHeadingAfterToggle.should('have.attr', 'aria-sort').then(
          (sortOrder) => {
            let expectedAlerts;
            if (sortOrder === 'ascending') {
              expectedAlerts = [...mockAlerts].sort((a, b) =>
                a.label.localeCompare(b.label)
              );
            } else {
              expectedAlerts = [...mockAlerts].sort((a, b) =>
                b.label.localeCompare(a.label)
              );
            }
            verifyAlertOrder(expectedAlerts);
          }
        );
      });

      // Validate the sorting functionality for service Type
      cy.get('[data-qa="associated-alerts-table"]').within(() => {
        // Click on the 'Service' header to sort
        ui.heading.findByText('service_type_label').click();

        // Get the sort order and verify data matches
        const serviceHeading = ui.heading.findByText('service_type_label');
        serviceHeading.should('have.attr', 'aria-sort').then((sortOrder) => {
          let expectedAlerts;
          if (sortOrder === 'ascending') {
            expectedAlerts = [...mockAlerts].sort((a, b) =>
              cloudPulseServiceMapNotificationChannel[
                a.service_type
              ].localeCompare(
                cloudPulseServiceMapNotificationChannel[b.service_type]
              )
            );
          } else {
            expectedAlerts = [...mockAlerts].sort((a, b) =>
              cloudPulseServiceMapNotificationChannel[
                b.service_type
              ].localeCompare(
                cloudPulseServiceMapNotificationChannel[a.service_type]
              )
            );
          }
          verifyAlertOrder(expectedAlerts);
        });

        // Click again to toggle sort order
        ui.heading.findByText('service_type_label').click();

        // Get the new sort order and verify data matches
        const serviceHeadingAfterToggle =
          ui.heading.findByText('service_type_label');
        serviceHeadingAfterToggle
          .should('have.attr', 'aria-sort')
          .then((sortOrder) => {
            let expectedAlerts;
            if (sortOrder === 'ascending') {
              expectedAlerts = [...mockAlerts].sort((a, b) =>
                cloudPulseServiceMapNotificationChannel[
                  a.service_type
                ].localeCompare(
                  cloudPulseServiceMapNotificationChannel[b.service_type]
                )
              );
            } else {
              expectedAlerts = [...mockAlerts].sort((a, b) =>
                cloudPulseServiceMapNotificationChannel[
                  b.service_type
                ].localeCompare(
                  cloudPulseServiceMapNotificationChannel[a.service_type]
                )
              );
            }
            verifyAlertOrder(expectedAlerts);
          });
      });
    });
  });

  it('should verify the pagination functionality in Associated Alerts table', () => {
    // Add additional alerts for pagination testing without mutating shared data
    const paginationAlerts = [
      ...mockAlerts,
      ...notificationChannelAlertsFactory.buildList(36, {
        service_type: 'linode',
      }),
    ];
    mockGetAlertsForChannelId(id, paginationAlerts).as('getAlertsForChannelId');
    // Navigate directly to the notification channel detail page
    cy.visitWithLogin(`/alerts/notification-channels/detail/${id}`);
    cy.wait('@getAlertNotificationChannelById');
    cy.wait('@getAlertsForChannelId');
    cy.get('[data-qa-section="Associated Alerts"]').within(() => {
      // Verify the initial state of the page size
      ui.pagination.findPageSizeSelect().click();

      // Verify the page size options are visible
      cy.get('[data-qa-pagination-page-size-option="25"]')
        .should('exist')
        .click();

      const pages = [1, 2];

      // Confirm that pagination controls list exactly 2 pages.
      ui.pagination.findControls().should('be.visible');
      pages.forEach((page: number) =>
        ui.pagination.findControls().contains(`${page}`).should('be.visible')
      );
      ui.pagination.findControls().contains('3').should('not.exist');

      // Validate pagination from length of paginationAlerts (ex : 26 total: page 1 has 25, page 2 has 1)
      pages.forEach((page: number) => {
        const pageSize = 25;
        const startIndex = pageSize * (page - 1);
        const endIndex = Math.min(pageSize * page, paginationAlerts.length);
        const alertSubset = paginationAlerts.slice(startIndex, endIndex);
        const expectedRowCount = alertSubset.length + 1; // +1 for header row

        ui.pagination
          .findControls()
          .contains(`${page}`)
          .should('be.visible')
          .click();

        // Verify the correct number of rows (alerts + header)
        cy.get('[data-qa="associated-alerts-table"]')
          .find('tr')
          .should('have.length', expectedRowCount);
      });
      // Change pagination page size to 100
      ui.pagination.findPageSizeSelect().click();

      cy.get('[data-qa-pagination-page-size-option="100"]')
        .should('exist')
        .click();
    });
  });

  it('should display appropriate message when associated alerts call fails with 500', () => {
    // Mock the alerts fetch to return an error
    mockGetAlertsForChannelIdError(notificationChannelDetails[0].id).as(
      'getAlertsForChannelIdError500'
    );
    // Navigate directly to the notification channel detail page
    cy.visitWithLogin(`/alerts/notification-channels/detail/${id}`);
    cy.wait('@getAlertNotificationChannelById');
    cy.wait('@getAlertsForChannelIdError500');
    // Verify that the URL is correct
    cy.url().should('include', `/alerts/notification-channels/detail/${id}`);
    // Verify that the appropriate message is displayed
    cy.get('[data-qa-section="Associated Alerts"]').within(() => {
      cy.findByText('Error in fetching the alerts.').should('be.visible');
    });
  });

  it('should display appropriate message when no alerts are associated with the channel', () => {
    // Mock empty alerts response
    mockGetAlertsForChannelId(id, []).as('getAlertsForChannelIdEmpty');
    // Navigate directly to the notification channel detail page
    cy.visitWithLogin(`/alerts/notification-channels/detail/${id}`);
    cy.wait('@getAlertNotificationChannelById');
    cy.wait('@getAlertsForChannelIdEmpty');
    // Verify that the URL is correct
    cy.url().should('include', `/alerts/notification-channels/detail/${id}`);
    // Verify that the appropriate message is displayed
    cy.get('[data-qa-section="Associated Alerts"]').within(() => {
      cy.findByText(
        'No alerts are associated with this notification channel.Add or assign alerts to start receiving notifications through this channel.'
      ).should('be.visible');
    });
  });

  it('should display error message when API returns an error during fetching notification channel details', () => {
    // Mock the channel fetch to return an error
    mockGetAlertChannelByIdError(id).as('getAlertNotificationChannelByIdError');
    // Navigate directly to the notification channel detail page
    cy.visitWithLogin(`/alerts/notification-channels/detail/${id}`);
    cy.wait('@getAlertNotificationChannelByIdError');
    // Verify that the URL is correct
    cy.url().should('include', `/alerts/notification-channels/detail/${id}`);
    // Verify that the appropriate error message is displayed
    cy.findByText(
      'An error occurred while loading the notification channel. Please try again later.'
    ).should('be.visible');
  });

  it('should verify for empty state when overview and details data is missing', () => {
    // Mock incomplete channel details with missing fields
    const incompleteChannelDetails = notificationChannelFactory.build({
      label: '',
      channel_type: 'email',
      created_by: '',
      updated_by: '',
      details: {},
    });
    mockGetAlertChannelById(id, incompleteChannelDetails).as(
      'getAlertNotificationChannelByIdIncomplete'
    );
    mockGetAlertsForChannelId(id, []).as('getAlertsForChannelIdEmpty');
    // Navigate directly to the notification channel detail page
    cy.visitWithLogin(`/alerts/notification-channels/detail/${id}`);
    cy.wait('@getAlertNotificationChannelByIdIncomplete');
    cy.wait('@getAlertsForChannelIdEmpty');
    // Verify that the URL is correct
    cy.url().should('include', `/alerts/notification-channels/detail/${id}`);

    // Verify Overview section handles empty fields gracefully
    cy.get('[data-qa-section="Overview"]').within(() => {
      // Verify Name field with empty label
      cy.findByText('Name:').should('be.visible');
      // Ensure no error-like values are displayed
      cy.contains('undefined').should('not.exist');
      cy.contains('null').should('not.exist');

      // Verify Channel Type displays correctly even with empty fields
      cy.findByText('Channel Type:').should('be.visible');
      cy.findByText('Email').should('be.visible');

      // Verify Created by field with empty value
      cy.findByText('Created by:').should('be.visible');
      cy.contains('undefined').should('not.exist');
      cy.contains('null').should('not.exist');

      // Verify Last Modified by field with empty value
      cy.findByText('Last Modified by:').should('be.visible');
      cy.contains('undefined').should('not.exist');
      cy.contains('null').should('not.exist');
    });

    // Verify Details section handles empty/missing recipient data gracefully
    cy.get('[data-qa-section="Details"]').within(() => {
      // Verify Recipient Type field
      cy.findByText('Recipient Type:').should('be.visible');
      cy.contains('undefined').should('not.exist');
      cy.contains('null').should('not.exist');
    });

    // Verify the page layout doesn't break with missing data
    cy.get('[data-qa-section="Overview"]').should('be.visible');
    cy.get('[data-qa-section="Details"]').should('be.visible');
  });

  it('should verify notificationChannels with long usernames list wrapping behavior', () => {
    // Create test data with very long usernames and labels
    const longUsernames = Array.from(
      { length: 50 },
      (_, i) =>
        `verylongnametestcasecheckwithsplcharsvisibleornotorwrappingup-${i + 1}`
    );
    const longUsernamesChannelDetails = notificationChannelFactory.build({
      label: 'Userlongnamerepeat123456'.repeat(5),
      channel_type: 'email',
      type: 'user',
      details: {
        email: {
          recipient_type: 'user',
          usernames: longUsernames,
        },
      },
      created_by: 'longnamerepeat123456'.repeat(5),
      updated_by: 'longnamerepeat123456'.repeat(5),
      created: '2026-01-27T06:18:00Z',
      updated: new Date().toISOString(),
    });
    mockGetAlertChannelById(id, longUsernamesChannelDetails).as(
      'getAlertNotificationChannelByIdLongUsernames'
    );

    const largeAlertList = notificationChannelAlertsFactory.buildList(100, {
      service_type: 'nodebalancer',
      label: 'longnamerepeat123456'.repeat(5),
    });

    mockGetAlertsForChannelId(id, largeAlertList).as(
      'getLargeAlertNamesForChannelId'
    );
    // Navigate directly to the notification channel detail page
    cy.visitWithLogin(`/alerts/notification-channels/detail/${id}`);
    cy.wait('@getAlertNotificationChannelByIdLongUsernames');
    cy.wait('@getLargeAlertNamesForChannelId');
    // Verify that the URL is correct
    cy.url().should('include', `/alerts/notification-channels/detail/${id}`);
    // Validate that the long label is displayed correctly
    cy.get('[data-qa-section="Overview"]').within(() => {
      cy.findByText('Name:').should('be.visible');
      cy.findByText(longUsernamesChannelDetails.label).should('be.visible');
    });
    cy.get('[data-qa-section="Details"]').within(() => {
      // Validate that all usernames are displayed correctly without overflow
      longUsernames.forEach((username) => {
        cy.get(`[data-qa-chip="${username}"]`)
          .should('have.text', username)
          .should('be.visible')
          .and(($chip) => {
            // Check that the chip does not overflow its container
            expect($chip[0].scrollWidth).to.be.lessThan(
              $chip[0].clientWidth + 1
            );
          });
      });
    });
  });

  it('should verify clicking on the alert name navigates to the alert detail page', () => {
    // Navigate directly to the notification channel detail page
    cy.visitWithLogin(`/alerts/notification-channels/detail/${id}`);
    cy.wait('@getAlertNotificationChannelById');
    cy.wait('@getAlertsForChannelId');

    // Get the first visible alert's ID from the table, then click it
    cy.get('[data-qa-alert-cell]')
      .first()
      .invoke('attr', 'data-qa-alert-cell')
      .then((cellAttr) => {
        // Extract the alert ID from the data-qa-alert-cell attribute
        const alertId = parseInt(cellAttr || '0', 10);

        // Find the corresponding alert from mockAlerts
        const clickedAlert = mockAlerts.find((alert) => alert.id === alertId);

        // Click the alert link
        cy.get('[data-qa-alert-link="true"]').first().click();

        // Verify that the URL navigates to the correct alert detail page
        cy.url().should(
          'include',
          `/alerts/definitions/detail/${clickedAlert?.service_type}/${clickedAlert?.id}`
        );
      });
  });
});
