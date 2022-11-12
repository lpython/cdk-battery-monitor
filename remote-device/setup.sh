
if [ ! -d $0 ]
    echo "usage: setup.sh CAPTURE_DIR"
    return
fi

CAPTURE_DIR=$0

sudo mkdir $CAPTURE_DIR
echo "tmpfs  $CAPTURE_DIR  tmpfs                            rw,size=100M,uid=jetbot,gid=jetbot,mode=113   0    0" | sudo tee -a /etc/fstab

# sudo service enable cron
crontab -l > backup_cron
cp backup_cron new_cron
echo "0 0 0 0 0 $(pwd)/cron_camera_captures.sh" > new_cron
crontab new_cron

docker image build --tag jetbot-upload:auto .


sudo docker run \
--restart=always \
--detach --tty \
--name=jetbot_upload \
--network=bridge \
--mount type=bind,src=/Users/admin/repos/cdk-battery-monitor/remote-device/captures/,dst=$CAPTURE_DIR \
-e AWS_ACCESS_KEY_ID=XXX \
-e AWS_SECRET_ACCESS_KEY=YYY \
-e S3_BUCKET=ZZZ \
jetbot-upload:auto 
