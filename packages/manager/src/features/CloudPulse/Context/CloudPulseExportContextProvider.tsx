import * as React from 'react';

import { CloudPulseExportContext } from './CloudPulseExportContext';

import type { FilterData } from '../Dashboard/CloudPulseDashboardLanding';
import type { CloudPulseMetricsResponse, Dashboard } from '@linode/api-v4';

export const CloudPulseExportContextProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const registryRef = React.useRef<Map<string, CloudPulseMetricsResponse>>(
    new Map()
  );

  const filterRegistryRef = React.useRef<FilterData | undefined>(undefined);
  const dashboardRegistryRef = React.useRef<Dashboard | undefined>(undefined);

  const registerWidget = React.useCallback(
    (data: CloudPulseMetricsResponse, widgetLabel: string) => {
      registryRef.current.set(widgetLabel, data);
    },
    []
  );

  const unregisterWidget = React.useCallback((label: string) => {
    registryRef.current.delete(label);
  }, []);

  const getAllWidgets = React.useCallback(() => {
    return Array.from(registryRef.current.values());
  }, []);

  const unregisterAll = React.useCallback(() => {
    registryRef.current = new Map();
  }, []);

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
    <CloudPulseExportContext.Provider
      value={{
        registerWidget,
        unregisterWidget,
        getAllWidgets,
        unregisterAll,
        registerFilterData,
        getFilterData,
        registerDashboard,
        getRegisteredDashboard,
      }}
    >
      {children}
    </CloudPulseExportContext.Provider>
  );
};
