import { Box } from '@mui/material';
import { useSnackbar } from 'notistack';
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
    const { enqueueSnackbar } = useSnackbar();
    const { data, filters, widget, dashboardName, duration, isDataLoading } =
      props;
    const enableDownloadIcon =
      data && filters && widget && dashboardName && duration && !isDataLoading;
    const csvData = enableDownloadIcon ? generateCSVData(props) : [];

    const handleDownloadClick = () => {
      csvRef.current?.link.click();
      enqueueSnackbar('CSV downloaded.', { variant: 'success' });
    };

    return (
      <Box>
        <DownloadCSV
          buttonType="styledLink"
          csvRef={csvRef}
          data={csvData}
          disabled={!enableDownloadIcon}
          filename={`${widget.label}.csv`}
          headers={[]}
          iconStyles={{
            height: '24px',
            width: '24px',
          }}
          onClick={handleDownloadClick}
          sx={(theme) => ({
            fontSize: '0',
            color: theme.tokens.alias.Content.Icon.Primary.Default, // consistent icon with other icons in the widget header
          })}
        />
      </Box>
    );
  }
);
