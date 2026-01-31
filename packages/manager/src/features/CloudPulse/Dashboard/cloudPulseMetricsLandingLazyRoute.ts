import { createLazyRoute } from '@tanstack/react-router';

import { CloudPulseDashboardLandingWithExport } from 'src/features/CloudPulse/Dashboard/CloudPulseLandingWithExport';

export const cloudPulseMetricsLandingLazyRoute = createLazyRoute('/metrics')({
  component: CloudPulseDashboardLandingWithExport,
});
