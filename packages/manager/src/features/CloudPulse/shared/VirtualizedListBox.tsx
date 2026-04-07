import React from 'react';
import { FixedSizeList } from 'react-window';

export interface VirtualizedListboxProps {
  children: React.ReactNode;
}

export const VirtualizedListbox = React.memo(
  (props: VirtualizedListboxProps) => {
    const { children } = props;

    const itemData = React.Children.toArray(children);
    const itemCount = itemData.length;

    const calculatedHeight = React.useMemo(
      () => Math.min(160, itemCount * 36),
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
        itemSize={36}
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
