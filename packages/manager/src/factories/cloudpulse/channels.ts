import { Factory } from '@linode/utilities';

import type { NotificationChannelEmail } from '@linode/api-v4';

export const notificationChannelFactory =
  Factory.Sync.makeFactory<NotificationChannelEmail>({
    alerts: {
      type: 'alerts-definitions',
      alert_count: 1,
      url: 'monitor/alert-channels/{id}/alerts',
    },
    channel_type: 'email',
    content: {
      email: {
        email_addresses: ['test@test.com', 'test2@test.com'],
        message: 'Alert notification',
        subject: 'Alert',
      },
    },
    details: {
      email: {
        recipient_type: 'read_write_users',
        usernames: ['test@test.com', 'test2@test.com'],
      },
    },
    created: new Date().toISOString(),
    created_by: 'user1',
    id: Factory.each((i) => i),
    label: Factory.each((id) => `Channel-${id}`),
    status: 'Enabled',
    type: 'user',
    updated: new Date().toISOString(),
    updated_by: 'user1',
  } as any);
/* 'as any' is used here to bypass strict type checking for the factory definition to ensure backward compatibility with content
 */
