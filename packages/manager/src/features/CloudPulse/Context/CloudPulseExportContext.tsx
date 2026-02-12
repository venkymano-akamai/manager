import React from 'react';

import type { FilterData } from '../Dashboard/CloudPulseDashboardLanding';
import type { CloudPulseMetricsResponse, Dashboard } from '@linode/api-v4';

export type ExportRegistry = {
  getAllWidgets: () => CloudPulseMetricsResponse[];
  getFilterData: () => FilterData | undefined;
  getRegisteredDashboard: () => Dashboard | undefined;
  registerDashboard: (dashboard: Dashboard) => void;
  registerFilterData: (filterData: FilterData) => void;
  registerWidget: (
    data: CloudPulseMetricsResponse,
    widgetLabel: string
  ) => void;
  unregisterAll: () => void;
  unregisterWidget: (label: string) => void;
};

export const CloudPulseExportContext =
  React.createContext<ExportRegistry | null>(null);
