import React from 'react';

import { CloudPulseTooltip } from '../../shared/CloudPulseTooltip';
import { StyledWidgetAutocomplete } from '../../Utils/CloudPulseWidgetUtils';
import { convertStringToCamelCasesWithSpaces } from '../../Utils/utils';

export interface AggregateFunctionProperties {
  /**
   * List of aggregate functions available to display
   */
  availableAggregateFunctions: string[];

  /**
   * Default aggregate function to be selected
   */
  defaultAggregateFunction?: string | undefined;

  /**
   * Function to be triggered on aggregate function changed from dropdown
   */
  onAggregateFuncChange: (aggregatevalue: string) => void;
}

interface AggregateFunction {
  label: string;
  value: string;
}

export const CloudPulseAggregateFunction = React.memo(
  (props: AggregateFunctionProperties) => {
    const {
      availableAggregateFunctions,
      defaultAggregateFunction,
      onAggregateFuncChange,
    } = props;

    // Convert list of availableAggregateFunc into a proper response structure accepted by Autocomplete component
    const availableAggregateFunc: AggregateFunction[] = availableAggregateFunctions?.map(
      (aggrFunc) => {
        return {
          label: aggrFunc,
          value: aggrFunc,
        };
      }
    );

    const defaultValue =
      availableAggregateFunc.find(
        (obj) => obj.label === defaultAggregateFunction
      ) || availableAggregateFunc[0];

    const [
      selectedAggregateFunction,
      setSelectedAggregateFunction,
    ] = React.useState<AggregateFunction>(defaultValue);

    return (
      <CloudPulseTooltip title={'Aggregation function'}>
        <StyledWidgetAutocomplete
          getOptionLabel={(option) => {
            return convertStringToCamelCasesWithSpaces(
              typeof option === 'string' ? option : option.label
            ); // options needed to be display in Caps first
          }}
          isOptionEqualToValue={(option, value) => {
            return option.label === value.label;
          }}
          onChange={(e, selectedAggregateFunc: AggregateFunction) => {
            setSelectedAggregateFunction(selectedAggregateFunc);
            onAggregateFuncChange(selectedAggregateFunc.label);
          }}
          textFieldProps={{
            hideLabel: true,
          }}
          autoHighlight
          disableClearable
          fullWidth={false}
          label="Select an Aggregate Function"
          noMarginTop={true}
          options={availableAggregateFunc}
          sx={{ width: '100%' }}
          value={selectedAggregateFunction}
        />
      </CloudPulseTooltip>
    );
  }
);
