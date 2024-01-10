import { Resource, ResourceProps } from 'aws-cdk-lib';
import { CustomRule, ResourceType, RuleScope } from 'aws-cdk-lib/aws-config';
import { IManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { IConstruct } from 'constructs';
import { Ec2RequiredRoleRemediationConfiguration } from './ec2-required-policy-remediation-configuration';
import { EvaluationFunction } from './evaluation-function';


export interface Ec2RequiredPolicyRemediationOptions {
  readonly automatic?: boolean;
  readonly enabled?: boolean;
}

export interface Ec2RequiredPolicyConfigRuleProps extends ResourceProps {
  readonly managedPolicy: IManagedPolicy;
  readonly remediation?: Ec2RequiredPolicyRemediationOptions;
}

export class Ec2RequiredPolicyConfigRule extends Resource {
  public static readonly DEFAULT_EC2_ROLE_DESCRIPTION: string = [
    'Provides a basic set of permissions that should be available to all EC2',
    'instances. If an instance is created with no role associated this role',
    'will be associated with it when AWS Config runs remediation.',
  ].join(' ');
  public static readonly DEFAULT_RULE_DESCRIPTION: string = [
    'Enforces that an EC2 instance has an IAM role attached. An instance is',
    'non-compliant if it has no IAM role associated with it.',
  ].join(' ');

  public readonly managedPolicy: IManagedPolicy;

  public readonly evaluationFunction: IFunction;
  public readonly rule: CustomRule;


  public constructor(scope: IConstruct, id: string, props: Ec2RequiredPolicyConfigRuleProps) {
    super(scope, id, props);

    this.managedPolicy = props.managedPolicy;

    this.evaluationFunction = new EvaluationFunction(this, 'evaluation-function');

    this.rule = new CustomRule(this, 'Resource', {
      configurationChanges: true,
      description: Ec2RequiredPolicyConfigRule.DEFAULT_RULE_DESCRIPTION,
      inputParameters: {
        managedPolicyArn: this.managedPolicy.managedPolicyArn,
        principal: 'ec2.amazonaws.com',
      },
      lambdaFunction: this.evaluationFunction,
      ruleScope: RuleScope.fromResource(ResourceType.IAM_ROLE),
    });

    if (props.remediation?.enabled ?? true) {
      new Ec2RequiredRoleRemediationConfiguration(this, 'remediation', {
        managedPolicy: this.managedPolicy,
        rule: this.rule,
      });
    }
  }
}