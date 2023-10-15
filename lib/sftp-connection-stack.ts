
import {
    RemovalPolicy,
    SecretValue,
    Stack,
    aws_transfer as transfer,
    aws_s3 as s3,
    aws_iam as iam,
    aws_logs as logs,
    aws_cloudwatch as cw,
} from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { SFTPServerStackProps } from './sftp-server-stack';

/** Additional properties we like to add */
export interface SFTPConnectionStackProps extends SFTPServerStackProps {
    // To include the credentials in Secret Manager
    privateKey: string
    serverId: string,
    logingRole: string
}

export class SFTPConnectionStack extends Stack {
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
        
        const secretManager = new Secret(scope, 'TransferSFTPSecret', {
            secretName: 'TransferSFTPSecret',
            secretObjectValue: {
                username: SecretValue.unsafePlainText('user1'),
                publicKey: SecretValue.unsafePlainText(props.publicKey),
                privateKey: SecretValue.unsafePlainText(props.privateKey)
            },
            removalPolicy: RemovalPolicy.DESTROY
        })

        // Allow SFTP user to write the S3 bucket and read secret
        const sftpConnectionAccessPolicy = new iam.ManagedPolicy(this, 'SFTPConnectionAccessPolicy', {
            managedPolicyName: 'sftpConnectionAccessPolicy',
            description: 'SFTP connection access policy',
        });

        sftpConnectorBucket.grantReadWrite(sftpConnectionAccessPolicy);
        secretManager.grantRead(sftpConnectionAccessPolicy)

        const sftpConnectionAccessRole = new iam.Role(this, 'SFTPConnectionAccessRole', {
            assumedBy: new iam.ServicePrincipal('transfer.amazonaws.com'),
            roleName: 'SftpConnectionAccessRole',
            managedPolicies: [
                sftpConnectionAccessPolicy,
            ]
        });

        const sftpConnector = new transfer.CfnConnector(scope, 'TransferSFTPConnector', {
            accessRole: sftpConnectionAccessRole.roleArn,
            loggingRole: props.logingRole,
            url: `sftp://${props.serverId}.server.transfer.${this.region}.amazonaws.com`,
            sftpConfig: {
                trustedHostKeys: [props.publicKey],
                userSecretId: secretManager.secretArn
            }
        })
    }
}
