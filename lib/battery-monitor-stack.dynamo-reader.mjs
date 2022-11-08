
import { DynamoDBClient, ScanCommand, AttributeValue, QueryCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

import { DateTime, Settings } from "luxon";
import { nextTick } from "process";

Settings.defaultZone = "UTC";

const REGION = 'us-west-2';

const dynamoClient = new DynamoDBClient({ region: REGION })

const TABLE_NAME = process.env.TABLE_NAME;
const env = process.env;

const DEBUG = (env.DEBUG == "true" || env.DEBUG == "True") || false

console.log({DEBUG})

if (DEBUG) {
    nextTick(handler)
}



export async function handler() {
    let response = {};
    try {
        let result = await main();
        response.body = {batteryLevel: result};
        response.statusCode = 200;
    } catch (err) {
        response.statusCode = err.statusCode || 500;
        response.body = err.message || "Internal error";
    }

    response.headers =  {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE"
    }
    response.body = JSON.stringify(response.body);

    return response;
}

async function main() {
    let items = await getItems();

    if (!items) {
        const err = new Error("No results");
        throw err;
    }
    if (items.length == 0) {
        const err = new Error("No recent results");
        err.statusCode = 200;
        throw err;
    }

    const batteryLevel = getBatteryLevel(items);

    console.log({batteryLevel});

    return batteryLevel;
}

// Get items for dynamo table or, if DEBUG, from test set
async function getItems() {
    if (DEBUG) {
        return TEST_SET;
    }
    return await getRecentRekognitionResults();
}

async function getRecentRekognitionResults() {
    const now = DateTime.now();
    const before = now.minus({ days: 3 });

    let dynamoScanResp = await dynamoClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        IndexName: "UploadDate-index",
        FilterExpression: "UploadDate BETWEEN :before AND :now",
        ExpressionAttributeValues: marshall({
            ":now": now.toISO(),
            ":before": before.toISO()
        })
    }));

    if (!dynamoScanResp.Count || !dynamoScanResp.Items) { return []; }

    // console.log(JSON.stringify(dynamoScanResp, undefined, 2))

    let items = dynamoScanResp.Items.map(i => unmarshall(i));

    // console.log(JSON.stringify(items, undefined, 2))

    return items;
}

function getBatteryLevel(reknItems) {
    
    let items = reknItems;

    // remove items if no uploadDate
    items = items.filter(i => i.UploadDate != undefined);
    // convert to Luxon DateTime
    items.forEach(i => i.UploadDate = DateTime.fromISO(i.UploadDate));

    items.sort((a, b) => (a.UploadDate < b.UploadDate) ? 1 : -1);

    console.log("after sort")
    console.log(JSON.stringify(items, undefined, 2))
    // let batteryLevel = reduceToBestValues(items);

    items = items.map(i => removeNonNumberEntries(i));
    
    console.log("after remove non numbers")
    console.log(JSON.stringify(items, undefined, 2))

    let listNumbers = items.map(i => i.numbers);

    // return latest if ...
    if (listNumbers.every(ns => ns.length == 1)) {
        // test if all numbers are close
        const ns = listNumbers.map(ns => ns[0]);
        if (allNumbersAcceptableRange(ns)) {
            // maybe change to max in list
            return maxNumber(ns);
        }
    }
    
    // alternative is to return average of last 4 numbers;
    listNumbers = listNumbers.flat();

    const len = listNumbers.length < 5 ? listNumbers.length : 5;

    const sum = listNumbers.slice(0, len).reduce((acc, n) => acc + n, 0);

    return sum / len;
}

function acceptableRange(a, b) {
    return Math.abs(a - b) < 4;
}

function allNumbersAcceptableRange(list) {
    // every index but last
    for (let i of Array(list.length - 1).keys() ) {
        // check current and next number
        if (!acceptableRange(list[i], list[i+1])) {
            return false;
        }
    }

    return true;
}

function maxNumber(ns) {
    let max = Number.MIN_SAFE_INTEGER;
    for (let n of ns) {
        if (n > max) {
            max = n;
        }
    }

    return max;
}

/**
 * NumberEntry:
 *   UploadDate: Luxon.DateTime
 *   numbers: Number[]
 */

/**
 * 
 * @param {ReknEntry} items 
 * @returns {NumberEntry} without non number entries
 */
function removeNonNumberEntries(items) {
    // reduce to remove items that do not have values that represent battery levels
    // two digit pairs with or without a percent symbol

    let result = {};
    let twoDigit = [];
    let twoDigitPercent = [];
    for (const [key, value] of Object.entries(items)) {
        if (!key.startsWith('Text')) {
            result[key] = value;
        }
        // check if digit-digit-percent 
        if (value.length == 3 && value[2] == '%') {
            let n = Number.parseInt(value.substring(0, 2));
            if (!Number.isNaN(n)) {
                twoDigitPercent.push(n);
            }
        }
        // check if digit-digit
        if (value.length == 2) {
            let n = Number.parseInt(value.substring(0, 2));
            if (!Number.isNaN(n)) {
                twoDigit.push(n);
            }
        }
    }

    console.log({twoDigit, twoDigitPercent})
    result.numbers = [...new Set([...twoDigit, ...twoDigitPercent]).values()]
    return result;

}


/**
 * Not finished, to unneccessary
 * @param {Array<NumberEntry>} list of list of numbers
 * @return {Array<Number>} list of numbers in descending order
 */

// function scanListForBestChain(items) {
//     let result = [];

//     if (!items || items.length < 2) { return 0; }

//     startingNumbers = [...items[0], ...items[1]];

//     for (const ns of items) {
//         scanListForBestChain(
//     }


//     function inner(i, val) {
//         if (i >= items.length) { return null; }

//         const ns = items[i];
        
//         for (const n of ns) {

//         }
//     }
// }

// for local testing
const TEST_SET = [
    {
      "Text_5": "but",
      "Text_6": "and",
      "UploadDate": "2022-10-20T05:41:13.162Z",
      "Text_7": "86",
      "Text_1": "but",
      "Text_2": "and",
      "Text_3": "86",
      "Image": "0049.jpg",
      "Text_4": "R26",
      "Text_0": "R26"
    },
    {
      "Text_5": "DUTDOOR",
      "Text_6": "222\"",
      "UploadDate": "2022-10-20T04:41:43.977Z",
      "Text_7": "85",
      "Text_1": "DUTDOOR",
      "Text_2": "222\"",
      "Text_3": "85",
      "Image": "0006.jpg",
      "Text_4": "<<<<<<<<",
      "Text_0": "<<<<<<<<"
    },
    {
      "Text_17": "IGNITION",
      "Text_5": "PUSH 2932 ON ZADI ® IGNITION",
      "Text_16": "®",
      "Text_6": "12:34'",
      "UploadDate": "2022-10-20T06:55:56.508Z",
      "Text_15": "ZADI",
      "Text_7": "#35.",
      "Text_14": "ON",
      "Text_8": "87",
      "Text_1": "#35.",
      "Text_13": "2932",
      "Text_12": "PUSH",
      "Text_2": "87",
      "Text_11": "TRASH",
      "Text_3": "OUTDOOR",
      "Text_10": "Bags",
      "Text_4": "Bags TRASH",
      "Text_9": "OUTDOOR",
      "Image": "0168.jpg",
      "Text_0": "12:34'"
    }
  ];