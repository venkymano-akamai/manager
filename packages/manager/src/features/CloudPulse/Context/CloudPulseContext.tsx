import React from 'react';

import type { FilterData } from '../Dashboard/CloudPulseDashboardLanding';
import type { Dashboard } from '@linode/api-v4';

export type ExportRegistry = {
  getGlobalFilterData: () => FilterData | undefined;
  getSelectedDashboard: () => Dashboard | undefined;
  setGlobalFilterData: (filterData: FilterData) => void;
  setSelectedDashboard: (dashboard: Dashboard) => void;
};

export const CloudPulseContext = React.createContext<ExportRegistry>({
  getGlobalFilterData: () => undefined,
  getSelectedDashboard: () => undefined,
  setSelectedDashboard: () => null,
  setGlobalFilterData: () => null,
});
