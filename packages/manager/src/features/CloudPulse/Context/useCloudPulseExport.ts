import React from 'react';

import { CloudPulseExportContext } from './CloudPulseExportContext';

export const useCloudPulseExport = () => {
  const ctx = React.useContext(CloudPulseExportContext);
  if (!ctx) {
    throw new Error(
      'useCloudPulseExport must be used inside CloudPulseExportProvider'
    );
  }
  return ctx;
};
