/**
 * @file Integration Tests for CloudPulse Alerting — Notification Channel Listing Page
 */
import { profileFactory } from '@linode/utilities';
import { mockGetAccount } from 'support/intercepts/account';
import {
  mockDeleteChannel,
  mockDeleteChannelError,
  mockGetAlertChannels,
} from 'support/intercepts/cloudpulse';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetProfile } from 'support/intercepts/profile';
import { ui } from 'support/ui';

import {
  accountFactory,
  flagsFactory,
  notificationChannelFactory,
} from 'src/factories';
import {
  DELETE_CHANNEL_FAILED_MESSAGE,
  DELETE_CHANNEL_SUCCESS_MESSAGE,
  DELETE_CHANNEL_TOOLTIP_TEXT,
} from 'src/features/CloudPulse/Alerts/constants';
import {
  ChannelAlertsTooltipText,
  ChannelListingTableLabelMap,
} from 'src/features/CloudPulse/Alerts/NotificationChannels/NotificationsChannelsListing/constants';
import { formatDate } from 'src/utilities/formatDate';

import type { NotificationChannel } from '@linode/api-v4';

const sortOrderMap = {
  ascending: 'asc',
  descending: 'desc',
};

const LabelLookup = Object.fromEntries(
  ChannelListingTableLabelMap.map((item) => [item.colName, item.label])
);

type SortOrder = 'ascending' | 'descending';

interface VerifyChannelSortingParams {
  columnLabel: string;
  expected: number[];
  sortOrder: SortOrder;
}

const notificationChannels = notificationChannelFactory
  .buildList(26)
  .map((ch, i) => {
    const isEmail = i % 2 === 0;

    // force first email user to have 0 alerts
    const isForcedEmailUserNoAlerts = isEmail && i === 0;

    const type: 'system' | 'user' = isForcedEmailUserNoAlerts
      ? 'user'
      : isEmail
        ? i % 4 === 0
          ? 'system'
          : 'user'
        : i % 3 === 0
          ? 'user'
          : 'system';

    const numAlerts = isForcedEmailUserNoAlerts
      ? 0
      : Math.random() < 0.5
        ? 0
        : 3;

    const alerts = Array.from({ length: numAlerts }).map((_, idx) => ({
      id: idx + 1,
      label: `Alert-${idx + 1}`,
      type: 'alerts-definitions',
      url: 'Sample',
    }));

    return {
      ...ch,
      id: i + 1,
      label: `Channel-${i + 1}`,
      type,
      created_by: type,
      updated_by: type,
      channel_type: isEmail ? 'email' : 'webhook',
      updated: new Date(2024, 0, i + 1).toISOString(),
      alerts,
      content: isEmail
        ? {
            email: {
              email_addresses: [`test-${i + 1}@example.com`],
              subject: 'Test Subject',
              message: 'Test message',
            },
          }
        : {
            webhook: {
              webhook_url: `https://example.com/webhook/${i + 1}`,
              http_headers: [
                {
                  header_key: 'Authorization',
                  header_value: 'Bearer secret-token',
                },
              ],
            },
          },
    } as NotificationChannel;
  });

/**
 * Finds a notification channel by channel_type, owner type, and alerts length,
 * and returns its label.
 *
 * Throws an error if no matching channel is found.
 * This guarantees the return type is always 'NotificationChannel'.
 */
const findChannelLabel = (
  // List of all notification channels to search
  channels: NotificationChannel[],

  channelType: NotificationChannel['channel_type'],

  // Owner/type of the channel (e.g. 'user', 'system')
  channelOwnerType: NotificationChannel['type'],

  // Expected number of alerts (use 0 for "no alerts")
  alertsLength: number
): NotificationChannel => {
  // Find the first channel that matches all criteria
  const channel = channels.find(
    (ch) =>
      ch.channel_type === channelType &&
      ch.type === channelOwnerType &&
      // Special handling for zero alerts:
      // alerts may be undefined or an empty array
      (alertsLength === 0
        ? !ch.alerts || ch.alerts.length === 0
        : ch.alerts?.length === alertsLength)
  );

  // Fail fast if no matching channel is found
  if (!channel) {
    throw new Error(
      `No channel found with channel_type=${channelType}, type=${channelOwnerType}, alertsLength=${alertsLength}`
    );
  }

  // Safe to return: channel is guaranteed to exist
  return channel;
};
const { label: userChannelLabel, id: userChannelId } = findChannelLabel(
  notificationChannels,
  'email', // channel_type
  'user', // channel owner/type
  0 // alertsLength (0 = no alerts)
);

const isEmailContent = (
  content: NotificationChannel['content']
): content is {
  email: {
    email_addresses: string[];
    message: string;
    subject: string;
  };
} => content !== undefined && 'email' in content;
const mockProfile = profileFactory.build({
  timezone: 'gmt',
});

/**
 * Verifies sorting of a column in the alerts table.
 *
 * @param params - Configuration object for sorting verification.
 * @param params.columnLabel - The label of the column to sort.
 * @param params.sortOrder - Expected sorting order (ascending | descending).
 * @param params.expected - Expected row order after sorting.
 */
const VerifyChannelSortingParams = (
  columnLabel: string,
  sortOrder: 'ascending' | 'descending',
  expected: number[]
) => {
  cy.get(`[data-qa-header="${columnLabel}"]`).click({ force: true });

  cy.get(`[data-qa-header="${columnLabel}"]`)
    .invoke('attr', 'aria-sort')
    .then((current) => {
      if (current !== sortOrder) {
        cy.get(`[data-qa-header="${columnLabel}"]`).click({ force: true });
      }
    });

  cy.get(`[data-qa-header="${columnLabel}"]`).should(
    'have.attr',
    'aria-sort',
    sortOrder
  );

  cy.get('[data-qa="notification-channels-table"] tbody:last-of-type tr').then(
    ($rows) => {
      const actualOrder = $rows
        .toArray()
        .map((row) =>
          Number(row.getAttribute('data-qa-notification-channel-cell'))
        );
      expect(actualOrder).to.eqls(expected);
    }
  );

  const order = sortOrderMap[sortOrder];
  const orderBy = LabelLookup[columnLabel];

  cy.url().should(
    'endWith',
    `/alerts/notification-channels?order=${order}&orderBy=${orderBy}`
  );
};

describe('Notification Channel Listing Page', () => {
  /**
   * Validates the listing page for CloudPulse notification channels.
   * Confirms channel data rendering, search behavior, and table sorting
   * across all columns using a controlled 26-item mock dataset.
   */
  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetProfile(mockProfile);
    mockGetAccount(accountFactory.build());
    mockGetAlertChannels(notificationChannels).as(
      'getAlertNotificationChannels'
    );
    mockDeleteChannel(userChannelId).as('deleteNotificationChannel');
    cy.visitWithLogin('/alerts/notification-channels');

    ui.pagination.findPageSizeSelect().click();

    cy.get('[data-qa-pagination-page-size-option="100"]')
      .should('exist')
      .click();

    ui.tooltip.findByText(ChannelAlertsTooltipText).should('be.visible');

    cy.wait('@getAlertNotificationChannels').then(({ response }) => {
      const body = response?.body;
      const data = body?.data;

      const channels = data as NotificationChannel[];

      expect(body?.results).to.eq(notificationChannels.length);

      channels.forEach((item, index) => {
        const expected = notificationChannels[index];

        // Basic fields
        expect(item.id).to.eq(expected.id);
        expect(item.label).to.eq(expected.label);
        expect(item.type).to.eq(expected.type);
        expect(item.status).to.eq(expected.status);
        expect(item.channel_type).to.eq(expected.channel_type);

        // Creator/updater fields
        expect(item.created_by).to.eq(expected.created_by);
        expect(item.updated_by).to.eq(expected.updated_by);

        // Email content (safe narrow)
        if (isEmailContent(item.content) && isEmailContent(expected.content)) {
          expect(item.content.email.email_addresses).to.deep.eq(
            expected.content.email.email_addresses
          );
          expect(item.content.email.subject).to.eq(
            expected.content.email.subject
          );
          expect(item.content.email.message).to.eq(
            expected.content.email.message
          );
        }

        // Alerts list
        expect(item.alerts.length).to.eq(expected.alerts.length);

        item.alerts.forEach((alert, aIndex) => {
          const expAlert = expected.alerts[aIndex];

          expect(alert.id).to.eq(expAlert.id);
          expect(alert.label).to.eq(expAlert.label);
          expect(alert.type).to.eq(expAlert.type);
          expect(alert.url).to.eq(expAlert.url);
        });
      });
    });
  });

  it('searches and validates notification channel details', () => {
    cy.findByPlaceholderText('Search for Notification Channels').as(
      'searchInput'
    );

    cy.get('[data-qa="notification-channels-table"]')
      .find('tbody')
      .last()
      .within(() => {
        cy.get('tr').should('have.length', 26);
      });

    cy.get('@searchInput').clear();
    cy.get('@searchInput').type('Channel-9');
    cy.get('[data-qa="notification-channels-table"]')
      .find('tbody')
      .last()
      .within(() => {
        cy.get('tr').should('have.length', 1);

        cy.get('tr').each(($row) => {
          const expected = notificationChannels[8];

          cy.wrap($row).within(() => {
            cy.findByText(expected.label).should('be.visible');
            cy.findByText(String(expected.alerts.length)).should('be.visible');
            cy.findByText('Email').should('be.visible');
            cy.get('td').eq(3).should('have.text', expected.created_by);
            cy.findByText(
              formatDate(expected.updated, {
                format: 'MMM dd, yyyy, h:mm a',
                timezone: 'GMT',
              })
            ).should('be.visible');
            cy.get('td').eq(5).should('have.text', expected.updated_by);
          });
        });
      });
  });

  it('sorting and validates notification channel details', () => {
    const sortColumns = [
      {
        column: 'Channel Name',
        ascending: [...notificationChannels]
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((ch) => ch.id),

        descending: [...notificationChannels]
          .sort((a, b) => b.label.localeCompare(a.label))
          .map((ch) => ch.id),
      },
      {
        column: 'Alerts',
        ascending: [...notificationChannels]
          .sort((a, b) => a.alerts.length - b.alerts.length)
          .map((ch) => ch.id),

        descending: [...notificationChannels]
          .sort((a, b) => b.alerts.length - a.alerts.length)
          .map((ch) => ch.id),
      },

      {
        column: 'Channel Type',
        ascending: [...notificationChannels]
          .sort((a, b) => a.channel_type.localeCompare(b.channel_type))
          .map((ch) => ch.id),

        descending: [...notificationChannels]
          .sort((a, b) => b.channel_type.localeCompare(a.channel_type))
          .map((ch) => ch.id),
      },

      {
        column: 'Created By',
        ascending: [...notificationChannels]
          .sort((a, b) => a.created_by.localeCompare(b.created_by))
          .map((ch) => ch.id),

        descending: [...notificationChannels]
          .sort((a, b) => b.created_by.localeCompare(a.created_by))
          .map((ch) => ch.id),
      },
      {
        column: 'Last Modified',
        ascending: [...notificationChannels]
          .sort((a, b) => a.updated.localeCompare(b.updated))
          .map((ch) => ch.id),

        descending: [...notificationChannels]
          .sort((a, b) => b.updated.localeCompare(a.updated))
          .map((ch) => ch.id),
      },
      {
        column: 'Last Modified By',
        ascending: [...notificationChannels]
          .sort((a, b) => a.updated_by.localeCompare(b.updated_by))
          .map((ch) => ch.id),

        descending: [...notificationChannels]
          .sort((a, b) => b.updated_by.localeCompare(a.updated_by))
          .map((ch) => ch.id),
      },
    ];

    cy.get('[data-qa="notification-channels-table"] thead th').as('headers');

    cy.get('@headers').then(($headers) => {
      const actual = Array.from($headers)
        .map((th) => th.textContent?.trim())
        .filter(Boolean);

      expect(actual).to.deep.equal([
        'Channel Name',
        'Alerts',
        'Channel Type',
        'Created By',
        'Last Modified',
        'Last Modified By',
      ]);
    });

    sortColumns.forEach(({ column, ascending, descending }) => {
      VerifyChannelSortingParams(column, 'ascending', ascending);
      VerifyChannelSortingParams(column, 'descending', descending);
    });
  });

  it('Deletes a user-type email notification channel with no alerts', () => {
    cy.findByPlaceholderText('Search for Notification Channels').as(
      'searchInput'
    );

    cy.get('@searchInput').clear();
    cy.get('@searchInput').type(userChannelLabel);

    ui.actionMenu
      .findByTitle(`Action menu for Notification Channel ${userChannelLabel}`)
      .should('be.visible')
      .click();

    ui.actionMenuItem.findByTitle('Delete').should('be.visible').click();

    ui.dialog
      .findByTitle(`Delete ${userChannelLabel}?`)
      .should('be.visible')
      .within(() => {
        // Focus the "Alert Label" confirmation input
        cy.findByLabelText('Notification Channel Label').click();

        // Type the alert label to enable the Delete button
        cy.focused().type(userChannelLabel);

        // Click the Delete button to confirm
        ui.buttonGroup
          .findButtonByTitle('Delete')
          .should('be.enabled')
          .should('be.visible')
          .click();
      });
    ui.toast.assertMessage(DELETE_CHANNEL_SUCCESS_MESSAGE);
  });

  it('Deletes a user-type email notification channel with alerts', () => {
    // --- Arrange: Find a channel that has at least 1 alert ---
    const { label: userChannelLabel } = findChannelLabel(
      notificationChannels,
      'email', // channel_type
      'user', // owner/type
      3 // alertsLength: at least 1 alert
    );

    // --- Act: Search for the channel ---
    cy.findByPlaceholderText('Search for Notification Channels').as(
      'searchInput'
    );

    cy.get('@searchInput').clear();
    cy.get('@searchInput').type(userChannelLabel);

    // --- Act: Open action menu ---
    ui.actionMenu
      .findByTitle(`Action menu for Notification Channel ${userChannelLabel}`)
      .should('be.visible')
      .click();

    ui.tooltip.findByText(DELETE_CHANNEL_TOOLTIP_TEXT).should('be.visible');

    // --- Act: Click Delete action ---
    ui.actionMenuItem
      .findByTitle('Delete')
      .should('be.visible')
      .should('be.disabled'); // ✅ key assertion for channels with alerts
  });

  it('Ensures system-type channels never show the Delete button', () => {
    // --- User-type email channel with alerts ---
    const { label: systemChannelLabel } = findChannelLabel(
      notificationChannels,
      'email', // channel_type
      'system', // type/owner
      0 // alertsLength = 0
    );

    // --- Act: Search for the channel ---
    cy.findByPlaceholderText('Search for Notification Channels').as(
      'searchInput'
    );

    cy.get('@searchInput').clear();
    cy.get('@searchInput').type(systemChannelLabel);

    // Open action menu
    ui.actionMenu
      .findByTitle(`Action menu for Notification Channel ${systemChannelLabel}`)
      .should('be.visible')
      .click();

    // Delete button should NOT exist for system-type channels
    cy.get('div[data-qa-action-menu="true"]') // targets the opened popover
      .within(() => {
        // Assert Delete button does NOT exist
        cy.get('[data-qa-action-menu-item="Delete"]').should('not.exist');

        // Optionally assert Show Details exists
        cy.get('[data-qa-action-menu-item="Show Details"]').should(
          'be.visible'
        );
      });
  });
  it('Displays an error when deleting a notification channel fails', () => {
    const notificationChannel = notificationChannelFactory.build({
      id: 123,
      label: 'Channel-error',
      type: 'user',
      created_by: 'user',
      updated_by: 'user',
      channel_type: 'email',
      alerts: [],
    });
    const userChannelLabel = notificationChannel.label;
    mockGetAlertChannels([notificationChannel]);

    // Arrange: Mock the DELETE API to return a 500 error
    mockDeleteChannelError(123).as('deleteChannel');
    cy.visitWithLogin('/alerts/notification-channels');

    // Act: Attempt to delete the channel
    ui.actionMenu
      .findByTitle(`Action menu for Notification Channel ${userChannelLabel}`)
      .should('be.visible')
      .click();

    ui.actionMenuItem.findByTitle('Delete').should('be.visible').click();

    ui.dialog
      .findByTitle(`Delete ${userChannelLabel}?`)
      .should('be.visible')
      .within(() => {
        // Focus the "Alert Label" confirmation input
        cy.findByLabelText('Notification Channel Label').click();

        // Type the alert label to enable the Delete button
        cy.focused().type(userChannelLabel);

        // Click the Delete button to confirm
        ui.buttonGroup
          .findButtonByTitle('Delete')
          .should('be.enabled')
          .should('be.visible')
          .click();
      });
    ui.toast.assertMessage(DELETE_CHANNEL_FAILED_MESSAGE);
  });
});
