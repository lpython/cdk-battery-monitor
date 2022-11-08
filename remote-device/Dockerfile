FROM ubuntu:latest
RUN apt-get update && apt-get install -y apt-utils && apt-get install -y git python3 pip curl unzip sudo
SHELL ["/bin/bash", "-c"]
RUN mkdir -p /app && \
    curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip" && \
    unzip  awscliv2.zip && \
    sudo ./aws/install
RUN python3 -m pip install boto3
ENV APPROOT="/app" \
    APP="aws_upload_capture.py" \
    PYTHONUNBUFFERED=1
WORKDIR ${APPROOT}
ADD aws_upload_capture.py ${APPROOT}
CMD ["python3", "/app/aws_upload_capture.py"]
