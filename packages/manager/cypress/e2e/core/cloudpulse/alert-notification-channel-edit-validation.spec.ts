/**
 * @file Integration Tests for CloudPulse Alerting — Notification Channel Edit Validation
 */
import { profileFactory } from '@linode/utilities';
import { mockGetAccount, mockGetUsers } from 'support/intercepts/account';
import {
  mockGetAlertChannelById,
  mockGetAlertChannels,
  mockUpdateAlertChannelById,
  mockUpdateAlertChannelByIdError,
} from 'support/intercepts/cloudpulse';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetProfile } from 'support/intercepts/profile';
import { ui } from 'support/ui';

import {
  accountFactory,
  accountUserFactory,
  flagsFactory,
  notificationChannelFactory,
} from 'src/factories';
import { UPDATE_CHANNEL_SUCCESS_MESSAGE } from 'src/features/CloudPulse/Alerts/constants';

// Define mock data for the test.

const mockAccount = accountFactory.build();
const mockUsers = [
  accountUserFactory.build({ username: 'user1' }),
  accountUserFactory.build({ username: 'user2' }),
  ...accountUserFactory.buildList(6),
];
const mockProfile = profileFactory.build({
  restricted: false,
});
const notificationChannels = notificationChannelFactory.buildList(5);
const editNotificationChannel = notificationChannelFactory.build({
  label: 'Test Channel Name',
  channel_type: 'email',
  details: {
    email: {
      usernames: ['user1', 'user2'],
    },
  },
});
const { id, label } = editNotificationChannel;
const checkErrorMessage = (field: string, message: string) => {
  cy.get(`p[role="alert"][data-qa-textfield-error-text="${field}"]`)
    .should('exist')
    .should('have.text', message);
};

describe('CloudPulse Alerting - Notification Channel Edit Validation', () => {
  /**
   * Verifies successful editing of an existing email notification channel with success snackbar.
   * Verifies the payload sent to the API and the UI listing of the updated channel.
   * Verifies server error handling during channel updates.
   */
  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount);
    mockGetProfile(mockProfile);
    mockGetAlertChannels([...notificationChannels, editNotificationChannel]).as(
      'getAlertNotificationChannels'
    );
    mockGetAlertChannelById(id, editNotificationChannel).as(
      'getAlertChannelById'
    );
    mockGetUsers(mockUsers).as('getAccountUsers');
    mockUpdateAlertChannelById(id, {
      ...editNotificationChannel,
      label: 'Updated Channel Name',
    }).as('updateAlertChannelById');

    //  Visit Notification Channels page
    cy.visitWithLogin('/alerts/notification-channels');
  });
  it('should verify edit action menu allows edit of the notification channel, verify payload and UI listing', () => {
    // Wait for initial data load
    cy.wait('@getAlertNotificationChannels');

    // Select the first notification channel to edit
    ui.actionMenu
      .findByTitle('Action menu for Notification Channel ' + label)
      .click();
    ui.actionMenuItem.findByTitle('Edit').click();

    cy.wait('@getAlertChannelById');

    cy.url().should('include', '/alerts/notification-channels/edit/' + id);

    // Modify the channel label
    const newChannelLabel = 'Updated Channel Name';

    cy.findByLabelText('Type').should('be.disabled').and('have.value', 'Email');
    cy.findByLabelText('Name').clear();
    cy.findByLabelText('Name').type(newChannelLabel);

    // Click the Save button
    ui.buttonGroup
      .findButtonByTitle('Save')
      .should('be.visible')
      .should('be.enabled')
      .click();

    // Verify success toast
    ui.toast.assertMessage(UPDATE_CHANNEL_SUCCESS_MESSAGE);

    // Validate the request payload data
    cy.wait('@updateAlertChannelById').then((interception) => {
      expect(interception)
        .to.have.property('response')
        .with.property('statusCode', 200);

      const payload = interception.request.body;

      // Top-level fields
      expect(payload.label).to.equal(newChannelLabel);

      // Email details validation
      expect(payload.details).to.have.property('email');
      expect(payload.details.email.usernames).to.have.length(2);

      const expectedRecipients = ['user1', 'user2'];

      expectedRecipients.forEach((username, index) => {
        expect(payload.details.email.usernames[index]).to.equal(username);
      });
    });

    // Verify navigation back to Notification Channels listing page
    cy.url().should('include', '/alerts/notification-channels');
    ui.tabList.find().within(() => {
      cy.get('[data-testid="Notification Channels"]').should(
        'have.text',
        'Notification Channels'
      );
    });

    cy.findByPlaceholderText('Search for Notification Channels').as(
      'searchInput'
    );
    cy.get('@searchInput').clear();
    cy.get('@searchInput').type(newChannelLabel);

    cy.get('[data-qa="notification-channels-table"]')
      .find('tbody:visible')
      .within(() => {
        cy.get('tr').should('have.length', 1);
        cy.get('tr')
          .first()
          .within(() => {
            cy.findByText(newChannelLabel).should('be.visible');
            cy.findByText('Email').should('be.visible');
          });
      });
  });
  it('should display server error when editing a notification channel fails', () => {
    // Simulate server error on update
    mockUpdateAlertChannelByIdError(id, 'Internal server error').as(
      'updateAlertChannelByIdError'
    );
    cy.visitWithLogin('/alerts/notification-channels');
    // Wait for initial data load
    cy.wait('@getAlertNotificationChannels');

    // Select the first notification channel to edit
    ui.actionMenu
      .findByTitle('Action menu for Notification Channel ' + label)
      .click();
    ui.actionMenuItem.findByTitle('Edit').click();

    cy.wait('@getAlertChannelById');

    // Modify the channel label
    const newChannelLabel = 'Updated Channel Name';
    cy.findByLabelText('Name').clear();
    cy.findByLabelText('Name').type(newChannelLabel);

    // Click the Save button
    ui.buttonGroup
      .findButtonByTitle('Save')
      .should('be.visible')
      .should('be.enabled')
      .click();

    ui.toast.assertMessage('Internal server error');

    cy.url().should('include', '/alerts/notification-channels/edit/' + id);
  });
  it('should verify that edit of the usernames in email notification channel works correctly', () => {
    const editNotificationChannel = notificationChannelFactory.build({
      label: 'Test Channel Name',
      channel_type: 'email',
      details: {
        email: {
          usernames: ['user-3', 'user-4'],
        },
      },
    });
    const { id, label } = editNotificationChannel;
    mockGetAlertChannels([...notificationChannels, editNotificationChannel]).as(
      'getAlertNotificationChannelsNew'
    );

    const updatedNotificationChannel = {
      ...editNotificationChannel,
      details: {
        email: {
          ...(
            editNotificationChannel.details as {
              email: { recipient_type?: string; usernames: string[] };
            }
          ).email,
          usernames: ['user1', 'user2'],
        },
      },
    } as typeof editNotificationChannel;

    mockUpdateAlertChannelById(id, updatedNotificationChannel).as(
      'updateAlertChannelByUsers'
    );
    mockGetAlertChannelById(id, editNotificationChannel).as(
      'getAlertChannelByIdNew'
    );

    cy.visitWithLogin('/alerts/notification-channels');

    // Wait for initial data load
    cy.wait('@getAlertNotificationChannelsNew');

    // Select the notification channel to edit
    ui.actionMenu
      .findByTitle('Action menu for Notification Channel ' + label)
      .click();
    ui.actionMenuItem.findByTitle('Edit').click();

    cy.wait('@getAlertChannelByIdNew');
    cy.findByLabelText('Recipients').should('be.visible').click();

    ['user-3', 'user-4'].forEach((user) => {
      cy.contains('.MuiChip-label', user)
        .should('be.visible')
        .parents('.MuiChip-root')
        .find('.MuiChip-deleteIcon')
        .click();
    });

    ui.autocompletePopper.findByTitle('user1').click();
    ui.autocompletePopper.findByTitle('user2').click();

    // Click the Save button
    ui.buttonGroup
      .findButtonByTitle('Save')
      .should('be.visible')
      .should('be.enabled')
      .click();

    ui.toast.assertMessage(UPDATE_CHANNEL_SUCCESS_MESSAGE);

    cy.wait('@updateAlertChannelByUsers').then((interception) => {
      expect(interception)
        .to.have.property('response')
        .with.property('statusCode', 200);

      const payload = interception.request.body;

      // Top-level fields
      expect(payload.label).to.equal(label);

      // Email details validation
      expect(payload.details).to.have.property('email');
      // verify label unchanged
      expect(payload.label).to.have.string('Test Channel Name');
      expect(payload.details.email.usernames).to.have.length(2);

      const expectedRecipients = ['user1', 'user2'];

      expectedRecipients.forEach((username, index) => {
        expect(payload.details.email.usernames[index]).to.equal(username);
      });
    });
  });
  it('should verify the name field does not accept special characters and max length of 100 characters', () => {
    cy.visitWithLogin('/alerts/notification-channels');

    // Wait for initial data load
    cy.wait('@getAlertNotificationChannels');

    // Select the notification channel to edit
    ui.actionMenu
      .findByTitle('Action menu for Notification Channel ' + label)
      .click();
    ui.actionMenuItem.findByTitle('Edit').click();

    // Test special characters
    cy.findByLabelText('Name').clear();
    cy.findByLabelText('Name').type('Test@Channel#Name!');

    cy.get('body').click(0, 0);

    checkErrorMessage(
      'Name',
      'Name cannot contain special characters: * # & + : < > ? @ % { } \\ /.'
    );

    // Test special characters
    cy.findByLabelText('Name').clear();
    cy.findByLabelText('Name').type('[]');

    cy.get('body').click(0, 0);

    checkErrorMessage(
      'Name',
      'Name cannot start or end with a special character.'
    );

    // Test max length
    cy.findByLabelText('Name').clear();
    cy.findByLabelText('Name').type(
      'ThisChannelNameIsWayTooLongAndExceedsThanHundredCharacterLimitSetThisChannelNameIsWayTooLongAndExceedsThanHundredCharacterLimitSet'
    );

    cy.get('body').click(0, 0);

    checkErrorMessage('Name', 'Name must be 100 characters or less.');
  });
  it('should verify the system alerts does not have edit action menu', () => {
    const editNotificationSystemChannel = notificationChannelFactory.build({
      label: 'Test System Channel',
      channel_type: 'email',
      details: {
        email: {
          usernames: ['user-3', 'user-4'],
        },
      },
      type: 'system',
    });
    const { label } = editNotificationSystemChannel;
    mockGetAlertChannels([
      ...notificationChannels,
      editNotificationSystemChannel,
    ]).as('getAlertNotificationChannelsNew');

    cy.visitWithLogin('/alerts/notification-channels');

    // Wait for initial data load
    cy.wait('@getAlertNotificationChannelsNew');

    // Select the notification channel to edit
    ui.actionMenu
      .findByTitle('Action menu for Notification Channel ' + label)
      .click();
    // Assert Edit is NOT present in the action menu
    cy.get('[data-qa-action-menu="true"]')
      .find('[data-qa-action-menu-item="Edit"]')
      .should('not.exist');
  });
  it('should display error messages for missing mandatory fields ', () => {
    // Select the notification channel to edit
    ui.actionMenu
      .findByTitle('Action menu for Notification Channel ' + label)
      .click();
    ui.actionMenuItem.findByTitle('Edit').click();

    cy.findByLabelText('Name').clear();
    cy.get('body').click(0, 0);
    checkErrorMessage('Name', 'This field is required.');

    cy.findByLabelText('Recipients').click();
    ui.button.findByAttribute('aria-label', 'Clear').click();
    cy.get('body').click(0, 0);
    checkErrorMessage('Recipients', 'This field is required.');
  });
  it('should prefill recipients correctly when selected users are far down the list (requires scrolling)', () => {
    const editNotificationChannel = notificationChannelFactory.build({
      label: 'Test Channel Name',
      channel_type: 'email',
      details: {
        email: {
          usernames: ['user-90', 'user-92'],
        },
      },
    });
    const { id, label } = editNotificationChannel;
    const mockUsers = [...accountUserFactory.buildList(100)];
    mockGetUsers(mockUsers).as('get100AccountUsers');
    mockGetAlertChannels([...notificationChannels, editNotificationChannel]).as(
      'getAlertNotificationChannelsNew'
    );

    mockGetAlertChannelById(id, editNotificationChannel).as(
      'getAlertChannelByIdNew'
    );

    cy.visitWithLogin('/alerts/notification-channels');
    // Wait for initial data load
    cy.wait('@getAlertNotificationChannelsNew');

    // Select the notification channel to edit
    ui.actionMenu
      .findByTitle('Action menu for Notification Channel ' + label)
      .click();
    ui.actionMenuItem.findByTitle('Edit').click();
    cy.wait('@getAlertChannelByIdNew');

    // Verify that type is email
    cy.findByLabelText('Type').should('be.disabled').and('have.value', 'Email');

    // Verify that label is correct
    cy.findByLabelText('Name')
      .should('be.visible')
      .and('have.value', 'Test Channel Name');

    // Verify that recipients are correctly selected,
    cy.findByLabelText('Recipients').click();
    cy.get('[data-tag-index]')
      .should('have.length', 2)
      .each(($chip, index) => {
        const expectedUsers = ['user-90', 'user-92'];
        cy.wrap($chip)
          .find('.MuiChip-label')
          .should('contain.text', expectedUsers[index]);
      });
  });
  it('should verify maximum recipients selection when removing and adding in edit flow', () => {
    const existingRecipients = Array.from(
      { length: 10 },
      (_, i) => `user-${i + 1}`
    );

    const editNotificationChannel = notificationChannelFactory.build({
      label: 'Test Channel Max Recipients Edit',
      channel_type: 'email',
      details: {
        email: {
          usernames: existingRecipients,
        },
      },
    });
    const { id, label } = editNotificationChannel;

    const mockUsers = Array.from({ length: 15 }, (_, i) =>
      accountUserFactory.build({ username: `user-${i + 1}` })
    );

    mockGetUsers(mockUsers).as('getAccountUsers');
    mockGetAlertChannels([...notificationChannels, editNotificationChannel]).as(
      'getAlertNotificationChannels'
    );
    mockGetAlertChannelById(id, editNotificationChannel).as(
      'getAlertChannelById'
    );
    mockUpdateAlertChannelById(id, {
      ...editNotificationChannel,
      label: 'Updated Channel Name',
    }).as('updateAlertChannelById');

    cy.visitWithLogin('/alerts/notification-channels');
    cy.wait('@getAlertNotificationChannels');

    ui.actionMenu
      .findByTitle('Action menu for Notification Channel ' + label)
      .click();
    ui.actionMenuItem.findByTitle('Edit').click();

    cy.wait('@getAlertChannelById');
    cy.wait('@getAccountUsers');

    cy.findByLabelText('Recipients').click();

    // Verify we start with 10 recipients
    cy.get('[data-tag-index]').should('have.length', 10);

    // Verify that user-11 is disabled
    cy.findByRole('option', { name: 'user-11' })
      .should('exist')
      .should('have.attr', 'aria-disabled', 'true');

    // Remove one recipient
    cy.contains('.MuiChip-label', 'user-1')
      .should('be.visible')
      .parents('.MuiChip-root')
      .find('.MuiChip-deleteIcon')
      .click();

    // Verify we now have 9 recipients
    cy.get('[data-tag-index]').should('have.length', 9);

    // Now we should be able to add user-11
    ui.autocompletePopper.findByTitle('user-11').click();

    // Verify we're back to 10 recipients
    cy.get('[data-tag-index]').should('have.length', 10);

    // Wait for the dropdown options to re-render and verify user-12 is now disabled again

    cy.findByRole('option', { name: 'user-12' })
      .should('exist')
      .should('have.attr', 'aria-disabled', 'true');

    // Click the Save button
    ui.buttonGroup
      .findButtonByTitle('Save')
      .should('be.visible')
      .should('be.enabled')
      .click();

    // Verify success toast
    ui.toast.assertMessage(UPDATE_CHANNEL_SUCCESS_MESSAGE);
  });
  it('should display field-specific error message when API returns field error during channel update - Name', () => {
    const editNotificationChannel = notificationChannelFactory.build({
      label: 'Test Channel Name',
      channel_type: 'email',
      details: {
        email: {
          usernames: ['user-2', 'user-3'],
        },
      },
    });
    const { id, label } = editNotificationChannel;
    mockGetAlertChannels([...notificationChannels, editNotificationChannel]).as(
      'getAlertNotificationChannelsNewList'
    );

    mockGetAlertChannelById(id, editNotificationChannel).as(
      'getAlertChannelById'
    );
    // Mock the update API to return a field-specific error
    mockUpdateAlertChannelByIdError(
      id,
      { field: 'label', reason: 'Duplicate labels not allowed' },
      400
    ).as('updateAlertChannelServerFieldError');

    cy.visitWithLogin('/alerts/notification-channels');
    cy.wait('@getAlertNotificationChannelsNewList');

    // Navigate to edit page
    ui.actionMenu
      .findByTitle('Action menu for Notification Channel ' + label)
      .click();
    ui.actionMenuItem.findByTitle('Edit').click();

    cy.wait('@getAlertChannelById');

    // Verify we're on the edit page
    cy.url().should('include', '/alerts/notification-channels/edit/' + id);

    // Modify the channel name to trigger duplicate error
    cy.findByLabelText('Name').clear();
    cy.findByLabelText('Name').type('Duplicate Channel Name');

    // Click Save button
    ui.buttonGroup
      .findButtonByTitle('Save')
      .should('be.visible')
      .should('be.enabled')
      .click();

    // Wait for the intercepted API call
    cy.wait('@updateAlertChannelServerFieldError')
      .its('response.statusCode')
      .should('eq', 400);

    // Verify field-specific error message appears
    checkErrorMessage('Name', 'Duplicate labels not allowed');

    // Verify user remains on edit page (no redirect)
    cy.url().should('include', '/alerts/notification-channels/edit/' + id);

    // Verify form is still editable
    cy.findByLabelText('Name')
      .should('be.enabled')
      .and('have.value', 'Duplicate Channel Name');
  });
  it('should display field-specific error message when API returns field error during channel update - Recipients', () => {
    const editNotificationChannel = notificationChannelFactory.build({
      label: 'Test Channel Name',
      channel_type: 'email',
      details: {
        email: {
          usernames: ['user1', 'user2'],
        },
      },
    });
    const { id, label } = editNotificationChannel;
    mockGetAlertChannels([...notificationChannels, editNotificationChannel]).as(
      'getAlertNotificationChannelsNewList'
    );

    mockGetAlertChannelById(id, editNotificationChannel).as(
      'getAlertChannelById'
    );
    // Mock the update API to return a field-specific error
    mockUpdateAlertChannelByIdError(
      id,
      { field: 'details.email.usernames', reason: 'Invalid recipients' },
      400
    ).as('updateAlertChannelServerFieldError');

    cy.visitWithLogin('/alerts/notification-channels');
    cy.wait('@getAlertNotificationChannelsNewList');

    // Navigate to edit page
    ui.actionMenu
      .findByTitle('Action menu for Notification Channel ' + label)
      .click();
    ui.actionMenuItem.findByTitle('Edit').click();

    cy.wait('@getAlertChannelById');

    // Verify we're on the edit page
    cy.url().should('include', '/alerts/notification-channels/edit/' + id);

    // Modify the recipients to trigger error
    cy.findByLabelText('Recipients').click();

    // Click Save button
    ui.buttonGroup
      .findButtonByTitle('Save')
      .should('be.visible')
      .should('be.enabled')
      .click();

    // Wait for the intercepted API call
    cy.wait('@updateAlertChannelServerFieldError')
      .its('response.statusCode')
      .should('eq', 400);

    // Verify field-specific error message appears
    checkErrorMessage('Recipients', 'Invalid recipients');

    // Verify user remains on edit page (no redirect)
    cy.url().should('include', '/alerts/notification-channels/edit/' + id);
  });

  it('should verify the proper error message is displayed when recipients call fails with server error', () => {
    // Mock Get Users API to return 500 error
    cy.intercept('GET', '*/account/users?*', {
      statusCode: 500,
      body: {},
    }).as('getAccountUsersError');
    cy.visitWithLogin('/alerts/notification-channels');
    // Wait for initial data load
    cy.wait('@getAlertNotificationChannels');
    // Select the Edit notification channel to edit
    ui.actionMenu
      .findByTitle('Action menu for Notification Channel ' + label)
      .click();
    ui.actionMenuItem.findByTitle('Edit').click();

    // Wait for Get Users API call
    cy.wait('@getAccountUsersError');

    // Verify error message is displayed in Recipients field
    cy.findByLabelText('Recipients').click();

    checkErrorMessage('Recipients', 'Failed to fetch the users.');

    // Close the Recipients dropdown
    cy.get('body').click(0, 0);

    ui.buttonGroup
      .findButtonByTitle('Save')
      .should('be.visible')
      .should('be.enabled')
      .click();

    checkErrorMessage('Recipients', 'This field is required.');
  });
  it('should verify for wrong id in direct edit url', () => {
    const wrongId = 9999999;

    // Stub GET request for non-existent channel to return 404
    cy.intercept('GET', `*/monitor/alert-channels/${wrongId}`, {
      statusCode: 404,
      body: { errors: [{ reason: 'Not found' }] },
    }).as('getAlertChannelByWrongId');

    cy.visitWithLogin('/alerts/notification-channels/edit/' + wrongId);

    cy.wait('@getAlertChannelByWrongId');

    // Verify for error msg
    cy.get('h3[data-qa-error-msg="true"]')
      .should('be.visible')
      .and(
        'have.text',
        'An error occurred while loading the notification channel. Please try again later.'
      );
  });
});
