import { mockAppendFeatureFlags } from 'support/intercepts/feature-flags';
import {
  mockCloudPulseJWSToken,
  mockCloudPulseDashboardServicesResponse,
  mockCloudPulseCreateMetrics,
  mockCloudPulseGetDashboards,
  mockCloudPulseGetMetricDefinitions,
  mockCloudPulseServices,
} from 'support/intercepts/cloudpulse';
import { ui } from 'support/ui';
import { widgetDetails } from 'support/constants/widgets';
import {
  accountFactory,
  cloudPulseMetricsResponseFactory,
  dashboardFactory,
  dashboardMetricFactory,
  databaseFactory,
  generateValues,
  kubeLinodeFactory,
  linodeFactory,
  regionFactory,
  widgetFactory,
} from 'src/factories';
import { mockGetAccount } from 'support/intercepts/account';
import { mockGetLinodes } from 'support/intercepts/linodes';
import { mockGetUserPreferences, mockUpdateUserPreferences } from 'support/intercepts/profile';
import { mockGetRegions } from 'support/intercepts/regions';
import { extendRegion } from 'support/util/regions';
import { CloudPulseMetricsResponse, Database, UserPreferences } from '@linode/api-v4';
import { transformData } from 'src/features/CloudPulse/Utils/unitConversion';
import { getMetrics } from 'src/utilities/statMetrics';
import { mockGetDatabases } from 'support/intercepts/databases';
import { userPreferencesFactory } from 'src/factories/dashboards';

/**
 * This test ensures that widget titles are displayed correctly on the dashboard.
 * This test suite is dedicated to verifying the functionality and display of widgets on the Cloudpulse dashboard.
 *  It includes:
 * Validating that widgets are correctly loaded and displayed.
 * Ensuring that widget titles and data match the expected values.
 * Verifying that widget settings, such as granularity and aggregation, are applied correctly.
 * Testing widget interactions, including zooming and filtering, to ensure proper behavior.
 * Each test ensures that widgets on the dashboard operate correctly and display accurate information.
 */

const expectedGranularityArray = ['Auto', '1 day', '1 hr', '5 min'];

const timeDurationToSelect = 'Last 24 Hours';
const {
  metrics,
  id,
  serviceType,
  dashboardName,
  region,
  engine,
  clusterName,
  nodeType,
} = widgetDetails.dbaas;

const dashboard = dashboardFactory.build({
  label: dashboardName,
  service_type: serviceType,
  widgets: metrics.map(({ title, yLabel, name, unit }) => {
    return widgetFactory.build({
      label: title,
      y_label: yLabel,
      metric: name,
      unit,
    });
  }),
});

const metricDefinitions = {
  data: metrics.map(({ title, name, unit }) =>
    dashboardMetricFactory.build({
      label: title,
      metric: name,
      unit,
    })
  ),
};

const mockKubeLinode = kubeLinodeFactory.build();
const mockLinode = linodeFactory.build({
  label:clusterName,
  id: mockKubeLinode.instance_id ?? undefined,
});

const mockAccount = accountFactory.build();
const mockRegion = extendRegion(
  regionFactory.build({
    capabilities: ['Linodes'],
    id: 'us-ord',
    label: 'Chicago, IL',
    country: 'us',
  })
);
const responsePayload =cloudPulseMetricsResponseFactory.build( {data:generateValues( timeDurationToSelect,
  '5 min')});  

const databaseMock: Database = databaseFactory.build({
  label:  clusterName,
  type:  engine,
  region:  region,
  version: "1",
  status: 'provisioning',
  cluster_size: 1,
  engine: 'mysql',
  hosts: {
    primary: undefined,
    secondary: undefined,
  },
});
const userPreferences = userPreferencesFactory.build({
  aclpPreference: {
    dashboardId: id, 
    "engine":engine.toLowerCase(),
    region:'us-ord',
    resources: ['1'], 
    timeDuration:timeDurationToSelect,
    "role": nodeType.toLowerCase(),
    // You can also override widgets if necessary
    widgets: {
      'CPU Utilization': {
        aggregateFunction: 'max',
        label: 'CPU Utilization',
        timeGranularity: { unit: 'hr', value: 1 },
      },
      'Disk I/O': {
        aggregateFunction: 'max',
        label: 'Disk I/O',
        timeGranularity: { unit: 'hr', value: 1 },
      },
      'Memory Usage': {
        aggregateFunction: 'max',
        label: 'Memory Usage',
        timeGranularity: { unit: 'hr', value: 1 },
      },
      'Network Traffic': {
        aggregateFunction: 'max',
        label: 'Network Traffic',
        timeGranularity: { unit: 'hr', value: 1 },
      },
    },
  },
} as Partial<UserPreferences>);
describe('Dbaas Dashboard and Widget Verification Tests', () => {
  beforeEach(() => {
    // Mocking Feature Flags
    mockAppendFeatureFlags({
      aclp: { beta: true, enabled: true },
    }).as('getFeatureFlags');

    // Mocking Account Data
    mockGetAccount(mockAccount).as('getAccount'); // Enables the account to have capability for Akamai Cloud Pulse

    // Mocking Linodes Data
    mockGetLinodes([mockLinode]).as('getLinodes');

    // Mocking Cloud Pulse Metric Definitions
    mockCloudPulseGetMetricDefinitions(metricDefinitions, serviceType);

    // Mocking Cloud Pulse Dashboards
    mockCloudPulseGetDashboards(dashboard, serviceType).as('dashboard');

    // Mocking Cloud Pulse Services
    mockCloudPulseServices(serviceType).as('services');

    // Mocking Dashboard Services Response
    mockCloudPulseDashboardServicesResponse(dashboard, id);

    // Mocking JWS Token for Cloud Pulse
    mockCloudPulseJWSToken(serviceType);

    // Mocking Metrics Creation
    mockCloudPulseCreateMetrics(responsePayload, serviceType).as('getMetrics');

    // Mocking Database Data
    mockGetDatabases([databaseMock]).as('getDatabases');

    // Mocking Regions Data
    mockGetRegions([mockRegion]).as('getRegions');

    // Mocking User Preferences
    mockGetUserPreferences({}).as('getUserPreferences');


    // Visit the Cloud Pulse Page
    cy.visitWithLogin('monitor/cloudpulse').as('cloudPulsePage');
    
    // Selecting a Dashboard from the autocomplete input
    ui.autocomplete
      .findByLabel('Select a Dashboard')
      .should('be.visible')
      .type(`${dashboardName}{enter}`)
      .should('be.visible');

  
    // Select a Time Duration
    ui.autocomplete
      .findByLabel('Select a Time Duration')
      .should('be.visible')
      .type(`${timeDurationToSelect}{enter}`)
      .should('be.visible');

    // Select an Engine
    ui.autocomplete
      .findByLabel('Select an Engine')
      .should('be.visible')
      .type(`${engine}{enter}`)
      .should('be.visible');

    // Select a Region
    ui.regionSelect
      .find()
      .click()
      .type(`${region}{enter}`);

    // Select a Resource
    ui.autocomplete
      .findByLabel('Select a Resource')
      .should('be.visible')
      .type(`${clusterName}{enter}`)
      .click();

  
    // Mocking User Preferences Update
    mockUpdateUserPreferences(userPreferences).as('updateUserPreferences');

    // Select a Node Type
    ui.autocomplete
      .findByLabel('Select a Node Type')
      .should('be.visible')
      .type(`${nodeType}{enter}`);

    // Verify Expected Widgets on the Dashboard
    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget-header="${testData.title}"]`;
      cy.get(widgetSelector)
        .invoke('text')
        .then((text) => {
          expect(text.trim()).to.equal(
            `${testData.title} (${testData.unit.trim()})`
          );
        });
    });

     // Verify Node Type Preference Update
    cy.wait('@updateUserPreferences').then((interception) => {
      const { body: requestPayload } = interception.request;
      const preferences = requestPayload.aclpPreference;
      expect(preferences).to.have.property('dashboardId',id);
      expect(preferences).to.have.property('timeDuration',timeDurationToSelect);
      expect(preferences).to.have.property('region', 'us-ord');
      expect(preferences).to.have.property('engine', engine.toLowerCase());
      expect(preferences).to.have.property('role', nodeType.toLowerCase());
      expect(preferences).to.have.property('resources').that.deep.equals( ["1"]);
  
    });
  });

 it('should allow users to select their desired granularity and see the most recent data from the API reflected in the graph', () => {
    // validate the widget level granularity selection and its metrics
    for (const testData of metrics) {
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;

      cy.get(widgetSelector)
        .should('be.visible')
        .first()
        .within(() => {
          // check for all available granularity in popper
          ui.autocomplete
            .findByLabel('Select an Interval')
            .should('be.visible')
            .click();

          expectedGranularityArray.forEach((option) => {
            ui.autocompletePopper.findByTitle(option).should('exist');
          });
          mockCloudPulseCreateMetrics(
            responsePayload,
            serviceType
          ).as('getGranularityMetrics');

          //find the interval component and select the expected granularity
          ui.autocomplete
            .findByLabel('Select an Interval')
            .should('be.visible')
            .type(`${testData.expectedGranularity}{enter}`); //type expected granularity

          //check if the API call is made correctly with time granularity value selected
          cy.wait('@getGranularityMetrics').then((interception) => {
            expect(interception)
              .to.have.property('response')
              .with.property('statusCode', 200);
            expect(testData.expectedGranularity).to.include(
              interception.request.body.time_granularity.value
            );
          });

          //validate the widget linegrah is present
          cy.findByTestId('linegraph-wrapper')
            .should('be.visible')
            .find('tbody tr')
            .each(($tr) => {
              const cells = $tr
                .find('td')
                .map((i, el) => {
                  const text = Cypress.$(el).text().trim();
                  return text.replace(/^\s*\([^)]+\)/, '');
                })
                .get();
              const [title, actualMax, actualAvg, actualLast] = cells; // the average, max and last present in the widget
              const widgetValues = getWidgetLegendRowValuesFromResponse(
                responsePayload
              ); // the average, max and last from the response payload
              compareWidgetValues(
                // compare both
                {
                  title,
                  max: parseFloat(actualMax),
                  average: parseFloat(actualAvg),
                  last: parseFloat(actualLast),
                },
                widgetValues,
                testData.title
              );
            });
        });
    }
  });

  it('should allow users to select the desired aggregation and view the latest data from the API displayed in the graph', () => {
    for (const testData of metrics) {
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;

      cy.get(widgetSelector)
        .should('be.visible')
        .first()
        .within(() => {
          mockCloudPulseCreateMetrics(
            responsePayload,
            serviceType
          ).as('getAggregationMetrics');

          mockCloudPulseCreateMetrics(
            responsePayload,
            serviceType
          ).as('getAggregationMetrics');
          //find the interval component and select the expected granularity
          ui.autocomplete
            .findByLabel('Select an Aggregate Function')
            .should('be.visible')
            .type(`${testData.expectedAggregation}{enter}`); //type expected granularity

          //check if the API call is made correctly with time granularity value selected
          cy.wait('@getAggregationMetrics').then((interception) => {
            expect(interception)
              .to.have.property('response')
              .with.property('statusCode', 200);
            expect(testData.expectedAggregation).to.equal(
              interception.request.body.aggregate_function
            );
          });

          //validate the widget linegrah is present
          cy.findByTestId('linegraph-wrapper')
            .should('be.visible')
            .find('tbody tr')
            .each(($tr) => {
              const cells = $tr
                .find('td')
                .map((i, el) => {
                  const text = Cypress.$(el).text().trim();
                  return text.replace(/^\s*\([^)]+\)/, '');
                })
                .get();
              const [title, actualMax, actualAvg, actualLast] = cells; // the average, max and last present in the widget
              const widgetValues = getWidgetLegendRowValuesFromResponse(
                responsePayload
              ); // the average, max and last from the response payload
              compareWidgetValues(
                // compare both
                {
                  title,
                  max: parseFloat(actualMax),
                  average: parseFloat(actualAvg),
                  last: parseFloat(actualLast),
                },
                widgetValues,
                testData.title
              );
            });
        });
    }
  });

  it('should trigger the global refresh button and verify the corresponding network calls', () => {

    // click the global refresh button
    ui.button
      .findByAttribute('aria-label', 'Refresh Dashboard Metrics')
      .should('be.visible')
      .click();

    // validate the API calls are going with intended payload
    cy.wait(['@getMetrics', '@getMetrics', '@getMetrics', '@getMetrics']).then(
      (interceptions) => {
        const interceptionsArray = Array.isArray(interceptions)
          ? interceptions
          : [interceptions];
        interceptionsArray.forEach((interception) => {
          const { body: requestPayload } = interception.request;
          const { metric, relative_time_duration: timeRange } = requestPayload;
          const metricData = metrics.find((data) => data.name === metric);
          if (!metricData) {
            expect.fail(
              'metricData or its expected properties are not defined.'
            );
          }
          const expectedRelativeTimeDuration = timeRange
            ? `Last ${timeRange.value} ${
                ['hour', 'hr'].includes(timeRange.unit.toLowerCase())
                  ? 'Hours'
                  : timeRange.unit
              }`
            : '';
          expect(metric).to.equal(metricData.name);
          expect(expectedRelativeTimeDuration).to.equal(timeDurationToSelect);
        });
      }
    );
  });

  it('Verify that the widget and global filters reflect the saved user preferences after reloading the page.', () => {
    // Step 1: Mock the user preferences API call
     mockGetUserPreferences(userPreferences).as('userPreferences');
    
    // Step 1:Nnavigating to  linode
    cy.visitWithLogin('/linodes');
   // ui.nav.findItemByTitle('Linodes').should('be.visible').click();

    // Step 2: click on Monitor button from sidebar to nagigate to cloudPulse
    ui.nav.findItemByTitle('Monitor').should('be.visible').click();
    

    // Step 3: Verify global filter selections
    // Check if the Dashboard filter is visible and has the correct value
    ui.autocomplete
        .findByLabel('Select a Dashboard')
        .should('be.visible')
        .and('have.value', dashboardName);

    // Check if the Time Duration filter is visible and has the correct value
    ui.autocomplete
        .findByLabel('Select a Time Duration')
        .should('be.visible')
        .and('have.value', timeDurationToSelect);

    // Check if the Engine filter is visible and has the correct value
    ui.autocomplete
        .findByLabel('Select an Engine')
        .should('be.visible')
        .and('have.value', engine);

    // Check if the Region filter is visible and has the correct value
    ui.regionSelect
        .find()
        .should('be.visible')
        .and('have.value', region);

    // Check if the Resource filter is visible
    ui.autocomplete
        .findByLabel('Select a Resource')
        .should('be.visible');

    // Check if the Node Type filter is visible and has the correct value
    ui.autocomplete
        .findByLabel('Select a Node Type')
        .should('be.visible')
        .and('have.value', nodeType);

    // Step 5: Verify each widget's title and configuration
    metrics.forEach((testData) => {
        // Create a selector for the widget header
        const widgetHeaderSelector = `[data-qa-widget-header="${testData.title}"]`;
        
        // Check if the widget header is visible and has the correct title
        cy.get(widgetHeaderSelector)
            .invoke('text')
            .then((text) => {
                expect(text.trim()).to.equal(`${testData.title} (${testData.unit.trim()})`);
            });

        // Create a selector for the widget itself
        const widgetSelector = `[data-qa-widget="${testData.title}"]`;

        // Verify the widget is visible
        cy.get(widgetSelector)
            .should('be.visible')
            .first()
            .within(() => {
                // Check if the Interval selection is visible and has the correct value
                ui.autocomplete
                    .findByLabel('Select an Interval')
                    .should('be.visible')
                    .and('have.value', testData.expectedGranularity); 

                // Check if the Aggregate Function selection is visible and has the correct value
                ui.autocomplete
                    .findByLabel('Select an Aggregate Function')
                    .should('be.visible')
                    .and('have.value', testData.expectedAggregation); 
            });
    });
   });

it('should zoom in and out of all the widgets', () => {
    // do zoom in and zoom out test on all the widgets
    metrics.forEach((testData) => {
      cy.get(`[data-qa-widget="${testData.title}"]`).as('widget');
      cy.get('@widget')
        .should('be.visible')
        .within(() => {
          ui.button
            .findByAttribute('aria-label', 'Zoom In')
            .should('be.visible')
            .should('be.enabled')
            .click();
          cy.get('@widget').should('be.visible');
          cy.findByTestId('linegraph-wrapper')
            .as('canvas')
            .should('be.visible')
            .find('tbody tr')
            .each(($tr) => {
              const cells = $tr
                .find('td')
                .map((i, el) => Cypress.$(el).text().trim())
                .get();
              const [title, actualMax, actualAvg, actualLast] = cells;
              const widgetValues = getWidgetLegendRowValuesFromResponse(
                responsePayload
              );
              compareWidgetValues(
                {
                  title,
                  max: parseFloat(actualMax),
                  average: parseFloat(actualAvg),
                  last: parseFloat(actualLast),
                },
                widgetValues,
                testData.title
              );
            });

          // click zoom out and validate the same
          ui.button
            .findByAttribute('aria-label', 'Zoom Out')
            .should('be.visible')
            .should('be.enabled')
            .scrollIntoView()
            .click({ force: true });
          cy.get('@widget').should('be.visible');
          cy.findByTestId('linegraph-wrapper')
            .as('canvas')
            .should('be.visible')
            .find('tbody tr')
            .each(($tr) => {
              const cells = $tr
                .find('td')
                .map((i, el) => Cypress.$(el).text().trim())
                .get();
              const [title, actualMax, actualAvg, actualLast] = cells;
              const widgetValues = getWidgetLegendRowValuesFromResponse(
                responsePayload
              );
              compareWidgetValues(
                {
                  title,
                  max: parseFloat(actualMax),
                  average: parseFloat(actualAvg),
                  last: parseFloat(actualLast),
                },
                widgetValues,
                testData.title
              );
            });
        });
    });
  });
});


/**
 * `verifyWidgetValues` processes and verifies the metric values of a widget from the provided response payload.
 *
 * This method performs the following steps:
 * 1. Transforms the raw data from the response payload into a more manageable format using `transformData`.
 * 2. Extracts key metrics (average, last, and max) from the transformed data using `getMetrics`.
 * 3. Rounds these metrics to two decimal places for accuracy.
 * 4. Returns an object containing the rounded average, last, and max values for further verification or comparison.
 *
 * @param {CloudPulseMetricsResponse} responsePayload - The response payload containing metric data for a widget.
 * @returns {Object} An object with the rounded average, last, and max metric values.
 */
const getWidgetLegendRowValuesFromResponse = (
  responsePayload: CloudPulseMetricsResponse
) => {
  const data = transformData(responsePayload.data.result[0].values, 'Bytes');
  const { average, last, max } = getMetrics(data);
  const roundedAverage = Math.round(average * 100) / 100;
  const roundedLast = Math.round(last * 100) / 100;
  const roundedMax = Math.round(max * 100) / 100;
  return { average: roundedAverage, last: roundedLast, max: roundedMax };
};

/**
 * Compares actual widget values to the expected values and asserts their equality.
 *
 * @param actualValues - The actual values retrieved from the widget, consisting of:
 *   @param actualValues.max - The maximum value shown on the widget.
 *   @param actualValues.average - The average value shown on the widget.
 *   @param actualValues.last - The last or most recent value shown on the widget.
 *
 * @param expectedValues - The expected values that the widget should display, consisting of:
 *   @param expectedValues.max - The expected maximum value.
 *   @param expectedValues.average - The expected average value.
 *   @param expectedValues.last - The expected last or most recent value.
 */

const compareWidgetValues = (
  actualValues: { title: string; max: number; average: number; last: number },
  expectedValues: { max: number; average: number; last: number },
  title: string
) => {
  expect(actualValues.max).to.equal(
    expectedValues.max,
    `Expected ${expectedValues.max} for max, but got ${actualValues.max}`
  );
  expect(actualValues.average).to.equal(
    expectedValues.average,
    `Expected ${expectedValues.average} for average, but got ${actualValues.average}`
  );
  expect(actualValues.last).to.equal(
    expectedValues.last,
    `Expected ${expectedValues.last} for last, but got ${actualValues.last}`
  );
  const extractedTitle = actualValues.title.substring(
    0,
    actualValues.title.indexOf(' ', actualValues.title.indexOf(' ') + 1)
  );
  expect(extractedTitle).to.equal(
    title,
    `Expected ${title} for title ${extractedTitle}`
  );
};
