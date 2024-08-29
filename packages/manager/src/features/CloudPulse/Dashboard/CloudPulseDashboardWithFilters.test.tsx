import { fireEvent } from '@testing-library/react';
import React from 'react';

import { dashboardFactory } from 'src/factories';
import { renderWithTheme } from 'src/utilities/testHelpers';

import { CloudPulseDashboardWithFilters } from './CloudPulseDashboardWithFilters';

const queryMocks = vi.hoisted(() => ({
  useCloudPulseDashboardByIdQuery: vi.fn().mockReturnValue({}),
}));

const selectTimeDurationPlaceholder = 'Select Time Duration';
const circleProgress = 'circle-progress';
const mandatoryFiltersError = 'Mandatory Filters not Selected';
const customNodeTypePlaceholder = 'Select Node Type';

vi.mock('src/queries/cloudpulse/dashboards', async () => {
  const actual = await vi.importActual('src/queries/cloudpulse/dashboards');
  return {
    ...actual,
    useCloudPulseDashboardByIdQuery: queryMocks.useCloudPulseDashboardByIdQuery,
  };
});
const mockDashboard = dashboardFactory.build();

queryMocks.useCloudPulseDashboardByIdQuery.mockReturnValue({
  data: {
    data: mockDashboard,
  },
  error: false,
  isLoading: false,
});

describe('CloudPulseDashboardWithFilters component tests', () => {
  it('renders a CloudPulseDashboardWithFilters component with error placeholder', () => {
    queryMocks.useCloudPulseDashboardByIdQuery.mockReturnValue({
      data: {
        data: mockDashboard,
      },
      error: false,
      isError: true,
      isLoading: false,
    });

    const screen = renderWithTheme(
      <CloudPulseDashboardWithFilters dashboardId={1} resource={1} />
    );

    expect(
      screen.getByText('Error while loading Dashboard with Id - 1')
    ).toBeDefined();
  });

  it('renders a CloudPulseDashboardWithFilters component successfully without error placeholders', () => {
    queryMocks.useCloudPulseDashboardByIdQuery.mockReturnValue({
      data: mockDashboard,
      error: false,
      isError: false,
      isLoading: false,
    });

    const screen = renderWithTheme(
      <CloudPulseDashboardWithFilters dashboardId={1} resource={1} />
    );

    expect(screen.getByText(selectTimeDurationPlaceholder)).toBeDefined();
    expect(screen.getByTestId(circleProgress)).toBeDefined(); // the dashboards started to render
  });

  it('renders a CloudPulseDashboardWithFilters component successfully for dbaas', () => {
    queryMocks.useCloudPulseDashboardByIdQuery.mockReturnValue({
      data: { ...mockDashboard, service_type: 'dbaas' },
      error: false,
      isError: false,
      isLoading: false,
    });

    const screen = renderWithTheme(
      <CloudPulseDashboardWithFilters dashboardId={1} resource={1} />
    );

    expect(screen.getByText(selectTimeDurationPlaceholder)).toBeDefined();
    expect(screen.getByTestId(circleProgress)).toBeDefined(); // the dashboards started to render
  });

  it('renders a CloudPulseDashboardWithFilters component with mandatory filter error for dbaas', () => {
    queryMocks.useCloudPulseDashboardByIdQuery.mockReturnValue({
      data: { ...mockDashboard, service_type: 'dbaas' },
      error: false,
      isError: false,
      isLoading: false,
    });

    const screen = renderWithTheme(
      <CloudPulseDashboardWithFilters dashboardId={1} resource={1} />
    );

    expect(screen.getByTestId('CloseIcon')).toBeDefined();

    const inputBox = screen.getByPlaceholderText(customNodeTypePlaceholder);
    fireEvent.change(inputBox, { target: { value: '' } }); // clear the value
    expect(screen.getByText(mandatoryFiltersError)).toBeDefined();
  });
});
