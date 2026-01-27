import { useRegionsQuery } from '@linode/queries';
import { Autocomplete } from '@linode/ui';
import React from 'react';

import { useCleanupStaleValues } from './useCleanupStaleValues';
import { useObjectStorageFetchOptions } from './useObjectStorageFetchOptions';
import { handleValueChange, resolveSelectedValues } from './utils';

import type { DimensionFilterAutocompleteProps } from './constants';

/**
 * Autocomplete for Object Storage endpoints.
 */
export const ObjectStorageDimensionFilterAutocomplete = (
  props: DimensionFilterAutocompleteProps
) => {
  const {
    dimensionLabel,
    multiple,
    name,
    fieldOnChange,
    disabled,
    fieldOnBlur,
    placeholderText,
    errorText,
    entities,
    fieldValue,
    scope,
    selectedRegions,
    serviceType,
    type,
    maxSelections,
  } = props;

  const { data: regions } = useRegionsQuery();
  const { values, isLoading, isError } = useObjectStorageFetchOptions({
    entities,
    dimensionLabel,
    regions,
    type,
    scope,
    selectedRegions,
    serviceType,
  });

  useCleanupStaleValues({
    options: values,
    fieldValue,
    multiple,
    onChange: fieldOnChange,
    isLoading,
  });

  const maxReached = React.useMemo(() => {
    if (!multiple || fieldValue === '' || maxSelections === undefined) {
      return false;
    }

    const values = fieldValue?.split(',') || [];

    return values.length >= maxSelections;
  }, [fieldValue, maxSelections, multiple]);

  return (
    <Autocomplete
      data-qa-dimension-filter={`${name}-value`}
      data-testid="value"
      disabled={disabled}
      disableSelectAll={
        maxSelections !== undefined ? values.length > maxSelections : false
      }
      errorText={
        errorText ??
        (isError ? 'Failed to fetch Object Storage endpoints.' : undefined)
      }
      getOptionDisabled={(option) => {
        if (!maxReached) {
          return false;
        }

        const values = fieldValue?.split(',') || [];

        // Allow already selected options (so user can unselect)
        if (multiple) {
          return !values.some((selected) => selected === option.value);
        }

        return false;
      }}
      helperText={
        maxSelections !== undefined && multiple
          ? `Select up to ${maxSelections} values`
          : undefined
      }
      isOptionEqualToValue={(option, value) => value.value === option.value}
      label="Value"
      limitTags={1}
      loading={!disabled && isLoading && !isError}
      multiple={multiple}
      onBlur={fieldOnBlur}
      onChange={(_, selected, operation) => {
        const newValue = handleValueChange(
          selected,
          operation,
          multiple ?? false
        );
        fieldOnChange(newValue);
      }}
      options={values}
      placeholder={placeholderText}
      sx={{ flex: 1 }}
      value={resolveSelectedValues(values, fieldValue, multiple ?? false)}
    />
  );
};
