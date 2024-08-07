import * as React from 'react';

import { Autocomplete } from 'src/components/Autocomplete/Autocomplete';

import { TIME_DURATION } from '../Utils/constants';
import {
  getUserPreferenceObject,
  updateGlobalFilterPreference,
} from '../Utils/UserPreference';

import type { TimeDuration } from '@linode/api-v4';
import type {
  BaseSelectProps,
  Item,
} from 'src/components/EnhancedSelect/Select';

export interface CloudPulseTimeRangeSelectProps
  extends Omit<
    BaseSelectProps<Item<Labels, Labels>, false>,
    'defaultValue' | 'onChange'
  > {
  handleStatsChange?: (timeDuration: TimeDuration) => void;
  placeholder?: string;
  savePreferences?: boolean;
}

const PAST_7_DAYS = 'Past 7 Days';
const PAST_12_HOURS = 'Past 12 Hours';
const PAST_24_HOURS = 'Past 24 Hours';
const PAST_30_DAYS = 'Past 30 Days';
const PAST_30_MINUTES = 'Past 30 Minutes';
export type Labels =
  | 'Past 7 Days'
  | 'Past 12 Hours'
  | 'Past 24 Hours'
  | 'Past 30 Days'
  | 'Past 30 Minutes';

export const CloudPulseTimeRangeSelect = React.memo(
  (props: CloudPulseTimeRangeSelectProps) => {
    const { handleStatsChange, label } = props;

    // To set the default value fetched from preferences.
    const getPreferredValue = () => {
      const defaultValue = getUserPreferenceObject().timeDuration;
      return options.find((o) => o.label === defaultValue) || options[0];
    };

    const options = generateSelectOptions();

    const handleChange = (item: Item<Labels, Labels>) => {
      updateGlobalFilterPreference({
        [TIME_DURATION]: item.value,
      });

      if (handleStatsChange) {
        handleStatsChange(getTimeDurationFromTimeRange(item.value));
      }
    };

    return (
      <Autocomplete
        onChange={(_: any, value: Item<Labels, Labels>) => {
          handleChange(value);
        }}
        autoHighlight
        data-testid="cloudpulse-time-duration"
        defaultValue={getPreferredValue()}
        disableClearable
        fullWidth
        isOptionEqualToValue={(option, value) => option.value === value.value}
        label=""
        noMarginTop
        options={options}
        placeholder={label}
      />
    );
  }
);

/**
 * react-select option generator that aims to remain a pure function
 * and take in the current datetime as an argument and generate select values
 * based on what it's passed.
 *
 *
 * @param { string } currentYear - the current year
 */
export const generateSelectOptions = (): Item<Labels, Labels>[] => {
  const baseOptions: Item<Labels, Labels>[] = [
    {
      label: PAST_30_MINUTES,
      value: PAST_30_MINUTES,
    },
    {
      label: PAST_12_HOURS,
      value: PAST_12_HOURS,
    },
  ];

  return [
    ...baseOptions,
    {
      label: PAST_24_HOURS,
      value: PAST_24_HOURS,
    },
    {
      label: PAST_7_DAYS,
      value: PAST_7_DAYS,
    },
    {
      label: PAST_30_DAYS,
      value: PAST_30_DAYS,
    },
  ];
};

/**
 *
 * @returns start time in seconds (NOT milliseconds)
 */
export const generateStartTime = (modifier: Labels, nowInSeconds: number) => {
  switch (modifier) {
    case PAST_30_MINUTES:
      return nowInSeconds - 30 * 60;
    case PAST_12_HOURS:
      return nowInSeconds - 12 * 60 * 60;
    case PAST_24_HOURS:
      return nowInSeconds - 24 * 60 * 60;
    case PAST_7_DAYS:
      return nowInSeconds - 7 * 24 * 60 * 60;
    default:
      return nowInSeconds - 30 * 24 * 60 * 60;
  }
};

const getTimeDurationFromTimeRange = (label: string): TimeDuration => {
  if (label === PAST_30_MINUTES) {
    return { unit: 'min', value: 30 };
  }

  if (label === PAST_24_HOURS) {
    return { unit: 'hr', value: 24 };
  }

  if (label === PAST_12_HOURS) {
    return { unit: 'hr', value: 12 };
  }

  if (label === PAST_7_DAYS) {
    return { unit: 'day', value: 7 };
  }

  if (label === PAST_30_DAYS) {
    return { unit: 'day', value: 30 };
  }

  return { unit: 'min', value: 30 };
};
