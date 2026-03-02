import React from 'react';

import type { FilterData } from '../Dashboard/CloudPulseDashboardLanding';
import type { Dashboard } from '@linode/api-v4';

export type ExportRegistry = {
  getFilterData: () => FilterData | undefined;
  getRegisteredDashboard: () => Dashboard | undefined;
  registerDashboard: (dashboard: Dashboard) => void;
  registerFilterData: (filterData: FilterData) => void;
};

export const CloudPulseContext = React.createContext<ExportRegistry>({
  getFilterData: () => undefined,
  getRegisteredDashboard: () => undefined,
  registerDashboard: () => null,
  registerFilterData: () => null,
});
