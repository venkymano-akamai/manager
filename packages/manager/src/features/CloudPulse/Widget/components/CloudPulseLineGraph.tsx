import { Button, CircleProgress, ErrorState, Typography } from '@linode/ui';
import { roundTo } from '@linode/utilities';
import { Box, Grid, useMediaQuery, useTheme } from '@mui/material';
import * as React from 'react';

import { AreaChart } from 'src/components/AreaChart/AreaChart';
import { useFlags } from 'src/hooks/useFlags';

import { humanizeLargeData } from '../../Utils/utils';

import type { CategoricalChartState } from 'recharts/types/chart/types';
import type { AreaChartProps } from 'src/components/AreaChart/AreaChart';

export interface CloudPulseLineGraph extends AreaChartProps {
  error?: string;
  loading?: boolean;
}

type ZoomState = {
  left: 'dataMin' | number;
  refAreaLeft?: number;
  refAreaRight?: number;
  right: 'dataMax' | number;
};

const initialZoomState: ZoomState = {
  left: 'dataMin',
  right: 'dataMax',
  refAreaLeft: undefined,
  refAreaRight: undefined,
};

export const CloudPulseLineGraph = React.memo((props: CloudPulseLineGraph) => {
  const { error, loading, unit, data, ...rest } = props;
  const [zoom, setZoom] = React.useState<ZoomState>(initialZoomState);

  const flags = useFlags();

  const theme = useTheme();

  // to reduce the x-axis tick count for small screen
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const onMouseDown = (e: CategoricalChartState) => {
    if (e && e.activePayload && e.activePayload !== null) {
      const refAreaLeft =
        e.activePayload[e.activePayload.length - 1].payload.timestamp;
      setZoom((prev) => ({
        ...prev,
        refAreaLeft,
        refAreaRight: undefined,
      }));
    }
  };

  const onMouseMove = (e: CategoricalChartState) => {
    if (zoom.refAreaLeft && e && e.activePayload && e.activePayload !== null) {
      const refAreaRight =
        e.activePayload[e.activePayload.length - 1].payload.timestamp;
      setZoom((prev) => ({
        ...prev,
        refAreaRight,
      }));
    }
  };

  const onMouseUp = () => {
    if (
      !zoom.refAreaLeft ||
      !zoom.refAreaRight ||
      zoom.refAreaLeft === zoom.refAreaRight
    ) {
      setZoom((z) => ({
        ...z,
        refAreaLeft: undefined,
        refAreaRight: undefined,
      }));
      return;
    }

    const [from, to] =
      zoom.refAreaLeft < zoom.refAreaRight
        ? [zoom.refAreaLeft, zoom.refAreaRight]
        : [zoom.refAreaRight, zoom.refAreaLeft];

    setZoom((z) => ({
      ...z,
      left: from,
      right: to,
      refAreaLeft: undefined,
      refAreaRight: undefined,
    }));
  };

  const zoomOut = () => {
    setZoom(initialZoomState);
  };

  const zoomedData = React.useMemo(() => {
    if (zoom.left === 'dataMin' || zoom.right === 'dataMax') {
      return data;
    }

    const zoomData = [];

    for (const d of data) {
      if (d.timestamp >= zoom.left && d.timestamp <= zoom.right) {
        zoomData.push(d);
      }
    }
    return zoomData;
  }, [data, zoom.left, zoom.right]);

  if (loading) {
    return <CircleProgress sx={{ minHeight: '380px' }} />;
  }

  if (error) {
    return <ErrorState errorText={error} />;
  }

  const noDataMessage = 'No data to display';
  const isHumanizableUnit =
    flags.aclp?.humanizableUnits?.some(
      (unitElement) => unitElement.toLowerCase() === unit.toLowerCase()
    ) ?? false;
  return (
    <Box
      sx={{
        p: 2,
        position: 'relative',
      }}
    >
      {error ? (
        <Box sx={{ height: '100%' }}>
          <ErrorState errorText={error} />
        </Box>
      ) : (
        <Grid container spacing={3}>
          <Button
            buttonType="primary"
            name="Reset Zoom"
            onClick={zoomOut}
            sx={{
              height: '26px',
              width: '124px',
            }}
            variant="contained"
          >
            Reset Zoom
          </Button>
          <AreaChart
            {...rest}
            data={zoomedData}
            fillOpacity={0.5}
            legendHeight="165px"
            margin={{
              bottom: 0,
              left: -15,
              right: 30,
              top: 2,
            }}
            referenceArea={
              zoom.refAreaLeft && zoom.refAreaRight
                ? { x1: zoom.refAreaLeft, x2: zoom.refAreaRight }
                : null
            }
            tooltipCustomValueFormatter={
              isHumanizableUnit
                ? (value, unit) => `${humanizeLargeData(value)} ${unit}`
                : undefined
            }
            unit={unit}
            xAxisTickCount={
              isSmallScreen ? undefined : Math.min(zoomedData.length, 7)
            }
            yAxisProps={
              isHumanizableUnit
                ? {
                    tickFormat: (value: number) =>
                      `${humanizeLargeData(value)}`,
                  }
                : {
                    tickFormat: (value: number) => `${roundTo(value, 3)}`,
                  }
            }
            zoomCallbacks={{
              onMouseDown,
              onMouseMove,
              onMouseUp,
            }}
          />
        </Grid>
      )}
      {zoomedData.length === 0 && (
        <Box
          sx={{
            bottom: '50%',
            left: '45%',
            position: 'absolute',
          }}
        >
          <Typography variant="body2">{noDataMessage}</Typography>
        </Box>
      )}
    </Box>
  );
});
