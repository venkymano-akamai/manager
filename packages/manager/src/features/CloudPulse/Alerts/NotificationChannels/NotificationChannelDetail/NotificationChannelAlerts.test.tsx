import { screen } from '@testing-library/react';
import React from 'react';

import { notificationChannelAlertsFactory } from 'src/factories/cloudpulse/channels';
import { serviceTypesFactory } from 'src/factories/cloudpulse/services';
import { renderWithTheme } from 'src/utilities/testHelpers';

import { NotificationChannelAlerts } from './NotificationChannelAlerts';

const queryMocks = vi.hoisted(() => ({
  useAllAlertsByNotificationChannelIdQuery: vi.fn(),
  useCloudPulseServiceTypes: vi.fn(),
}));

const hookMocks = vi.hoisted(() => ({
  useFlags: vi.fn(),
  useOrderV2: vi.fn(),
}));

vi.mock('src/queries/cloudpulse/alerts', () => ({
  useAllAlertsByNotificationChannelIdQuery:
    queryMocks.useAllAlertsByNotificationChannelIdQuery,
}));

vi.mock('src/queries/cloudpulse/services', () => ({
  useCloudPulseServiceTypes: queryMocks.useCloudPulseServiceTypes,
}));

vi.mock('src/hooks/useFlags', () => ({
  useFlags: hookMocks.useFlags,
}));

vi.mock('src/hooks/useOrderV2', () => ({
  useOrderV2: hookMocks.useOrderV2,
}));

describe('NotificationChannelAlerts', () => {
  const mockServiceTypes = serviceTypesFactory.buildList(3);
  const associatedAlertsText = 'Associated Alerts';
  const alertNameText = 'Alert Name';
  const serviceTypeText = 'Service';

  beforeEach(() => {
    hookMocks.useFlags.mockReturnValue({
      aclpServices: {
        dbaas: { alerts: { enabled: true } },
        linode: { alerts: { enabled: true } },
      },
    });

    queryMocks.useCloudPulseServiceTypes.mockReturnValue({
      data: {
        data: mockServiceTypes,
      },
      isServiceTypesLoading: false,
    });

    hookMocks.useOrderV2.mockReturnValue({
      handleOrderChange: vi.fn(),
      order: 'asc',
      orderBy: 'label',
      sortedData: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state while fetching alerts', () => {
    queryMocks.useAllAlertsByNotificationChannelIdQuery.mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: true,
    });

    renderWithTheme(<NotificationChannelAlerts channelId={1} />);

    expect(screen.getByText(associatedAlertsText)).toBeVisible();
    expect(screen.getByTestId('table-row-loading')).toBeInTheDocument();
  });

  it('should render error state when alerts query fails', () => {
    const mockError = [{ reason: 'Error loading alerts' }];

    queryMocks.useAllAlertsByNotificationChannelIdQuery.mockReturnValue({
      data: undefined,
      error: mockError,
      isError: true,
      isLoading: false,
    });

    renderWithTheme(<NotificationChannelAlerts channelId={1} />);

    expect(screen.getByText(associatedAlertsText)).toBeVisible();
    expect(screen.getByText('Error loading alerts')).toBeVisible();
  });

  it('should render notice when no alerts are associated', () => {
    queryMocks.useAllAlertsByNotificationChannelIdQuery.mockReturnValue({
      data: [],
      error: undefined,
      isError: false,
      isLoading: false,
    });

    renderWithTheme(<NotificationChannelAlerts channelId={1} />);

    expect(screen.getByText(associatedAlertsText)).toBeVisible();
    expect(
      screen.getByText(
        /No alerts are associated with this notification channel./
      )
    ).toBeVisible();
    expect(
      screen.getByText(
        /Add or assign alerts to start receiving notifications through this channel./
      )
    ).toBeVisible();
  });

  it('should render alerts with multiple service types correctly', () => {
    const alerts = [
      ...notificationChannelAlertsFactory.buildList(2, {
        service_type: 'linode',
      }),
      ...notificationChannelAlertsFactory.buildList(2, {
        service_type: 'dbaas',
      }),
    ];

    const alertsWithServiceLabel = alerts.map((alert) => ({
      ...alert,
      service_type_label: mockServiceTypes.find(
        (st) => st.service_type === alert.service_type
      )?.label,
    }));

    queryMocks.useAllAlertsByNotificationChannelIdQuery.mockReturnValue({
      data: alerts,
      error: undefined,
      isError: false,
      isLoading: false,
    });

    hookMocks.useOrderV2.mockReturnValue({
      handleOrderChange: vi.fn(),
      order: 'asc',
      orderBy: 'label',
      sortedData: alertsWithServiceLabel,
    });

    renderWithTheme(<NotificationChannelAlerts channelId={1} />);

    expect(screen.getByText(associatedAlertsText)).toBeVisible();
    expect(screen.getByText(alertNameText)).toBeVisible();
    expect(screen.getByText(serviceTypeText)).toBeVisible();

    alerts.forEach((alert) => {
      expect(screen.getByText(alert.label)).toBeVisible();
    });
  });
});
