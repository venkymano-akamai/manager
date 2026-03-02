import * as React from 'react';

import { CloudPulseContext } from './CloudPulseContext';

import type { FilterData } from '../Dashboard/CloudPulseDashboardLanding';
import type { Dashboard } from '@linode/api-v4';

interface CloudPulseProviderProps {
  children: React.ReactNode;
}

export const CloudPulseContextProvider = ({
  children,
}: CloudPulseProviderProps) => {
  const globalFilterData = React.useRef<FilterData | undefined>(undefined);
  const selectedDashboard = React.useRef<Dashboard | undefined>(undefined);

  const setGlobalFilterData = React.useCallback((filterData: FilterData) => {
    globalFilterData.current = filterData;
  }, []);

  const getGlobalFilterData = React.useCallback(() => {
    return globalFilterData.current;
  }, []);

  const setSelectedDashboard = React.useCallback((dashboard: Dashboard) => {
    // Placeholder for potential future use if we need to register dashboard-level data
    selectedDashboard.current = dashboard;
  }, []);

  const getSelectedDashboard = React.useCallback(() => {
    return selectedDashboard.current;
  }, []);

  return (
    <CloudPulseContext.Provider
      value={{
        setGlobalFilterData,
        getGlobalFilterData,
        setSelectedDashboard,
        getSelectedDashboard,
      }}
    >
      {children}
    </CloudPulseContext.Provider>
  );
};
