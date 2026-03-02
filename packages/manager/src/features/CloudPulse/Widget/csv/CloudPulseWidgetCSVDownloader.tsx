import { Box, useTheme } from '@mui/material';
import React from 'react';
import type { CSVLink } from 'react-csv';

import { DownloadCSV } from 'src/components/DownloadCSV/DownloadCSV';

import { generateCSVData } from './CloudPulseWidgetCSVUtils';

import type { CSVDataProps } from './CloudPulseWidgetCSVUtils';

export const CloudPulseWidgetCSVDownloader = React.memo(
  (props: CSVDataProps) => {
    const csvRef = React.useRef<(CSVLink & { link: HTMLAnchorElement }) | null>(
      null
    );
    const { data, filters, widget, dashboardName, duration, isDataLoading } =
      props;
    const enableDownloadIcon =
      data && filters && widget && dashboardName && duration && !isDataLoading;
    const csvData = enableDownloadIcon ? generateCSVData(props) : [];
    const theme = useTheme();
    return (
      <Box>
        <DownloadCSV
          buttonType="styledLink"
          csvRef={csvRef}
          data={csvData}
          disabled={!enableDownloadIcon}
          filename={`${dashboardName}-${widget.label}.csv`}
          headers={[]}
          iconStyles={{
            height: '24px',
            width: '24px',
          }}
          onClick={() => csvRef.current?.link.click()}
          sx={{
            fontSize: 0, // text not needed
            color: theme.tokens.alias.Content.Text.Primary.Default,
          }}
        />
      </Box>
    );
  }
);
