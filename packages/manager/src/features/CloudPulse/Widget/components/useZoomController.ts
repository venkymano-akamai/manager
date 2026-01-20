import * as React from 'react';

import type { CategoricalChartState } from 'recharts/types/chart/types';
import type { DataSet } from 'src/components/AreaChart/AreaChart';

export type ZoomState = {
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

const DRAG_THRESHOLD_MS = 500;

interface UseZoomControllerProps {
  data: DataSet[];
  isAutoRefetching?: boolean;
  loading?: boolean;
  zoomResetKey: string;
}

export const useZoomController = ({
  data,
  loading,
  isAutoRefetching,
  zoomResetKey,
}: UseZoomControllerProps) => {
  const [zoom, setZoom] = React.useState<ZoomState>(initialZoomState);

  const dragStartRef = React.useRef<null | number>(null);
  const isDraggingRef = React.useRef(false);
  const wasAutoRefetching = React.useRef(false);

  const onMouseDown = React.useCallback((e: CategoricalChartState) => {
    const payload = e?.activePayload?.[0]?.payload;
    if (!payload?.timestamp) return;

    dragStartRef.current = payload.timestamp;
    isDraggingRef.current = false;
  }, []);

  const onMouseMove = React.useCallback((e: CategoricalChartState) => {
    const dragStart = dragStartRef.current;
    if (dragStart === null) return;

    const payload = e?.activePayload?.[0]?.payload;
    if (!payload?.timestamp) return;

    const delta = Math.abs(payload.timestamp - dragStart);
    if (delta < DRAG_THRESHOLD_MS) return;

    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      setZoom((prev) => ({
        ...prev,
        refAreaLeft: dragStart,
        refAreaRight: payload.timestamp,
      }));
      return;
    }

    setZoom((prev) => ({
      ...prev,
      refAreaRight: payload.timestamp,
    }));
  }, []);

  const onMouseUp = React.useCallback(() => {
    if (!isDraggingRef.current) {
      dragStartRef.current = null;
      return;
    }

    isDraggingRef.current = false;

    setZoom((prev) => {
      if (
        !prev.refAreaLeft ||
        !prev.refAreaRight ||
        prev.refAreaLeft === prev.refAreaRight
      ) {
        return {
          ...prev,
          refAreaLeft: undefined,
          refAreaRight: undefined,
        };
      }

      const [from, to] =
        prev.refAreaLeft < prev.refAreaRight
          ? [prev.refAreaLeft, prev.refAreaRight]
          : [prev.refAreaRight, prev.refAreaLeft];

      return {
        ...prev,
        left: from,
        right: to,
        refAreaLeft: undefined,
        refAreaRight: undefined,
      };
    });

    dragStartRef.current = null;
  }, []);

  const zoomOut = React.useCallback(() => {
    setZoom(initialZoomState);
  }, []);

  // Reset when parent explicitly says so
  React.useEffect(() => {
    setZoom(initialZoomState);
  }, [zoomResetKey]);

  // Reset only on background auto-refresh
  React.useEffect(() => {
    if (isAutoRefetching && !wasAutoRefetching.current) {
      setZoom(initialZoomState);
    }

    wasAutoRefetching.current = Boolean(isAutoRefetching);
  }, [isAutoRefetching]);

  // Reset when zoomed range becomes invalid due to new data
  React.useEffect(() => {
    if (!data || data.length === 0) {
      if (loading) return;
      setZoom(initialZoomState);
      return;
    }

    const newMinTs = data[0].timestamp;
    const newMaxTs = data[data.length - 1].timestamp;

    if (zoom.left !== 'dataMin' && zoom.right !== 'dataMax') {
      const left = zoom.left;
      const right = zoom.right;

      if (left < newMinTs || right > newMaxTs) {
        setZoom(initialZoomState);
      }
    }
  }, [data, loading, zoom.left, zoom.right]);

  const isZoomed = zoom.left !== 'dataMin' || zoom.right !== 'dataMax';

  return {
    zoom,
    isZoomed,
    zoomOut,
    zoomCallbacks: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
    },
  };
};
