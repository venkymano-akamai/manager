/**
 * @file Integration Tests for CloudPulse Alerting — Notification Channel Creation Validation
 */
import { profileFactory } from '@linode/utilities';
import { mockGetAccount, mockGetUsers } from 'support/intercepts/account';
import {
  mockCreateAlertChannelError,
  mockCreateAlertChannelSuccess,
  mockGetAlertChannels,
  mockGetAlertChannelsTypeError,
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
import { CREATE_CHANNEL_SUCCESS_MESSAGE } from 'src/features/CloudPulse/Alerts/constants';

// Define mock data for the test.

const mockAccount = accountFactory.build();
const mockProfile = profileFactory.build({
  restricted: false,
});
const notificationChannels = notificationChannelFactory.buildList(5);

// Build notification channel for creation
const createNotificationChannel = notificationChannelFactory.build({
  label: 'Test Channel Name',
  channel_type: 'email',
  content: {
    email: {
      email_addresses: ['user1', 'user2'],
      message: 'You have a new Alert',
      subject: 'Sample Alert',
    },
  },
});

// Function to check error message for a specific field
const checkErrorMessage = (field: string, message: string) => {
  cy.get(`p[role="alert"][data-qa-textfield-error-text="${field}"]`)
    .should('exist')
    .should('have.text', message);
};

describe('CloudPulse Alerting - Notification Channel Creation Validation', () => {
  /**
   * Verifies successful creation of an Email notification channel
   * Verifies error handling when channel creation API returns a server error
   * Verifies maximum recipient selection limit of 10 users
   * Verifies validation errors for missing mandatory fields
   * Verifies breadcrumb navigation behavior in Create Channel flow
   * Verifies cancel button functionality and form reset behavior
   * Verifies Select All and Deselect All recipients functionality
   * Verifies form reset behavior on page refresh
   * Verifies the payload sent to the API on channel creation
   * Verifies users call fails gracefully
   * Verifies launchdarkly feature flag behavior for select 10 max recipients
   * Verifies create notification button is not disabled when notification listing fails
   * Verifies the name field does not accept special characters and max length of 100 characters
   */
  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(mockAccount);
    mockGetProfile(mockProfile);
    mockGetAlertChannels(notificationChannels).as(
      'getAlertNotificationChannels'
    );
    mockCreateAlertChannelSuccess(createNotificationChannel).as(
      'createAlertChannelNew'
    );
    // Mock 2 users for recipient selection
    const users = [
      accountUserFactory.build({ username: 'user1' }),
      accountUserFactory.build({ username: 'user2' }),
    ];
    mockGetUsers(users).as('getAccountUsers');
    //  Visit Notification Channels page
    cy.visitWithLogin('/alerts/notification-channels');
  });
  it('should create channel successfully for email notification type and verify', () => {
    // Open Create Channel page
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Verify breadcrumb heading
    ui.breadcrumb.find().within(() => {
      cy.contains('Notification Channels').should('be.visible');
      cy.contains('Create Channel').should('be.visible');
    });

    // Verify Channel Settings heading
    ui.heading.findByText('Channel Settings').should('be.visible');

    // Select notification type (Email)
    cy.get('[data-qa-textfield-label="Type"]').should('be.visible');
    ui.autocomplete
      .findByLabel('channel-type-select')
      .should('be.visible')
      .click();
    ui.autocompletePopper.findByTitle('Email').click();

    // Enter channel name
    cy.get('[data-qa-textfield-label="Name"]').should('be.visible');
    cy.findByPlaceholderText('Enter a name for the channel')
      .should('be.visible')
      .type('Test Channel Name');

    cy.get('[data-qa-textfield-helper-text="true"]')
      .should('be.visible')
      .and('have.text', 'Select up to 10 Recipients');

    // Open recipients autocomplete and select users
    cy.get('[data-qa-textfield-label="Recipients"]').should('be.visible');
    ui.autocomplete
      .findByLabel('recipients-select')
      .should('be.visible')
      .click();
    ui.autocompletePopper.findByTitle('user1').click();
    ui.autocompletePopper.findByTitle('user2').click();

    // Verify selected chips
    cy.get('[data-tag-index]')
      .should('have.length', 2)
      .each(($chip, index) => {
        const expectedUsers = ['user1', 'user2'];
        cy.wrap($chip)
          .find('.MuiChip-label')
          .should('contain.text', expectedUsers[index]);
      });

    // Verify Cancel button is enabled
    ui.buttonGroup
      .findButtonByTitle('Cancel')
      .should('be.visible')
      .and('be.enabled');

    // Verify Submit button is enabled and click
    ui.buttonGroup
      .findButtonByTitle('Submit')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Verify successful creation via API intercept
    cy.wait('@createAlertChannelNew')
      .its('response.statusCode')
      .should('eq', 200);

    ui.toast.assertMessage(CREATE_CHANNEL_SUCCESS_MESSAGE);

    cy.wait('@getAlertNotificationChannels');

    // Verify navigation back to Notification Channels listing page
    cy.url().should('include', '/alerts/notification-channels');
    ui.tabList.find().within(() => {
      cy.get('[data-testid="Notification Channels"]').should(
        'have.text',
        'Notification Channels'
      );
    });

    // Verify the newly created channel appears in the list
    const expected = createNotificationChannel;
    cy.findByPlaceholderText('Search for Notification Channels').as(
      'searchInput'
    );
    cy.get('@searchInput').clear();
    cy.get('@searchInput').type(expected.label);

    cy.get('[data-qa="notification-channels-table"]')
      .find('tbody:visible')
      .within(() => {
        cy.get('tr').should('have.length', 1);
        cy.get('tr')
          .first()
          .within(() => {
            cy.findByText(expected.label).should('be.visible');
            cy.findByText('Email').should('be.visible');
          });
      });
  });

  it('should display server related message when API returns an error during channel creation', () => {
    mockCreateAlertChannelError('Internal Server Error', 500).as(
      'createAlertChannelServerError'
    );

    cy.visitWithLogin('/alerts/notification-channels');

    // Open Create Channel drawer
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Select notification type
    ui.autocomplete.findByLabel('channel-type-select').click();
    ui.autocompletePopper.findByTitle('Email').click();

    // Enter channel name
    cy.findByPlaceholderText('Enter a name for the channel').type(
      'Error Channel'
    );

    // Select recipients
    ui.autocomplete.findByLabel('recipients-select').click();
    ui.autocompletePopper.findByTitle('user1').click();

    // Submit form
    ui.buttonGroup.findButtonByTitle('Submit').click();

    // Wait for the intercepted API call
    cy.wait('@createAlertChannelServerError')
      .its('response.statusCode')
      .should('eq', 500);

    // Verify toast message
    ui.toast.assertMessage('Internal Server Error');
  });

  it('should display field-specific error message when API returns field error during channel creation', () => {
    mockCreateAlertChannelError(
      { field: 'label', reason: 'Duplicate labels not allowed' },
      400
    ).as('createAlertChannelServerFieldError');

    cy.visitWithLogin('/alerts/notification-channels');
    // Open Create Channel drawer
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Select notification type
    ui.autocomplete.findByLabel('channel-type-select').click();
    ui.autocompletePopper.findByTitle('Email').click();

    // Enter channel name
    cy.findByPlaceholderText('Enter a name for the channel').type(
      'Error Channel'
    );

    // Select recipients
    ui.autocomplete.findByLabel('recipients-select').click();
    ui.autocompletePopper.findByTitle('user1').click();

    // Submit form
    ui.buttonGroup.findButtonByTitle('Submit').click();

    // Wait for the intercepted API call
    cy.wait('@createAlertChannelServerFieldError')
      .its('response.statusCode')
      .should('eq', 400);

    // Verify toast message
    checkErrorMessage('Name', 'Duplicate labels not allowed');
  });

  it('should select maximum of 10 recipients when creating a notification channel', () => {
    // Test-specific intercept for 15 users
    const mockUsers = Array.from({ length: 15 }, (_, i) =>
      accountUserFactory.build({ username: `user${i + 1}` })
    );
    mockGetUsers(mockUsers).as('getAccountUsersMax10');

    cy.visitWithLogin('/alerts/notification-channels');

    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    ui.autocomplete.findByLabel('channel-type-select').click();
    ui.autocompletePopper.findByTitle('Email').click();

    cy.findByPlaceholderText('Enter a name for the channel').type(
      'Max Recipients Test'
    );

    cy.wait('@getAccountUsersMax10'); // wait for our test-specific mock

    ui.autocomplete.findByLabel('recipients-select').click();

    const usersToSelect = mockUsers.slice(0, 10); // first 10
    usersToSelect.forEach((user) => {
      ui.autocompletePopper.findByTitle(user.username).click();
    });

    // Verify 11th user is disabled
    const extraUser = mockUsers[10]; // 11th
    cy.findByRole('option', { name: extraUser.username })
      .should('exist')
      .should('have.attr', 'aria-disabled', 'true');

    // Verify chips
    cy.get('[data-tag-index]')
      .should('have.length', 10)
      .each(($chip, index) => {
        cy.wrap($chip)
          .find('.MuiChip-label')
          .should('contain.text', usersToSelect[index].username);
      });

    ui.buttonGroup
      .findButtonByTitle('Submit')
      .should('be.visible')
      .and('be.enabled')
      .click();

    ui.toast.assertMessage(CREATE_CHANNEL_SUCCESS_MESSAGE);
  });

  it('should display error messages for missing mandatory fields and various UI validations', () => {
    // Open Create Channel drawer
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    ui.buttonGroup.findButtonByTitle('Submit').should('be.enabled').click();
    checkErrorMessage('Type', 'This field is required.');

    // Select notification type
    ui.autocomplete.findByLabel('channel-type-select').click();
    ui.autocompletePopper.findByTitle('Email').click();

    // Submit without entering name and recipients
    ui.buttonGroup.findButtonByTitle('Submit').click();

    // Check for error messages for missing fields
    checkErrorMessage('Name', 'This field is required.');
    checkErrorMessage('Recipients', 'This field is required.');
  });

  it('should verify the breadcrumb navigation on Notification Channels page', () => {
    // Open Create Channel drawer
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Verify breadcrumb items
    ui.breadcrumb.find().within(() => {
      cy.contains('Notification Channels').should('be.visible');
      cy.contains('Create Channel').should('be.visible');
    });

    // Click on 'Notification Channels' breadcrumb to navigate back
    ui.breadcrumb.find().within(() => {
      cy.contains('Notification Channels').click();
    });

    // Verify navigation back to Notification Channels listing page
    cy.url().should('include', '/alerts/notification-channels');
    ui.tabList.find().within(() => {
      cy.get('[data-testid="Notification Channels"]').should(
        'have.text',
        'Notification Channels'
      );
    });
  });

  it('should verify cancel button functionality in Create Notification Channel drawer for type and entire', () => {
    // Open Create Channel drawer
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Click Cancel button
    ui.buttonGroup
      .findButtonByTitle('Cancel')
      .should('be.visible')
      .and('be.enabled')
      .click();
    // Verify navigation back to Notification Channels listing page
    cy.url().should('include', '/alerts/notification-channels');
    ui.tabList.find().within(() => {
      cy.get('[data-testid="Notification Channels"]').should(
        'have.text',
        'Notification Channels'
      );
    });

    // Reopen Create Channel drawer
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Select notification type
    ui.autocomplete.findByLabel('channel-type-select').click();
    ui.autocompletePopper.findByTitle('Email').click();

    // Enter channel name
    cy.findByPlaceholderText('Enter a name for the channel').type(
      'Cancel Button Test'
    );

    // Click Cancel button
    ui.buttonGroup
      .findButtonByTitle('Cancel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Verify navigation back to Notification Channels listing page
    cy.url().should('include', '/alerts/notification-channels');
    ui.tabList.find().within(() => {
      cy.get('[data-testid="Notification Channels"]').should(
        'have.text',
        'Notification Channels'
      );
    });

    // Reopen Create Channel drawer
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Select notification type as email and close the button
    ui.autocomplete.findByLabel('channel-type-select').click();
    ui.autocompletePopper.findByTitle('Email').click();

    // Verify channel name field is empty
    cy.get('[data-qa-textfield-label="Name"]')
      .find('input')
      .should(($input) => {
        expect($input.val() || '').to.eq('');
      });

    // Verify no recipients are selected
    cy.get('[data-qa-textfield-label="Recipients"]')
      .find('input')
      .should(($input) => {
        expect($input.val() || '').to.eq('');
      });
    // Now close the email type selected
    ui.autocomplete
      .findByLabel('channel-type-select')
      .closest('.MuiAutocomplete-root')
      .find('button[aria-label="Clear"]')
      .click();

    // Verify the form state is reset
    ui.autocomplete.findByLabel('channel-type-select').should('have.value', '');

    // Other fields should not be visible as type is not selected
    cy.findByPlaceholderText('Enter a name for the channel').should(
      'not.exist'
    );
    ui.autocomplete.findByLabel('recipients-select').should('not.exist');
  });

  it('Should verify select all/deselect all functionality for alert types in Create Notification Channel drawer', () => {
    // Test-specific intercept for 10 users
    const mockUsers = Array.from({ length: 10 }, (_, i) =>
      accountUserFactory.build({ username: `user${i + 1}` })
    );

    cy.intercept('GET', '*/account/users?*', {
      body: {
        data: mockUsers,
        page: 1,
        pages: 1,
        results: mockUsers.length,
      },
    }).as('getAccountUsersMax');

    cy.visitWithLogin('/alerts/notification-channels');

    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    ui.autocomplete.findByLabel('channel-type-select').click();
    ui.autocompletePopper.findByTitle('Email').click();

    cy.findByPlaceholderText('Enter a name for the channel').type(
      'Max Recipients Test'
    );

    cy.wait('@getAccountUsersMax'); // wait for our test-specific mock

    ui.autocomplete.findByLabel('recipients-select').click();
    ui.autocompletePopper.findByTitle('Select All').click();
    // Verify all users are selected
    cy.get('[data-tag-index]')
      .should('have.length', 10)
      .each(($chip, index) => {
        cy.wrap($chip)
          .find('.MuiChip-label')
          .should('contain.text', mockUsers[index].username);
      });

    // Click outside to close the popper
    cy.get('body').click(0, 0);
    // Now Deselect All
    ui.autocomplete.findByLabel('recipients-select').click();
    ui.autocompletePopper.findByTitle('Deselect All').click();
    // Verify no users are selected
    cy.get('[data-tag-index]').should('have.length', 0);
  });

  it('should verify refresh functionality resets the notification channels type', () => {
    // Open Create Channel drawer
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Select notification type
    ui.autocomplete.findByLabel('channel-type-select').click();
    ui.autocompletePopper.findByTitle('Email').click();

    // Enter channel name
    cy.findByPlaceholderText('Enter a name for the channel').type(
      'Refresh Functionality Test'
    );

    // Now refresh the page
    cy.reload();

    // Verify the form state is reset
    ui.autocomplete.findByLabel('channel-type-select').should('have.value', '');

    // Other fields should not be visible as type is not selected
    cy.findByPlaceholderText('Enter a name for the channel').should(
      'not.exist'
    );
    ui.autocomplete.findByLabel('recipients-select').should('not.exist');
  });

  it('should verify the payload sent to the API on creating a notification channel', () => {
    // Open Create Channel page
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Select notification type (Email)
    cy.get('[data-qa-textfield-label="Type"]').should('be.visible');
    ui.autocomplete
      .findByLabel('channel-type-select')
      .should('be.visible')
      .click();
    ui.autocompletePopper.findByTitle('Email').click();

    // Enter channel name
    cy.get('[data-qa-textfield-label="Name"]').should('be.visible');
    cy.findByPlaceholderText('Enter a name for the channel')
      .should('be.visible')
      .type('Test Channel Name');

    // Open recipients autocomplete and select users
    cy.get('[data-qa-textfield-label="Recipients"]').should('be.visible');
    ui.autocomplete
      .findByLabel('recipients-select')
      .should('be.visible')
      .click();
    ui.autocompletePopper.findByTitle('user1').click();
    ui.autocompletePopper.findByTitle('user2').click();

    // Verify selected chips
    cy.get('[data-tag-index]')
      .should('have.length', 2)
      .each(($chip, index) => {
        const expectedUsers = ['user1', 'user2'];
        cy.wrap($chip)
          .find('.MuiChip-label')
          .should('contain.text', expectedUsers[index]);
      });

    // Verify Submit button is enabled and click
    ui.buttonGroup
      .findButtonByTitle('Submit')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Verify successful creation via API intercept with payload validation
    cy.wait('@createAlertChannelNew').then((interception) => {
      // Ensure the request was captured
      expect(interception).to.have.property('request');

      // Extract request payload
      const { body: requestPayload } = interception.request;

      // Verify top-level fields
      expect(requestPayload).to.include({
        label: 'Test Channel Name',
        channel_type: 'email',
      });

      // Verify nested structure
      expect(requestPayload.details).to.have.property('email');
      expect(requestPayload.details.email.usernames).to.have.ordered.members([
        'user1',
        'user2',
      ]);
    });
  });

  it('should verify recipients listing fails gracefully when users call fails', () => {
    cy.intercept('GET', '*/account/users?*', {
      statusCode: 500,
      body: {},
    }).as('getAccountUsersError');

    cy.visitWithLogin('/alerts/notification-channels');

    // Open Create Channel drawer
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Select notification type
    ui.autocomplete.findByLabel('channel-type-select').click();
    ui.autocompletePopper.findByTitle('Email').click();

    // Enter channel name
    cy.get('[data-qa-textfield-label="Name"]').should('be.visible');
    cy.findByPlaceholderText('Enter a name for the channel')
      .should('be.visible')
      .type('Test Channel Name');

    // Open recipients autocomplete
    ui.autocomplete.findByLabel('recipients-select').click();

    // Wait for the intercepted API call
    cy.wait('@getAccountUsersError');

    // Verify error message in the recipients dropdown
    ui.autocompletePopper
      .findByTitle('You have no options to choose from')
      .should('be.visible');
  });
  it('should verify feature flag behavior for max 5 recipients selection', () => {
    mockAppendFeatureFlags(
      flagsFactory.build({
        aclpAlerting: {
          maxEmailChannelRecipients: 5,
        },
      })
    );
    // Test-specific intercept for 5 users
    const mockUsers = Array.from({ length: 10 }, (_, i) =>
      accountUserFactory.build({ username: `user${i + 1}` })
    );
    mockGetUsers(mockUsers).as('getAccountUsersNew');
    cy.visitWithLogin('/alerts/notification-channels');

    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    ui.autocomplete.findByLabel('channel-type-select').click();
    ui.autocompletePopper.findByTitle('Email').click();

    cy.findByPlaceholderText('Enter a name for the channel').type(
      'Max Recipients Test'
    );

    cy.get('[data-qa-textfield-helper-text="true"]')
      .should('be.visible')
      .and('have.text', 'Select up to 5 Recipients');

    ui.autocomplete.findByLabel('recipients-select').click();

    const usersToSelect = mockUsers.slice(0, 5); // first 5
    usersToSelect.forEach((user) => {
      ui.autocompletePopper.findByTitle(user.username).click();
    });

    // Verify 6th user is disabled
    const extraUser = accountUserFactory.build({ username: 'user6' }); // 6th
    cy.findByRole('option', { name: extraUser.username })
      .should('exist')
      .should('have.attr', 'aria-disabled', 'true');

    // Verify chips
    cy.get('[data-tag-index]')
      .should('have.length', 5)
      .each(($chip, index) => {
        cy.wrap($chip)
          .find('.MuiChip-label')
          .should('contain.text', usersToSelect[index].username);
      });

    ui.buttonGroup
      .findButtonByTitle('Submit')
      .should('be.visible')
      .and('be.enabled')
      .click();

    ui.toast.assertMessage(CREATE_CHANNEL_SUCCESS_MESSAGE);
  });
  it('should verify notification listing error doesnot disable create notification channel button', () => {
    mockGetAlertChannelsTypeError('500 Internal Server Error').as(
      'getAlertNotificationChannelsError'
    );
    cy.visitWithLogin('/alerts/notification-channels');
    // Verify Create Channel button is enabled despite listing error
    cy.wait('@getAlertNotificationChannelsError');
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled');
  });
  it('should verify the name field does not accept special characters and max length of 100 characters', () => {
    cy.visitWithLogin('/alerts/notification-channels');

    // Wait for initial data load
    // cy.wait('@getAlertNotificationChannels');
    // Open Create Channel drawer
    ui.button
      .findByTitle('Create Channel')
      .should('be.visible')
      .and('be.enabled')
      .click();

    // Select notification type
    ui.autocomplete.findByLabel('channel-type-select').click();
    ui.autocompletePopper.findByTitle('Email').click();

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
});
