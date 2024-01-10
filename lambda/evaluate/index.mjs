import { ConfigService } from '@aws-sdk/client-config-service';

const config = new ConfigService();


// Helper function used to validate input
function checkDefined(reference, referenceName) {
  if (!reference) {
    throw new Error(`Error: ${referenceName} is not defined`);
  }
  return reference;
}

// Check whether the message is OversizedConfigurationItemChangeNotification or not
function isOverSizedChangeNotification(messageType) {
  checkDefined(messageType, 'messageType');
  return messageType === 'OversizedConfigurationItemChangeNotification';
}

// Get configurationItem using getResourceConfigHistory API.
const getConfiguration = async (resourceType, resourceId, configurationCaptureTime) => {
  const data = await config.getResourceConfigHistory({ resourceType, resourceId, laterTime: new Date(configurationCaptureTime), limit: 1 });
  return data.configurationItems[0];
};

// Convert from the API model to the original invocation model
/*eslint no-param-reassign: ["error", { "props": false }]*/
function convertApiConfiguration(apiConfiguration) {
  apiConfiguration.awsAccountId = apiConfiguration.accountId;
  apiConfiguration.ARN = apiConfiguration.arn;
  apiConfiguration.configurationStateMd5Hash = apiConfiguration.configurationItemMD5Hash;
  apiConfiguration.configurationItemVersion = apiConfiguration.version;
  apiConfiguration.configuration = JSON.parse(apiConfiguration.configuration);
  if ({}.hasOwnProperty.call(apiConfiguration, 'relationships')) {
    for (let i = 0; i < apiConfiguration.relationships.length; i++) {
      apiConfiguration.relationships[i].name = apiConfiguration.relationships[i].relationshipName;
    }
  }
  return apiConfiguration;
}

// Based on the type of message get the configuration item either from configurationItem in the invoking event or using the getResourceConfigHistiry API in getConfiguration function.
const getConfigurationItem = async (invokingEvent) => {
  checkDefined(invokingEvent, 'invokingEvent');
  if (isOverSizedChangeNotification(invokingEvent.messageType)) {
    const configurationItemSummary = checkDefined(invokingEvent.configurationItemSummary, 'configurationItemSummary');
    const apiConfigurationItem = await getConfiguration(configurationItemSummary.resourceType, configurationItemSummary.resourceId, configurationItemSummary.configurationItemCaptureTime);
    return convertApiConfiguration(apiConfigurationItem);
  }
  checkDefined(invokingEvent.configurationItem, 'configurationItem');
  return invokingEvent.configurationItem;
};

// Check whether the resource has been deleted. If it has, then the evaluation is unnecessary.
function isApplicable(configurationItem, event) {
  checkDefined(configurationItem, 'configurationItem');
  checkDefined(event, 'event');
  const status = configurationItem.configurationItemStatus;
  const eventLeftScope = event.eventLeftScope;
  return (status === 'OK' || status === 'ResourceDiscovered') && eventLeftScope === false;
}

// This is where it's determined whether the resource is compliant or not.
// In this example, we simply decide that the resource is compliant if it is an instance and its type matches the type specified as the desired type.
// If the resource is not an instance, then we deem this resource to be not applicable. (If the scope of the rule is specified to include only
// instances, this rule would never have been invoked.)
function evaluateChangeNotificationCompliance(configurationItem, ruleParameters) {
  checkDefined(configurationItem, 'configurationItem');

  if (configurationItem.resourceType !== 'AWS::IAM::Role') {
    return 'NOT_APPLICABLE';
  }

  const desiredPolicy = ruleParameters.managedPolicyArn;
  const desiredPrincipal = ruleParameters.principal;

  const encodedTrusts = configurationItem.configuration?.assumeRolePolicyDocument ?? '{}';
  const trusts = JSON.parse(decodeURIComponent(encodedTrusts));
  const matchedTrusts = trusts.Statement.filter((x) => {
    const principal = x.Principal?.Service;

    if (principal === desiredPrincipal) {
      return true;
    } else if (Array.isArray(principal) && principal.includes(desiredPrincipal)) {
      return true;
    } else {
      return false;
    }
  });
  
  if (matchedTrusts.length === 0) {
    return 'NOT_APPLICABLE';
  }

  const policies = configurationItem.configuration?.attachedManagedPolicies ?? [];
  const matchedPolicies = policies.filter((x) => {
    return x.policyArn === desiredPolicy;
  });

  if (matchedPolicies.length > 0) {
    return 'COMPLIANT';
  }

  return 'NON_COMPLIANT';
}

// This is the handler that's invoked by Lambda
// Most of this code is boilerplate; use as is
export const handler = async (event) => {
  console.log(JSON.stringify(event));
  checkDefined(event, 'event');
  const invokingEvent = JSON.parse(event.invokingEvent);
  const ruleParameters = JSON.parse(event.ruleParameters);
  const configurationItem = await getConfigurationItem(invokingEvent);
  let compliance = 'NOT_APPLICABLE';
  const putEvaluationsRequest = {};
  if (isApplicable(configurationItem, event)) {
    // Invoke the compliance checking function.
    compliance = evaluateChangeNotificationCompliance(configurationItem, ruleParameters);
  }
  // Put together the request that reports the evaluation status
  putEvaluationsRequest.Evaluations = [{
    ComplianceResourceType: configurationItem.resourceType,
    ComplianceResourceId: configurationItem.resourceId,
    ComplianceType: compliance,
    OrderingTimestamp: new Date(configurationItem.configurationItemCaptureTime),
  }];
  putEvaluationsRequest.ResultToken = event.resultToken;

  // Invoke the Config API to report the result of the evaluation
  const data = await config.putEvaluations(putEvaluationsRequest);
  if (data.FailedEvaluations.length > 0) {
    // Ends the function execution if any evaluation results are not successfully reported.
    throw new Error(JSON.stringify(data));
  }
  return data;
};