import * as React from 'react';

import { CloudPulseContext } from './CloudPulseContext';

import type { FilterData } from '../Dashboard/CloudPulseDashboardLanding';
import type { Dashboard } from '@linode/api-v4';

export const CloudPulseExportContextProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const filterRegistryRef = React.useRef<FilterData | undefined>(undefined);
  const dashboardRegistryRef = React.useRef<Dashboard | undefined>(undefined);

  const registerFilterData = React.useCallback((filterData: FilterData) => {
    filterRegistryRef.current = filterData;
  }, []);

  const getFilterData = React.useCallback(() => {
    return filterRegistryRef.current;
  }, []);

  const registerDashboard = React.useCallback((dashboard: Dashboard) => {
    // Placeholder for potential future use if we need to register dashboard-level data
    dashboardRegistryRef.current = dashboard;
  }, []);

  const getRegisteredDashboard = React.useCallback(() => {
    return dashboardRegistryRef.current;
  }, []);

  return (
    <CloudPulseContext.Provider
      value={{
        registerFilterData,
        getFilterData,
        registerDashboard,
        getRegisteredDashboard,
      }}
    >
      {children}
    </CloudPulseContext.Provider>
  );
};
