import React from 'react';

import { CloudPulseContext } from './CloudPulseContext';

export const useCloudPulseExport = () => {
  const ctx = React.useContext(CloudPulseContext);
  if (!ctx) {
    throw new Error(
      'useCloudPulseExport must be used inside CloudPulseExportProvider'
    );
  }
  return ctx;
};
