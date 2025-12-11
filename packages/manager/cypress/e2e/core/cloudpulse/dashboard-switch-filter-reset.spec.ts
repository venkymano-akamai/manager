/**
 * FIXED CloudPulse Dashboard Setup
 * - No duplicate "firewall" dashboards across its variants
 * - Extra dashboards (8, 10) load correctly
 * - Handles mixed serviceType strings (firewall_linode, object-storage, etc.) as intended
 */

import {
  linodeFactory,
  nodeBalancerFactory,
  regionFactory,
} from '@linode/utilities';
import { widgetDetails } from 'support/constants/widgets';
import { mockGetAccount } from 'support/intercepts/account';
import {
  mockCreateCloudPulseJWEToken,
  mockCreateCloudPulseMetrics,
  mockGetCloudPulseDashboard,
  mockGetCloudPulseDashboards,
  mockGetCloudPulseMetricDefinitions,
  mockGetCloudPulseServices,
} from 'support/intercepts/cloudpulse';
import { mockGetDatabases } from 'support/intercepts/databases';
import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import { mockGetFirewalls } from 'support/intercepts/firewalls';
import { mockGetLinodes } from 'support/intercepts/linodes';
import { mockGetClusters } from 'support/intercepts/lke';
import { mockGetNodeBalancers } from 'support/intercepts/nodebalancers';
import {
  mockGetBuckets,
  mockGetObjectStorageEndpoints,
} from 'support/intercepts/object-storage';
import { mockGetRegions } from 'support/intercepts/regions';
import { ui } from 'support/ui';
import { generateRandomMetricsData } from 'support/util/cloudpulse';

import {
  accountFactory,
  cloudPulseMetricsResponseFactory,
  dashboardFactory,
  dashboardMetricFactory,
  databaseFactory,
  firewallFactory,
  flagsFactory,
  kubeLinodeFactory,
  kubernetesClusterFactory,
  objectStorageBucketFactory,
  objectStorageEndpointsFactory,
  widgetFactory,
} from 'src/factories';

import type {
  CloudPulseServiceType,
  Dashboard,
  Database,
  ObjectStorageEndpoint,
} from '@linode/api-v4';

/** normalize serviceType → so firewall_linode + firewall_nodebalancer = firewall */
const normalize = (svc: string) =>
  svc
    .replace(/[_-]/g, '')
    .replace(/linode|nodebalancer|endpoint/g, '')
    .trim();

const metricDefinitionsFor = (key: keyof typeof widgetDetails) =>
  widgetDetails[key].metrics.map((m) =>
    dashboardMetricFactory.build({
      label: m.title,
      metric: m.name,
      unit: m.unit,
    })
  );

const buildDashboard = ({
  dashboardName,
  serviceType,
  metrics,
  id,
}: {
  dashboardName: string;
  id: number | string;
  metrics: Array<{ name: string; title: string; unit: string; yLabel: string }>;
  serviceType: CloudPulseServiceType;
}) =>
  dashboardFactory.build({
    label: dashboardName,
    service_type: serviceType,
    id: Number(id),
    widgets: metrics.map((metric) =>
      widgetFactory.build({
        entity_ids: [String(id)],
        filters: [],
        label: metric.title,
        metric: metric.name,
        unit: metric.unit,
        y_label: metric.yLabel,
        namespace_id: Number(id),
        service_type: serviceType,
      })
    ),
  });

/** main dashboard for each service */
const dashboardFor = (key: keyof typeof widgetDetails) => {
  const svc = widgetDetails[key];

  return buildDashboard({
    dashboardName: `${svc.dashboardName}-${svc.id}`,
    serviceType: svc.serviceType as CloudPulseServiceType,
    id: svc.id,
    metrics: svc.metrics.map((m) => ({
      name: m.name,
      title: m.title,
      unit: m.unit,
      yLabel: m.yLabel,
    })),
  });
};

/** Extra dashboards (fixed mapping using normalized keys) */
const extraDashboards: {
  [key: string]: Array<{
    dashboardName: string;
    id: number;
    metrics: (typeof widgetDetails)[keyof typeof widgetDetails]['metrics'];
  }>;
} = {
  objectstorage: [
    {
      id: 10,
      dashboardName: 'Object Storage By Endpoint Dashboard-10',
      metrics: widgetDetails.objectstorage.metrics,
    },
  ],
  firewall: [
    {
      id: 8,
      dashboardName: 'Firewall NodeBalancer Dashboard-8',
      metrics: widgetDetails.firewall.metrics,
    },
  ],
};

const dbaas = widgetDetails.dbaas;

const mockLinode = linodeFactory.build({
  id: kubeLinodeFactory.build().instance_id ?? undefined,
  label: dbaas.clusterName,
  region: 'us-ord',
});

const mockRegion = regionFactory.build({
  id: 'us-ord',
  label: 'Chicago, IL',
  capabilities: [
    'Managed Databases',
    'Linodes',
    'NodeBalancers',
    'Kubernetes',
    'Object Storage',
    'Block Storage',
    'Cloud Firewall',
  ],
  monitors: {
    metrics: [
      'Managed Databases',
      'Linodes',
      'NodeBalancers',
      'Kubernetes',
      'Object Storage',
      'Block Storage',
      'Cloud Firewall',
      'Object Storage',
    ],
  },
});

const databaseMock: Database = databaseFactory.build({
  cluster_size: 1,
  engine: 'mysql',
  label: dbaas.clusterName,
  region: mockRegion.id,
  type: dbaas.engine,
});
const mockedEnterpriseClusters = [
  kubernetesClusterFactory.build({
    label: 'enterprise-cluster-us-east1',
    region: 'us-ord',
    tier: 'enterprise',
  }),
];
const mockFirewalls = [
  firewallFactory.build({
    id: 1,
    label: 'Firewall-0',
    status: 'enabled',
    entities: [
      {
        id: 1,
        label: 'linode-1',
        type: 'linode',
        url: '/test',
        parent_entity: null,
      },
    ],
  }),
  firewallFactory.build({
    id: 2,
    label: 'Firewall-1',
    status: 'enabled',
    entities: [
      {
        id: 1,
        label: 'nodebalancer-1',
        type: 'nodebalancer',
        url: '/test',
        parent_entity: null,
      },
    ],
  }),
];
const mockNodeBalancers = nodeBalancerFactory.build({
  label: 'mockNodeBalancer-resource-1',
  region: 'us-ord',
  id: 2,
});

const metricsAPIResponsePayload = cloudPulseMetricsResponseFactory.build({
  data: generateRandomMetricsData('Last 24 Hours', '5 min'),
});
const bucketMock = [
  objectStorageBucketFactory.build({
    cluster: 'us-ord-1',
    hostname: 'bucket-1.us-ord-1.linodeobjects.com',
    region: mockRegion.id,
    s3_endpoint: 'endpoint_type-E2-us-sea-1.linodeobjects.com',
    label: 'bucket-1',
    endpoint_type: 'E1',
  }),
  objectStorageBucketFactory.build({
    cluster: 'us-ord-2',
    hostname: 'bucket-2.us-ord-2.linodeobjects.com',
    region: mockRegion.id,
    s3_endpoint: 'endpoint_type-E2-us-sea-2.linodeobjects.com',
    label: 'bucket-2',
    endpoint_type: 'E2',
  }),
];

const mockEndpoints: ObjectStorageEndpoint[] = [
  objectStorageEndpointsFactory.build({
    endpoint_type: 'E2',
    region: mockRegion.id,
    s3_endpoint: 'endpoint_type-E2-us-sea-1.linodeobjects.com',
  }),
  objectStorageEndpointsFactory.build({
    endpoint_type: 'E3',
    region: mockRegion.id,
    s3_endpoint: 'endpoint_type-E2-us-sea-2.linodeobjects.com',
  }),
];

describe('Dashboard Filter Reset on Switch', () => {
  const serviceKeys = Object.keys(widgetDetails) as Array<
    keyof typeof widgetDetails
  >;

  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(accountFactory.build({ capabilities: ['Object Storage'] }));
    mockGetLinodes([mockLinode]);
    mockGetRegions([mockRegion]);
    mockGetDatabases([databaseMock]);
    mockGetClusters(mockedEnterpriseClusters);
    mockGetFirewalls(mockFirewalls);
    mockGetNodeBalancers([mockNodeBalancers]);
    mockGetBuckets(bucketMock).as('getBuckets');
    mockGetObjectStorageEndpoints(mockEndpoints).as(
      'getObjectStorageEndpoints'
    );

    // Step 1: Build master deduped dashboard list and map serviceType to dashboards
    const masterDashboardsByServiceType: Record<string, Dashboard[]> = {};
    const seenDashboardIds = new Set<number>();

    serviceKeys.forEach((key) => {
      const svc = widgetDetails[key];
      const raw = svc.serviceType;
      const norm = normalize(raw);

      // Get main dashboard
      const main = dashboardFor(key);

      const extras = extraDashboards[norm] ?? [];
      const extraBuilt = extras.map((d) =>
        buildDashboard({
          dashboardName: d.dashboardName,
          serviceType: raw as CloudPulseServiceType,
          id: d.id,
          metrics: d.metrics.map((m) => ({
            name: m.name,
            title: m.title,
            unit: m.unit,
            yLabel: m.yLabel,
          })),
        })
      );

      // Compose the list for this type, but dedupe by id
      const dashboardsForThisType: Dashboard[] = [];
      [main, ...extraBuilt].forEach((db) => {
        if (!seenDashboardIds.has(db.id)) {
          dashboardsForThisType.push(db);
          seenDashboardIds.add(db.id);
        }
      });

      // Assign to the serviceType if not already done
      if (!masterDashboardsByServiceType[raw]) {
        masterDashboardsByServiceType[raw] = dashboardsForThisType;
      }
    });

    // Step 2: Only one call per API route, and only with deduped dashboards
    Object.entries(masterDashboardsByServiceType).forEach(
      ([serviceType, dashboards]) => {
        const key = serviceKeys.find(
          (k) => widgetDetails[k].serviceType === serviceType
        );
        if (key) {
          mockGetCloudPulseMetricDefinitions(
            serviceType,
            metricDefinitionsFor(key)
          );
          mockGetCloudPulseDashboards(serviceType, dashboards).as(
            'fetchDashboard'
          );
          dashboards.forEach((db) => mockGetCloudPulseDashboard(db.id, db));
          mockCreateCloudPulseJWEToken(serviceType);
        }
      }
    );

    // Tell UI the list of available top-level serviceTypes
    mockGetCloudPulseServices(Object.keys(masterDashboardsByServiceType));
  });
  const ALL_DASHBOARDS = [
    { name: 'Dbaas Dashboard-1', serviceType: 'dbaas' },

    { name: 'Block Storage Dashboard-7', serviceType: 'blockstorage' },
    {
      name: 'Object Storage By Endpoint Dashboard-10',
      serviceType: 'objectstorage',
    },
    { name: 'Object Storage Dashboard-6', serviceType: 'objectstorage' },
    { name: 'Firewall Dashboard-4', serviceType: 'firewall' },
    { name: 'Firewall NodeBalancer Dashboard-8', serviceType: 'firewall' },
    { name: 'Linode Dashboard-2', serviceType: 'linode' },
    { name: 'LKE Cluster Status Dashboard-9', serviceType: 'lke' },
    { name: 'NodeBalancer Dashboard-3', serviceType: 'nodebalancer' },
  ];

  const selectDashboard = (dashboardName: string, serviceType: string) => {
    ui.autocomplete
      .findByLabel('Dashboard')
      .should('be.visible')
      .as('dashboardField');

    cy.get('@dashboardField').clear();
    cy.get('@dashboardField').type(dashboardName);

    ui.autocompletePopper
      .findByTitle(dashboardName)
      .should('be.visible')
      .click();

    cy.get('@dashboardField')
      .should('have.value', dashboardName, { timeout: 20000 })
      .should('be.visible');

    switch (serviceType) {
      case 'blockstorage': {
        ui.regionSelect.find().click();
        ui.regionSelect.find().clear();
        ui.regionSelect.find().type('US, Chicago, IL (us-ord){enter}');

        ui.autocomplete.findByLabel('Volumes').type('Test_Volume');
        ui.autocompletePopper.findByTitle('Test_Volume').click();
        ui.autocomplete.findByLabel('Volumes').type('{esc}');
        break;
      }

      case 'dbaas': {
        ui.autocomplete
          .findByLabel('Database Engine')
          .should('be.visible')
          .type('MySQL');

        ui.autocompletePopper.findByTitle('MySQL').should('be.visible').click();

        ui.regionSelect.find().click();
        ui.regionSelect.find().clear();
        ui.regionSelect.find().type('US, Chicago, IL (us-ord){enter}');

        ui.autocomplete
          .findByLabel('Database Clusters')
          .should('be.visible')
          .type('mysql-cluster');

        ui.autocompletePopper
          .findByTitle('mysql-cluster')
          .should('be.visible')
          .click();

        ui.button
          .findByAttribute('aria-label', 'Close')
          .should('be.visible')
          .click();

        ui.autocomplete
          .findByLabel('Node Type')
          .should('be.visible')
          .type('primary{enter}');

        break;
      }

      case 'firewall': {
        switch (dashboardName) {
          case 'Firewall Dashboard-4':
            cy.findByPlaceholderText('Select Firewalls').type(
              'Firewall-0{enter}'
            );

            ui.autocomplete.findByLabel('Firewalls').click();
            ui.regionSelect.find().click();
            ui.regionSelect.find().clear();
            ui.regionSelect.find().type('US, Chicago, IL (us-ord){enter}');
            ui.autocomplete.findByLabel('Linode Region').click();
            ui.autocomplete
              .findByLabel('Interface Types')
              .should('be.visible')
              .type('VPC{enter}');

            ui.autocomplete.findByLabel('Interface Types').click();

            cy.findByPlaceholderText('e.g., 1234,5678')
              .should('be.visible')
              .type('1234{enter}');
            break;

          case 'Firewall NodeBalancer Dashboard-8':
            cy.findByPlaceholderText('Select a Firewall').type(
              'Firewall-1{enter}'
            );

            ui.autocomplete.findByLabel('Firewall').click();
            ui.regionSelect.find().click();
            ui.regionSelect.find().clear();
            ui.regionSelect.find().type('US, Chicago, IL (us-ord){enter}');

            cy.get('body').click(0, 0); // click empty area to close

            break;
        }
        break;
      }

      case 'linode': {
        ui.regionSelect.find().click();
        ui.regionSelect.find().clear();
        ui.regionSelect.find().type('US, Chicago, IL (us-ord){enter}');

        ui.autocomplete
          .findByLabel('Linode Label(s)')
          .should('be.visible')
          .type('mysql-cluster{enter}');
        ui.autocomplete.findByLabel('Linode Label(s)').click();

        break;
      }
      case 'lke': {
        ui.regionSelect.find().click();
        ui.regionSelect.find().clear();
        ui.regionSelect.find().type('US, Chicago, IL (us-ord){enter}');

        ui.autocomplete
          .findByLabel('Clusters')
          .should('be.visible')
          .as('clusterDropdown');

        cy.get('@clusterDropdown').click();
        cy.get('@clusterDropdown').type('enterprise-cluster-us-east1{enter}');

        cy.get('@clusterDropdown').click();

        cy.findByText('enterprise-cluster-us-east1').should('be.visible');

        break;
      }

      case 'nodebalancer': {
        ui.regionSelect.find().click();
        ui.regionSelect.find().clear();
        ui.regionSelect.find().type('US, Chicago, IL (us-ord){enter}');

        ui.autocomplete
          .findByLabel('Nodebalancers')
          .should('be.visible')
          .type('mockNodeBalancer-resource-1{enter}');

        cy.findByPlaceholderText('e.g., 80,443,3000')
          .should('be.visible')
          .type('80{enter}');

        break;
      }
      case 'objectstorage': {
        switch (dashboardName) {
          case 'Object Storage By Endpoint Dashboard-10': {
            ui.regionSelect.find().click();
            ui.regionSelect.find().clear();
            ui.regionSelect.find().type('US, Chicago, IL (us-ord){enter}');

            ui.autocomplete
              .findByLabel('Endpoints')
              .should('be.visible')
              .type('endpoint_type-E2-us-sea-2.linodeobjects.com{enter}');

            ui.autocomplete.findByLabel('Endpoints').click();

            break;
          }

          case 'Object Storage Dashboard-6': {
            ui.regionSelect.find().click();
            ui.regionSelect.find().clear();
            ui.regionSelect.find().type('US, Chicago, IL (us-ord){enter}');

            ui.autocomplete
              .findByLabel('Endpoints')
              .should('be.visible')
              .type('endpoint_type-E2-us-sea-2.linodeobjects.com{enter}');

            ui.autocomplete.findByLabel('Endpoints').click();

            ui.autocomplete
              .findByLabel('Buckets')
              .should('be.visible')
              .type('bucket-2.us-ord-2.linodeobjects.com{enter}');

            ui.autocomplete.findByLabel('Buckets').click();
            break;
          }

          default:
            break;
        }

        break;
      }

      default:
        break;
    }

    mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
      'getMetrics'
    );
  };

  it('should load dbass dashboard list and show additional dashboards', () => {
    mockCreateCloudPulseMetrics(dbaas.serviceType, metricsAPIResponsePayload);
    mockCreateCloudPulseMetrics(
      dbaas.serviceType,
      metricsAPIResponsePayload
    ).as('getMetrics');

    cy.visitWithLogin('/metrics');
    selectDashboard('Dbaas Dashboard-1', 'dbaas');
    cy.wait(['@getMetrics', '@getMetrics', '@getMetrics', '@getMetrics']);
    ALL_DASHBOARDS.forEach(({ name, serviceType }) => {
      selectDashboard(name, serviceType);
      cy.get('body').within(() => {
        cy.contains('Something went wrong').should('not.exist');
        cy.contains('TypeError: p.current[z]?.map is not a function').should(
          'not.exist'
        );
      });
    });
  });
});
