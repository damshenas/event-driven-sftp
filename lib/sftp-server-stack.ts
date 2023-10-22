import { Construct } from 'constructs';
import { Stack, StackProps, RemovalPolicy, CfnOutput,
    aws_s3 as s3,
    aws_ec2 as ec2,
    aws_iam as iam,
    aws_logs as logs,
    aws_cloudwatch as cw,
    aws_transfer as transfer,
} from 'aws-cdk-lib';

/** Stack for initializing a fully working SFTP server. */
export class SFTPServerStack extends Stack {

    public readonly cloudwatchRole: iam.Role;
    public readonly SftpServer: transfer.CfnServer;
    public readonly SftpBucket: s3.Bucket;
    public readonly SftpUserAccessRole: iam.Role;

    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        this.SftpBucket = new s3.Bucket(this, 'SFTPServerBucket', {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            bucketName: `sftp-server-data-bucket-${props.env?.region}`,
            encryption: s3.BucketEncryption.KMS_MANAGED,
            enforceSSL: true,
            removalPolicy: RemovalPolicy.DESTROY, // Do not use for production!
        });

        const vpc = new ec2.Vpc(this, 'VPC', {
            maxAzs: 2,
            natGateways: 0,
        });

        // Create the required IAM role which allows the SFTP server
        // to log to CloudWatch.
        this.cloudwatchRole = new iam.Role(this, 'CloudWatchLoggingRole', {
            assumedBy: new iam.ServicePrincipal('transfer.amazonaws.com'),
            description: 'IAM role used by AWS Transfer for logging',
            inlinePolicies: {
                loggingRole: new iam.PolicyDocument({
                    statements: [new iam.PolicyStatement({
                        actions: [
                            'logs:CreateLogGroup',
                            'logs:CreateLogStream',
                            'logs:DescribeLogStreams',
                            'logs:PutLogEvents',
                        ],
                        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/transfer/*`],
                        effect: iam.Effect.ALLOW,
                    })],
                }),
            },
        });

        // Security group for restricting incoming traffic to specific IP addresses
        const sg = new ec2.SecurityGroup(this, 'SFTPServerSG', {
            vpc,
            allowAllOutbound: false,
            securityGroupName: 'SFTPServerSG',
            description: 'Security group for SFTP server',
        });

        // In production it's good to allow only specific IP addresses
        sg.addIngressRule(ec2.Peer.ipv4('0.0.0.0/0'), ec2.Port.tcp(22), 'Allow SSH inbound');

        // Add EIP for each public subnet
        const eips = vpc.publicSubnets.map((_, index) => new ec2.CfnEIP(this, `SftpEIP${index + 1}`, {
            domain: 'vpc',
        }));

        this.SftpServer = new transfer.CfnServer(this, 'SFTPServer', {
            endpointDetails: {
                securityGroupIds: [sg.securityGroupId],
                vpcId: vpc.vpcId,
                subnetIds: vpc.publicSubnets.map((subnet) => subnet.subnetId),
                addressAllocationIds: eips.map((eip) => eip.attrAllocationId),
            },
            identityProviderType: 'SERVICE_MANAGED',
            endpointType: 'VPC',
            loggingRole: this.cloudwatchRole.roleArn,
            protocols: ['SFTP'],
            domain: 'S3',
        });

        // Output Server Endpoint access where clients can connect
        new CfnOutput(this, 'SFTPServerEndpoint', {
            description: 'Server Endpoint',
            value: `${this.SftpServer.attrServerId}.server.transfer.${this.region}.amazonaws.com`,
        });

        // Allow SFTP user to write the S3 bucket
        const sftpAccessPolicy = new iam.ManagedPolicy(this, 'SFTPAccessPolicy', {
            managedPolicyName: 'SftpAccessPolicy',
            description: 'SFTP access policy',
        });
        this.SftpBucket.grantReadWrite(sftpAccessPolicy);

        this.SftpUserAccessRole = new iam.Role(this, 'SFTPAccessRole', {
            assumedBy: new iam.ServicePrincipal('transfer.amazonaws.com'),
            roleName: 'SftpAccessRole',
            managedPolicies: [
                sftpAccessPolicy,
            ]
        });

        const logGroup = new logs.LogGroup(this, 'SFTPLogGroup', {
            logGroupName: `/aws/transfer/${this.SftpServer.attrServerId}`,
            removalPolicy: RemovalPolicy.DESTROY,
            retention: logs.RetentionDays.ONE_MONTH,
        });

        // Metric filter for recognizing two types of errors in the SFTP logs
        const metricFilter = new logs.MetricFilter(this, 'MetricFilter', {
            logGroup,
            metricNamespace: 'SftpServer',
            metricName: 'ErrorLog',
            filterPattern: logs.FilterPattern.anyTerm('ERRORS AUTH_FAILURE', 'ERROR Message'),
            metricValue: '1',
            unit: cw.Unit.COUNT,
        });

        // Alarm if there are too many errors
        new cw.Alarm(this, 'AlarmMetricFilter', {
            alarmDescription: 'Alarm if there are too many errors in the logs',
            metric: metricFilter.metric(),
            threshold: 1,
            evaluationPeriods: 5,
            datapointsToAlarm: 1,
        });

        // TODO Add alarm action to notify administrators or perform other actions
    }
}
