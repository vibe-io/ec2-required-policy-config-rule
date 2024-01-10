import { Resource, ResourceProps } from 'aws-cdk-lib';
import { CfnRemediationConfiguration, IRule } from 'aws-cdk-lib/aws-config';
import { IManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { IConstruct } from 'constructs';
import { Ec2RequiredPolicyRemediationDocument } from './ec2-required-policy-remediation-document';


export interface Ec2RequiredRoleRemediationConfigurationProps extends ResourceProps {
  readonly managedPolicy: IManagedPolicy;
  readonly rule: IRule;
}

export class Ec2RequiredRoleRemediationConfiguration extends Resource {
  public readonly managedPolicy: IManagedPolicy;
  public readonly rule: IRule;


  public constructor(scope: IConstruct, id: string, props: Ec2RequiredRoleRemediationConfigurationProps) {
    super(scope, id, props);

    this.managedPolicy = props.managedPolicy;
    this.rule = props.rule;

    const automation = new Ec2RequiredPolicyRemediationDocument(this, 'automation');

    new CfnRemediationConfiguration(this, 'Resource', {
      configRuleName: this.rule.configRuleName,
      parameters: {
        AutomationAssumeRole: {
          StaticValue: {
            Values: [],
          },
        },
        ManagedPolicyArn: {
          StaticValue: {
            Values: [
              this.managedPolicy.managedPolicyArn,
            ],
          },
        },
        RoleId: {
          ResourceValue: {
            Value: 'RESOURCE_ID',
          },
        },
      },
      targetId: automation.documentName,
      targetType: 'SSM_DOCUMENT',
    });
  }
}