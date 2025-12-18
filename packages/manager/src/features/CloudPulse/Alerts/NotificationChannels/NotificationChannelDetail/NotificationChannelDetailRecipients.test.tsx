import { screen } from '@testing-library/react';
import React from 'react';

import { notificationChannelFactory } from 'src/factories/cloudpulse/channels';
import { renderWithTheme } from 'src/utilities/testHelpers';

import { NotificationChannelRecipients } from './NotificationChannelDetailRecipients';

describe('NotificationChannelRecipients', () => {
  it('should render recipients for email channel with usernames', () => {
    const channel = notificationChannelFactory.build({
      channel_type: 'email',
      details: {
        email: {
          usernames: ['alex_martinez', 'samantha_cho', 'mike_anderson_dev'],
        },
      },
    });

    renderWithTheme(<NotificationChannelRecipients channelDetails={channel} />);

    // Verify header
    expect(screen.getByText('Settings')).toBeVisible();
    expect(screen.getByText(/Recipients/)).toBeVisible();

    // Verify all recipients are visible
    expect(screen.getByText('alex_martinez')).toBeVisible();
    expect(screen.getByText('samantha_cho')).toBeVisible();
    expect(screen.getByText('mike_anderson_dev')).toBeVisible();
  });

  it('should render with scrollable container for many recipients', () => {
    const manyUsernames = Array.from({ length: 15 }, (_, i) => `user_${i}`);
    const channel = notificationChannelFactory.build({
      channel_type: 'email',
      details: {
        email: {
          usernames: manyUsernames,
        },
      },
    });

    renderWithTheme(<NotificationChannelRecipients channelDetails={channel} />);

    // Verify all recipients are visible
    manyUsernames.forEach((username) => {
      expect(screen.getByText(username)).toBeVisible();
    });
  });
});
