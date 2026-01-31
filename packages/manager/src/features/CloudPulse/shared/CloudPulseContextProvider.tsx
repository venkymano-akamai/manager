import * as React from 'react';

import type { CloudPulseMetricsResponse } from '@linode/api-v4';

export const CloudPulseExportProvider: React.FC<{
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

  return (
    <CloudPulseExportContext.Provider
      value={{
        registerWidget,
        unregisterWidget,
        getAllWidgets,
      }}
    >
      {children}
    </CloudPulseExportContext.Provider>
  );
};

type ExportRegistry = {
  getAllWidgets: () => CloudPulseMetricsResponse[];
  registerWidget: (
    data: CloudPulseMetricsResponse,
    widgetLabel: string
  ) => void;
  unregisterWidget: (label: string) => void;
};

const CloudPulseExportContext = React.createContext<ExportRegistry | null>(
  null
);

export const useCloudPulseExport = () => {
  const ctx = React.useContext(CloudPulseExportContext);
  if (!ctx) {
    throw new Error(
      'useCloudPulseExport must be used inside CloudPulseExportProvider'
    );
  }
  return ctx;
};
