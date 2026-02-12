import { Box } from '@mui/material';
import React from 'react';

import Download from 'src/assets/icons/download.svg';
import { DownloadCSV } from 'src/components/DownloadCSV/DownloadCSV';

import { generateCSVData } from './CloudPulseWidgetCSVUtils';

import type { CSVDataProps } from './CloudPulseWidgetCSVUtils';

export const CloudPulseWidgetCSVDownloader = React.memo(
  (props: CSVDataProps) => {
    const csvRef = React.useRef<any>(undefined);
    const isDataPossible =
      props.data &&
      props.filters &&
      props.widget &&
      props.dashboardName.length &&
      props.duration;
    const data = isDataPossible ? generateCSVData(props) : [];
    return (
      <Box>
        <DownloadCSV
          buttonType="styledLink"
          csvRef={csvRef}
          data={data}
          disabled={!isDataPossible}
          filename="test.csv"
          headers={[]}
          icon={Download}
          onClick={() => csvRef.current.link.click()}
          sx={{
            fontSize: 0, // text not needed
          }}
        />
      </Box>
    );
  }
);
