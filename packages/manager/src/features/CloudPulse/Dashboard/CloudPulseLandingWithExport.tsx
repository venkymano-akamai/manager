import React from 'react';

import { CloudPulseExportProvider } from '../shared/CloudPulseContextProvider';
import { CloudPulseDashboardLanding } from './CloudPulseDashboardLanding';

export const CloudPulseDashboardLandingWithExport = () => {
  return (
    <CloudPulseExportProvider>
      <CloudPulseDashboardLanding />
    </CloudPulseExportProvider>
  );
};
