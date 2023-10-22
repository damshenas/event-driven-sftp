import { Construct } from 'constructs';
import { RemovalPolicy, Stack, StackProps, Aws, CfnOutput, CustomResource, Duration,
    aws_s3_notifications as s3Notifications,
    custom_resources as cr,
    aws_lambda as lambda,
    aws_s3 as s3,
    aws_iam as iam,
    aws_logs as logs
} from 'aws-cdk-lib';
import path from 'path';

export interface KeyManagementStackProps extends StackProps {
    sftpServerId: string,
    sftpBucketName: string,
    sftpUserAccessRole: string,
    sftpConnectorId: string,
    stageName: string
}

export class KeyManagementStack extends Stack {
    constructor(scope: Construct, id: string, props: KeyManagementStackProps) {
        super(scope, id, props);

        // the bucket that contains the host keys and users ssh keys

        const keyBucket = new s3.Bucket(this, 'Key_Bucket', {
            accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            // bucketName: `key-management-data-bucket-${props.env?.account}-${props.env?.region}`,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            removalPolicy: RemovalPolicy.DESTROY, // Do not use for production!
        });

        // sample policy for fine-grained access control to key bucket
        // alternatively secret manager can be used but requires a more complex event trigger for lambda

        keyBucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: ['*'],
            principals: [new iam.AnyPrincipal()],
            resources: [
                keyBucket.bucketArn,
                keyBucket.arnForObjects('*')
            ],
            conditions: {
                'StringEquals':
                {
                    'aws:SourceAccount': `${Aws.ACCOUNT_ID}`
                }
            }
        }));

        // defining the custom resource 

        const customResourcePolicy = new iam.ManagedPolicy(this, 'CustomResource1Policy', {
            managedPolicyName: 'sftpConnectionAccessPolicy',
            description: 'SFTP connection access policy',
        });

        keyBucket.grantPut(customResourcePolicy);

        const customResourceRole = new iam.Role(this, 'CustomResourceRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            roleName: 'RoleForSFTPCustomResource',
            managedPolicies: [customResourcePolicy,]
        });

        const customFN = new lambda.SingletonFunction(this, 'CustomFunctionForProvider', {
            uuid: 'aad4f730-4ee1-11e8-9c2d-fa7ae01bbeaa',
            code: lambda.Code.fromAsset(path.join(__dirname, '../src/custom-resource')),
            environment: {
                "KEY_BUCKET": keyBucket.bucketName,
                "ENV": props.stageName,
                "PHYSICAL_ID": "CustomResourcePhysicalID",
                "REGION": this.region,
            },
            handler: 'main.handler',
            timeout: Duration.seconds(60),
            runtime: lambda.Runtime.PYTHON_3_10
        });

        const customProvider = new cr.Provider(this, 'CustomProvider', {
            onEventHandler: customFN,
            logRetention: logs.RetentionDays.ONE_MONTH,
            role: customResourceRole, // must be assumable by the `lambda.amazonaws.com` service principal
        });

        new CustomResource(this, 'CustomResource1', { serviceToken: customProvider.serviceToken, properties: props });

        // the key management flow

        const keyManager = new lambda.Function(this, 'KeyManager', {
            runtime: lambda.Runtime.PYTHON_3_10,
            handler: 'main.handler',
            environment: {
                "ENV": props.stageName,
                "SERVER_ID": props.sftpServerId,
                "CONNECTOR_ID": props.sftpConnectorId,
                "KEY_BUCKET": keyBucket.bucketName, //to check if the ssh key is pair or not
                "SFTP_BUCKET": props.sftpBucketName,
                "SFTP_USER_ROLE": props.sftpUserAccessRole,
                "SECRET_PREFIX": `${props.stageName}/SFTPSecrets/`,
                "REGION": this.region,
            },
            code: lambda.Code.fromAsset(path.join(__dirname, '../src/key-management')),
        });

        // Binds the S3 bucket to the lambda function
        keyBucket.addEventNotification(
            s3.EventType.OBJECT_CREATED_PUT,
            new s3Notifications.LambdaDestination(keyManager), {
            prefix: 'host_keys/'
        });

        keyBucket.addEventNotification(
            s3.EventType.OBJECT_CREATED_PUT,
            new s3Notifications.LambdaDestination(keyManager), {
            prefix: 'ssh_keys/'
        });

        new CfnOutput(this, 'KeyBucketName', {
            value: keyBucket.bucketName,
        });
    }
}