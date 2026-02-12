import { DateTime } from 'luxon';

import type { FilterData } from '../../Dashboard/CloudPulseDashboardLanding';
import type { CloudPulseServiceTypeFilterMap } from '../../Utils/models';
import type {
  CloudPulseMetricsResponse,
  DateTimeWithPreset,
  Widgets,
} from '@linode/api-v4';

export interface CSVDataProps {
  dashboardName: string;
  data: CloudPulseMetricsResponse | undefined;
  duration: DateTimeWithPreset;
  filterConfig: CloudPulseServiceTypeFilterMap;
  filters: FilterData | undefined;
  widget: Widgets;
}

export const generateCSVData = ({
  dashboardName,
  data,
  duration,
  filters,
  widget,
  filterConfig,
}: CSVDataProps): Array<Array<number | string>> => {
  const csvData = [];
  csvData.push(['Dashboard', dashboardName]);
  csvData.push([
    'Start Time',
    DateTime.fromISO(duration.start).toLocaleString(DateTime.DATETIME_MED),
  ]);
  csvData.push([
    'End Time',
    DateTime.fromISO(duration.end).toLocaleString(DateTime.DATETIME_MED),
  ]);
  csvData.push([]); // Empty row for separation

  // build filter data
  if (filters && filters.label) {
    const configuredFilters = filterConfig.filters;
    const usableFilters = filters.label;

    const appliedFilter = configuredFilters
      .filter((filter) => {
        const filterKey = filter.configuration.filterKey;
        return Boolean(usableFilters[filterKey]?.length);
      })
      .reduce(
        (prevValue, filter) => ({
          ...prevValue,
          [filter.configuration.name]:
            usableFilters[filter.configuration.filterKey],
        }),
        {}
      );
    Object.entries(appliedFilter).forEach(([filterName, filterValues]) => {
      csvData.push([filterName, filterValues]);
    });
    csvData.push([]); // Empty row for separation
  }
  // add widget label and unit
  csvData.push(['Metric', widget.label]);
  csvData.push(['Unit', widget.unit]);
  csvData.push([]); // Empty row for separation
  return csvData;
};
