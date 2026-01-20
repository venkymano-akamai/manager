import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useZoomController } from './useZoomController';

describe('useZoomController', () => {
  const mockData = [
    { timestamp: 1000, value: 10 },
    { timestamp: 2000, value: 20 },
    { timestamp: 3000, value: 30 },
  ];

  const defaultProps = {
    data: mockData,
    zoomResetKey: 'initial',
    loading: false,
    isAutoRefetching: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default zoom state', () => {
    const { result } = renderHook(() => useZoomController(defaultProps));

    expect(result.current.zoom).toEqual({
      left: 'dataMin',
      right: 'dataMax',
    });
    expect(result.current.isZoomed).toBe(false);
  });

  it('should set refAreaLeft on mouse down', () => {
    const { result } = renderHook(() => useZoomController(defaultProps));

    const event = {
      activePayload: [{ payload: { timestamp: 1500 } }],
    };

    act(() => {
      result.current.zoomCallbacks.onMouseDown(event);
    });

    expect(result.current.zoom.refAreaLeft).toBeUndefined();
  });

  it('should update refArea during mouse move with drag threshold', () => {
    const { result } = renderHook(() => useZoomController(defaultProps));

    act(() => {
      result.current.zoomCallbacks.onMouseDown({
        activePayload: [{ payload: { timestamp: 1000 } }],
      });
    });

    act(() => {
      result.current.zoomCallbacks.onMouseMove({
        activePayload: [{ payload: { timestamp: 2000 } }],
      });
    });

    expect(result.current.zoom.refAreaLeft).toBe(1000);
    expect(result.current.zoom.refAreaRight).toBe(2000);
  });

  it('should set zoom range on mouse up after dragging', () => {
    const { result } = renderHook(() => useZoomController(defaultProps));

    act(() => {
      result.current.zoomCallbacks.onMouseDown({
        activePayload: [{ payload: { timestamp: 1000 } }],
      });
    });

    act(() => {
      result.current.zoomCallbacks.onMouseMove({
        activePayload: [{ payload: { timestamp: 2000 } }],
      });
    });

    act(() => {
      result.current.zoomCallbacks.onMouseUp();
    });

    expect(result.current.zoom.left).toBe(1000);
    expect(result.current.zoom.right).toBe(2000);
    expect(result.current.isZoomed).toBe(true);
  });

  it('should handle reverse drag direction', () => {
    const { result } = renderHook(() => useZoomController(defaultProps));

    act(() => {
      result.current.zoomCallbacks.onMouseDown({
        activePayload: [{ payload: { timestamp: 2000 } }],
      });
    });

    act(() => {
      result.current.zoomCallbacks.onMouseMove({
        activePayload: [{ payload: { timestamp: 1000 } }],
      });
    });

    act(() => {
      result.current.zoomCallbacks.onMouseUp();
    });

    expect(result.current.zoom.left).toBe(1000);
    expect(result.current.zoom.right).toBe(2000);
  });

  it('should reset zoom on zoomOut', () => {
    const { result } = renderHook(() => useZoomController(defaultProps));

    act(() => {
      result.current.zoomCallbacks.onMouseDown({
        activePayload: [{ payload: { timestamp: 1000 } }],
      });
    });

    act(() => {
      result.current.zoomCallbacks.onMouseMove({
        activePayload: [{ payload: { timestamp: 2000 } }],
      });
    });

    act(() => {
      result.current.zoomCallbacks.onMouseUp();
    });

    act(() => {
      result.current.zoomOut();
    });

    expect(result.current.zoom.left).toBe('dataMin');
    expect(result.current.zoom.right).toBe('dataMax');
    expect(result.current.isZoomed).toBe(false);
  });

  it('should reset zoom when zoomResetKey changes', () => {
    const { result, rerender } = renderHook(
      (props) => useZoomController(props),
      { initialProps: defaultProps }
    );

    act(() => {
      result.current.zoomCallbacks.onMouseDown({
        activePayload: [{ payload: { timestamp: 1000 } }],
      });
    });

    rerender({ ...defaultProps, zoomResetKey: 'new-key' });

    expect(result.current.zoom.left).toBe('dataMin');
    expect(result.current.zoom.right).toBe('dataMax');
  });

  it('should reset zoom on auto-refetch', () => {
    const { result, rerender } = renderHook(
      (props) => useZoomController(props),
      { initialProps: defaultProps }
    );

    rerender({ ...defaultProps, isAutoRefetching: true });

    expect(result.current.zoom.left).toBe('dataMin');
    expect(result.current.zoom.right).toBe('dataMax');
  });

  it('should reset zoom when zoomed range becomes invalid', () => {
    const { result, rerender } = renderHook(
      (props) => useZoomController(props),
      { initialProps: defaultProps }
    );

    act(() => {
      result.current.zoomCallbacks.onMouseDown({
        activePayload: [{ payload: { timestamp: 1500 } }],
      });
    });

    act(() => {
      result.current.zoomCallbacks.onMouseMove({
        activePayload: [{ payload: { timestamp: 2500 } }],
      });
    });

    act(() => {
      result.current.zoomCallbacks.onMouseUp();
    });

    const newData = [
      { timestamp: 5000, value: 50 },
      { timestamp: 6000, value: 60 },
    ];

    rerender({ ...defaultProps, data: newData });

    expect(result.current.zoom.left).toBe('dataMin');
    expect(result.current.zoom.right).toBe('dataMax');
  });

  it('should not update on mouse move below threshold', () => {
    const { result } = renderHook(() => useZoomController(defaultProps));

    act(() => {
      result.current.zoomCallbacks.onMouseDown({
        activePayload: [{ payload: { timestamp: 1000 } }],
      });
    });

    act(() => {
      result.current.zoomCallbacks.onMouseMove({
        activePayload: [{ payload: { timestamp: 1100 } }],
      });
    });

    expect(result.current.zoom.refAreaLeft).toBeUndefined();
  });

  it('should handle empty data', () => {
    const { result } = renderHook(() =>
      useZoomController({ ...defaultProps, data: [] })
    );

    expect(result.current.zoom.left).toBe('dataMin');
    expect(result.current.zoom.right).toBe('dataMax');
  });
});
