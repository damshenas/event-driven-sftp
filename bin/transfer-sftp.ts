#!/usr/bin/env node
import { readFileSync } from 'fs';
import { StackProps, App, Stack } from 'aws-cdk-lib';
import { SFTPServerStack, SFTPServerStackProps } from '../lib/sftp-server-stack';
import { SFTPConnectionStack, SFTPConnectionStackProps } from '../lib/sftp-connection-stack';

// Follow the setup process at https://docs.aws.amazon.com/cdk/v2/guide/environments.html
const props: StackProps = {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    }
};

const app = new App();
const initScope = new Stack(app, 'transfer-sftp', props);

const userName: string = app.node.tryGetContext('username') || "user1";
const publicKeyFile: string = app.node.tryGetContext('publicKey') || ".keys/k.pub";
const privateKeyFile: string = app.node.tryGetContext('privateKey') || ".keys/k.pri";

const publicKey = readFileSync(publicKeyFile,'utf8');
const privateKey = readFileSync(privateKeyFile,'utf8');

const SftpServerProps: SFTPServerStackProps = {userName, publicKey, ...props}
const { server: { attrServerId }, cwLogingRole: { roleArn } } = new SFTPServerStack(initScope, 'SftpServerStack', SftpServerProps);

const SftpConnectionProps: SFTPConnectionStackProps = {serverId: attrServerId, privateKey, logingRole: roleArn, ...SftpServerProps}
new SFTPConnectionStack(initScope, 'SftpConnectionStack', SftpConnectionProps);
