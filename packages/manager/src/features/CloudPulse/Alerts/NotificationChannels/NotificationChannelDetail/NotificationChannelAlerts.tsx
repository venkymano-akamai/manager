import { CircleProgress, Notice, Typography } from '@linode/ui';
import * as React from 'react';

import { Table } from 'src/components/Table';
import { TableBody } from 'src/components/TableBody';
import { TableHead } from 'src/components/TableHead';
import { TableRow } from 'src/components/TableRow';
import { TableRowEmpty } from 'src/components/TableRowEmpty/TableRowEmpty';
import { TableSortCell } from 'src/components/TableSortCell/TableSortCell';
import { useOrderV2 } from 'src/hooks/useOrderV2';
import { useAlertsByNotificationChannelIdQuery } from 'src/queries/cloudpulse/alerts';
import { useCloudPulseServiceTypes } from 'src/queries/cloudpulse/services';

import { getServiceTypeLabel } from '../../Utils/utils';
import { NotificationChannelAlertsTableRow } from './NotificationChannelAlertsTableRow';

import type { NotificationChannelAlerts as NotificationChannelAlertsType } from '@linode/api-v4';

interface NotificationChannelAlertsProps {
  /**
   * The ID of the notification channel to fetch alerts for.
   */
  channelId: number;
}

export const NotificationChannelAlerts = React.memo(
  (props: NotificationChannelAlertsProps) => {
    const { channelId } = props;

    const { data: serviceTypeList, isFetching } =
      useCloudPulseServiceTypes(true);
    const {
      data: channelAlerts,
      isError: isChannelAlertsError,
      isLoading: isChannelAlertsLoading,
    } = useAlertsByNotificationChannelIdQuery(channelId);

    const { handleOrderChange, order, orderBy, sortedData } =
      useOrderV2<NotificationChannelAlertsType>({
        data: channelAlerts,
        initialRoute: {
          defaultOrder: {
            order: 'asc',
            orderBy: 'label',
          },
          from: '/alerts/notification-channels/detail/$channelId',
        },
        preferenceKey: 'notification-channel-alerts',
      });

    // Check if any alert has service_type to conditionally render the column
    const hasServiceType =
      sortedData && sortedData.length > 0
        ? sortedData.some((alert) => alert.service_type)
        : false;

    if (isChannelAlertsLoading || isFetching) {
      return (
        <>
          <Typography marginBottom={2} variant="h2">
            Associated Alerts
          </Typography>
          <CircleProgress size="sm" />
        </>
      );
    }

    if (isChannelAlertsError) {
      return (
        <>
          <Typography marginBottom={2} variant="h2">
            Associated Alerts
          </Typography>
          <Typography color="error">
            Unable to load alerts for this channel.
          </Typography>
        </>
      );
    }

    return (
      <>
        <Typography marginBottom={2} variant="h2">
          Associated Alerts
        </Typography>
        {!channelAlerts?.length ? (
          <Notice variant="info">
            No alerts are associated with this notification channel.
            <br />
            Add or assign alerts to start receiving notifications through this
            channel.
          </Notice>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableSortCell
                  active={orderBy === 'label'}
                  direction={order}
                  handleClick={handleOrderChange}
                  label="label"
                >
                  Alert Name
                </TableSortCell>
                {hasServiceType && (
                  <TableSortCell
                    active={orderBy === 'service_type'}
                    direction={order}
                    handleClick={handleOrderChange}
                    label="service_type"
                  >
                    Service Type
                  </TableSortCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedData && sortedData.length > 0 ? (
                sortedData.map((alert) => (
                  <NotificationChannelAlertsTableRow
                    alert={alert}
                    hasServiceType={hasServiceType}
                    key={alert.id}
                    serviceTypeLabel={
                      hasServiceType && alert.service_type
                        ? getServiceTypeLabel(
                            alert.service_type,
                            serviceTypeList
                          )
                        : undefined
                    }
                  />
                ))
              ) : (
                <TableRowEmpty colSpan={hasServiceType ? 2 : 1} />
              )}
            </TableBody>
          </Table>
        )}
      </>
    );
  }
);
