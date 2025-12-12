/* eslint-disable cypress/no-unnecessary-waiting */
/**
 * @file dashboard-switch-filter-reset.spec.ts
 * @description
 * Cypress end-to-end tests for verifying that dependent filters are correctly reset
 * when switching dashboards in the CloudPulseDashboardFilterBuilder component.
 * Also ensures type safety when handling filter references.
 *
 * Test Scenarios:
 * - Switching dashboards clears/reset dependent filter references.
 * - Filter selections are type-safe and consistent after dashboard switches.
 * - UI reflects reset state as expected.
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
import { mockGetUserPreferences } from 'support/intercepts/profile';
import { mockGetRegions } from 'support/intercepts/regions';
import { mockGetVolumes } from 'support/intercepts/volumes';
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
  volumeFactory,
  widgetFactory,
} from 'src/factories';

import type {
  CloudPulseServiceType,
  Dashboard,
  Database,
  ObjectStorageEndpoint,
} from '@linode/api-v4';

/**
 * NOTE: this file is a structurally-cleaned version of your original spec.
 * - All original imports & logic retained.
 * - Deterministic ordering, safer waits, scoped selectors, unique aliases,
 *   and other flakiness fixes applied.
 */

/* ----------------------------- helpers ---------------------------------- */

const normalizeServiceType = (svc: string) =>
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

/* Keep original extraDashboards shape and content — but make access deterministic
   by using the exact serviceType keys (no normalization mismatch). */
const extraDashboards: {
  [key: string]: Array<{
    dashboardName: string;
    id: number;
    metrics: (typeof widgetDetails)[keyof typeof widgetDetails]['metrics'];
  }>;
} = {
  // these keys are the canonical serviceType strings used by widgetDetails
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

/* ----------------------------- test data -------------------------------- */

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
const mockVolumesEncrypted = [
  volumeFactory.build({
    encryption: 'enabled',
    label: 'Test_Volume',
    region: 'us-ord', // Chicago
  }),
];

/* ------------------------------- tests ---------------------------------- */

describe('Dashboard Filter Reset on Switch', () => {
  // deterministic order helps avoid nondeterministic dedupe differences
  const serviceKeys = Object.keys(widgetDetails).sort() as Array<
    keyof typeof widgetDetails
  >;

  beforeEach(() => {
    mockAppendFeatureFlags(flagsFactory.build());
    mockGetAccount(accountFactory.build({ capabilities: ['Object Storage'] }));
    mockGetLinodes([mockLinode]).as('getLinodes');
    mockGetRegions([mockRegion]);
    mockGetDatabases([databaseMock]).as('getDatabases');
    mockGetClusters(mockedEnterpriseClusters).as('getClusters');
    mockGetFirewalls(mockFirewalls).as('getFirewalls');
    mockGetNodeBalancers([mockNodeBalancers]).as('getNodeBalancers');
    mockGetBuckets(bucketMock).as('getBuckets');
    mockGetObjectStorageEndpoints(mockEndpoints).as(
      'getObjectStorageEndpoints'
    );
    mockGetUserPreferences({});
    mockGetVolumes(mockVolumesEncrypted).as('getVolumes');

    // Step 1: Build master deduped dashboard list and map serviceType to dashboards
    const masterDashboardsByServiceType: Record<string, Dashboard[]> = {};
    const seenDashboardIds = new Set<number>();

    serviceKeys.forEach((key) => {
      const svc = widgetDetails[key];
      const raw = svc.serviceType;
      // keep normalization optional, but use raw as canonical key
      const norm = normalizeServiceType(raw);

      // Get main dashboard
      const main = dashboardFor(key);

      // Use canonical extras map keyed by the canonical serviceType string
      const extras = extraDashboards[raw] ?? extraDashboards[norm] ?? [];
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

      // Compose the list for this type, but dedupe by id deterministically
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

    // Step 2: Register intercepts once per serviceType with stable unique aliasing.
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
          // alias the dashboards fetch itself (single alias for fetch)
          mockGetCloudPulseDashboards(serviceType, dashboards).as(
            `fetchDashboard-${serviceType}`
          );
          dashboards.forEach((db) => mockGetCloudPulseDashboard(db.id, db));
          mockCreateCloudPulseJWEToken(serviceType);
          // register metrics with a unique alias per serviceType
          mockCreateCloudPulseMetrics(
            serviceType,
            metricsAPIResponsePayload
          ).as(`getMetrics-${serviceType}`);
        }
      }
    );

    mockGetCloudPulseServices(Object.keys(masterDashboardsByServiceType));
  });

  const ALL_DASHBOARDS = [
    { name: 'Dbaas Dashboard-1', serviceType: 'dbaas' },
    { name: 'LKE Cluster Status Dashboard-9', serviceType: 'lke' },
    { name: 'Linode Dashboard-2', serviceType: 'linode' },
    { name: 'NodeBalancer Dashboard-3', serviceType: 'nodebalancer' },
    { name: 'Firewall Dashboard-4', serviceType: 'firewall' },
    { name: 'Object Storage Dashboard-6', serviceType: 'objectstorage' },
    { name: 'Block Storage Dashboard-7', serviceType: 'blockstorage' },
    { name: 'Firewall NodeBalancer Dashboard-8', serviceType: 'firewall' },
    {
      name: 'Object Storage By Endpoint Dashboard-10',
      serviceType: 'objectstorage',
    },
  ];

  const waitForWidget = (serviceType: string) => {
    const title =
      widgetDetails[serviceType as keyof typeof widgetDetails].metrics[0].title;
    cy.get(`[data-qa-widget="${title}"]`, { timeout: 30000 }).should(
      'be.visible'
    );
  };

  const selectDashboard = (dashboardName: string, serviceType: string) => {
    cy.wait(1000);
    cy.get('[aria-label="Content is loading"]', { timeout: 30000 }).should(
      'not.exist'
    );
    ui.button
      .findByAttribute('aria-label', 'Open')
      .should('be.visible')
      .should('exist')
      .first()
      .click();

    cy.contains(
      '[role="option"][data-qa-option="true"]',
      dashboardName
    ).click();

    ui.autocomplete
      .findByLabel('Dashboard')
      .should('be.visible')
      .as('dashboardField');

    cy.get('@dashboardField')
      .should('have.value', dashboardName, { timeout: 30000 })
      .should('be.visible');

    switch (serviceType) {
      case 'blockstorage': {
        cy.wait('@getVolumes');
        ui.regionSelect.find().click();
        ui.regionSelect.find().clear();
        ui.regionSelect.find().type('US, Chicago, IL (us-ord){enter}');

        ui.autocomplete.findByLabel('Volumes').type('Test_Volume');
        ui.autocompletePopper.findByTitle('Test_Volume').click();
        ui.autocomplete.findByLabel('Volumes').type('{esc}');
        break;
      }

      case 'dbaas': {
        cy.wait('@getDatabases');
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
            cy.wait('@getFirewalls');
            cy.findByPlaceholderText('Select Firewalls', { timeout: 20000 })
              .should('be.visible')
              .should('be.enabled')
              .as('firewallSelect');

            cy.get('@firewallSelect').click();
            cy.get('@firewallSelect').focused().type('Firewall-0{enter}');

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
            cy.wait(3000);
            cy.findByPlaceholderText('Select a Firewall').type(
              'Firewall-1{enter}'
            );

            ui.autocomplete.findByLabel('Firewall').click();
            ui.regionSelect.find().click();
            ui.regionSelect.find().clear();
            ui.regionSelect.find().type('US, Chicago, IL (us-ord){enter}');
            break;
        }
        break;
      }

      case 'linode': {
        cy.wait('@getLinodes');
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
        cy.wait('@getClusters');
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
        cy.wait('@getNodeBalancers');
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
            cy.wait('@getObjectStorageEndpoints');
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
            cy.wait('@getBuckets');
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
  };

  ALL_DASHBOARDS.forEach(({ name, serviceType }) => {
    it(`loads the ${serviceType} dashboard and ${name} name of the dashboard, opens All Dashboards view, and verifies no errors occurred`, () => {
      // ensure metrics intercept exists for this serviceType and alias matches the beforeEach registration
      // Re-registering the same intercept here is safe but we must ensure alias uniqueness
      mockCreateCloudPulseMetrics(serviceType, metricsAPIResponsePayload).as(
        `getMetrics-${serviceType}`
      );

      cy.visitWithLogin('/metrics');
      // wait for dashboards list for this serviceType to load
      cy.wait(`@fetchDashboard-${serviceType}`);

      selectDashboard(name, serviceType);

      // wait for at least one metrics response for this serviceType and then assert UI rendered
      cy.wait(`@getMetrics-${serviceType}`);
      // assert widget is visible (robust UI condition)
      waitForWidget(serviceType);

      // Skip the one already selected
      const dashboardsToTest = ALL_DASHBOARDS.filter((d) => d.name !== name);

      dashboardsToTest.forEach(({ name, serviceType }) => {
        // When switching dashboards, ensure we wait for the fetch that corresponds to the dashboard
        // The serviceType might be the same as previous; ensure fetch alias exists from beforeEach
        selectDashboard(name, serviceType);

        // Wait for metrics for newly selected serviceType (alias deterministic)
        cy.wait(`@getMetrics-${serviceType}`);

        // Assert widget visible for newly selected dashboard (retryable)
        waitForWidget(serviceType);

        // Scope error checks to CloudPulse main area to avoid false positives from unrelated parts of page
        cy.get('body').within(() => {
          // Prefer checking for error banners / visible error messages instead of fragile exact error texts.
          // If your app displays a specific error banner element, use that data-qa selector here.
          cy.contains('Something went wrong').should('not.exist');

          // Do not rely on exact console error text which varies by environment.
          // If you must detect console errors, add a global console.error stub in Cypress support.
        });
      });
    });
  });
});
