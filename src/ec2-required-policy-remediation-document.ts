import { ArnFormat, Resource, ResourceProps } from 'aws-cdk-lib';
import { CfnDocument } from 'aws-cdk-lib/aws-ssm';
import { IConstruct } from 'constructs';


export interface Ec2RequiredPolicyRemediationDocumentProps extends ResourceProps {}

export class Ec2RequiredPolicyRemediationDocument extends Resource {
  public readonly automationDefinitionArn: string;
  public readonly documentArn: string;
  public readonly documentName: string;


  public constructor(scope: IConstruct, id: string, props: Ec2RequiredPolicyRemediationDocumentProps = {}) {
    super(scope, id, props);

    // The reference to the Stack ID in the description is required because of
    // bad validation by the CDK.
    const document = new CfnDocument(this, 'Resource', {
      content: this.stack.toYamlString({
        schemaVersion: '0.3',
        description: [
          'Attaches a specified managed policy to an IAM role. This document',
          'is used by AWS Config when an IAM role was found to have been',
          'created without a specific policy that should be required.',
          `Controlled by CloudFormation Stack ${this.stack.stackId}.`,
        ].join(' '),
        assumeRole: '{{ AutomationAssumeRole }}',
        parameters: {
          AutomationAssumeRole: {
            default: '',
            description: [
              'Allows Automation to perform actions on your behalf.',
            ].join(' '),
            type: 'String',
          },
          ManagedPolicyArn: {
            description: [
              'Name of the IAM Instance Profile to associate with the',
              'instance.',
            ].join(' '),
            type: 'String',
          },
          RoleId: {
            description: [
              'ID of the IAM Role to attach the policy to.',
            ].join(' '),
            type: 'String',
          },
        },
        mainSteps: [
          {
            name: 'LookupRoleName',
            action: 'aws:executeAwsApi',
            nextStep: 'AttachRolePolicy',
            inputs: {
              Api: 'BatchGetResourceConfig',
              Service: 'config',
              resourceKeys: [{
                resourceId: '{{ RoleId }}',
                resourceType: 'AWS::IAM::Role',
              }],
            },
            outputs: [{
              Name: 'RoleName',
              Selector: '$.baseConfigurationItems[0].resourceName',
              Type: 'String',
            }],
          },
          {
            name: 'AttachRolePolicy',
            action: 'aws:executeAwsApi',
            isEnd: true,
            inputs: {
              Api: 'AttachRolePolicy',
              Service: 'iam',
              PolicyArn: '{{ ManagedPolicyArn }}',
              RoleName: '{{ LookupRoleName.RoleName }}',
            },
          },
        ],
      }),
      documentFormat: 'YAML',
      documentType: 'Automation',
    });

    this.automationDefinitionArn = this.stack.formatArn({
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      resource: 'automation-definition',
      resourceName: document.ref,
      service: 'ssm',
    });
    this.documentArn = this.stack.formatArn({
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      resource: 'document',
      resourceName: document.ref,
      service: 'ssm',
    });
    this.documentName = document.ref;
  }

  public automationDefinitionArnForVersion(version: string): string {
    return `${this.automationDefinitionArn}:${version}`;
  }
}