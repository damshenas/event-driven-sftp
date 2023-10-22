#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json, logging, utils
from os import environ

username = "FirstUser"
physical_id = environ["PHYSICAL_ID"]
environment = environ['ENV']
key_bucket = environ['KEY_BUCKET']
region = environ['REGION']

def handler(event, context):
    try:

        verbose = True if environment == "dev" else False
        if verbose: print("event", event)
        request_type = event["RequestType"]

        util = utils.main(key_bucket, environment, region)


        if request_type == "Create":
            props = event["ResourceProperties"]
            print("create new resource with props %s" % props)

            [private_key_str, public_key_str] = util.generate_key_pair(username) 
            util.upload_data_to_s3(private_key_str, "ssh_keys/{}.pem".format(username)) 
            util.upload_data_to_s3(public_key_str, "ssh_keys/{}.pub".format(username)) 

            return {"PhysicalResourceId": physical_id}
        
        elif request_type == "Update": pass

        elif request_type == "Delete": pass

        else:
            raise Exception("Invalid request type: %s" % request_type)

    except Exception as e:
        logging.error(e)
        return e
