import { useProfile } from '@linode/queries';
import { Box, CircleProgress, NewFeatureChip, Paper } from '@linode/ui';
import { GridLegacy } from '@mui/material';
import { DateTime } from 'luxon';
import * as React from 'react';

import { DocumentTitleSegment } from 'src/components/DocumentTitle';
import { LandingHeader } from 'src/components/LandingHeader';
import { SuspenseLoader } from 'src/components/SuspenseLoader';
import { useFlags } from 'src/hooks/useFlags';

import { GlobalFilters } from '../Overview/GlobalFilters';
import { CloudPulseAppliedFilterRenderer } from '../shared/CloudPulseAppliedFilterRenderer';
import { defaultTimeDuration } from '../Utils/CloudPulseDateTimePickerUtils';
import { FILTER_CONFIG } from '../Utils/FilterConfig';
import { downloadDashboardPDF } from './CloudPulseDashboardDownloader';
import { CloudPulseDashboardRenderer } from './CloudPulseDashboardRenderer';

import type { Dashboard, DateTimeWithPreset } from '@linode/api-v4';

export type FilterValueType = number | number[] | string | string[] | undefined;

export interface FilterData {
  id: { [filterKey: string]: FilterValueType };
  label: { [filterKey: string]: string[] };
}
export interface CloudPulseMetricsFilter {
  [key: string]: FilterValueType;
}
export interface DashboardProp {
  dashboard?: Dashboard;
  filterValue: CloudPulseMetricsFilter;
  groupBy: string[];
  handleDownloadPDF: (widgetLabel?: string) => void;
  timeDuration?: DateTimeWithPreset;
}

export const CloudPulseDashboardLanding = () => {
  const { data: profile } = useProfile();
  const flags = useFlags();
  const [filterData, setFilterData] = React.useState<FilterData>({
    id: {},
    label: {},
  });

  const [groupBy, setGroupBy] = React.useState<string[]>([]);

  const [isDownloadingPdf, setIsDownloadingPdf] = React.useState(false);

  const [timeDuration, setTimeDuration] = React.useState<
    DateTimeWithPreset | undefined
  >();

  const [dashboard, setDashboard] = React.useState<Dashboard>();

  const [showAppliedFilters, setShowAppliedFilters] =
    React.useState<boolean>(false);

  const timezone =
    profile?.timezone === 'GMT'
      ? 'Etc/GMT' // this is present in timezone list for GMT
      : (profile?.timezone ?? DateTime.local().zoneName);

  const toggleAppliedFilter = (isVisible: boolean) => {
    setShowAppliedFilters(isVisible);
  };

  const onGroupByChange = React.useCallback((selectedValues: string[]) => {
    setGroupBy(selectedValues);
  }, []);

  const handleDownloadPDF = React.useCallback(async () => {
    try {
      setIsDownloadingPdf(true);

      // Placeholder for future implementation
      const config = FILTER_CONFIG.get(dashboard?.id || 0);
      if (timeDuration && config) {
        await downloadDashboardPDF(
          dashboard?.label || '',
          timeDuration,
          config,
          filterData,
          dashboard?.widgets.map((widget) => widget.label) || []
        );
      }
    } catch (e) {
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [dashboard, filterData, timeDuration]);

  const handleDownloadPDFForWidgets = React.useCallback(
    async (widgetLabel?: string) => {
      try {
        setIsDownloadingPdf(true);

        // Placeholder for future implementation
        const config = FILTER_CONFIG.get(dashboard?.id || 0);
        if (timeDuration && config) {
          await downloadDashboardPDF(
            dashboard?.label || '',
            timeDuration,
            config,
            filterData,
            widgetLabel ? [widgetLabel] : []
          );
        }
      } catch (e) {
      } finally {
        setIsDownloadingPdf(false);
      }
    },
    [dashboard, filterData, timeDuration]
  );

  const onFilterChange = React.useCallback(
    (filterKey: string, filterValue: FilterValueType, labels: string[]) => {
      setFilterData((prev: FilterData) => {
        return {
          id: {
            ...prev.id,
            [filterKey]: filterValue,
          },
          label: {
            ...prev.label,
            [filterKey]: labels,
          },
        };
      });
    },
    []
  );

  const onDashboardChange = React.useCallback(
    (dashboardObj: Dashboard, skipReset: boolean = false) => {
      setDashboard(dashboardObj);
      if (!skipReset) {
        setFilterData({
          id: {},
          label: {},
        }); // clear the filter values on dashboard change
        setTimeDuration(defaultTimeDuration(timezone)); // clear time duration on dashboard change
      }
    },
    [timezone]
  );
  const onTimeDurationChange = React.useCallback(
    (timeDurationObj: DateTimeWithPreset) => {
      setTimeDuration(timeDurationObj);
    },
    []
  );
  return (
    <React.Suspense fallback={<SuspenseLoader />}>
      <DocumentTitleSegment segment="Dashboards" />
      <LandingHeader
        breadcrumbProps={{
          pathname: '/metrics',
          labelOptions: {
            suffixComponent: flags.aclp?.new ? <NewFeatureChip /> : undefined,
          },
        }}
        docsLabel="Docs"
        docsLink="https://techdocs.akamai.com/cloud-computing/docs/akamai-cloud-pulse"
      />
      <GridLegacy container spacing={3} sx={{ width: 'inherit !important' }}>
        {isDownloadingPdf && (
          <Box
            sx={(theme) => ({
              position: 'fixed',
              inset: 0,
              zIndex: 1300,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.tokens.alias.Background.Overlay,
            })}
          >
            <CircleProgress size="lg" />
          </Box>
        )}

        <GridLegacy item xs={12}>
          <Paper sx={{ padding: 0 }}>
            <Box display="flex" flexDirection="column">
              <GlobalFilters
                handleAnyFilterChange={onFilterChange}
                handleDashboardChange={onDashboardChange}
                handleDownloadPDF={handleDownloadPDF}
                handleGroupByChange={onGroupByChange}
                handleTimeDurationChange={onTimeDurationChange}
                handleToggleAppliedFilter={toggleAppliedFilter}
              />
              {dashboard?.service_type && showAppliedFilters && (
                <CloudPulseAppliedFilterRenderer
                  dashboardId={dashboard.id}
                  filters={filterData.label}
                />
              )}
            </Box>
          </Paper>
        </GridLegacy>
        <CloudPulseDashboardRenderer
          dashboard={dashboard}
          filterValue={filterData.id}
          groupBy={groupBy}
          handleDownloadPDF={handleDownloadPDFForWidgets}
          timeDuration={timeDuration}
        />
      </GridLegacy>
    </React.Suspense>
  );
};
