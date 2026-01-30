import axios from 'axios';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import AkamaiLogo from './akamai-logo.png';

import type { CloudPulseServiceTypeFilterMap } from '../Utils/models';
import type { FilterData } from './CloudPulseDashboardLanding';
import type { DateTimeWithPreset } from '@linode/api-v4';

const MARGIN = 24;
const HEADER_HEIGHT = 40;
const GAP = 16;

const captureElement = async (element: HTMLElement) => {
  const canvas = await html2canvas(element, {
    scale: window.devicePixelRatio || 2,
    useCORS: true,
    backgroundColor: '#fff',
  });

  return {
    img: canvas.toDataURL('image/jpeg'),
    width: canvas.width,
    height: canvas.height,
  };
};

const getWidgetCols = (el: HTMLElement): 6 | 12 => {
  const isHalf = el.getAttribute('data-pdf-half') === 'true';

  return isHalf ? 6 : 12;
};

const drawPdfHeader = (
  pdf: jsPDF,
  dashboardName: string,
  timeRange: string
) => {
  const pageWidth = pdf.internal.pageSize.getWidth();

  // Background bar
  pdf.setFillColor(68, 68, 68);
  pdf.rect(
    MARGIN,
    HEADER_HEIGHT + MARGIN + 10,
    pageWidth - MARGIN * 2,
    38,
    'F'
  );

  // Dashboard name
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('brand', 'bold');
  pdf.setFontSize(14);
  pdf.text(dashboardName, MARGIN + 12, HEADER_HEIGHT + MARGIN + 28);

  // Time range (right aligned)
  pdf.setFontSize(10);
  pdf.setFont('brand', 'normal');
  pdf.text(timeRange, pageWidth - MARGIN * 2, HEADER_HEIGHT + MARGIN + 28, {
    align: 'right',
  });
};

const drawFilterData = (
  pdf: jsPDF,
  appliedFilters: FilterData,
  filterConfig: CloudPulseServiceTypeFilterMap
) => {
  const configuredFilters = filterConfig.filters;

  const appliedFilter: Record<string, string[]> = configuredFilters
    .filter((filter) => {
      const filterKey = filter.configuration.filterKey;
      return Boolean(appliedFilters.label[filterKey]?.length);
    })
    .reduce(
      (prev, filter) => ({
        ...prev,
        [filter.configuration.name]:
          appliedFilters.label[filter.configuration.filterKey],
      }),
      {}
    );

  if (!Object.keys(appliedFilter).length) {
    return HEADER_HEIGHT * 2 + MARGIN;
  }

  const pageWidth = pdf.internal.pageSize.getWidth();
  const boxX = MARGIN;
  const boxY = HEADER_HEIGHT * 2 + MARGIN;
  const boxWidth = pageWidth - MARGIN * 2;
  const padding = 10;
  const lineHeight = 12;

  // Build single filter string
  let filterString = '';
  Object.entries(appliedFilter).forEach(([label, values], index, arr) => {
    filterString += `${label}: ${values.join(', ')}`;
    if (index < arr.length - 1) {
      filterString += ' | ';
    }
  });

  pdf.setFont('brand', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(52, 52, 56);

  // 🔑 Wrap text automatically
  const wrappedText = pdf.splitTextToSize(filterString, boxWidth - padding * 2);

  // 🔑 Dynamic box height
  const boxHeight = wrappedText.length * lineHeight + padding * 2;

  // Background box
  pdf.setFillColor(247, 247, 250);
  pdf.rect(boxX, boxY, boxWidth, boxHeight, 'F');

  // Text
  pdf.text(wrappedText, boxX + padding, boxY + padding + lineHeight - 2);

  // Return next Y cursor (VERY useful)
  return boxY + boxHeight + 12;
};

export const downloadDashboardPDF = async (
  dashboardName: string,
  timeDuration: DateTimeWithPreset,
  filterConfig: CloudPulseServiceTypeFilterMap,
  filterData: FilterData,
  widgets: string[]
) => {
  await document.fonts.ready;
  document.body.classList.add('pdf-mode');

  try {
    const AkamaiLogoURL = await getAkamaiLogo();

    const pdf = new jsPDF({ unit: 'px' });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const COLUMN_COUNT = 12;
    const COLUMN_GAP = 16;
    const ROW_GAP = 16;

    const contentWidth = pageWidth - MARGIN * 2;
    const columnWidth = (contentWidth - COLUMN_GAP) / COLUMN_COUNT;

    /* ---------- Header & filters (first page) ---------- */

    if (AkamaiLogoURL) {
      pdf.addImage(
        AkamaiLogoURL,
        'JPEG',
        160,
        MARGIN,
        120,
        HEADER_HEIGHT,
        undefined,
        'MEDIUM'
      );
    }

    drawPdfHeader(
      pdf,
      dashboardName,
      timeDuration.preset ||
        `${timeDuration.start} - ${timeDuration.end} ${timeDuration.timeZone}`
    );

    let yCursor = MARGIN + HEADER_HEIGHT + GAP;

    if (filterData.label && Object.keys(filterData.label).length > 0) {
      yCursor = drawFilterData(pdf, filterData, filterConfig);
    }

    /* ---------- Grid-aware widget rendering ---------- */

    let xCursor = MARGIN;
    let currentRowCols = 0;
    let currentRowHeight = 0;

    for (const label of widgets) {
      const el = document.getElementsByClassName(label)[0] as
        | HTMLElement
        | undefined;

      if (!el) continue;

      const widgetCols = getWidgetCols(el); // 6 or 12
      const widgetData = await captureElement(el);

      // Move to next row if widget doesn't fit
      if (currentRowCols + widgetCols > COLUMN_COUNT) {
        xCursor = MARGIN;
        yCursor += currentRowHeight + ROW_GAP;
        currentRowCols = 0;
        currentRowHeight = 0;
      }

      const renderWidth =
        widgetCols * columnWidth - (widgetCols === 6 ? COLUMN_GAP / 2 : 0);

      const scale = renderWidth / widgetData.width;
      const renderHeight = widgetData.height * scale;

      // Page break if vertical overflow
      if (yCursor + renderHeight > pageHeight - MARGIN) {
        pdf.addPage();

        if (AkamaiLogoURL) {
          pdf.addImage(
            AkamaiLogoURL,
            'JPEG',
            160,
            MARGIN,
            120,
            HEADER_HEIGHT,
            undefined,
            'MEDIUM'
          );
        }

        drawPdfHeader(
          pdf,
          dashboardName,
          timeDuration.preset ||
            `${timeDuration.start} - ${timeDuration.end} ${timeDuration.timeZone}`
        );

        yCursor = MARGIN + HEADER_HEIGHT + GAP;

        if (filterData.label && Object.keys(filterData.label).length > 0) {
          yCursor = drawFilterData(pdf, filterData, filterConfig);
        }
        xCursor = MARGIN;
        currentRowCols = 0;
        currentRowHeight = 0;
      }

      pdf.addImage(
        widgetData.img,
        'JPEG',
        xCursor,
        yCursor,
        renderWidth,
        renderHeight
      );

      // Advance row state
      xCursor += renderWidth + COLUMN_GAP;
      currentRowCols += widgetCols;
      currentRowHeight = Math.max(currentRowHeight, renderHeight);
    }

    pdf.save(`${dashboardName}.pdf`);
  } finally {
    document.body.classList.remove('pdf-mode');
  }
};

// M3-6177 only make one request to get the logo
const getAkamaiLogo = async () => {
  const response = await axios.get(AkamaiLogo, { responseType: 'blob' });

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(response.data);
  });
};
