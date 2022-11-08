
import type { S3Event } from "aws-lambda";
import { RekognitionClient, DetectTextCommand, TextDetection } from "@aws-sdk/client-rekognition";
import { DynamoDBClient, GetItemCommand, PutItemCommand, AttributeValue } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const REGION = 'us-west-2';

const rekClient = new RekognitionClient({ region: REGION })
const dynamoClient = new DynamoDBClient({ region: REGION })

const TABLE_NAME = process.env.TABLE_NAME;
console.log({TABLE_NAME})
export const handler = async (event: S3Event): Promise<void> => {
    let bucket = "";
    let key = "";
    event.Records.map((record) => {
        bucket = record.s3.bucket.name;
        key = record.s3.object.key;
        // console.log({bucket, key});
    });

    await rekFunction(bucket, key);
};

// TODO rename dynamo primary key to imageID

async function rekFunction(bucket: string, imageID: string) {
    // console.log(`Detected the ${key} uploaded to ${bucket}.`)
    
    // Check if already processed in dynamoDB
    const dynamoFindResponse = await dynamoClient.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: marshall({ Image: imageID }),
        AttributesToGet: [ 'ImageID' ]
    }));

    // already processed
    if (!!dynamoFindResponse.Item) {
        return;
    }

    const rekResponse = await rekClient.send(new DetectTextCommand({
        // Filters: { WordFilter: }
        Image: { "S3Object": {
            "Bucket": bucket,
            "Name": imageID
        }}
    }));

    if (!rekResponse.$metadata.httpStatusCode ||
        rekResponse.$metadata.httpStatusCode > 299 || 
        rekResponse.$metadata.httpStatusCode < 200) 
    {
        throw new Error("Failed to have rekcognition process image.")
    }

    const item: any = {
        "Image": imageID,
        "UploadDate": (new Date()).toISOString()
    };

    if (!rekResponse.TextDetections || rekResponse.TextDetections.length == 0) { return; }
    
    console.log("length of rekResponse.TextDetections: " + rekResponse.TextDetections.length)

    rekResponse.TextDetections.forEach((text,i) => {
        if (!text.DetectedText) { return; }
        item[`Text_${i}`] = text.DetectedText;
    });

    const putItemResp = await dynamoClient.send(new PutItemCommand({
        TableName: TABLE_NAME,
        Item: marshall(item),
    }));

    if (!putItemResp.$metadata.httpStatusCode ||
        putItemResp.$metadata.httpStatusCode > 299 || 
        putItemResp.$metadata.httpStatusCode < 200) 
    {
        throw new Error("Failed to upload to table")
    }
}
