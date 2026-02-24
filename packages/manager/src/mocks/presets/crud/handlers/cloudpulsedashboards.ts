// This file will be maintained only in our aclp repo to work with CRUD handlers.
import { pickRandom } from '@linode/utilities';
import { http, HttpResponse } from 'msw';

import {
  blockStorageMetricRules,
  dashboardFactory,
  dimensionFilterFactory,
  firewallMetricDefinitionsResponse,
  logsMetricCriteria,
  networkLoadBalancerMetricCriteria,
  objectStorageMetricRules,
  serviceAlertFactory,
  serviceTypesFactory,
  widgetFactory,
} from 'src/factories';

import type {
  AlertDefinitionScope,
  CloudPulseServiceType,
  Dashboard,
  ServiceTypesList,
} from '@linode/api-v4';

export const cloudPulseServices = () => [
  http.get('*/monitor/services', () => {
    const response: ServiceTypesList = {
      data: [
        serviceTypesFactory.build({
          label: 'Linodes',
          service_type: 'linode',
          alert: serviceAlertFactory.build({ scope: ['entity'] }),
        }),
        serviceTypesFactory.build({
          label: 'Databases',
          service_type: 'dbaas',
          alert: {
            evaluation_period_seconds: [300],
            polling_interval_seconds: [300],
          },
        }),
        serviceTypesFactory.build({
          label: 'Nodebalancers',
          service_type: 'nodebalancer',
          regions: 'us-iad,us-east',
          alert: serviceAlertFactory.build({ scope: ['entity'] }),
        }),
        serviceTypesFactory.build({
          label: 'Firewalls',
          service_type: 'firewall',
          regions: 'us-iad,us-east',
          alert: serviceAlertFactory.build({ scope: ['entity'] }),
        }),
        serviceTypesFactory.build({
          label: 'Object Storage',
          service_type: 'objectstorage',
          regions: 'us-iad,us-east',
          alert: serviceAlertFactory.build({
            scope: ['entity', 'account', 'region'],
          }),
        }),
        serviceTypesFactory.build({
          label: 'Volumes',
          service_type: 'blockstorage',
          regions: 'us-iad,us-east',
          alert: serviceAlertFactory.build({
            scope: ['entity', 'account', 'region'],
          }),
        }),
        serviceTypesFactory.build({
          label: 'LKE Enterprise',
          service_type: 'lke',
          regions: 'us-iad,us-east',
          alert: serviceAlertFactory.build({
            scope: ['entity', 'account', 'region'],
          }),
        }),
        serviceTypesFactory.build({
          label: 'Network Load Balancers',
          service_type: 'netloadbalancer',
          regions: 'us-iad,us-east,eu-west',
          alert: serviceAlertFactory.build({ scope: ['entity'] }),
        }),
        serviceTypesFactory.build({
          label: 'Logs',
          service_type: 'logs',
          regions: 'us-iad,us-east,eu-west,us-ord,us-west,ca-central',
          alert: serviceAlertFactory.build({ scope: ['entity'] }),
        }),
      ],
    };

    return HttpResponse.json(response);
  }),

  http.get('*/monitor/services/:serviceType', ({ params }) => {
    const serviceType = params.serviceType as CloudPulseServiceType;
    const serviceTypesMap: Record<CloudPulseServiceType, string> = {
      linode: 'Linode',
      dbaas: 'Databases',
      nodebalancer: 'NodeBalancers',
      firewall: 'Firewalls',
      objectstorage: 'Object Storage',
      blockstorage: 'Volumes',
      lke: 'LKE Enterprise',
      netloadbalancer: 'Network Load Balancers',
      logs: 'Logs',
    };
    const serviceTypeScopeMap: Record<
      CloudPulseServiceType,
      AlertDefinitionScope[]
    > = {
      linode: ['entity'],
      dbaas: ['entity'],
      nodebalancer: ['entity'],
      firewall: ['entity', 'account'],
      objectstorage: ['entity', 'account', 'region'],
      blockstorage: ['entity', 'account', 'region'],
      lke: ['entity'],
      netloadbalancer: ['entity'],
      logs: ['entity'],
    };
    const response = serviceTypesFactory.build({
      service_type: `${serviceType}`,
      label: serviceTypesMap[serviceType],
      alert: serviceAlertFactory.build({
        evaluation_period_seconds: [300],
        polling_interval_seconds: [300],
        scope: serviceTypeScopeMap[serviceType],
      }),
    });

    return HttpResponse.json(response, { status: 200 });
  }),
];

export const cloudPulseMetricDefinitions = () => [
  http.get(
    '*/monitor/services/:serviceType/metric-definitions',
    ({ params }) => {
      const response = {
        data: [
          {
            available_aggregate_functions: ['min', 'max', 'avg'],
            dimensions: [
              {
                dimension_label: 'cpu',
                label: 'CPU name',
                values: null,
              },
              {
                dimension_label: 'state',
                label: 'State of CPU',
                values: [
                  'user',
                  'system',
                  'idle',
                  'interrupt',
                  'nice',
                  'softirq',
                  'steal',
                  'wait',
                ],
              },
              {
                dimension_label: 'LINODE_ID',
                label: 'Linode ID',
                values: null,
              },
            ],
            label: 'CPU utilization',
            metric: 'system_cpu_utilization_percent',
            metric_type: 'gauge',
            scrape_interval: '2m',
            unit: 'percent',
          },
          {
            available_aggregate_functions: ['min', 'max', 'avg', 'sum'],
            dimensions: [
              {
                dimension_label: 'state',
                label: 'State of memory',
                values: [
                  'used',
                  'free',
                  'buffered',
                  'cached',
                  'slab_reclaimable',
                  'slab_unreclaimable',
                ],
              },
              {
                dimension_label: 'LINODE_ID',
                label: 'Linode ID',
                values: null,
              },
            ],
            label: 'Memory Usage',
            metric: 'system_memory_usage_by_resource',
            metric_type: 'gauge',
            scrape_interval: '30s',
            unit: 'Bps ',
          },
          {
            available_aggregate_functions: ['min', 'max', 'avg', 'sum'],
            dimensions: [
              {
                dimension_label: 'device',
                label: 'Device name',
                values: ['loop0', 'sda', 'sdb'],
              },
              {
                dimension_label: 'direction',
                label: 'Operation direction',
                values: ['read', 'write'],
              },
              {
                dimension_label: 'LINODE_ID',
                label: 'Linode ID',
                values: null,
              },
            ],
            label: 'Disk I/O',
            metric: 'system_disk_OPS_total',
            metric_type: 'counter',
            scrape_interval: '30s',
            unit: 'ops_per_second',
          },
          {
            label: 'Network Traffic',
            metric: 'vm_network_bytes_total',
            unit: 'Kbps',
            metric_type: 'gauge',
            scrape_interval: '300s',
            is_alertable: true,
            available_aggregate_functions: ['avg'],
            dimensions: [
              {
                label: 'Traffic Pattern',
                dimension_label: 'pattern',
                values: ['publicin', 'publicout', 'privatein', 'privateout'],
              },
              {
                label: 'Protocol',
                dimension_label: 'protocol',
                values: ['ipv4', 'ipv6'],
              },
              {
                label: 'Test Dimension',
                dimension_label: 'test',
                values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
              },
            ],
          },
        ],
      };

      const nodebalancerMetricsResponse = {
        data: [
          {
            label: 'Ingress Traffic Rate',
            metric: 'nb_ingress_traffic_rate',
            unit: 'bytes_per_second',
            metric_type: 'gauge',
            scrape_interval: '300s',
            is_alertable: true,
            available_aggregate_functions: ['sum'],
            dimensions: [
              {
                label: 'Port',
                dimension_label: 'port',
                values: null,
              },
              {
                label: 'Protocol',
                dimension_label: 'protocol',
                values: ['TCP', 'UDP'],
              },
              {
                label: 'Configuration',
                dimension_label: 'config_id',
                values: null,
              },
            ],
          },
          {
            label: 'Egress Traffic Rate',
            metric: 'nb_egress_traffic_rate',
            unit: 'bytes_per_second',
            metric_type: 'gauge',
            scrape_interval: '300s',
            is_alertable: true,
            available_aggregate_functions: ['sum'],
            dimensions: [
              {
                label: 'Port',
                dimension_label: 'port',
                values: null,
              },
              {
                label: 'Protocol',
                dimension_label: 'protocol',
                values: ['TCP', 'UDP'],
              },
              {
                label: 'Configuration',
                dimension_label: 'config_id',
                values: null,
              },
            ],
          },
          {
            label: 'Total Active Sessions',
            metric: 'nb_total_active_sessions',
            unit: 'count',
            metric_type: 'gauge',
            scrape_interval: '300s',
            is_alertable: true,
            available_aggregate_functions: ['max', 'min', 'avg', 'sum'],
            dimensions: [
              {
                label: 'Port',
                dimension_label: 'port',
                values: null,
              },
              {
                label: 'Protocol',
                dimension_label: 'protocol',
                values: ['TCP', 'UDP'],
              },
              {
                label: 'Configuration',
                dimension_label: 'config_id',
                values: null,
              },
            ],
          },
          {
            label: 'New Sessions',
            metric: 'nb_new_sessions_per_second',
            unit: 'sessions_per_second',
            metric_type: 'gauge',
            scrape_interval: '300s',
            is_alertable: true,
            available_aggregate_functions: ['sum'],
            dimensions: [
              {
                label: 'Port',
                dimension_label: 'port',
                values: null,
              },
              {
                label: 'Protocol',
                dimension_label: 'protocol',
                values: ['TCP', 'UDP'],
              },
              {
                label: 'Configuration',
                dimension_label: 'config_id',
                values: null,
              },
            ],
          },
          {
            label: 'Total Active Backends',
            metric: 'nb_total_active_backends',
            unit: 'count',
            metric_type: 'gauge',
            scrape_interval: '300s',
            is_alertable: true,
            available_aggregate_functions: ['max', 'min', 'avg', 'sum'],
            dimensions: [
              {
                label: 'Port',
                dimension_label: 'port',
                values: null,
              },
              {
                label: 'Protocol',
                dimension_label: 'protocol',
                values: ['TCP', 'UDP'],
              },
              {
                label: 'Configuration',
                dimension_label: 'config_id',
                values: null,
              },
            ],
          },
        ],
      };
      if (params.serviceType === 'firewall') {
        return HttpResponse.json({ data: firewallMetricDefinitionsResponse });
      }
      if (params.serviceType === 'nodebalancer') {
        return HttpResponse.json(nodebalancerMetricsResponse);
      }
      if (params.serviceType === 'objectstorage') {
        return HttpResponse.json({ data: objectStorageMetricRules });
      }
      if (params.serviceType === 'blockstorage') {
        return HttpResponse.json({ data: blockStorageMetricRules });
      }
      if (params.serviceType === 'netloadbalancer') {
        return HttpResponse.json({ data: networkLoadBalancerMetricCriteria });
      }
      if (params.serviceType === 'logs') {
        return HttpResponse.json({ data: logsMetricCriteria });
      }
      return HttpResponse.json(response);
    }
  ),
];

export const cloudPulseDashboards = () => [
  http.get('*/monitor/services/:serviceType/dashboards', ({ params }) => {
    const response = {
      data: [] as Dashboard[],
    };

    if (params.serviceType === 'dbaas') {
      response.data.push(
        dashboardFactory.build({
          id: 1,
          label: 'DBaaS Dashboard',
          service_type: 'dbaas',
          widgets: [
            widgetFactory.build({
              label: 'CPU utilization',
              metric: 'system_cpu_utilization_percent',
              unit: '%',
              group_by: ['entity_id'],
              y_label: 'system_cpu_utilization_ratio',
            }),
          ],
        })
      );
    }

    if (params.serviceType === 'linode') {
      response.data.push(
        dashboardFactory.build({
          id: 2,
          label: 'Linode Dashboard',
          service_type: 'linode',
          widgets: [
            widgetFactory.build({
              label: 'CPU utilization',
              metric: 'system_cpu_utilization_percent',
              unit: '%',
              group_by: ['entity_id'],
              y_label: 'system_cpu_utilization_ratio',
            }),
          ],
        })
      );
    }

    if (params.serviceType === 'nodebalancer') {
      response.data.push(
        dashboardFactory.build({
          id: 3,
          label: 'Nodebalancer Dashboard',
          service_type: 'nodebalancer',
        })
      );
    }

    if (params.serviceType === 'firewall') {
      response.data.push(
        dashboardFactory.build({
          id: 4,
          label: 'Firewall Dashboard',
          service_type: 'firewall',
        })
      );
      response.data.push(
        dashboardFactory.build({
          id: 8,
          label: 'Firewall Nodebalancer Dashboard',
          service_type: 'firewall',
        })
      );
    }

    if (params.serviceType === 'objectstorage') {
      response.data.push(
        dashboardFactory.build({
          id: 6,
          label: 'Object Storage Dashboard',
          service_type: 'objectstorage',
        })
      );
      response.data.push(
        dashboardFactory.build({
          id: 10,
          label: 'Endpoint Dashboard',
          service_type: 'objectstorage',
        })
      );
    }

    if (params.serviceType === 'blockstorage') {
      response.data.push(
        dashboardFactory.build({
          id: 7,
          label: 'Block Storage Dashboard',
          service_type: 'blockstorage',
        })
      );
    }

    if (params.serviceType === 'lke') {
      response.data.push(
        dashboardFactory.build({
          id: 9,
          label: 'LKE Enterprise Dashboard',
          service_type: 'lke',
        })
      );
    }

    if (params.serviceType === 'netloadbalancer') {
      response.data.push(
        dashboardFactory.build({
          id: 5,
          service_type: 'netloadbalancer',
          label: 'Network Load Balancer',
        })
      );
    }

    if (params.serviceType === 'logs') {
      response.data.push(
        dashboardFactory.build({
          id: 11,
          service_type: 'logs',
          label: 'Log Delivery Status',
        })
      );
    }

    return HttpResponse.json(response);
  }),
];

export const cloudPulseToken = () => [
  http.post('*/monitor/services/:serviceType/token', () => {
    const response = {
      token: 'eyJhbGciOiAiZGlyIiwgImVuYyI6ICJBMTI4Q0JDLUhTMjU2IiwgImtpZCI6ID',
    };
    return HttpResponse.json(response);
  }),
];

export const cloudPulseDashboardById = () => [
  http.get('*/monitor/dashboards/:id', ({ params }) => {
    let serviceType: string;
    let dashboardLabel: string;
    let widgets;

    const id = params.id;

    if (id === '1') {
      serviceType = 'dbaas';
      dashboardLabel = 'DBaaS Service I/O Statistics';
      widgets = [
        {
          metric: 'cpu_usage',
          unit: '%',
          label: 'CPU Usage',
          color: 'default',
          size: 12,
          chart_type: 'area',
          y_label: 'cpu_usage',
          group_by: ['entity_id'],
          aggregate_function: 'avg',
        },
        {
          metric: 'memory_usage',
          unit: '%',
          label: 'Memory Usage',
          color: 'default',
          size: 6,
          chart_type: 'area',
          y_label: 'memory_usage',
          group_by: ['entity_id'],
          aggregate_function: 'avg',
        },
      ];
    } else if (id === '3') {
      serviceType = 'nodebalancer';
      dashboardLabel = 'NodeBalancer Service I/O Statistics';
      widgets = [
        {
          metric: 'nb_ingress_traffic_rate',
          unit: 'Bps',
          label: 'Ingress Traffic Rate',
          color: 'default',
          size: 12,
          chart_type: 'line',
          y_label: 'nb_ingress_traffic_rate',
          group_by: ['entity_id'],
          aggregate_function: 'sum',
        },
        {
          metric: 'nb_egress_traffic_rate',
          unit: 'Bps',
          label: 'Egress Traffic Rate',
          color: 'default',
          size: 12,
          chart_type: 'line',
          y_label: 'nb_egress_traffic_rate',
          group_by: ['entity_id'],
          aggregate_function: 'sum',
        },
      ];
    } else if (id === '4') {
      serviceType = 'firewall';
      dashboardLabel = 'Firewall Service I/O Statistics';
      widgets = [
        {
          metric: 'fw_active_connections',
          unit: 'Count',
          label: 'Current Connections',
          color: 'default',
          size: 12,
          chart_type: 'line',
          y_label: 'fw_active_connections',
          group_by: ['entity_id', 'linode_id', 'interface_id'],
          aggregate_function: 'avg',
        },
        {
          metric: 'fw_available_connections',
          unit: 'Count',
          label: 'Available Connections',
          color: 'default',
          size: 12,
          chart_type: 'line',
          y_label: 'fw_available_connections',
          group_by: ['entity_id', 'linode_id', 'interface_id'],
          aggregate_function: 'avg',
        },
      ];
    } else if (id === '6') {
      serviceType = 'objectstorage';
      dashboardLabel = 'Object Storage Service I/O Statistics';
    } else if (id === '7') {
      serviceType = 'blockstorage';
      dashboardLabel = 'Block Storage Dashboard';
    } else if (id === '8') {
      serviceType = 'firewall';
      dashboardLabel = 'Firewall Nodebalancer Dashboard';
      widgets = [
        {
          metric: 'nb_ingress_bytes_accepted',
          unit: 'Count',
          label: 'Current Connections',
          color: 'default',
          size: 12,
          chart_type: 'line',
          y_label: 'nb_ingress_bytes_accepted',
          group_by: ['entity_id'],
          aggregate_function: 'avg',
        },
        {
          metric: 'nb_ingress_bytes_dropped',
          unit: 'Count',
          label: 'Available Connections',
          color: 'default',
          size: 12,
          chart_type: 'line',
          y_label: 'nb_ingress_bytes_dropped',
          group_by: ['entity_id'],
          aggregate_function: 'avg',
        },
      ];
    } else if (id === '9') {
      serviceType = 'lke';
      dashboardLabel = 'Kubernetes Enterprise Dashboard';
    } else if (id === '10') {
      serviceType = 'objectstorage';
      dashboardLabel = 'Endpoint Dashboard';
    } else if (id === '5') {
      widgets = [
        {
          metric: 'nlb_ingress_traffic',
          unit: 'Bps',
          label: 'Ingress Traffic Rate',
          color: 'default',
          size: 12,
          chart_type: 'line',
          y_label: 'nlb_ingress_traffic',
          aggregate_function: 'sum',
        },
        {
          metric: 'nlb_ingress_packets',
          unit: 'packets/s',
          label: 'Ingress Packets Rate',
          color: 'default',
          size: 12,
          chart_type: 'line',
          y_label: 'nlb_ingress_packets',
          aggregate_function: 'sum',
        },
        {
          metric: 'nlb_backend_ingress_traffic',
          unit: 'Bps',
          label: 'Ingress Traffic Rate Per backend',
          color: 'default',
          size: 12,
          chart_type: 'line',
          y_label: 'nlb_backend_ingress_traffic',
          aggregate_function: 'sum',
        },
        {
          metric: 'nlb_backend_ingress_packets',
          unit: 'packets/s',
          label: 'Ingress Packets Rate Per backend',
          color: 'default',
          size: 12,
          chart_type: 'line',
          y_label: 'nlb_backend_ingress_packets',
          aggregate_function: 'sum',
        },
      ];
      serviceType = 'netloadbalancer';
      dashboardLabel = 'Network Load Balancer';
    } else if (id === '11') {
      serviceType = 'logs';
      dashboardLabel = 'Log Delivery Status';
      widgets = [
        {
          metric: 'success_upload_count',
          unit: 'Count',
          label: 'Success Upload',
          color: 'default',
          size: 6,
          chart_type: 'area',
          y_label: 'success_upload_count',
          aggregate_function: 'sum',
        },
        {
          metric: 'error_upload_count',
          unit: 'Count',
          label: 'Error Upload',
          color: 'default',
          size: 6,
          chart_type: 'area',
          y_label: 'error_upload_count',
          aggregate_function: 'sum',
        },
        {
          metric: 'error_upload_rate',
          unit: '%',
          label: 'Error Rate',
          color: 'default',
          size: 12,
          chart_type: 'area',
          y_label: 'error_upload_rate',
          aggregate_function: 'avg',
        },
      ];
    } else {
      serviceType = 'linode';
      dashboardLabel = 'Linode Service I/O Statistics';
      widgets = [
        {
          metric: 'vm_cpu_time_total',
          unit: '%',
          label: 'CPU Usage by Instance',
          color: 'default',
          size: 12,
          chart_type: 'area',
          y_label: 'vm_cpu_time_total',
          group_by: ['entity_id'],
          aggregate_function: 'avg',
        },
        {
          metric: 'vm_local_disk_iops_total',
          unit: 'IOPS',
          label: 'Local Disk I/O by Instance',
          color: 'default',
          size: 12,
          chart_type: 'area',
          y_label: 'vm_local_disk_iops_total',
          group_by: ['entity_id'],
          aggregate_function: 'avg',
        },
        {
          metric: 'vm_network_bytes_total',
          unit: 'Kbps',
          label: 'Network Traffic In by Instance',
          color: 'default',
          size: 12,
          chart_type: 'area',
          y_label: 'vm_network_bytes_total',
          group_by: ['entity_id'],
          aggregate_function: 'avg',
          filters: [
            {
              dimension_label: 'pattern',
              operator: 'in',
              value: 'publicin',
            },
          ],
        },
      ];
    }

    const response = {
      created: '2024-04-29T17:09:29',
      id: Number(params.id),
      label: dashboardLabel,
      service_type: serviceType,
      type: 'standard',
      updated: null,
      widgets: widgets || [
        {
          aggregate_function: 'avg',
          chart_type: 'area',
          color: 'default',
          label: 'CPU utilization',
          metric: 'system_cpu_utilization_percent',
          size: 12,
          unit: '%',
          group_by: ['entity_id'],
          y_label: 'system_cpu_utilization_ratio',
          filters: dimensionFilterFactory.buildList(5, {
            operator: pickRandom(['endswith', 'eq', 'neq', 'startswith']),
          }),
        },
        {
          aggregate_function: 'avg',
          chart_type: 'area',
          color: 'default',
          label: 'Memory Usage',
          metric: 'system_memory_usage_by_resource',
          size: 12,
          unit: 'Bps',
          group_by: ['entity_id'],
          y_label: 'system_memory_usage_bytes',
        },
        {
          aggregate_function: 'avg',
          chart_type: 'area',
          color: 'default',
          label: 'Network Traffic In By The Instance',
          metric: 'system_network_io_by_resource',
          size: 6,
          unit: 'Bytes',
          y_label: 'system_network_io_bytes_total',
          filters: dimensionFilterFactory.buildList(3, {
            operator: pickRandom(['endswith', 'eq', 'neq', 'startswith', 'in']),
          }),
          group_by: ['entity_id'],
        },
        {
          aggregate_function: 'avg',
          chart_type: 'area',
          color: 'default',
          label: 'Disk I/O',
          metric: 'system_disk_OPS_total',
          size: 6,
          unit: 'OPS',
          group_by: ['entity_id'],
          y_label: 'system_disk_operations_total',
        },
      ],
    };
    return HttpResponse.json(response);
  }),
];

export const cloudPulseMetrics = () => [
  http.post('*/monitor/services/:serviceType/metrics', () => {
    const response = {
      data: {
        result: [
          {
            metric: {
              entity_id: '1',
              metric_name: 'average_cpu_usage',
              linode_id: '1',
              node_id: 'primary-1',
            },
            values: [
              [1721854379, '0.2744841110560275'],
              [1721857979, '0.2980357104166823'],
              [1721861579, '0.3290476561287732'],
              [1721865179, '0.32148793964961897'],
              [1721868779, '0.3269247326830727'],
              [1721872379, '0.3393055885526987'],
              [1721875979, '0.3237102833940027'],
              [1721879579, '0.3153372503472701'],
              [1721883179, '0.26811506053820466'],
              [1721886779, '0.25839295774934357'],
              [1721890379, '0.26863082415681144'],
              [1721893979, '0.26126998689934394'],
              [1721897579, '0.26164641539434685'],
            ],
          },
          {
            metric: {
              entity_id: '7',
              metric_name: 'average_cpu_usage',
              linode_id: '7',
              node_id: 'primary-2',
            },
            values: [
              [1721854379, '0.3744841110560275'],
              [1721857979, '0.4980357104166823'],
              [1721861579, '0.3290476561287732'],
              [1721865179, '0.42148793964961897'],
              [1721868779, '0.2269247326830727'],
              [1721872379, '0.3393055885526987'],
              [1721875979, '0.5237102833940027'],
              [1721879579, '0.3153372503472701'],
              [1721883179, '0.26811506053820466'],
              [1721886779, '0.35839295774934357'],
              [1721890379, '0.36863082415681144'],
              [1721893979, '0.46126998689934394'],
              [1721897579, '0.56164641539434685'],
            ],
          },
          {
            metric: {
              entity_id: 'obj-bucket-383.ap-west.linodeobjects.com',
              metric_name: 'average_cpu_usage',
            },
            values: [
              [1721854379, '0.3744841110560275'],
              [1721857979, '0.4980357104166823'],
              [1721861579, '0.3290476561287732'],
              [1721865179, '0.4148793964961897'],
              [1721868779, '0.4269247326830727'],
              [1721872379, '0.3393055885526987'],
              [1721875979, '0.6237102833940027'],
              [1721879579, '0.3153372503472701'],
              [1721883179, '0.26811506053820466'],
              [1721886779, '0.45839295774934357'],
              [1721890379, '0.36863082415681144'],
              [1721893979, '0.56126998689934394'],
              [1721897579, '0.66164641539434685'],
            ],
          },
        ],
        resultType: 'matrix',
      },
      isPartial: false,
      stats: {
        executionTimeMsec: 23,
        seriesFetched: '14',
      },
      status: 'success',
    };

    return HttpResponse.json(response);
  }),
];

export const allCloudPulseHandlers = [
  cloudPulseDashboardById,
  cloudPulseDashboards,
  cloudPulseMetricDefinitions,
  cloudPulseMetrics,
  cloudPulseServices,
  cloudPulseToken,
];
