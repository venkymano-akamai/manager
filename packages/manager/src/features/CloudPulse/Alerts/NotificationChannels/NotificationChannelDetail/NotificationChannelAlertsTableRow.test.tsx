import { screen } from '@testing-library/react';
import React from 'react';

import { notificationChannelAlertsFactory } from 'src/factories/cloudpulse/channels';
import { renderWithTheme, wrapWithTableBody } from 'src/utilities/testHelpers';

import { NotificationChannelAlertsTableRow } from './NotificationChannelAlertsTableRow';

describe('NotificationChannelAlertsTableRow', () => {
  const testAlertNoService = 'Test Alert No Service';

  it('should render alert with link when service_type is present', () => {
    const alert = notificationChannelAlertsFactory.build({
      id: 1,
      label: 'Test Alert',
      service_type: 'linode',
    });

    renderWithTheme(
      wrapWithTableBody(
        <NotificationChannelAlertsTableRow
          alert={alert}
          hasServiceType={true}
          serviceTypeLabel="Linode"
        />
      )
    );

    const link = screen.getByRole('link', { name: 'Test Alert' });
    expect(link).toBeVisible();
    expect(link).toHaveAttribute('href', '/alerts/definitions/detail/linode/1');
    expect(screen.getByText('Linode')).toBeVisible();
  });

  it('should render alert without link when service_type is absent', () => {
    const alert = notificationChannelAlertsFactory.build({
      id: 2,
      label: testAlertNoService,
      service_type: undefined,
    });

    renderWithTheme(
      wrapWithTableBody(
        <NotificationChannelAlertsTableRow
          alert={alert}
          hasServiceType={false}
        />
      )
    );

    expect(screen.getByText(testAlertNoService)).toBeVisible();
    expect(
      screen.queryByRole('link', { name: testAlertNoService })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Linode')).not.toBeInTheDocument();
  });

  it('should not render Service Type cell when hasServiceType is false', () => {
    const alert = notificationChannelAlertsFactory.build({
      id: 3,
      label: 'Another Alert',
      service_type: undefined,
    });

    renderWithTheme(
      wrapWithTableBody(
        <NotificationChannelAlertsTableRow
          alert={alert}
          hasServiceType={false}
        />
      )
    );

    // Should only have one cell (Alert Name)
    expect(screen.getAllByRole('cell')).toHaveLength(1);
  });

  it('should render Service Type cell when hasServiceType is true', () => {
    const alert = notificationChannelAlertsFactory.build({
      id: 4,
      label: 'Service Alert',
      service_type: 'dbaas',
    });

    renderWithTheme(
      wrapWithTableBody(
        <NotificationChannelAlertsTableRow
          alert={alert}
          hasServiceType={true}
          serviceTypeLabel="Managed Databases"
        />
      )
    );

    // Should have two cells (Alert Name and Service Type)
    expect(screen.getAllByRole('cell')).toHaveLength(2);
    expect(screen.getByText('Managed Databases')).toBeVisible();
  });

  it('should render correct data-qa attributes', () => {
    const alert = notificationChannelAlertsFactory.build({
      id: 5,
      label: 'QA Test Alert',
      service_type: 'linode',
    });

    renderWithTheme(
      wrapWithTableBody(
        <NotificationChannelAlertsTableRow
          alert={alert}
          hasServiceType={true}
          serviceTypeLabel="Linode"
        />
      )
    );

    expect(screen.getByTestId('table-row-5')).toBeVisible();

    const link = screen.getByRole('link', { name: 'QA Test Alert' });
    expect(link).toHaveAttribute('data-qa-alert-link', 'true');
  });

  it('should render multiple service types correctly', () => {
    const linodeAlert = notificationChannelAlertsFactory.build({
      id: 7,
      label: 'Linode Alert',
      service_type: 'linode',
    });

    const dbaasAlert = notificationChannelAlertsFactory.build({
      id: 8,
      label: 'Database Alert',
      service_type: 'dbaas',
    });

    const { rerender } = renderWithTheme(
      wrapWithTableBody(
        <NotificationChannelAlertsTableRow
          alert={linodeAlert}
          hasServiceType={true}
          serviceTypeLabel="Linode"
        />
      )
    );

    expect(screen.getByText('Linode Alert')).toBeVisible();
    expect(screen.getByText('Linode')).toBeVisible();

    rerender(
      wrapWithTableBody(
        <NotificationChannelAlertsTableRow
          alert={dbaasAlert}
          hasServiceType={true}
          serviceTypeLabel="Managed Databases"
        />
      )
    );

    expect(screen.getByText('Database Alert')).toBeVisible();
    expect(screen.getByText('Managed Databases')).toBeVisible();
  });
});
