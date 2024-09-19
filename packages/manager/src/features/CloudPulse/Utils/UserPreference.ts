import { useRef } from 'react';

import {
  useMutatePreferences,
  usePreferences,
} from 'src/queries/profile/preferences';

import { DASHBOARD_ID, TIME_DURATION } from './constants';

import type { AclpWidget } from '@linode/api-v4';

/**
 *
 *  This hook is used in CloudPulseDashboardLanding, GlobalFilters & CloudPulseWidget component
 */

export const useAclpPreference = () => {
  const { data: preferences, isLoading } = usePreferences();

  const { mutateAsync: updateFunction } = useMutatePreferences(false, true);

  const preferenceRef = useRef(preferences?.aclpPreference ?? {});

  /**
   *
   * @param data AclpConfig data to be updated in preferences
   */
  const updateGlobalFilterPreference = (data: {}) => {
    let currentPreferences = { ...(preferenceRef.current ?? {}) };
    const keys = Object.keys(data);

    if (keys.includes(DASHBOARD_ID)) {
      currentPreferences = {
        ...data,
        [TIME_DURATION]: currentPreferences[TIME_DURATION],
      };
    } else {
      currentPreferences = {
        ...currentPreferences,
        ...data,
      };
    }
    preferenceRef.current = currentPreferences;
    updateFunction({
      aclpPreference: {
        ...data,
      },
    });
  };

  /**
   *
   * @param label label of the widget that should be updated
   * @param data AclpWidget data for the label that is to be updated in preference
   */
  const updateWidgetPreference = (label: string, data: Partial<AclpWidget>) => {
    const updatedPreferences = { ...(preferenceRef.current ?? {}) };

    if (!updatedPreferences.widgets) {
      updatedPreferences.widgets = {};
    }

    updatedPreferences.widgets[label] = {
      ...updatedPreferences.widgets[label],
      label,
      ...data,
    };

    preferenceRef.current = updatedPreferences;
    updateFunction({ aclpPreference: updatedPreferences });
  };
  return {
    isLoading,
    preferences: preferences?.aclpPreference ?? {},
    updateGlobalFilterPreference,
    updateWidgetPreference,
  };
};
