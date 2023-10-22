# Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
from cryptography.hazmat.primitives import serialization as crypto_serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend as crypto_default_backend
import boto3, json

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

    def generate_key_pair(self, comment="FirstUser"):
        key = rsa.generate_private_key(
                backend=crypto_default_backend(),
                public_exponent=65537,
                key_size=2048
                )
        private_key = key.private_bytes(
                crypto_serialization.Encoding.PEM,
                crypto_serialization.PrivateFormat.TraditionalOpenSSL,
                crypto_serialization.NoEncryption())
        public_key = key.public_key().public_bytes(
                crypto_serialization.Encoding.OpenSSH,
                crypto_serialization.PublicFormat.OpenSSH
                )

        private_key_str = private_key.decode('utf-8')
        public_key_str = public_key.decode('utf-8') + " " + comment

        return [private_key_str, public_key_str] 

    def upload_data_to_s3(self, content, s3_obj):
        if not self.check_s3_obj(s3_obj): #avoid overwriting keys
            self.s3_client.upload_fileobj(content, self.key_bucket, s3_obj)

            return s3_obj

    def check_s3_obj(self, target_key):
        objs = self.s3_client.list_objects_v2(
            Bucket=self.key_bucket,
            Prefix=target_key,
        )
        return objs['KeyCount']

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