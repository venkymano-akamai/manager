import React from 'react';

import { CloudPulseContextProvider } from '../Context/CloudPulseContextProvider';
import { CloudPulseDashboardWithFiltersRenderer } from './CloudPulseDashboardWithFiltersRenderer';

import type { CloudPulseDashboardWithFiltersProp } from './CloudPulseDashboardWithFiltersRenderer';

export const CloudPulseDashboardWithFilters = React.memo(
  (props: CloudPulseDashboardWithFiltersProp) => {
    return (
      <CloudPulseContextProvider>
        <CloudPulseDashboardWithFiltersRenderer {...props} />
      </CloudPulseContextProvider>
    );
  }
);
