import { Construct } from 'constructs';
import { RemovalPolicy, Stack, StackProps,
    aws_transfer as transfer,
    aws_s3 as s3,
    aws_iam as iam
} from 'aws-cdk-lib';

/** Additional properties we like to add */
export interface SFTPConnectionStackProps extends StackProps {
    sftpServerId: string,
    logingRoleArn: string,
    stageName: string
}

export class SFTPConnectionStack extends Stack {

    public readonly SftpConnector: transfer.CfnConnector;

    constructor(scope: Construct, id: string, props: SFTPConnectionStackProps) {
        super(scope, id, props);

        const sftpConnectorBucket = new s3.Bucket(this, 'SFTPConnectorBucket', {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            bucketName: `sftp-connector-data-bucket-${props.env?.account}-${props.env?.region}`,
            encryption: s3.BucketEncryption.KMS_MANAGED,
            enforceSSL: true,
            // Do not use for production!
            removalPolicy: RemovalPolicy.DESTROY,
        });

        // Allow SFTP user to write the S3 bucket and read secret
        const sftpConnectionAccessPolicy = new iam.ManagedPolicy(this, 'SFTPConnectionAccessPolicy', {
            managedPolicyName: 'sftpConnectionAccessPolicy',
            description: 'SFTP connection access policy',
        });

        sftpConnectorBucket.grantReadWrite(sftpConnectionAccessPolicy);

        const sftpConnectionAccessRole = new iam.Role(this, 'SFTPConnectionAccessRole', {
            assumedBy: new iam.ServicePrincipal('transfer.amazonaws.com'),
            roleName: 'SftpConnectionAccessRole',
            managedPolicies: [
                sftpConnectionAccessPolicy,
            ]
        });

        sftpConnectionAccessRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: [`arn:aws:secretsmanager:${props.env?.region}:${props.env?.account}:secret:${props.stageName}/SFTPSecrets/*`],
            actions: ["secretsmanager:GetSecretValue"],
            conditions: {
                StringEquals: { //"ForAnyValue:StringEquals"
                    "aws:CalledVia": ["lambda.amazonaws.com"]
                }
            }
        }));

        this.SftpConnector = new transfer.CfnConnector(scope, 'TransferSFTPConnector', {
            accessRole: sftpConnectionAccessRole.roleArn,
            loggingRole: props.logingRoleArn,
            url: `sftp://${props.sftpServerId}.server.transfer.${this.region}.amazonaws.com`,
        })
    }
}
