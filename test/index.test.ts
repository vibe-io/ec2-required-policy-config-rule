import { ArnFormat, CfnResource, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Ec2RequiredPolicyConfigRule } from '../src';


test('template should contain default set of resources', () => {
  const stack = new Stack();
  new Ec2RequiredPolicyConfigRule(stack, 'rule', {
    managedPolicy: ManagedPolicy.fromAwsManagedPolicyName('ViewOnlyAccess'),
  });

  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::Config::ConfigRule', 1);
  template.resourceCountIs('AWS::Config::RemediationConfiguration', 1);
  template.resourceCountIs('AWS::Lambda::Function', 1);
  template.resourceCountIs('AWS::SSM::Document', 1);
});

test('automatic remediation should be reflected in configuration', () => {
  const stack = new Stack();
  new Ec2RequiredPolicyConfigRule(stack, 'rule', {
    managedPolicy: ManagedPolicy.fromAwsManagedPolicyName('ViewOnlyAccess'),
    remediation: {
      automatic: true,
    },
  });

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Config::RemediationConfiguration', {
    Automatic: true,
  });
});

test('automatic remediation should have required properties', () => {
  const stack = new Stack();
  new Ec2RequiredPolicyConfigRule(stack, 'rule', {
    managedPolicy: ManagedPolicy.fromAwsManagedPolicyName('ViewOnlyAccess'),
    remediation: {
      automatic: true,
    },
  });

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Config::RemediationConfiguration', {
    MaximumAutomaticAttempts: 5,
    RetryAttemptSeconds: 60,
  });
});

test('automatic remediation should properly configure permissions', () => {
  const stack = new Stack();
  const rule = new Ec2RequiredPolicyConfigRule(stack, 'rule', {
    managedPolicy: ManagedPolicy.fromAwsManagedPolicyName('ViewOnlyAccess'),
    remediation: {
      automatic: true,
    },
  });

  const template = Template.fromStack(stack);

  const remediation = rule.node.tryFindChild('remediation');
  const automationRoleL2 = remediation?.node.tryFindChild('automation-role');
  const automationRoleL1 = automationRoleL2?.node.defaultChild;

  expect(CfnResource.isCfnResource(automationRoleL1)).toBe(true);
  const automationRoleResource = automationRoleL1 as CfnResource;

  template.hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: {
      Statement: [{
        Action: 'sts:AssumeRole',
        Effect: 'Allow',
        Principal: {
          Service: 'ssm.amazonaws.com',
        },
      }],
    },
    Path: '/service-role/',
  });

  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: 'config:BatchGetResourceConfig',
          Effect: 'Allow',
          Resource: '*',
        },
        {
          Action: 'iam:AttachRolePolicy',
          Effect: 'Allow',
          Resource: stack.resolve(stack.formatArn({
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
            region: '',
            resource: 'role',
            resourceName: '*',
            service: 'iam',
          })),
        },
      ],
    },
    Roles: [
      stack.resolve(automationRoleResource.ref),
    ],
  });

  template.hasResourceProperties('AWS::Config::RemediationConfiguration', {
    Parameters: {
      AutomationAssumeRole: {
        StaticValue: {
          Values: [
            stack.resolve(automationRoleResource.getAtt('Arn')),
          ],
        },
      },
    },
  });
});