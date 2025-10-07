import { Button, Drawer, Stack, Typography } from '@linode/ui';
import React from 'react';

import type { MetricsDimensionFilter } from './types';
import type { CloudPulseServiceType, Dimension } from '@linode/api-v4';

interface CloudPulseDimensionFilterDrawerProps {
  /**
   * The list of dimensions associated with the selected metric
   */
  dimensionOptions: Dimension[];
  /**
   * The label for the drawer, typically the name of the metric
   */
  drawerLabel: string;
  /**
   * @param selectedDimensions The list of selected dimension filters
   * @param close Property to determine whether to close the drawer after selection
   */
  handleSelectionChange: (
    selectedDimensions: MetricsDimensionFilter[],
    close: boolean
  ) => void;
  /**
   * The callback to close the drawer
   */
  onClose: () => void;
  /**
   * The boolean value to control the drawer open state
   */
  open: boolean;
  /**
   * The selected dimension filters for the metric
   */
  selectedDimensions?: MetricsDimensionFilter[];

  /**
   * The selected entities for the dimension filter
   */
  selectedEntities?: string[];

  /**
   * The service type of the associated metric
   */
  serviceType: CloudPulseServiceType;
}

export const CloudPulseDimensionFilterDrawer = React.memo(
  (props: CloudPulseDimensionFilterDrawerProps) => {
    const { onClose, open, drawerLabel } = props;

    const handleClose = React.useCallback(() => {
      onClose();
    }, [onClose]);

    return (
      <Drawer
        onClose={(_) => handleClose()}
        open={open}
        title="Dimension Filters"
        wide
      >
        <Stack gap={1.5}>
          <Typography
            data-qa-id="filter-drawer-subtitle"
            sx={(theme) => ({ marginTop: -2, font: theme.font.normal })}
            variant="h3"
          >
            {drawerLabel}
          </Typography>
          <Stack direction="row" justifyContent="space-between">
            <Typography
              data-qa-id="filter-drawer-selection-title"
              sx={(theme) => ({ font: theme.font.semibold })}
            >
              Select up to 5 Filters
            </Typography>
            <Button
              component="a"
              data-qa-id="filter-drawer-clear-all"
              sx={(theme) => ({
                padding: 0,
                font: theme.font.normal,
                color: theme.textColors.linkActiveLight,
              })}
              variant="text"
            >
              Clear All
            </Button>
          </Stack>
        </Stack>
      </Drawer>
    );
  }
);
