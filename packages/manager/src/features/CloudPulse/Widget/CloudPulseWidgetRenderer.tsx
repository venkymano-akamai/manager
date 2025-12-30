import { closestCorners, DndContext } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { GridLegacy, Paper } from '@mui/material';
import React from 'react';

import { useFlags } from 'src/hooks/useFlags';

import { CloudPulseErrorPlaceholder } from '../shared/CloudPulseErrorPlaceholder';
import { createObjectCopy } from '../Utils/utils';
import { CloudPulseWidget } from './CloudPulseWidget';
import {
  allIntervalOptions,
  autoIntervalOption,
  getInSeconds,
  getIntervalIndex,
} from './components/CloudPulseIntervalSelect';

import type { CloudPulseResources } from '../shared/CloudPulseResourcesSelect';
import type {
  CloudPulseMetricsAdditionalFilters,
  CloudPulseWidgetProperties,
} from './CloudPulseWidget';
import type {
  AclpConfig,
  Dashboard,
  DateTimeWithPreset,
  JWEToken,
  MetricDefinition,
  ResourcePage,
  Widgets,
} from '@linode/api-v4';

interface WidgetProps {
  additionalFilters?: CloudPulseMetricsAdditionalFilters[];
  dashboard: Dashboard;
  duration: DateTimeWithPreset;
  groupBy: string[];
  isJweTokenFetching: boolean;
  jweToken?: JWEToken | undefined;
  linodeRegion?: string;
  manualRefreshTimeStamp?: number;
  metricDefinitions: ResourcePage<MetricDefinition> | undefined;
  preferences?: AclpConfig;
  /**
   * Selected region for the widget
   */
  region?: string;
  resourceList: CloudPulseResources[] | undefined;
  resources: string[];
  savePref?: boolean;
}

export const renderPlaceHolder = (subtitle: string) => {
  return (
    <GridLegacy item xs>
      <Paper>
        <CloudPulseErrorPlaceholder errorMessage={subtitle} />
      </Paper>
    </GridLegacy>
  );
};

export const RenderWidgets = React.memo(
  (props: WidgetProps) => {
    const {
      additionalFilters,
      dashboard,
      duration,
      isJweTokenFetching,
      jweToken,
      manualRefreshTimeStamp,
      metricDefinitions,
      preferences,
      resourceList,
      resources,
      savePref,
      groupBy,
      linodeRegion,
      region,
    } = props;

    const flags = useFlags();

    const [, setSelfUpdate] = React.useState<number>(0);

    const getCloudPulseGraphProperties = (
      widget: Widgets
    ): CloudPulseWidgetProperties => {
      const graphProp: CloudPulseWidgetProperties = {
        additionalFilters,
        ariaLabel: widget.label,
        authToken: '',
        availableMetrics: undefined,
        duration,
        entityIds: resources,
        errorLabel: 'Error occurred while loading data.',
        isJweTokenFetching: false,
        resources: [],
        serviceType: dashboard.service_type,
        timeStamp: manualRefreshTimeStamp,
        unit: widget.unit ?? '%',
        dashboardId: dashboard.id,
        globalFilterGroupBy: groupBy,
        widget: {
          ...widget,
          time_granularity: autoIntervalOption,
          group_by: undefined,
        },
      };
      if (savePref) {
        graphProp.widget = setPreferredWidgetPlan(graphProp.widget);
      }
      return graphProp;
    };

    const getTimeGranularity = (scrapeInterval: string) => {
      const scrapeIntervalValue = getInSeconds(scrapeInterval);
      const index = getIntervalIndex(scrapeIntervalValue);
      return index < 0 ? allIntervalOptions[0] : allIntervalOptions[index];
    };

    const setPreferredWidgetPlan = (widgetObj: Widgets): Widgets => {
      const widgetPreferences = preferences?.widgets;
      const pref = widgetPreferences?.[widgetObj.label];
      if (pref) {
        return {
          ...widgetObj,
          aggregate_function:
            pref.aggregateFunction ?? widgetObj.aggregate_function,
          size: pref.size ?? widgetObj.size,
          time_granularity: {
            ...(pref.timeGranularity ?? autoIntervalOption),
          },
          group_by: pref.groupBy,
          filters: flags.aclp?.showWidgetDimensionFilters
            ? (pref.filters ?? widgetObj.filters)
            : widgetObj.filters,
        };
      } else {
        return {
          ...widgetObj,
          time_granularity: autoIntervalOption,
          group_by: undefined,
        };
      }
    };

    const reOrderWidgets = (event: any) => {
      const { active, over } = event;

      if (active.id !== over.id) {
        const oldIndex = dashboard.widgets.findIndex(
          (widget) => widget.label === active.id
        );
        const newIndex = dashboard.widgets.findIndex(
          (widget) => widget.label === over.id
        );

        const newWidgetsOrder = Array.from(dashboard.widgets);
        const [movedWidget] = newWidgetsOrder.splice(oldIndex, 1);
        newWidgetsOrder.splice(newIndex, 0, movedWidget);

        dashboard.widgets = newWidgetsOrder;

        setSelfUpdate((prev) => prev + 1);
      }
    };

    if (!dashboard.widgets?.length) {
      return renderPlaceHolder(
        'No visualizations are available at this moment. Create Dashboards to list here.'
      );
    }

    if (
      !dashboard.service_type ||
      (!isJweTokenFetching && !jweToken?.token) ||
      !resourceList?.length
    ) {
      return renderPlaceHolder(
        'Select a dashboard and filters to visualize metrics.'
      );
    }

    // maintain a copy
    const newDashboard: Dashboard = createObjectCopy(dashboard)!;
    return (
      <DndContext
        collisionDetection={closestCorners}
        onDragEnd={reOrderWidgets}
      >
        <GridLegacy columnSpacing={2} container item rowSpacing={2} xs={12}>
          <SortableContext
            items={newDashboard.widgets.map((widget) => widget.label)}
            strategy={rectSortingStrategy}
          >
            {{ ...newDashboard }.widgets.map((widget, index) => {
              // check if widget metric definition is available or not
              if (widget) {
                // find the metric defintion of the widget label
                const availMetrics = metricDefinitions?.data.find(
                  (availMetrics: MetricDefinition) =>
                    widget.metric === availMetrics.metric
                );
                const cloudPulseWidgetProperties = getCloudPulseGraphProperties(
                  {
                    ...widget,
                  }
                );

                // metric definition is available but time_granularity is not present
                if (
                  availMetrics &&
                  !cloudPulseWidgetProperties.widget.time_granularity
                ) {
                  cloudPulseWidgetProperties.widget.time_granularity =
                    getTimeGranularity(availMetrics.scrape_interval);
                }
                return (
                  <CloudPulseWidget
                    key={widget.label}
                    {...cloudPulseWidgetProperties}
                    authToken={jweToken?.token}
                    availableMetrics={availMetrics}
                    isJweTokenFetching={isJweTokenFetching}
                    linodeRegion={linodeRegion}
                    region={region}
                    resources={resourceList!}
                    savePref={savePref}
                  />
                );
              } else {
                return <React.Fragment key={index} />;
              }
            })}
          </SortableContext>
        </GridLegacy>
      </DndContext>
    );
  },
  (oldProps: WidgetProps, newProps: WidgetProps) => {
    const keysToCompare: (keyof WidgetProps)[] = [
      'dashboard',
      'manualRefreshTimeStamp',
      'jweToken',
      'duration',
      'resources',
      'additionalFilters',
      'groupBy',
    ];

    for (const key of keysToCompare) {
      if (oldProps[key] !== newProps[key]) {
        return false;
      }
    }

    return true;
  }
);
