import { CLOUDVIEW_METRICS_ROOT } from '../constants';
import Request, { setData, setHeaders, setMethod, setURL } from '../request';
import { CloudViewMetricsRequest, CloudViewMetricsResponse } from './types';

export const getCloudViewMetrics = (
  jweToken: string,
  serviceType?: string,
  metricsRequest?: CloudViewMetricsRequest
) =>
  Request<CloudViewMetricsResponse>(
    setURL(
      `${CLOUDVIEW_METRICS_ROOT}/monitor/service/${encodeURIComponent(
        serviceType!
      )}/metrics`
    ),
    setMethod('POST'),
    setData(metricsRequest),
    setHeaders({
      Authorization: `Bearer ${jweToken}`,
    })
  );

export const getCloudViewMetricsAPI = (
  jweToken: string,
  readApiEndpoint: string,
  serviceType?: string,
  metricsRequest?: CloudViewMetricsRequest
) =>
  Request<CloudViewMetricsResponse>(
    // setURL(
    //   `${readApiEndpoint}/${encodeURIComponent(
    //     serviceType!
    //   )}/metrics`
    // ),

    setURL(
      `https://metrics-query.aclp.linode.com/v1/monitor/services/${encodeURIComponent(
        serviceType!
      )}/metrics`
    ),

    setMethod('POST'),
    setData(metricsRequest),
    setHeaders({
      Authorization: `${jweToken}`,
      'Authentication-type': 'jwe',
    })
  );
