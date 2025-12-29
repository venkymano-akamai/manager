import { Chip } from '@mui/material';
import * as React from 'react';

import { shouldUseContentsForEmail } from '../../Utils/utils';

import type { NotificationChannel } from '@linode/api-v4';

interface RenderChannelDetailProps {
  /**
   * Notification Channel with the data to be shown in the component
   */
  template: NotificationChannel;
}
export const RenderChannelDetails = (props: RenderChannelDetailProps) => {
  const { template } = props;
  if (template.channel_type === 'email') {
    const contentEmail = template.content?.email;
    const detailEmail = template.details?.email;
    const useDetails = shouldUseContentsForEmail(template);

    const recipients = useDetails
      ? (detailEmail?.usernames ?? [])
      : (contentEmail?.email_addresses ?? []);

    return (
      <>
        {recipients.map((value, index) => (
          <Chip key={index} label={value} />
        ))}
      </>
    );
  }
  return null;
};
