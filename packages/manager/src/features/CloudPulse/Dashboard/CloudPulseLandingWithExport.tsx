import React from 'react';

import { CloudPulseExportContextProvider } from '../Context/CloudPulseExportContextProvider';
import { CloudPulseDashboardLanding } from './CloudPulseDashboardLanding';

export const CloudPulseDashboardLandingWithExport = () => {
  return (
    <CloudPulseExportContextProvider>
      <CloudPulseDashboardLanding />
    </CloudPulseExportContextProvider>
  );
};
