import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Ec2RequiredPolicyConfigRule } from '../src';


test('template should contain default set of resources', () => {
  const stack = new Stack();
  const policyName = 'AmazonSSMManagedEC2InstanceDefaultPolicy';
  new Ec2RequiredPolicyConfigRule(stack, 'rule', {
    managedPolicy: ManagedPolicy.fromAwsManagedPolicyName(policyName),
  });

  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::Config::ConfigRule', 1);
  template.resourceCountIs('AWS::Config::RemediationConfiguration', 1);
  template.resourceCountIs('AWS::Lambda::Function', 1);
  template.resourceCountIs('AWS::SSM::Document', 1);
});