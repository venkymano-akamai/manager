import { useAccountUsersInfiniteQuery } from '@linode/queries';
import { Autocomplete, Box, SelectedIcon, StyledListItem } from '@linode/ui';
import { useDebouncedValue } from '@linode/utilities';
import React, { useState } from 'react';
import type { FieldPathByValue } from 'react-hook-form';
import { Controller, useFormContext, useWatch } from 'react-hook-form';

import { useFlags } from 'src/hooks/useFlags';

import type { CreateNotificationChannelForm } from './types';
import type { User } from '@linode/api-v4';

interface NotificationRecipientsProps {
  /**
   * Name of the field in the form for the recipients
   */
  name: FieldPathByValue<CreateNotificationChannelForm, null | string[]>;
}

export const NotificationRecipients = (props: NotificationRecipientsProps) => {
  const { name } = props;
  const { control } = useFormContext<CreateNotificationChannelForm>();

  const [usernameInput, setUsernameInput] = useState<string>('');
  const debouncedUsernameInput = useDebouncedValue(usernameInput);

  const flags = useFlags();

  // Filter the users by the debounced username input
  const userSearchFilter = debouncedUsernameInput
    ? {
        ['+or']: [{ username: { ['+contains']: debouncedUsernameInput } }],
      }
    : undefined;

  const {
    data: accountUsers,
    fetchNextPage,
    hasNextPage,
    isFetching: isFetchingAccountUsers,
    isLoading: isLoadingAccountUsers,
  } = useAccountUsersInfiniteQuery({
    ...userSearchFilter,
    '+order': 'asc',
    '+order_by': 'username',
  });

  const options = React.useMemo(() => {
    const users = accountUsers?.pages.flatMap((page) => page.data);
    return (
      users?.map((user: User) => ({
        label: user.username,
        value: user.username,
      })) || []
    );
  }, [accountUsers]);

  const fieldValue = useWatch({ control, name });

  const selectedOptions = React.useMemo(() => {
    if (!fieldValue || !Array.isArray(fieldValue)) {
      return [];
    }
    return fieldValue.map((val) => {
      const match = options.find((opt) => opt.value === val);
      return match ?? { label: val, value: val };
    });
  }, [options, fieldValue]);

  // Handle the scroll event to load more users when the user scrolls to the bottom of the list
  const handleScroll = (event: React.SyntheticEvent) => {
    const listboxNode = event.currentTarget;
    const isAtBottom =
      Math.abs(
        listboxNode.scrollHeight -
          listboxNode.clientHeight -
          listboxNode.scrollTop
      ) < 1;

    if (isAtBottom && hasNextPage) {
      fetchNextPage();
    }
  };

    // Maximum recipients selection limit is fetched from launchdarkly
    const maxRecipientsSelectionLimit = React.useMemo(() => {
      return flags.aclpAlerting?.maxEmailNotificationChannelRecipients || 10;
    }, [flags.aclpAlerting]);

  // Check if total number of options and selected options are greater than the limit, if yes then disable the Select All option
  const recipientsLimitReached = React.useMemo(() => {
    return options.length > maxRecipientsSelectionLimit;
  }, [options.length, maxRecipientsSelectionLimit]);

  // Check if the number of selected recipients are greater than or equal to the limit
  const maxSelectionsReached = React.useMemo(() => {
    return selectedOptions.length >= maxRecipientsSelectionLimit;
  }, [selectedOptions.length, maxRecipientsSelectionLimit]);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Autocomplete
          data-testid="recipients-select"
          disableSelectAll={
            recipientsLimitReached || debouncedUsernameInput !== ''
          }
          errorText={fieldState.error?.message}
          filterOptions={(x) => x}
          getOptionLabel={(option) => option.label}
          helperText={
            !fieldState.error?.message
              ? `Select up to ${maxRecipientsSelectionLimit} Recipients`
              : ''
          }
          inputValue={usernameInput}
          isOptionEqualToValue={(option, value) => option.value === value.value}
          label="Recipients"
          limitTags={1}
          loading={isLoadingAccountUsers || isFetchingAccountUsers}
          multiple
          onBlur={field.onBlur}
          onChange={(
            _,
            selected: { label: string; value: string }[],
            reason
          ) => {
            if (reason === 'clear') {
              field.onChange([]);
              return;
            }
            if (selected) {
              const newSelectedValues = selected.map((item) => item.value);
              const existingValues = fieldValue || [];

              // Merge new selections with existing values that aren't in current options
              // This preserves previously selected items that are filtered out
              const currentOptionValues = options.map((opt) => opt.value);
              const preservedValues = existingValues.filter(
                (val) => !currentOptionValues.includes(val)
              );

              // Combine preserved values with new selections, removing duplicates
              const mergedValues = [
                ...preservedValues,
                ...newSelectedValues.filter(
                  (val) => !preservedValues.includes(val)
                ),
              ];

              field.onChange(mergedValues);
            }
            setUsernameInput('');
          }}
          onInputChange={(_, value, reason) => {
            // Only update for actual typing; ignore MUI reset calls
            if (reason === 'input') {
              setUsernameInput(value);
            }
          }}
          options={options}
          placeholder="Enter recipients"
          renderOption={(props, option) => {
            // After selecting resources up to the max resource selection limit, rest of the unselected options will be disabled if there are any
            const { key, ...rest } = props;
            const isRecipientSelected = selectedOptions?.some(
              (item) => item.label === option.label
            );

            const isSelectAllORDeslectAllOption =
              option.label === 'Select All ' ||
              option.label === 'Deselect All ';

            const isMaxSelectionsReached =
              maxSelectionsReached &&
              !isRecipientSelected &&
              !isSelectAllORDeslectAllOption;

            const ListItem = isSelectAllORDeslectAllOption
              ? StyledListItem
              : 'li';

            return (
              <ListItem
                {...rest}
                aria-disabled={isMaxSelectionsReached}
                data-qa-option
                key={key}
              >
                <>
                  <Box sx={{ flexGrow: 1 }}>{option.label}</Box>
                  <SelectedIcon visible={isRecipientSelected || false} />
                </>
              </ListItem>
            );
          }}
          slotProps={{
            listbox: {
              onScroll: handleScroll,
            },
            popper: {
              placement: 'bottom',
            },
          }}
          value={selectedOptions}
        />
      )}
    />
  );
};
