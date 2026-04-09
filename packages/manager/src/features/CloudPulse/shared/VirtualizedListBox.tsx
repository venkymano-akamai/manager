import React from 'react';
import { FixedSizeList } from 'react-window';

import { VIRTUALIZATION_CONFIG } from '../Utils/constants';

export interface VirtualizedListboxProps {
  /**
   * The children of the VirtualizedListbox component, which are expected to be the options to be rendered in the list.
   */
  children: React.ReactNode;
}

/**
 * A virtualized listbox component that efficiently renders large lists by only
 * rendering visible items. Uses react-window for virtualization.
 */
export const VirtualizedListbox = React.memo(
  (props: VirtualizedListboxProps) => {
    const { children } = props;

    const itemData = React.Children.toArray(children);
    const itemCount = itemData.length;

    const calculatedHeight = React.useMemo(
      () =>
        Math.min(
          VIRTUALIZATION_CONFIG.MAX_VISIBLE_HEIGHT,
          itemCount * VIRTUALIZATION_CONFIG.ITEM_HEIGHT
        ),
      [itemCount]
    );

    if (itemCount === 0) {
      return <ul>{children}</ul>;
    }

    return (
      <FixedSizeList
        className="virtualized-listbox"
        height={calculatedHeight}
        innerElementType="div"
        itemCount={itemCount}
        itemData={itemData}
        itemSize={VIRTUALIZATION_CONFIG.ITEM_HEIGHT}
        outerElementType="ul"
        style={{
          margin: 0,
        }}
        width="100%"
      >
        {({ data, index, style }) => (
          <div style={{ ...style, boxSizing: 'border-box' }}>{data[index]}</div>
        )}
      </FixedSizeList>
    );
  }
);

VirtualizedListbox.displayName = 'VirtualizedListbox';
