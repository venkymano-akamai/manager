import React from 'react';
import type { FieldPathByValue } from 'react-hook-form';

import NullComponent from 'src/components/NullComponent';

import type {
  MetricsDimensionFilter,
  MetricsDimensionFilterForm,
} from './types';
import type { CloudPulseServiceType, Dimension } from '@linode/api-v4';

interface CloudPulseDimensionFilterFieldsProps {
  /**
   * The dimension filter data options to list in the Autocomplete component
   */
  dimensionOptions: Dimension[];
  /**
   * The name (with the index) used for the component to set in form
   */
  name: FieldPathByValue<MetricsDimensionFilterForm, MetricsDimensionFilter>;

  /**
   * Callback function to delete the DimensionFilter component
   */
  onFilterDelete: () => void;

  /**
   * The selected entities for the dimension filter
   */
  selectedEntities?: string[];

  /**
   * The service type of the associated metric
   */
  serviceType: CloudPulseServiceType;
}

export const CloudPulseDimensionFilterFields = React.memo(
  (_props: CloudPulseDimensionFilterFieldsProps) => {
    return <NullComponent />; // TODO: Replace with actual component after this PR review
  }
);
