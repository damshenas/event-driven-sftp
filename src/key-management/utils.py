# Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
from cryptography.hazmat.primitives import serialization as crypto_serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend as crypto_default_backend
import boto3, os,json

class main:
    def __init__(self, key_bucket, environment, region):
        self.environment = environment
        self.key_bucket = key_bucket
        self.s3_client = boto3.client('s3',region)
        self.sm_client = boto3.client('secretsmanager',region)
        self.tf_client = boto3.client('transfer',region)
        self.verbose = True if self.environment == 'dev' else False

    def file_get_contents(self, filename):
        with open(filename) as f:
            return f.read()

    def store_key_pair(self, secret_name, key_pair):
        return self.sm_client.create_secret(
            Name=secret_name,
            Description='The key for SFTP user',
            SecretString=json.dumps(key_pair)
        )
    
    # Adds a host key to the server that’s specified by the ServerId parameter.
    def add_host_key(self, server_id, host_key):
        return self.tf_client.import_host_key(
            ServerId=server_id,
            HostKeyBody=host_key
        )
    
    # Adds a Secure Shell (SSH) public key to a Transfer Family user identified by 
    # a UserName value assigned to the specific file transfer protocol-enabled server, identified by ServerId.
    def add_ssh_public_key(self, username, server_id, ssh_public_key):
        return self.tf_client.import_ssh_public_key(
            ServerId=server_id,
            SshPublicKeyBody=ssh_public_key,
            UserName=username
        )

    def is_keypair_downloaded(self, username):
        if os.path.exists("/tmp/{username}.pem") and os.path.exists("/tmp/{username}.pub"):
            return True

    def download_s3_file(self, s3_obj):
        local_file = "/tmp/{}".format(s3_obj.split('/')[-1])
        newKeyObj = self.s3_client.Object(self.key_bucket, s3_obj)
        newKeyObj.download_file(local_file)
    
        return local_file
    
    def create_sftp_user(self, sftp_bucket, username, sftp_user_role, sftp_server_id):
        return self.tf_client.create_user(
            HomeDirectory="{}/home/{}".format(sftp_bucket, username),
            HomeDirectoryType='PATH',
            Role=sftp_user_role,
            ServerId=sftp_server_id,
            Tags=[
                {'Key': 'created_by', 'Value': 'key_management_lambda'},
            ],
            UserName=username,
            SshPublicKeyBody=self.file_get_contents("/tmp/{}.pub".format(username))
            )