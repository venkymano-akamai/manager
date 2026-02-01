import React from 'react';

import type { CloudPulseMetricsResponse } from '@linode/api-v4';

export type ExportRegistry = {
  getAllWidgets: () => CloudPulseMetricsResponse[];
  registerWidget: (
    data: CloudPulseMetricsResponse,
    widgetLabel: string
  ) => void;
  unregisterAll: () => void;
  unregisterWidget: (label: string) => void;
};

export const CloudPulseExportContext =
  React.createContext<ExportRegistry | null>(null);
