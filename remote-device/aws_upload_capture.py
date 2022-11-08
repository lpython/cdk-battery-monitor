#!/usr/bin/env python3
import logging
import boto3
from botocore.exceptions import ClientError
import os
import sys
from os.path import join
import uuid
from datetime import datetime, timedelta
import time
import shutil
import hashlib

CAPTURE_DIR = r'/camera_captures/'

if not os.path.exists(CAPTURE_DIR):
    print(CAPTURE_DIR, ' is not available. check docker mount.')
    sys.exit()

UPLOAD_BUCKET = os.getenv("S3_BUCKET")

if UPLOAD_BUCKET is None:
    print('UPLOAD_BUCKET not set')
    sys.exit()    

LATEST_JPG_PATH = join(CAPTURE_DIR, 'latest.jpg')
UPLOAD_JPG_PATH = join(CAPTURE_DIR, 'latest_for_upload.jpg')

last_upload = None
last_upload_hash = None

TIME_BETWEEN_UPLOAD = timedelta(minutes=10)
FAILED_UPLOAD_DELAY = timedelta(minutes=2)

def upload_file(file_name, bucket, object_name=None):
    """Upload a file to an S3 bucket

    :param file_name: File to upload
    :param bucket: Bucket to upload to
    :param object_name: S3 object name. If not specified then file_name is used
    :return: True if file was uploaded, else False
    """

    # If S3 object_name was not specified, use file_name
    if object_name is None:
        object_name = os.path.basename(file_name)

    # Upload the file
    s3_client = boto3.client('s3')
    try:
        response = s3_client.upload_file(file_name, bucket, object_name)
    except ClientError as e:
        logging.error(e)
        return False
    return True

def md5(fname):
    hash_md5 = hashlib.md5()
    with open(fname, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


while True:

    # pause until next upload needed
    if last_upload is not None:
        next_upload = last_upload + TIME_BETWEEN_UPLOAD
        delta = next_upload - datetime.now()
        if delta < TIME_BETWEEN_UPLOAD:
            print('Waiting for ', str(delta), ' to upload next capture.')
            time.sleep(delta.total_seconds())
        
    # upload file name
    filename = str(uuid.uuid4()) + '.jpg'
    dst = join(CAPTURE_DIR, filename)

    # get latest jpg
    try:
        # first remove the one that is there
        # prevents uploading old captures
        os.remove(LATEST_JPG_PATH)
    
        # now wait until new one is produced
        print("waiting for next capture...")        
        while not os.path.exists(LATEST_JPG_PATH):
            time.sleep(3)
        time.sleep(3)

        # now move to protect for overwritting
        try:
            os.remove(dst)
        except FileNotFoundError:
            pass
        
        shutil.move(LATEST_JPG_PATH, dst)

    except OSError as err:
        # problem with removing or moving files. log and continue
        print('could not move files : ', err)        
        time.sleep(5)
        continue
        
    print('moved latest to: ', filename)
    # try/finally to guarantee removal of upload file
    try: 
        current_hash = md5(dst)

        if last_upload_hash is not None and current_hash == last_upload_hash:
            print('found file to have the same hash. ({})'.format(datetime.now()))
            continue           

        if not upload_file(dst, UPLOAD_BUCKET):
            print('failed to upload, next upload in ', str(FAILED_UPLOAD_DELAY))
            last_upload = last_upload + FAILED_UPLOAD_DELAY
        else:
            print(dst, ' uploaded')
            last_upload = datetime.now()
            last_upload_hash = current_hash

    finally:
        try:
            os.remove(dst)  # must succeed
            print('removed : ', filename)
        except FileNotFoundError:
            pass



