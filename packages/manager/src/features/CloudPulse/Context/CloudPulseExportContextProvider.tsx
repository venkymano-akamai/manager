import * as React from 'react';

import { CloudPulseExportContext } from './CloudPulseExportContext';

import type { CloudPulseMetricsResponse } from '@linode/api-v4';

export const CloudPulseExportContextProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const registryRef = React.useRef<Map<string, CloudPulseMetricsResponse>>(
    new Map()
  );

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

  return (
    <CloudPulseExportContext.Provider
      value={{
        registerWidget,
        unregisterWidget,
        getAllWidgets,
        unregisterAll,
      }}
    >
      {children}
    </CloudPulseExportContext.Provider>
  );
};
