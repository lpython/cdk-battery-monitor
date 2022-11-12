import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Effect } from 'aws-cdk-lib/aws-iam';

import { Construct } from 'constructs';

import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { RestApi, LambdaRestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';

import { StaticSite } from './static-site';

const imageBucketName = "cdk-rekn-imagebucket";

export class BatteryMonitorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // Bucket for storing images
    // ========================================
    const imageBucket = new s3.Bucket(this, imageBucketName, {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    new cdk.CfnOutput(this, "Bucket", { value: imageBucket.bucketName });

    // ========================================
    // Role for Remote Device
    // PROBABLY NOT A BEST PRACTICE
    // ========================================
    const remoteDeviceArn = new cdk.CfnParameter(this, "Remote Device IAM User ARN", {
      type: "String",
      description: "The arn of the IAM user that represents the Remote Camera Device."
    });
    const remoteDeviceIAMUser = iam.User.fromUserArn(this, id, remoteDeviceArn.valueAsString);

    // ========================================
    // Create web site to access simple web app
    // ========================================

    new StaticSite(this, "static-web", { 
      domainName: "ABCDEFG.COM",
      siteSubDomain: "app",
      siteContents: "./front/web"
    });


    // ========================================
    // Policy for Remote Device to upload to bucket
    // ========================================
    const uploaderPolicy = new iam.Policy(this, 'image-uploader-policy', {
      statements: [new iam.PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          's3:PutObject',
        ],
        resources: [imageBucket.bucketArn],
      })],
    });

    remoteDeviceIAMUser.attachInlinePolicy(uploaderPolicy);

    // ========================================
    // DynamoDB table for storing image labels
    // ========================================
    const reckResultTable = new dynamodb.Table(this, "cdk-rekn-image-table", {
      partitionKey: { name: "Image", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    });
    new cdk.CfnOutput(this, "Table", { value: reckResultTable.tableName });

    // ========================================
    // Role for AWS Lambda
    // ========================================
    const role = new iam.Role(this, "cdk-rekn-lambdarole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "rekognition:*",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["*"],
      })
    );

    // ========================================
    // AWS Lambda function - for uploading images to s3 and rekognition
    // ========================================
    const imageUploadFn = new NodejsFunction(this, "image-upload", {
      runtime: lambda.Runtime.NODEJS_16_X,
      role: role,
      timeout: cdk.Duration.seconds(10), 
      environment: {
        TABLE_NAME: reckResultTable.tableName,
        BUCKET_NAME: imageBucket.bucketName,
      },
    });

    imageUploadFn.addEventSource(
      new S3EventSource(imageBucket, {
        events: [s3.EventType.OBJECT_CREATED],
      })
    );

    imageBucket.grantReadWrite(imageUploadFn);
    reckResultTable.grantFullAccess(imageUploadFn);

    // ========================================
    // API Gateway for user facing apps
    // ========================================
    const apigw = new RestApi(this, 'api', {
      description: 'lambda api gateway',
      deployOptions: {
        stageName: 'dev',
      },
      defaultCorsPreflightOptions: {
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
        allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowCredentials: true,
        allowOrigins: ['*'],
      },
    });

    // ========================================
    // AWS Lambda function - list results for rekognition from dynamoDB
    // ========================================
    const dynamoReaderFn = new NodejsFunction(this, "dynamo-reader", {
      runtime: lambda.Runtime.NODEJS_16_X,
      role: role,     // TODO use aws mangaed role instead, this has rekognition access
      timeout: cdk.Duration.seconds(10), 
      environment: {
        TABLE_NAME: reckResultTable.tableName,
        BUCKET_NAME: imageBucket.bucketName,  
      },
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'es2020'
      }
    });

    reckResultTable.grantReadData(dynamoReaderFn);

    const readerEndpont = apigw.root.addResource('latest')
    readerEndpont.addMethod('GET', new LambdaIntegration(dynamoReaderFn, {proxy: true}))


    new cdk.CfnOutput(this, 'apiUrl', {value: apigw.url});
  }
}
