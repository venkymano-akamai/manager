import { Autocomplete } from '@linode/ui';
import React from 'react';
import type { FieldPathByValue } from 'react-hook-form';
import { Controller, useFormContext } from 'react-hook-form';

import { channelTypeOptions, type Item } from '../../constants';

import type { CreateNotificationChannelForm } from './types';
import type { ChannelType } from '@linode/api-v4';

interface NotificationChannelTypeSelectProps {
  /**
   * Function to handle the channel type change
   */
  handleChannelTypeChange: () => void;
  /**
   * Name of the field in the form for the channel type
   */
  name: FieldPathByValue<CreateNotificationChannelForm, ChannelType | null>;
}

export const NotificationChannelTypeSelect = (
  props: NotificationChannelTypeSelectProps
) => {
  const { name, handleChannelTypeChange } = props;
  const { control } = useFormContext<CreateNotificationChannelForm>();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Autocomplete
          data-testid="channel-type-select"
          errorText={fieldState.error?.message}
          label="Type"
          onBlur={field.onBlur}
          onChange={(_, selected: Item<string, ChannelType>, reason) => {
            if (selected) {
              field.onChange(selected.value);
            }
            if (reason === 'clear') {
              field.onChange(null);
            }
            handleChannelTypeChange();
          }}
          options={channelTypeOptions}
          placeholder="Select a Channel Type"
          value={
            channelTypeOptions.find((option) => option.value === field.value) ??
            null
          }
        />
      )}
    />
  );
};
