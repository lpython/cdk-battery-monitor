#/usr/bin/env bash
( cd /camera_captures/ && gst-launch-1.0 nvarguscamerasrc num-buffers=10 ! nvvidconv ! 'video/x-raw(memory:NVMM),format=NV12, width=3280, height=2464, framerate=10/1' ! nvjpegenc ! multifilesink location=snapshot-%05d.jpg  max-files=1 ) 
mv /camera_captures/snapshot-00009.jpg /camera_captures/latest.jpg 

