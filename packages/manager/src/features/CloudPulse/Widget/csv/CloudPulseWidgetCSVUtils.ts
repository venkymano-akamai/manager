import { DateTime } from 'luxon';

import { DIMENSION_TRANSFORM_CONFIG } from '../../shared/DimensionTransform';
import { convertStringToCamelCasesWithSpaces } from '../../Utils/utils';

import type { FilterData } from '../../Dashboard/CloudPulseDashboardLanding';
import type { CloudPulseServiceTypeFilterMap } from '../../Utils/models';
import type { MetricsDimensionFilter } from '../components/DimensionFilters/types';
import type {
  CloudPulseServiceType,
  DateTimeWithPreset,
  Dimension,
  Widgets,
} from '@linode/api-v4';
import type { DataSet } from 'src/components/AreaChart/AreaChart';

export interface CSVDataProps {
  dashboardName: string;
  data: DataSet[];
  dimensionFilters: MetricsDimensionFilter[];
  dimensionOptions: Dimension[];
  duration: DateTimeWithPreset;
  filterConfig: CloudPulseServiceTypeFilterMap;
  filters: FilterData | undefined;
  groupBy: string[];
  isDataLoading: boolean;
  serviceType: CloudPulseServiceType;
  widget: Widgets;
}

export const generateCSVData = ({
  dashboardName,
  data,
  duration,
  filters,
  widget,
  filterConfig,
  groupBy,
  dimensionFilters,
  dimensionOptions,
  serviceType,
}: CSVDataProps): Array<Array<number | string>> => {
  const csvData = [];
  csvData.push(['Dashboard', dashboardName]);
  csvData.push([
    'Start Time',
    DateTime.fromISO(duration.start)
      .setZone(duration.timeZone)
      .toLocaleString(DateTime.DATETIME_MED),
  ]);
  csvData.push([
    'End Time',
    DateTime.fromISO(duration.end)
      .setZone(duration.timeZone)
      .toLocaleString(DateTime.DATETIME_MED),
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

  // populate the widget level aggregation function, scrape interval, group by and dimension filters
  if (groupBy.length > 0) {
    csvData.push(['Group By', groupBy.join(', ')]);
  }

  // aggregation function
  if (widget.aggregate_function) {
    csvData.push([
      'Aggregation Function',
      convertStringToCamelCasesWithSpaces(widget.aggregate_function),
    ]);
  }

  // scrape interval
  if (widget.time_granularity) {
    csvData.push([
      'Scrape Interval',
      `${widget.time_granularity.value === -1 ? '' : widget.time_granularity.value} ${widget.time_granularity.unit}`,
    ]);
  }

  let filterString: string = '';

  // dimnesion filters
  if (dimensionFilters.length > 0) {
    const dimensionFilterLabels = dimensionOptions.reduce<
      Record<string, string>
    >((acc, dimensionOption) => {
      acc[dimensionOption.dimension_label] = dimensionOption.label;
      return acc;
    }, {});
    dimensionFilters.forEach((dimensionFilter) => {
      if (dimensionFilter.dimension_label !== null) {
        filterString =
          filterString +
          `${dimensionFilterLabels[dimensionFilter.dimension_label]},${dimensionFilter.operator}, ${DIMENSION_TRANSFORM_CONFIG[serviceType]?.[dimensionFilter.dimension_label ?? '']?.(dimensionFilter.value ?? '') ?? dimensionFilter.value ?? ''};`;
      }
    });
  }
  csvData.push(['Dimension Filters', filterString]);

  // add widget label and unit
  csvData.push(['Metric', widget.label]);
  csvData.push(['Unit', widget.unit]);
  csvData.push([]); // Empty row for separation

  if (data.length > 0) {
    const keys = Object.keys(data[0]);

    // add column headers
    csvData.push(keys);

    csvData.push([]); // Empty row for separation

    for (const dataPoint of data) {
      const row = [];
      for (const key of keys) {
        if (key === 'timestamp') {
          row.push(
            DateTime.fromMillis(dataPoint[key])
              .setZone(duration.timeZone)
              .toLocaleString(DateTime.DATETIME_MED)
          );
        } else {
          row.push(dataPoint[key]);
        }
      }
      csvData.push(row);
    }
  }

  return csvData;
};
