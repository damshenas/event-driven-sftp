#!/usr/bin/env node

import { StackProps, App, Stack } from 'aws-cdk-lib';
import { SFTPServerStack } from '../lib/sftp-server-stack';
import { SFTPConnectionStack, SFTPConnectionStackProps } from '../lib/sftp-connection-stack';
import { KeyManagementStack, KeyManagementStackProps } from '../lib/key-management-stack';

const app = new App();
const initProps: StackProps = {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    }
};
const initScope = new Stack(app, 'transfer-sftp', initProps);

// initializing the SFTP Server stack
const { SftpServer, cloudwatchRole, 
    SftpBucket, SftpUserAccessRole } = new SFTPServerStack(initScope, 'SftpServerStack', initProps);

const SftpConnectionProps: SFTPConnectionStackProps = { 
    sftpServerId: SftpServer.attrServerId, 
    logingRoleArn: cloudwatchRole.roleArn,
    stageName: process.env.STAGE_NAME || 'dev',
    ...initProps 
}

// initializing the SFTP connection stack
const { SftpConnector } = new SFTPConnectionStack(initScope, 'SftpConnectionStack', SftpConnectionProps);

const KeyManagementProps: KeyManagementStackProps = { 
    sftpServerId: SftpServer.attrServerId, 
    sftpConnectorId: SftpConnector.attrConnectorId,
    sftpBucketName: SftpBucket.bucketArn,
    sftpUserAccessRole: SftpUserAccessRole.roleArn,
    stageName: process.env.STAGE_NAME || 'dev',
    ...initProps 
}

new KeyManagementStack(initScope, 'KeyManagementStack', KeyManagementProps);