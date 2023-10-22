#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json, logging, utils
from os import environ

environment = environ['ENV']
key_bucket = environ['KEY_BUCKET']
sftp_bucket = environ['SFTP_BUCKET']
sftp_user_role = environ['SFTP_USER_ROLE']
region = environ['REGION']
sftp_server_id = environ['SERVER_ID']
connector_id = environ['CONNECTOR_ID']
secret_prefix = environ['SECRET_PREFIX']
region = environ['REGION']

def handler(event, context):
    verbose = True if environment == "dev" else False
    if verbose: print("event", event)
    try:
        util = utils.main(key_bucket, environment, region)

        for record in event['Records']:
            object = record['s3']['object']['key']
            bucket = record['s3']['bucket']['name']
            if bucket != key_bucket: continue #!!
            localfile = util.download_s3_file(object)

            if "ssh" in object:
                # using the key name as username
                # assuming keys in S3 are unique and can not have duplicates
                username = object.split('/')[-1][:-4]

                if util.is_keypair_downloaded(username):
                    util.add_ssh_public_key(sftp_bucket, username, sftp_user_role, sftp_server_id) # type: ignore


            if "host" in object:
                util.add_host_key(sftp_server_id, localfile)


    except Exception as e:
        logging.error(e)
        return e
