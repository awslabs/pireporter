global.version = "1.1"

const fs = require('fs');
const commandLineArgs =  require('command-line-args');
const commandLineUsage =  require('command-line-usage');

const { RDS, 
        DescribeDBParametersCommand, 
        DescribeDBLogFilesCommand, 
        DownloadDBLogFilePortionCommand, 
        DescribeOrderableDBInstanceOptionsCommand,
        DescribeDBClustersCommand } = require("@aws-sdk/client-rds");
const { EC2 } = require("@aws-sdk/client-ec2");
const { PI } = require("@aws-sdk/client-pi");
const { PricingClient, GetPriceListFileUrlCommand, DescribeServicesCommand, ListPriceListsCommand } = require("@aws-sdk/client-pricing");
const { CloudWatchClient, GetMetricDataCommand } = require("@aws-sdk/client-cloudwatch");
const https = require('https');

const { generateHTMLReport, generateCompareHTMLReport } = require("./generateHTML")

const myRegion = 'eu-central-1'

const rds = new RDS({apiVersion: '2014-10-31', region: myRegion});
const ec2 = new EC2({apiVersion: '2016-11-15', region: myRegion});
const pi  = new  PI({apiVersion: '2018-02-27', region: myRegion});
const pricing = new PricingClient({apiVersion: '2017-10-15', region: 'us-east-1'});
const cw = new CloudWatchClient({apiVersion: '2010-08-01', region: myRegion});
/*var params = {
  DBClusterIdentifier: 'apg-bm-cluster'
}

rds.describeDBClusters(params, function(err, data) {
  if (err) console.log(err, err.stack); // an error occurred
  else     console.log('Output', JSON.stringify(data.DBClusters, null, 2));           // successful response
});
*/


const optionDefinitions = [
  { name: 'help', description: 'Display this usage guide.', alias: 'h', type: Boolean},
  { name: 'rds-instance', alias: 'i', type: String, description: 'The RDS instance name to create snapshot.' },
  { name: 'create-snapshot', alias: 's', type: Boolean, description: 'Create snapshot.'},
  { name: 'start-time', type: String, description: 'Snapshot start time. Allowed format is ISO 8601 "YYYY-MM-DDTHH:MM". Seconds will be ignored if provided.'},
  { name: 'end-time', type: String, description: 'Snapshot end time. Same format as for start time.'},
  { name: 'res-reserve-pct', type: Number, description: 'Specify the percentage of additional resources to reserve above the maximum metrics when generating instance type recommendations. Default is 30.'},
  { name: 'comment', alias: 'm', type: String, description: 'Provide a comment to associate with the snapshot.'},
  { name: 'create-report', alias: 'r', type: Boolean, description: 'Create HTML report for snapshot.'},
  { name: 'create-compare-report', alias: 'c', type: Boolean, description: 'Create compare snapshots HTML report for two snapshots.'},
  { name: 'snapshot', type: String, description: 'Snapshot JSON file name.'},
  { name: 'snapshot2', type: String, description: 'Second snapshot JSON file name to compare.'},
  { name: 'include-logfiles', type: Boolean, description: 'Instance log files will be scanned for errors or critical messages within the provided time range. This operation can be time-consuming and resource-intensive.', defaultOption: false},
  { name: 'do-estimation', type: Boolean, description: 'Estimates the percent of cost difference between a serverless versus a provisioned offerings and IO optimized versus standard storage.'},
]

// '$ pireporter {bold --create-snapshot} {bold --rds-instance} {underline name} {bold --start-time} {underline YYYY-MM-DDTHH:MM} {bold --end-time} {underline YYYY-MM-DDTHH:MM} [{--comment} {underline text}] [{--include-logfiles}]',
const sections = [
  {
    header: 'Performance Insights reporter',
    content: 'The tool to generate snapshots from PI data and create reports with useful insights.'
  },
  {
    header: 'Synopsis',
    content: { 
      options: {noTrim: true, maxWidth: 300},
      data: [
      {1: '$ pireporter {bold --create-snapshot} {bold --rds-instance} {green name} {bold --start-time} {green YYYY-MM-DDTHH:MM} {bold --end-time} {green YYYY-MM-DDTHH:MM} [{dim --comment} {green text}] [{dim --include-logfiles}]'},
      {1: '$ pireporter {bold --create-report} {bold --snapshot} {green snapshot_file}'},
      {1: '$ pireporter {bold --create-compare-report} {bold --snapshot} {green snapshot_file} {bold --snapshot2} {green snapshot_file}'},
      {1: '$ pireporter {bold --do-estimation} {bold --rds-instance} {green name} {bold --start-time} {green YYYY-MM-DDTHH:MM} {bold --end-time} {green YYYY-MM-DDTHH:MM}'},
      {1: '$ pireporter {bold --help}'}
    ]}
  },
  {
    header: 'Options',
    optionList: optionDefinitions
  },
  {
    header: 'Examples',
    content: { 
      options: {noTrim: true, maxWidth: 300},
      data: [
      {1: '1. Create a snapshot inlclude logfile analysis '},
      {1: '  $ pireporter --create-snapshot --start-time 2023-08-02T16:50 --end-time 2023-08-02T17:50 -i apginst1 --include-logfiles -m "High load period"'},
      {1: '2. Create a report from snapshot'},
      {1: '  $ pireporter --create-report --snapshot snapshot_apg-bm_20230802145000_20230802155000.json'},
      {1: '3. Create a compare periods report'},
      {1: '  $ pireporter --create-compare-report --snapshot snapshot_apg-bm_20230704150700_20230704194900.json --snapshot2 snapshot_apg-bm_20230619100000_20230619113000.json'},
    ]}
  },
  {
    content: 'Project home: {underline https://github.com/<TBD>}'
  }
]


const options = commandLineArgs(optionDefinitions)

if (options.help) {
   console.log(commandLineUsage(sections))
   process.exit()
}

// console.log(options);

var startTime
var endTime
var cwMetrics = []
var priceListGlobal

// Generate 5 hour date ranges
const generateDateRanges = function (interval = 18000) {
  const timeDiff = endTime.getTime() - startTime.getTime();
  const numIntervals = Math.ceil(timeDiff / (interval * 1000));

  const ranges = [];
  for (let i = 0; i < numIntervals; i++) {
    const start = new Date(startTime.getTime() + i * interval * 1000);
    const end = new Date(start.getTime() + interval * 1000);
    if (end > endTime) {
      ranges.push({start, end: endTime});
    } else {
      ranges.push({start, end});
    }
}
//console.log(ranges);
return ranges
}

var timeOffset = (new Date().getTimezoneOffset() / 60) * -1;

if (options['start-time']) {
  const [startYear, startMonth, startDay, startHour, startMinute] = options['start-time'].split(/[-T:]/).map(Number);
  n = new Date(startYear, startMonth - 1, startDay, startHour, startMinute);
  startTime = new Date(n.getTime() + timeOffset);
}

if (options['end-time']) {
  const [endYear, endMonth, endDay, endHour, endMinute] = options['end-time'].split(/[-T:]/).map(Number);
  n = new Date(endYear, endMonth - 1, endDay, endHour, endMinute);
  endTime = new Date(n.getTime() + timeOffset);
}


if (options['create-snapshot'] || options['do-estimation']) {
  if ((startTime instanceof Date && !isNaN(startTime)) && (endTime instanceof Date && !isNaN(endTime))) {
    if ((endTime - startTime)/(1000 * 60) < 10) {
      console.error('Minimum allowed time frame is 10 minutes.')
      process.exit(1)
    }
    var periodInSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000)
    var dateRanges = generateDateRanges()
    
    if (options["rds-instance"]) {
      var InstanceName = options["rds-instance"]
    } else {
      console.error('Provide RDS instance name to take PI snapshot.')
      process.exit(1)
    }
  
  } else {
    console.error('Snapshot start time and end time are required. Check --help for more information.')
    process.exit(1)
  }
}


// Max ACUs is 128 which 256 GB host with 32 vCPUs, it makes 4 ACUs per vCPU. It will be used for rough estimations.
const ACUmultiplier = 4
const maxACULimit = 128
const ACUcalcIOmetricEffectivePeriod = 7
const otherMemoryAllocationsPCT = 35
const metricsCorrelationThreshold = 0.7
const logFilesParallelDegree = 5
var resourceReservePct = options['res-reserve-pct'] || 30
/*const startTime = new Date(2023, 3, 17, 11, 0, 0)
const endTime = new Date(2023, 3, 24, 13, 30, 0)
*/
//const startTime = new Date(2023, 6, 2, 10, 10, 0)
//const endTime = new Date(2023, 6, 3, 20, 49, 0)

const baselineNPfile = './baselineNetworkPerformance.json'
if (fs.existsSync(baselineNPfile)) {
  var baselineNP = JSON.parse(fs.readFileSync(baselineNPfile, 'utf8'));
} else {
  console.warn(`File ${baselineNPfile} cannot be found, some metrics will not be calculated.`)
}




const getEC2Details = (a) => {
  var EC2Class = a.substr(3);
  var request = ec2.describeInstanceTypes({InstanceTypes: [EC2Class]});
  
  return request;
  
};



// Get the PI range in seconds based on report range
const getPIperiodSeconds = function (range) {
  if ((range / 1) <= 100) {
    return 1
  } else if ((range / 60) <= 100) {
    return 60
  } else if ((range / 300) <= 100) {
    return 300
  } else if ((range / 3600) <= 100) {
    return 3600
  } else {
    return 86400 
  }
}


// Convert date
const convertDate = function (dateString) {
  const date = new Date(dateString);

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}


// Rounds the number to next 0.5 if less than 0.5 or to next 1 if number is between 0.5 and 1
const roundACUs = function (num) {
   return Math.ceil(num * 2) / 2;
}

const roundToNext1000 = function (num) {
  
  if (num < 1000) return 1000
  
  var next1000 = Math.ceil(num / 1000) * 1000;
  
  return next1000;
}

const mergeArraysByMax = function (arr1, arr2, arr3) {
  
  var maxArr = [];
  for (let i = 0; i < arr1.length; i++) {
    const maxVal = Math.max(arr1[i], arr2[i], arr3[i]);
    maxArr.push(maxVal);
  }

  return maxArr
}

const generateInterpolation = function (inputArr) {

  let outputArr = [];

  let level_number = inputArr[0];
  outputArr = [inputArr[0]];
  let consecutive_levels = 0;

  for (let i = 1; i < inputArr.length; i++) {
    if (inputArr[i] < level_number) {
      outputArr.push(level_number);
      consecutive_levels++;
      if (consecutive_levels >= 9) {
        level_number = inputArr[i];
        consecutive_levels = 0;
      }
    } else {
      outputArr.push(inputArr[i]);
      level_number = inputArr[i];
      consecutive_levels = 0;
    }
  }

  //console.log(`generateInterpolation input ${JSON.stringify(inputArr)}`);
  //console.log(`generateInterpolation output ${JSON.stringify(outputArr)}`);
  
  return outputArr

}

// Datapoints array consists from from Objects like {"Timestamp": "2023-06-19T11:29:00.000Z","Value": 0}
// We use this function to compare two Datapoints arrays
const correlationIndex = function (arr1, arr2) {
  var similar = 0
  for (let i = 0; i < arr1.length-1; i++) {
    var arr1_val = arr1[i].Value
    var arr2_val = arr2[i].Value
    var arr1_next = arr1[i+1].Value
    var arr2_next = arr2[i+1].Value
    if ((arr1_val > arr1_next && arr2_val > arr2_next) || (arr1_val < arr1_next && arr2_val < arr2_next) || (arr1_val === arr1_next && arr2_val === arr2_next)) {
      similar++
    }
  }
  return similar/(arr1.length-1);
}


const fetchJSON = async function (url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}


const evaluateParameter = function (instMemoryMiB, paramValue) {
  function SUM(a, b) { return a + b }
  function LEAST(a, b) { return a < b ? a : b }
  function GREATEST(a, b) { return a > b ? a : b }
  const GREATESTregex = /^GREATEST\(\{[\d\/\*\+\-]*DBInstanceClassMemory[\d\/\*\+\-]*\},\s*-?\d+\)$/;
  const SUMregex = /^SUM\(\{[\d\/\*\+\-]*DBInstanceClassMemory[\d\/\*\+\-]*\},\s*-?\d+\)$/;
  const LEASTregex = /^LEAST\(\{[\d\/\*\+\-]*DBInstanceClassMemory[\d\/\*\+\-]*\},\s*-?\d+\)$/;
  const DBInstanceClassMemory = instMemoryMiB * 1024 * 1024
  // In paramValue replace '{' with '(' and '}' with ')' 
  if (!isNaN(Number(paramValue))) {
    return Number(paramValue)
  }
  if (GREATESTregex.test(paramValue) || SUMregex.test(paramValue) || LEASTregex.test(paramValue)) {
    paramValue = paramValue.replace('{', '(').replace('}', ')')
    return eval(paramValue)
  }
  return undefined
}



const modifyACUIOarray = function (arr) {
  let ind = 0
  let sum = 0
  let res = []
  for (let i = 0; i < arr.length; i++) {
    ind++
    sum = sum + arr[i]
    if (ind === ACUcalcIOmetricEffectivePeriod) {
      ind = 0
      res.push(sum)
      sum = 0
    } else {
      res.push(0)
    }
  }
  return res
}


const calculateAverage = function (numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return undefined;
  }
  let sum = 0;
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] == null) continue
    sum += numbers[i];
  }
  return sum / numbers.length;
}

const calculateMax = function (numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return undefined;
  }
  let maxValue = numbers[0];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] == null) continue
    if (numbers[i] > maxValue) {
      maxValue = numbers[i];
    }
  }
  return maxValue;
}

const calculateMin = function (numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return undefined;
  }
  let minValue = numbers[0];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] == null) continue
    if (numbers[i] < minValue) {
      minValue = numbers[i];
    }
  }
  return minValue;
}


const calculateSum = function (numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return undefined;
  }
  let sum = 0;
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] == null) continue
    sum = sum + numbers[i]
  }
  return sum;
}



function calculateStandardDeviation(numbers, mean) {
  const differences = numbers.map(number => number - mean);
  const squaredDifferences = differences.map(difference => difference ** 2);
  const averageSquaredDifference = squaredDifferences.reduce((sum, difference) => sum + difference, 0) / numbers.length;
  const standardDeviation = Math.sqrt(averageSquaredDifference);
  return standardDeviation;
}


const generateCPUandIOArrays = async function (DbiResourceId, vCPUs) {

  var CPUDataPoints = []
  var IODataPoints = []
  var OSIOPSDataPoints = []
  var CPUValues
  var IOvalues
  var OSIOPSValues
  var PI_result
  var AlignedStartTime
  var AlignedEndTime
  
  for (let i = 0; i < dateRanges.length; i++) {
  
    try {
      PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: DbiResourceId,
        StartTime: dateRanges[i].start,
        EndTime: dateRanges[i].end,
        PeriodInSeconds: 60,
        MetricQueries: [
          {
            Metric: "os.cpuUtilization.total.max"
          },
          {
            Metric: "db.SQL.logical_reads.max"
          },
          {
            Metric: "os.diskIO.readIOsPS.sum"
          }
        ]
      });
    } catch (error) {
        console.log(`Error: ${error}`)
    }   
    
    CPUValues = PI_result.MetricList[0].DataPoints.map(dataPoint => vCPUs * dataPoint.Value / 100);
    IOvalues = PI_result.MetricList[1].DataPoints.map(dataPoint => dataPoint.Value);
    OSIOPSValues = PI_result.MetricList[2].DataPoints.map(dataPoint => dataPoint.Value);
     
    CPUDataPoints.push(...CPUValues)
    IODataPoints.push(...IOvalues)
    OSIOPSDataPoints.push(...OSIOPSValues)
    
    if (i === 0) AlignedStartTime = PI_result.AlignedStartTime
    if (i === dateRanges.length - 1) AlignedEndTime = PI_result.AlignedEndTime

  }

  return {CPUDataPoints: CPUDataPoints, IODataPoints: IODataPoints, OSIOPSDataPoints: modifyACUIOarray(OSIOPSDataPoints), AlignedStartTime: AlignedStartTime, AlignedEndTime: AlignedEndTime}
    
  
}  


const generateEstimatedCPUACUs = function (inputArr) {
  
  let res = inputArr.map(dataPoint => roundACUs(dataPoint * ACUmultiplier))
  
  return res
}


const generateEstimatedMemoryACUs = function (inputArr) {
  
  let res = inputArr.map(dataPoint => roundACUs(roundToNext1000(dataPoint) / 2000))
  
  return res
}


const generateMemoryArray = function (inputArr) {
  
  let res = inputArr.map(dataPoint => (dataPoint * 8 / 1024) * 100 / (100 - otherMemoryAllocationsPCT))
  
  return res
}


const generateEstimatedACUs = function (CPUACUArr, MemoryACUArr1, MemoryACUArr2) {
  
  let res = mergeArraysByMax(CPUACUArr, MemoryACUArr1, MemoryACUArr2)
  
  return res.map(dataPoint => (dataPoint > maxACULimit) ? maxACULimit : dataPoint)
}

const formatSeconds = function (seconds) {
    const MINUTE = 60;
    const HOUR = MINUTE * 60;
    const DAY = HOUR * 24;
    const MONTH = DAY * 30;
    const YEAR = DAY * 365;
    let remainingSeconds = seconds;
    const years = Math.floor(remainingSeconds / YEAR);
    remainingSeconds -= years * YEAR;
    const months = Math.floor(remainingSeconds / MONTH);
    remainingSeconds -= months * MONTH;
    const days = Math.floor(remainingSeconds / DAY);
    remainingSeconds -= days * DAY;
    const hours = Math.floor(remainingSeconds / HOUR);
    remainingSeconds -= hours * HOUR;
    const minutes = Math.floor(remainingSeconds / MINUTE);
    let result = "";
    if (years > 0) {
        result += `${years} year${years > 1 ? 's' : ''} `;
    }
    if (months > 0) {
        result += `${months} month${months > 1 ? 's' : ''} `;
    }
    if (days > 0) {
        result += `${days} day${days > 1 ? 's' : ''} `;
    }
    if (hours > 0) {
        result += `${hours} hour${hours > 1 ? 's' : ''} `;
    }
    if (minutes > 0) {
        result += `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    return result.trim();
}



const calculateServerlessCost = function (ACUs, pricePerACUHour) {
      let cost = 0
      for (let i = 0; i < ACUs.length; i++) {
          cost = cost + (parseFloat(pricePerACUHour/60) * ACUs[i])
      }
      
      return cost
}




const getServerlessMaxACU = async function (DbiResourceId) {
  return new Promise (async (resolve, reject) => {

  const startTimeSpecial = new Date(endTime.getTime() - 15 * 60 * 1000);
  const pseconds = 300
    
  try {
    var PI_data = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: DbiResourceId,
        StartTime: startTimeSpecial,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          {
            Metric: "os.general.minConfiguredAcu.max"
          },
          {
            Metric: "os.general.maxConfiguredAcu.max"
          }
        ]
      });

  } catch(err) { 
    reject(err)
  }
  
  var count = PI_data.MetricList[0].DataPoints.length
  resolve({minACUs: PI_data.MetricList[0].DataPoints[count - 1].Value, maxACUs: PI_data.MetricList[1].DataPoints[count - 1].Value})  

  })
}




const getVolumeAndIO = async function (cluster) {
  return new Promise (async (resolve, reject) => {

    
    const pseconds = getPIperiodSeconds(periodInSeconds)
    
    const cwCommand = new GetMetricDataCommand({
     StartTime: startTime,
     EndTime: endTime,
     MetricDataQueries: [
       {Id: "volumeBytesUsed", Label: "${AVG}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "VolumeBytesUsed",
                                                    Dimensions: [{Name: "DBClusterIdentifier", Value: cluster}]},
                                                    Period: pseconds,
                                                    Stat: "Average"}},
       {Id: "volumeWriteIOPs", Label: "${SUM}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "VolumeWriteIOPs",
                                                    Dimensions: [{Name: "DBClusterIdentifier", Value: cluster}]},
                                                    Period: pseconds,
                                                    Stat: "Sum"}},
       {Id: "volumeReadIOPs", Label: "${SUM}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "VolumeReadIOPs",
                                                    Dimensions: [{Name: "DBClusterIdentifier", Value: cluster}]},
                                                    Period: pseconds,
                                                    Stat: "Sum"}}
     ]
  });
  
  
  try {
    var cwData = await cw.send(cwCommand);
  } catch(err) { 
    reject(err)
  }
  
   
   resolve({volumeBytesUsed: parseInt(cwData.MetricDataResults.find(v => v.Id === 'volumeBytesUsed').Label.replace(/,/g, '')),
            volumeWriteIOPs: parseInt(cwData.MetricDataResults.find(v => v.Id === 'volumeWriteIOPs').Label.replace(/,/g, '')),
            volumeReadIOPs: parseInt(cwData.MetricDataResults.find(v => v.Id === 'volumeReadIOPs').Label.replace(/,/g, ''))})  

  })
}




const getServerlessUsageCW = async function (GeneralInformation) {

  var ACUDataPoints = []
  var ACUValues
  var cwData
  
  var DateRanges = generateDateRanges(12*60*60)
  
  for (let i = 0; i < DateRanges.length; i++) {
    
    const cwCommand = new GetMetricDataCommand({
     StartTime: DateRanges[i].start,
     EndTime: DateRanges[i].end,
     MetricDataQueries: [
       {Id: "serverlessDatabaseCapacity", MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "ServerlessDatabaseCapacity",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: GeneralInformation.DBInstanceIdentifier}]},
                                                    Period: 60,
                                                    Stat: "Maximum"}}
     ]
    });
  
  
    try {
      var cwData = await cw.send(cwCommand);
    } catch (error) {
        console.log(`Error: ${error}`)
    }   
    
    ACUValues = cwData.MetricDataResults[0].Values;
     
    ACUDataPoints.push(...ACUValues)
    

  }

  return ACUDataPoints
    
  
}  





const getCWMetrics = async function (generalInformation) {
  return new Promise (async (resolve, reject) => {

    if (cwMetrics.length > 0) {
      resolve(cwMetrics)
    }
    
    const pseconds = getPIperiodSeconds(periodInSeconds)
    
    const cwCommand = new GetMetricDataCommand({
     StartTime: startTime,
     EndTime: endTime,
     MetricDataQueries: [
        {Id: "networkThroughput",  Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "NetworkThroughput",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: InstanceName}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "storageNetworkThroughput", Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "StorageNetworkThroughput",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: InstanceName}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "engineUptime", Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "EngineUptime",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: InstanceName}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "replicationSlotDiskUsage", Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "ReplicationSlotDiskUsage",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: InstanceName}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "snapshotStorageUsed", Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "SnapshotStorageUsed",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: InstanceName}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "transactionLogsDiskUsage", Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "TransactionLogsDiskUsage",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: InstanceName}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "dbLoad", Label: "${AVG}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "DBLoad",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: InstanceName}]},
                                                    Period: pseconds,
                                                    Stat: "Average"}},
        {Id: "bufferCacheHitRatio", Label: "${AVG}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "BufferCacheHitRatio",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: InstanceName}]},
                                                    Period: pseconds,
                                                    Stat: "Average"}},
        {Id: "volumeBytesUsed", Label: "${LAST}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "VolumeBytesUsed",
                                                    Dimensions: [{Name: "DBClusterIdentifier", Value: generalInformation.DBClusterIdentifier}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}}
                                                    
    ]
  });
  
  
  try {
    cwMetrics = await cw.send(cwCommand);
  } catch(err) { 
    reject(err)
  }
  

   resolve(cwMetrics)  

  })
}
  
  

const calcNetworkPerformanceLimits = function (generalInformation, maxKnownNetworkTrafficBytes) {
  var res = {}
  var burstable = false
  var Gbps
  const matches = generalInformation.EC2Details.NetworkPerformance.match(/\d+(\.\d+)?/);
  if (matches) {
     Gbps = parseFloat(matches[0]);
     if (generalInformation.EC2Details.NetworkPerformance.startsWith("Up to")) {
       burstable = true
     }
  } else {
     Gbps = 2.5;
     burstable = true
     baselineGbps = 0.5
  }

  var trafficToMaxPct = (maxKnownNetworkTrafficBytes / 1024 / 1024)  /  (Gbps * 125) * 100;
  res["networkMaxMBps"] = (Gbps * 125)
  if (burstable && baselineNP) { 
    var baselineGbps = baselineNP.Aurora.find(v => v.type === generalInformation.DBInstanceClass).value
    if (baselineGbps) {
       res["baselineMBps"] = baselineGbps * 125
    }
  }

  if (maxKnownNetworkTrafficBytes) {
    res["trafficToMaxPct"] = trafficToMaxPct
    res["diffFromMaxMBps"] = (Gbps * 125) - (maxKnownNetworkTrafficBytes / 1024 / 1024)
    
    if (burstable && baselineNP && baselineGbps) { 
      var trafficToBaselinePct = (maxKnownNetworkTrafficBytes / 1024 / 1024)  /  (baselineGbps * 125) * 100;
      res["trafficToBaselinePct"] = trafficToBaselinePct
      res["diffFromBaselineMBps"] = (baselineGbps * 125) - (maxKnownNetworkTrafficBytes / 1024 / 1024)
    }
  }
  
  res["burstable"] = burstable
  return res
  
}


const getPrices = async function (GeneralInformation) {
   return new Promise (async (resolve, reject) => {
    
    let pricingDBEngine
    if (GeneralInformation.Engine === 'aurora-postgresql') {
      pricingDBEngine = 'Aurora PostgreSQL'
    } else {
      pricingDBEngine = 'Aurora MySQL'
    }

    var PriceList

    if (priceListGlobal) {
      
      PriceList = priceListGlobal
      
    } else {
    try {
      const command = new ListPriceListsCommand({
            ServiceCode: "AmazonRDS",
            EffectiveDate: new Date(),
            CurrencyCode: "USD"});
      var response = await pricing.send(command);
    } catch (error) {
      console.log(error)
      reject(error)
    }

      const myPriceList = response.PriceLists.find(
        item => item.CurrencyCode === "USD" && item.RegionCode === myRegion
      );

    try {
      const input = { // GetPriceListFileUrlRequest
        PriceListArn: myPriceList.PriceListArn, // required
        FileFormat: "json", // required
      };
      const command2 = new GetPriceListFileUrlCommand(input);
      var response2 = await pricing.send(command2);
    } catch (error) {
      console.log(error)
      reject(error)
    }
      
      
      priceListGlobal = await fetchJSON(response2.Url)
      PriceList = priceListGlobal
     }
      
      var returnObject = {}
      
      //console.log(JSON.stringify(PriceList, null, 2))

      const serverlessV2_SKU = Object.values(PriceList.products).find(p =>
        p.productFamily === "ServerlessV2" && p.attributes.databaseEngine === pricingDBEngine && !p.attributes.usagetype.includes("IOOptimized")
      );
      
      const serverlessV2_IOO_SKU = Object.values(PriceList.products).find(p =>
        p.productFamily === "ServerlessV2" && p.attributes.databaseEngine === pricingDBEngine && p.attributes.usagetype.includes("IOOptimized")
      );
      
      let sku = serverlessV2_SKU.sku;
      let skuIOO = serverlessV2_IOO_SKU.sku;

      const skuData = PriceList.terms.OnDemand[sku];
      const priceDimensions = skuData[Object.keys(skuData)[0]].priceDimensions;
      const pricePerACUHour = priceDimensions[Object.keys(priceDimensions)[0]].pricePerUnit.USD;
      const skuDataIOO = PriceList.terms.OnDemand[skuIOO];
      const priceDimensionsIOO = skuDataIOO[Object.keys(skuDataIOO)[0]].priceDimensions;
      const pricePerACUHourIOO = priceDimensionsIOO[Object.keys(priceDimensionsIOO)[0]].pricePerUnit.USD;

      returnObject['pricePerACUHour'] = parseFloat(pricePerACUHour)
      returnObject['pricePerACUHourIOO'] = parseFloat(pricePerACUHourIOO)
      
      const storage_SKU = Object.values(PriceList.products).find(p =>
        p.productFamily === "Database Storage" && p.attributes.databaseEngine === pricingDBEngine && !p.attributes.usagetype.includes("IO-Optimized")
      );
      const storageIOO_SKU = Object.values(PriceList.products).find(p =>
        p.productFamily === "Database Storage" && p.attributes.databaseEngine === pricingDBEngine && p.attributes.usagetype.includes("IO-Optimized")
      );
      
      let skuStorage = storage_SKU.sku;
      let skuStorageIOO = storageIOO_SKU.sku;

      const skuStorageData = PriceList.terms.OnDemand[skuStorage];
      const priceDimensionsStorage = skuStorageData[Object.keys(skuStorageData)[0]].priceDimensions;
      const pricePerGBMonth = priceDimensionsStorage[Object.keys(priceDimensionsStorage)[0]].pricePerUnit.USD;
      const skuStorageDataIOO = PriceList.terms.OnDemand[skuStorageIOO];
      const priceDimensionsStorageIOO = skuStorageDataIOO[Object.keys(skuStorageDataIOO)[0]].priceDimensions;
      const pricePerGBMonthIOO = priceDimensionsStorageIOO[Object.keys(priceDimensionsStorageIOO)[0]].pricePerUnit.USD;
      
      returnObject['pricePerGBMonth'] = parseFloat(pricePerGBMonth)
      returnObject['pricePerGBMonthIOO'] = parseFloat(pricePerGBMonthIOO)
      
      const io_SKU = Object.values(PriceList.products).find(p =>
        p.productFamily === "System Operation" && p.attributes.databaseEngine === pricingDBEngine && p.attributes.usagetype.includes("IOUsage")
      );
      
      let skuIO = io_SKU.sku;
      const skuIOData = PriceList.terms.OnDemand[skuIO];
      const priceDimensionsStorageIO = skuIOData[Object.keys(skuIOData)[0]].priceDimensions;
      const pricePer1MillionIO = priceDimensionsStorageIO[Object.keys(priceDimensionsStorageIO)[0]].pricePerUnit.USD * 1000000;
      
      returnObject['pricePer1MillionIO'] = pricePer1MillionIO
      
      
      if (GeneralInformation.DBInstanceClass !== 'db.serverless') {
        const provisioned_SKU = Object.values(PriceList.products).find(p =>
          p.productFamily === "Database Instance" && p.attributes.databaseEngine === pricingDBEngine && p.attributes.instanceType === GeneralInformation.DBInstanceClass && !p.attributes.storage.includes("IO Optimization")
        );
        const provigioned_IOO_SKU = Object.values(PriceList.products).find(p =>
          p.productFamily === "Database Instance" && p.attributes.databaseEngine === pricingDBEngine && p.attributes.instanceType === GeneralInformation.DBInstanceClass && p.attributes.storage.includes("IO Optimization")
        );
        
        const provisionedSku = provisioned_SKU.sku
        const onDemandSkuData = PriceList.terms.OnDemand[provisionedSku];
        const onDemandPriceDimensions = onDemandSkuData[Object.keys(onDemandSkuData)[0]].priceDimensions;
        const onDemandPricePerHour = onDemandPriceDimensions[Object.keys(onDemandPriceDimensions)[0]].pricePerUnit.USD;
        const provisionedIOOSku = provigioned_IOO_SKU.sku
        const onDemandIOOSkuData = PriceList.terms.OnDemand[provisionedIOOSku];
        const onDemandIOOPriceDimensions = onDemandIOOSkuData[Object.keys(onDemandIOOSkuData)[0]].priceDimensions;
        const onDemandIOOPricePerHour = onDemandIOOPriceDimensions[Object.keys(onDemandIOOPriceDimensions)[0]].pricePerUnit.USD;
        
        returnObject['onDemandPricePerHour'] = parseFloat(onDemandPricePerHour)
        returnObject['onDemandIOOPricePerHour'] = parseFloat(onDemandIOOPricePerHour)
        
        var reservedObj = PriceList.terms.Reserved[provisionedSku];
        var reservedPrices = {}
        for (const offerTermCode in reservedObj) {
          const termAttributes = reservedObj[offerTermCode]['termAttributes'];
          const PurchaseOption = termAttributes['PurchaseOption'];
          const LeaseContractLength = termAttributes['LeaseContractLength'];
          //console.log(`Price per term ${LeaseContractLength} and option ${PurchaseOption}`);
          let priceDim = reservedObj[offerTermCode]['priceDimensions']
          
          for (const priceDimObj in priceDim) {
            //console.log(`PriceDim ${priceDim[priceDimObj]}`);
            if (priceDim[priceDimObj].unit === "Hrs" || priceDim[priceDimObj].unit === "Quantity") {
              //console.log(`Price per term ${LeaseContractLength} and option ${PurchaseOption} unit (${priceDim[priceDimObj].unit}): ${priceDim[priceDimObj].pricePerUnit.USD}`);
              reservedPrices[`${LeaseContractLength}-${PurchaseOption}-${priceDim[priceDimObj].unit}`] = parseFloat(priceDim[priceDimObj].pricePerUnit.USD)
            }
          }
        }

      
        returnObject['reservedPrices'] = reservedPrices
     }
      
      resolve(returnObject)

   })
}

const calculateProvisionedCost = async function (GeneralInformation, rangeInMinutes = -1) {
        // get prices  
        const prices = await getPrices(GeneralInformation)
        var res = {}
       
         const PricePerMinuteOnDemand          = prices.onDemandPricePerHour / 60
         const PricePerMinuteOnDemandIOO       = prices.onDemandIOOPricePerHour / 60
         const PricePerMinute1YrAllUpfront     = prices.reservedPrices["1yr-All Upfront-Quantity"] / 365 / 24 / 60
         const PricePerMinute1YrPartialUpfront = prices.reservedPrices["1yr-Partial Upfront-Quantity"] / 365 / 24 / 60 + prices.reservedPrices["1yr-Partial Upfront-Hrs"] / 60
         const PricePerMinute1YrNoUpfront      = prices.reservedPrices["1yr-No Upfront-Hrs"] / 60
         const PricePerMinute3YrAllUpfront     = prices.reservedPrices["3yr-All Upfront-Quantity"] / (3 * 365) / 24 / 60
         const PricePerMinute3YrPartialUpfront = prices.reservedPrices["3yr-Partial Upfront-Quantity"] / (3 * 365) / 24 / 60 + prices.reservedPrices["3yr-Partial Upfront-Hrs"] / 60
         
         res['CostOnDemand']          = rangeInMinutes * PricePerMinuteOnDemand
         res['Cost1YrAllUpfront']     = rangeInMinutes * PricePerMinute1YrAllUpfront
         res['Cost1YrPartialUpfront'] = rangeInMinutes * PricePerMinute1YrPartialUpfront
         res['Cost1YrNoUpfront']      = rangeInMinutes * PricePerMinute1YrNoUpfront
         res['Cost3YrAllUpfront']     = rangeInMinutes * PricePerMinute3YrAllUpfront
         res['Cost3YrPartialUpfront'] = rangeInMinutes * PricePerMinute3YrPartialUpfront
         
         res['CostOnDemandIOO']          = rangeInMinutes * PricePerMinuteOnDemandIOO
         res['Cost1YrAllUpfrontIOO']     = res['Cost1YrAllUpfront'] * 1.3
         res['Cost1YrPartialUpfrontIOO'] = res['Cost1YrPartialUpfront'] * 1.3
         res['Cost1YrNoUpfrontIOO']      = res['Cost1YrNoUpfront'] * 1.3
         res['Cost3YrAllUpfrontIOO']     = res['Cost3YrAllUpfront'] * 1.3
         res['Cost3YrPartialUpfrontIOO'] = res['Cost3YrPartialUpfront'] * 1.3
       
       return res
}
    

const estimateServerless = async function (GeneralInformation) {
    
    // Estimate serverless
    if (GeneralInformation.DBInstanceClass === 'db.serverless') {
      // Instance is serverless, estimate provisioned
    
      try {
        const command = new DescribeOrderableDBInstanceOptionsCommand({Engine: GeneralInformation.Engine, EngineVersion: GeneralInformation.EngineVersion});
        var response = await rds.send(command);
        var availableInstanceClasses = response.OrderableDBInstanceOptions.map(i => i.DBInstanceClass)
        return {availableInstanceClasses}
      } catch (err) {
        console.error(err)
      }
      
      
      
    } else {
      // Instance is provisioned, estimate serverless
    
      const PI_data_for_ACU = await generateCPUandIOArrays(GeneralInformation.DbiResourceId, GeneralInformation.EC2Details.DefaultVCpus)
      var estimatedCPUbasedACUs = generateEstimatedCPUACUs(PI_data_for_ACU.CPUDataPoints)
      var MemoryRequiredMBArray1 = generateMemoryArray(PI_data_for_ACU.IODataPoints)
      var MemoryRequiredMBArray2 = generateMemoryArray(PI_data_for_ACU.OSIOPSDataPoints)
      var estimatedMemoryBasedACUs1 = generateEstimatedMemoryACUs(MemoryRequiredMBArray1)
      var estimatedMemoryBasedACUs2 = generateEstimatedMemoryACUs(MemoryRequiredMBArray2)
      var estimatedACUs = generateEstimatedACUs(estimatedCPUbasedACUs, estimatedMemoryBasedACUs1, estimatedMemoryBasedACUs2)
      var realisticACUs = generateInterpolation(estimatedACUs)
    
      var avgACUs = calculateAverage(realisticACUs)
      var stdACUs = calculateStandardDeviation(realisticACUs, avgACUs)
      var minACUs = roundACUs(avgACUs - stdACUs)
      var maxACUsAvgStd = roundACUs(avgACUs + stdACUs)
      var maxACUs = Math.max(...realisticACUs)
    
      const instanceCosts = await calculateProvisionedCost(GeneralInformation, realisticACUs.length)
    
      var serverlessEstimation = {}
    
      const prices = await getPrices(GeneralInformation)
      const serverlessCost = calculateServerlessCost(realisticACUs, prices.pricePerACUHour)
         
      serverlessEstimation['EstimatedPercentRelativeToCostOnDemand'] =  parseFloat(((instanceCosts.CostOnDemand - serverlessCost) /  instanceCosts.CostOnDemand * 100).toFixed(2))
      serverlessEstimation['EstimatedPercentRelativeToCost1YrAllUpfront'] = parseFloat(((instanceCosts.Cost1YrAllUpfront - serverlessCost) /  instanceCosts.Cost1YrAllUpfront * 100).toFixed(2))
      serverlessEstimation['EstimatedPercentRelativeToCost1YrPartialUpfront'] = parseFloat(((instanceCosts.Cost1YrPartialUpfront - serverlessCost) /  instanceCosts.Cost1YrPartialUpfront * 100).toFixed(2))
      serverlessEstimation['EstimatedPercentRelativeToCost1YrNoUpfront'] = parseFloat(((instanceCosts.Cost1YrNoUpfront - serverlessCost) /  instanceCosts.Cost1YrNoUpfront * 100).toFixed(2))
      serverlessEstimation['EstimatedPercentRelativeToCost3YrPartialUpfront'] = parseFloat(((instanceCosts.Cost3YrPartialUpfront - serverlessCost) /  instanceCosts.Cost3YrPartialUpfront * 100).toFixed(2))
      serverlessEstimation['EstimatedPercentRelativeToCost3YrAllUpfront'] = parseFloat(((instanceCosts.Cost3YrAllUpfront - serverlessCost) /  instanceCosts.Cost3YrAllUpfront * 100).toFixed(2))
      serverlessEstimation['SuggestedMinACUs'] = parseFloat(minACUs)
      serverlessEstimation['SuggestedMaxACUsBasedOnAVGandSD'] = parseFloat(maxACUsAvgStd)
      serverlessEstimation['SuggestedMaxACUsBasedOnMAX'] = parseFloat(maxACUs)
    
    }
    
    /*
    console.log(`Estimated serverless cost: ${serverlessCost}`)
    console.log(`Estimated IO Optimized serverless cost: ${serverlessIOOCost}`)
    console.log(`CostOnDemand: ${CostOnDemand}`)
    console.log(`CostOnDemandIOO: ${CostOnDemandIOO}`)
    console.log(`Cost1YrAllUpfront: ${Cost1YrAllUpfront}`)
    console.log(`Cost1YrAllUpfrontIOO: ${Cost1YrAllUpfrontIOO}`)
    console.log(`Cost1YrPartialUpfront: ${Cost1YrPartialUpfront}`)
    console.log(`Cost1YrPartialUpfrontIOO: ${Cost1YrPartialUpfrontIOO}`)
    console.log(`Cost1YrNoUpfront: ${Cost1YrNoUpfront}`)
    console.log(`Cost1YrNoUpfrontIOO: ${Cost1YrNoUpfrontIOO}`)
    console.log(`Cost3YrAllUpfront: ${Cost3YrAllUpfront}`)
    console.log(`Cost3YrAllUpfrontIOO: ${Cost3YrAllUpfrontIOO}`)
    console.log(`Cost3YrPartialUpfront: ${Cost3YrPartialUpfront}`)
    console.log(`Cost3YrPartialUpfrontIOO: ${Cost3YrPartialUpfrontIOO}`)
    
    console.log(`Serverless cost start period: ${PI_data_for_ACU.AlignedStartTime}`)
    console.log(`Serverless cost end period: ${PI_data_for_ACU.AlignedEndTime}`)
    console.log(`Number of values: ${realisticACUs.length}`)
    
    console.log(`Suggested minimum ACUs: ${minACUs}`)
    console.log(`Suggested maximum ACUs based on the average and standard deviation: ${maxACUsAvgStd}`)
    console.log(`Suggested maximum ACUs based on the maximum ACU estimated: ${maxACUs}`)
    */
  
    // Estimate storage type
    var optimizedIOEstimation = {}
    const prices = await getPrices(GeneralInformation)
  
    try {
      var volumeAndIO = await getVolumeAndIO(GeneralInformation.DBClusterIdentifier)
    } catch (err) { console.error(err) }
    
    // 2592000 is number of seconds in one month (30 days)
    const estimationVolumeCost = ((volumeAndIO.volumeBytesUsed/1024/1024/1024 * prices.pricePerGBMonth) / 2592000) * periodInSeconds
    const estimationVolumeCostIOO = ((volumeAndIO.volumeBytesUsed/1024/1024/1024 * prices.pricePerGBMonthIOO) / 2592000) * periodInSeconds
    const estimationIOCost = (volumeAndIO.volumeWriteIOPs + volumeAndIO.volumeReadIOPs) * prices.pricePer1MillionIO / 1000000
    
    try {
      const command = new DescribeDBClustersCommand({DBClusterIdentifier: GeneralInformation.DBClusterIdentifier});
      const response = await rds.send(command);
      var availableInstances = response.DBClusters[0].DBClusterMembers.map(i => i.DBInstanceIdentifier)
    } catch (err) {
      console.error(err)
    }
    
    // loop over availableInstances arrayand get general information for each instance
    var computeCostSL = 0
    var computeCostSLIOO = 0
    var computeCostProvisioned = 0
    var computeCostProvisionedIOO = 0
    for (var i = 0; i < availableInstances.length; i++) {
      try {
        var instanceGeneralInformation = await getGeneralInformation({ DBInstanceIdentifier: availableInstances[i] })
      } catch (err) {console.error(err)}
      
      var instancePrices = await getPrices(instanceGeneralInformation)
      
      if (instanceGeneralInformation.DBInstanceClass === "db.serverless") {
          var usedACUs = await getServerlessUsageCW(instanceGeneralInformation)
          computeCostSL = computeCostSL + calculateServerlessCost(usedACUs, instancePrices.pricePerACUHour)
          computeCostSLIOO = computeCostSLIOO + (calculateServerlessCost(usedACUs, instancePrices.pricePerACUHourIOO))
      } else {
          var currInstanceCosts = await calculateProvisionedCost(instanceGeneralInformation, periodInSeconds / 60)
          computeCostProvisioned = computeCostProvisioned + currInstanceCosts.CostOnDemand
          computeCostProvisionedIOO = computeCostProvisionedIOO + currInstanceCosts.CostOnDemandIOO
      }
    }
    
    var estimatedComputeCost = computeCostSL + computeCostProvisioned
    var estimatedComputeCostIOO = computeCostSLIOO + computeCostProvisionedIOO
    
    const overallCost = estimatedComputeCost + estimationVolumeCost + estimationIOCost
    const overallCostIOO = estimatedComputeCostIOO + estimationVolumeCostIOO

    if (GeneralInformation.StorageType === 'aurora') {
    // Storage type is standard, estimate IO Optimized
      optimizedIOEstimation = {estimatedPercentIOOptimizedCostToStandard: parseFloat(((overallCost - overallCostIOO) / overallCost * 100).toFixed(2)) }
    
    } else {
    // Storage type is IO optimized, estimate standard
      optimizedIOEstimation = {estimatedPercentStandardCostToIOOptimized: parseFloat(((overallCostIOO - overallCost) / overallCostIOO * 100).toFixed(2)) }
    }
  
    return {serverlessEstimation, optimizedIOEstimation, warning: 'Please note that the numbers presented in this estimation are indicative and may not represent precise or exact figures. They are based on a probable assessment and intended to provide general recommendations. Actual values may vary depending on various factors.'}
    
}




const getAllDBParameters = async function (GeneralInformation) {
  return new Promise(async (resolve, reject) => {
   
   /*while (i < 5) {
    console.log(i);
    i++;
   }*/
   var marker = 'initial'
   var allParams = []
   while (marker !== undefined) {
   
    try {
      
     const rdsCommand = new DescribeDBParametersCommand({DBParameterGroupName: GeneralInformation.DBParameterGroups[0].DBParameterGroupName, Marker: marker === 'initial' ? undefined : marker})
     var params = await rds.send(rdsCommand)
      
    } catch (error) {
         console.log(error);
         reject(error)
    }

    marker = params.Marker
    allParams.push(...params.Parameters)
    
    }
    
   resolve(allParams)

  })
}




const getDBParameters = async function (GeneralInformation) {
  return new Promise(async (resolve, reject) => {

    try {
      
     const rdsCommand = new DescribeDBParametersCommand({DBParameterGroupName: GeneralInformation.DBParameterGroups[0].DBParameterGroupName, Source: 'user'})
     var params = await rds.send(rdsCommand)
      
    } catch (error) {
         console.log(error);
         reject(error)
    }

    resolve(params.Parameters)

  })
}




const counterMetrics = async function (generalInformation) {
  return new Promise(async (resolve, reject) => {

  try {
    var PIMetricsMetadata = await pi.listAvailableResourceMetrics({
      ServiceType: "RDS",
      Identifier: generalInformation.DbiResourceId,
      MetricTypes: ['os', 'db', 'db.sql.stats', 'db.sql_tokenized.stats']
    });
    
    // ['os', 'db', 'db.sql.stats', 'db.sql_tokenized.stats']
   //console.log('Output', 'PIMetricsMetadata', JSON.stringify(PIMetricsMetadata, null, 2));
   // console.log('Output', 'PIMetricsMetadata', PIMetricsMetadata);
    
  } catch (error) {
      reject(error)
  }
  
  
  const getMetricData = function (dataSet, metric) {
    var dataPointsArr = dataSet.filter(object => object.Key.Metric.startsWith(metric+'.'))
    var res = {}
    const getValues = function (arr) {
      return arr.map(dataPoint => dataPoint.Value)
    }
    if (dataPointsArr.length === 3) {
        res["avg"] = Number(calculateAverage(getValues(dataPointsArr.find(object => object.Key.Metric === `${metric}.avg`).DataPoints)).toFixed(2))
        res["max"] = calculateMax(getValues(dataPointsArr.find(object => object.Key.Metric === `${metric}.max`).DataPoints))
        res["min"] = calculateMin(getValues(dataPointsArr.find(object => object.Key.Metric === `${metric}.min`).DataPoints))
    } else if (dataPointsArr.length === 1) {
        res["sum"] = calculateSum(getValues(dataPointsArr.find(object => object.Key.Metric === `${metric}.sum`).DataPoints))
    } else {
        return {}
    }
    
    return res
    
  }
  
  const pseconds = getPIperiodSeconds(periodInSeconds)
  //console.log('PI Period in seconds', pseconds)
  
  // OS Metrics
  
  
  var OS_MetricList = []
  
  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.cpuUtilization.guest.avg"},{Metric: "os.cpuUtilization.guest.max"},{Metric: "os.cpuUtilization.guest.min"},
          {Metric: "os.cpuUtilization.idle.avg"},{Metric: "os.cpuUtilization.idle.max"},{Metric: "os.cpuUtilization.idle.min"},
          {Metric: "os.cpuUtilization.irq.avg"},{Metric: "os.cpuUtilization.irq.max"},{Metric: "os.cpuUtilization.irq.min"},
          {Metric: "os.cpuUtilization.nice.avg"},{Metric: "os.cpuUtilization.nice.max"},{Metric: "os.cpuUtilization.nice.min"},
          {Metric: "os.cpuUtilization.steal.avg"},{Metric: "os.cpuUtilization.steal.max"},{Metric: "os.cpuUtilization.steal.min"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     
    
    
    try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.cpuUtilization.system.avg"},{Metric: "os.cpuUtilization.system.max"},{Metric: "os.cpuUtilization.system.min"},
          {Metric: "os.cpuUtilization.total.avg"},{Metric: "os.cpuUtilization.total.max"},{Metric: "os.cpuUtilization.total.min"},
          {Metric: "os.cpuUtilization.user.avg"},{Metric: "os.cpuUtilization.user.max"},{Metric: "os.cpuUtilization.user.min"},
          {Metric: "os.cpuUtilization.wait.avg"},{Metric: "os.cpuUtilization.wait.max"},{Metric: "os.cpuUtilization.wait.min"},
          {Metric: "os.diskIO.auroraStorage.auroraStorageBytesRx.sum"},
          {Metric: "os.diskIO.auroraStorage.auroraStorageBytesTx.sum"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     
  
  
  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.diskIO.auroraStorage.diskQueueDepth.avg"},{Metric: "os.diskIO.auroraStorage.diskQueueDepth.max"},{Metric: "os.diskIO.auroraStorage.diskQueueDepth.min"},
          {Metric: "os.diskIO.auroraStorage.readIOsPS.avg"},{Metric: "os.diskIO.auroraStorage.readIOsPS.max"},{Metric: "os.diskIO.auroraStorage.readIOsPS.min"},
          {Metric: "os.diskIO.auroraStorage.readLatency.avg"},{Metric: "os.diskIO.auroraStorage.readLatency.max"},{Metric: "os.diskIO.auroraStorage.readLatency.min"},
          {Metric: "os.diskIO.auroraStorage.readThroughput.avg"},{Metric: "os.diskIO.auroraStorage.readThroughput.max"},{Metric: "os.diskIO.auroraStorage.readThroughput.min"},
          {Metric: "os.diskIO.auroraStorage.writeIOsPS.avg"},{Metric: "os.diskIO.auroraStorage.writeIOsPS.max"},{Metric: "os.diskIO.auroraStorage.writeIOsPS.min"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     
  
  
  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.diskIO.auroraStorage.writeLatency.avg"},{Metric: "os.diskIO.auroraStorage.writeLatency.max"},{Metric: "os.diskIO.auroraStorage.writeLatency.min"},
          {Metric: "os.diskIO.auroraStorage.writeThroughput.avg"},{Metric: "os.diskIO.auroraStorage.writeThroughput.max"},{Metric: "os.diskIO.auroraStorage.writeThroughput.min"},
          {Metric: "os.diskIO.rdstemp.avgQueueLen.avg"},{Metric: "os.diskIO.rdstemp.avgQueueLen.max"},{Metric: "os.diskIO.rdstemp.avgQueueLen.min"},
          {Metric: "os.diskIO.rdstemp.avgReqSz.avg"},{Metric: "os.diskIO.rdstemp.avgReqSz.max"},{Metric: "os.diskIO.rdstemp.avgReqSz.min"},
          {Metric: "os.diskIO.rdstemp.await.avg"},{Metric: "os.diskIO.rdstemp.await.max"},{Metric: "os.diskIO.rdstemp.await.min"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     
  

  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.diskIO.rdstemp.readIOsPS.avg"},{Metric: "os.diskIO.rdstemp.readIOsPS.max"},{Metric: "os.diskIO.rdstemp.readIOsPS.min"},
          {Metric: "os.diskIO.rdstemp.readKbPS.avg"},{Metric: "os.diskIO.rdstemp.readKbPS.max"},{Metric: "os.diskIO.rdstemp.readKbPS.min"},
          {Metric: "os.diskIO.rdstemp.rrqmPS.avg"},{Metric: "os.diskIO.rdstemp.rrqmPS.max"},{Metric: "os.diskIO.rdstemp.rrqmPS.min"},
          {Metric: "os.diskIO.rdstemp.tps.avg"},{Metric: "os.diskIO.rdstemp.tps.max"},{Metric: "os.diskIO.rdstemp.tps.min"},
          {Metric: "os.diskIO.rdstemp.util.avg"},{Metric: "os.diskIO.rdstemp.util.max"},{Metric: "os.diskIO.rdstemp.util.min"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     

 try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.diskIO.rdstemp.writeIOsPS.avg"},{Metric: "os.diskIO.rdstemp.writeIOsPS.max"},{Metric: "os.diskIO.rdstemp.writeIOsPS.min"},
          {Metric: "os.diskIO.rdstemp.writeKbPS.avg"},{Metric: "os.diskIO.rdstemp.writeKbPS.max"},{Metric: "os.diskIO.rdstemp.writeKbPS.min"},
          {Metric: "os.diskIO.rdstemp.wrqmPS.avg"},{Metric: "os.diskIO.rdstemp.wrqmPS.max"},{Metric: "os.diskIO.rdstemp.wrqmPS.min"},
          {Metric: "os.fileSys.total.avg"},{Metric: "os.fileSys.total.max"},{Metric: "os.fileSys.total.min"},
          {Metric: "os.fileSys.used.avg"},{Metric: "os.fileSys.used.max"},{Metric: "os.fileSys.used.min"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     


  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.fileSys.usedFilePercent.avg"},{Metric: "os.fileSys.usedFilePercent.max"},{Metric: "os.fileSys.usedFilePercent.min"},
          {Metric: "os.fileSys.usedFiles.avg"},{Metric: "os.fileSys.usedFiles.max"},{Metric: "os.fileSys.usedFiles.min"},
          {Metric: "os.fileSys.usedPercent.avg"},{Metric: "os.fileSys.usedPercent.max"},{Metric: "os.fileSys.usedPercent.min"},
          {Metric: "os.loadAverageMinute.fifteen.avg"},{Metric: "os.loadAverageMinute.fifteen.max"},{Metric: "os.loadAverageMinute.fifteen.min"},
          {Metric: "os.loadAverageMinute.five.avg"},{Metric: "os.loadAverageMinute.five.max"},{Metric: "os.loadAverageMinute.five.min"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     


 try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.loadAverageMinute.one.avg"},{Metric: "os.loadAverageMinute.one.max"},{Metric: "os.loadAverageMinute.one.min"},
          {Metric: "os.memory.active.avg"},{Metric: "os.memory.active.max"},{Metric: "os.memory.active.min"},
          {Metric: "os.memory.buffers.avg"},{Metric: "os.memory.buffers.max"},{Metric: "os.memory.buffers.min"},
          {Metric: "os.memory.cached.avg"},{Metric: "os.memory.cached.max"},{Metric: "os.memory.cached.min"},
          {Metric: "os.memory.db.cache.avg"},{Metric: "os.memory.db.cache.max"},{Metric: "os.memory.db.cache.min"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     


  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.memory.db.residentSetSize.avg"},{Metric: "os.memory.db.residentSetSize.max"},{Metric: "os.memory.db.residentSetSize.min"},
          {Metric: "os.memory.db.swap.avg"},{Metric: "os.memory.db.swap.max"},{Metric: "os.memory.db.swap.min"},
          {Metric: "os.memory.dirty.avg"},{Metric: "os.memory.dirty.max"},{Metric: "os.memory.dirty.min"},
          {Metric: "os.memory.free.avg"},{Metric: "os.memory.free.max"},{Metric: "os.memory.free.min"},
          {Metric: "os.memory.hugePagesFree.avg"},{Metric: "os.memory.hugePagesFree.max"},{Metric: "os.memory.hugePagesFree.min"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     


 
  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.memory.hugePagesRsvd.avg"},{Metric: "os.memory.hugePagesRsvd.max"},{Metric: "os.memory.hugePagesRsvd.min"},
          {Metric: "os.memory.hugePagesTotal.avg"},{Metric: "os.memory.hugePagesTotal.max"},{Metric: "os.memory.hugePagesTotal.min"},
          {Metric: "os.memory.inactive.avg"},{Metric: "os.memory.inactive.max"},{Metric: "os.memory.inactive.min"},
          {Metric: "os.memory.mapped.avg"},{Metric: "os.memory.mapped.max"},{Metric: "os.memory.mapped.min"},
          {Metric: "os.memory.pageTables.avg"},{Metric: "os.memory.pageTables.max"},{Metric: "os.memory.pageTables.min"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     

  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.memory.slab.avg"},{Metric: "os.memory.slab.max"},{Metric: "os.memory.slab.min"},
          {Metric: "os.memory.writeback.avg"},{Metric: "os.memory.writeback.max"},{Metric: "os.memory.writeback.min"},
          {Metric: "os.network.rx.avg"},{Metric: "os.network.rx.max"},{Metric: "os.network.rx.min"},
          {Metric: "os.network.tx.avg"},{Metric: "os.network.tx.max"},{Metric: "os.network.tx.min"},
          {Metric: "os.swap.cached.avg"},{Metric: "os.swap.cached.max"},{Metric: "os.swap.cached.min"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     
    
    
  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.swap.free.avg"},{Metric: "os.swap.free.max"},{Metric: "os.swap.free.min"},
          {Metric: "os.swap.in.avg"},{Metric: "os.swap.in.max"},{Metric: "os.swap.in.min"},
          {Metric: "os.swap.out.avg"},{Metric: "os.swap.out.max"},{Metric: "os.swap.out.min"},
          {Metric: "os.tasks.running.avg"},{Metric: "os.tasks.running.max"},{Metric: "os.tasks.running.min"},
          {Metric: "os.tasks.sleeping.avg"},{Metric: "os.tasks.sleeping.max"},{Metric: "os.tasks.sleeping.min"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     
    
  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          // OS Metrics
          {Metric: "os.tasks.stopped.avg"},{Metric: "os.tasks.stopped.max"},{Metric: "os.tasks.stopped.min"},
          {Metric: "os.tasks.total.avg"},{Metric: "os.tasks.total.max"},{Metric: "os.tasks.total.min"},
          {Metric: "os.tasks.zombie.avg"},{Metric: "os.tasks.zombie.max"},{Metric: "os.tasks.zombie.min"},
          {Metric: "os.diskIO.rdstemp.readKb.sum"},
          {Metric: "os.diskIO.rdstemp.writeKb.sum"},
          {Metric: "os.memory.outOfMemoryKillCount.sum"},
          {Metric: "os.tasks.blocked.sum"}
        ]
      });
      
      OS_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     
  
  
  
  try {
      var PI_static_metrics = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          {Metric: "os.general.numVCPUs.max"}, {Metric: "os.memory.total.max"}, {Metric: "os.swap.total.max"}
        ]
      });
      
    } catch (error) {
        reject(error)
    }
    
    var staticMetrics = {vCPUs: [], memory: [], swap: []}
    
    PI_static_metrics.MetricList.forEach(Metric => {
      var uniquePoints = [Metric.DataPoints[0]]
      var foundPoints = [Metric.DataPoints[0].Value]
      Metric.DataPoints.forEach(Datapoint => {
        if (! foundPoints.includes(Datapoint.Value)) {
           foundPoints.push(Datapoint.Value)
           uniquePoints.push(Datapoint)
        }
      })
      if (Metric.Key.Metric === "os.general.numVCPUs.max") {
        staticMetrics.vCPUs = uniquePoints
      } else if (Metric.Key.Metric === "os.memory.total.max") {
        staticMetrics.memory = uniquePoints
      } else if (Metric.Key.Metric === "os.swap.total.max") {
        staticMetrics.swap = uniquePoints
      }
      
    })
    
    //console.log('Static metrics', JSON.stringify(staticMetrics, null, 2))
    
    
  
  var OS_Metrics = {
    cpuUtilization: {name: "CPU Utilization", metrics: []},
    diskIO: {name: "Disk IO", metrics: []},
    fileSys: {name: "File system", metrics: []},
    loadAverageMinute: {name: "Average load per intervals", metrics: []},
    memory: {name: "Memory", metrics: []},
    network: {name: "Network", metrics: []},
    swap: {name: "Swap", metrics: []},
    tasks: {name: "OS tasks", metrics: []}
  }
  
  
  var OS_MetricsMetdata = PIMetricsMetadata.Metrics.filter(meta => meta.Metric.startsWith('os.'))
  
  //var OS_MetricsExcludeList = ['os.fileSys.maxFiles', 'os.memory.hugePagesSize', 'os.memory.hugePagesTotal', 'os.memory.outOfMemoryKillCount', 'os.memory.total', 'os.swap.total']
  var OS_MetricsExcludeList = ['os.fileSys.maxFiles', 'os.memory.hugePagesSize', 'os.memory.total', 'os.swap.total']
  
  for (let i = 0; i < OS_MetricsMetdata.length; i++) {
    
    var cm = OS_MetricsMetdata[i]
    switch (true) {
      case cm.Metric.startsWith("os.cpuUtilization") && !OS_MetricsExcludeList.includes(cm.Metric):
        OS_Metrics.cpuUtilization.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(OS_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("os.diskIO") && !OS_MetricsExcludeList.includes(cm.Metric):
        OS_Metrics.diskIO.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(OS_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("os.fileSys") && !OS_MetricsExcludeList.includes(cm.Metric):
        OS_Metrics.fileSys.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(OS_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("os.loadAverageMinute") && !OS_MetricsExcludeList.includes(cm.Metric):
        OS_Metrics.loadAverageMinute.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(OS_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("os.memory") && !OS_MetricsExcludeList.includes(cm.Metric):
        OS_Metrics.memory.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(OS_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("os.network") && !OS_MetricsExcludeList.includes(cm.Metric):
        OS_Metrics.network.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(OS_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("os.swap") && !OS_MetricsExcludeList.includes(cm.Metric):
        OS_Metrics.swap.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(OS_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("os.tasks") && !OS_MetricsExcludeList.includes(cm.Metric):
        OS_Metrics.tasks.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(OS_MetricList, cm.Metric)})
        break;
      default:
        break;
    }
    
  }
  
  
  //console.log('Output', 'PI_result', OS_MetricList);
  //console.log('Output', 'PI_result length', OS_MetricList.length);
  //console.log('Output', 'PI_result', JSON.stringify(OS_Metrics, null, 2))
  //console.log('Output', 'PI_result', getMetricData(OS_MetricList, 'os.cpuUtilization.total'));
  //console.log('Output', 'PI_result', getMetricData(OS_MetricList, 'os.diskIO.rdstemp.readKb'));
  
  
  // Database metrics
  
  var DB_Aurora_MetricList = []
  
  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          {Metric: "db.SQL.queries.sum"},{Metric: "db.SQL.total_query_time.sum"},{Metric: "db.SQL.tup_deleted.sum"},
          {Metric: "db.SQL.tup_fetched.sum"},{Metric: "db.SQL.tup_inserted.sum"},{Metric: "db.SQL.tup_returned.sum"},
          {Metric: "db.SQL.tup_updated.sum"},{Metric: "db.Cache.blks_hit.sum"},{Metric: "db.Cache.buffers_alloc.sum"},
          {Metric: "db.Checkpoint.buffers_checkpoint.sum"},{Metric: "db.Checkpoint.checkpoints_req.sum"},
          {Metric: "db.Checkpoint.checkpoint_sync_time.avg"},{Metric: "db.Checkpoint.checkpoint_sync_time.max"},{Metric: "db.Checkpoint.checkpoint_sync_time.min"}
        ]
      });
      
      DB_Aurora_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     
    
    
    try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          {Metric: "db.Checkpoint.checkpoints_timed.sum"},{Metric: "db.Checkpoint.maxwritten_clean.sum"},{Metric: "db.Concurrency.deadlocks.sum"},
          {Metric: "db.Checkpoint.checkpoint_write_time.avg"},{Metric: "db.Checkpoint.checkpoint_write_time.max"},{Metric: "db.Checkpoint.checkpoint_write_time.min"},
          {Metric: "db.IO.blk_read_time.avg"},{Metric: "db.IO.blk_read_time.max"},{Metric: "db.IO.blk_read_time.min"},
          {Metric: "db.IO.blks_read.sum"},{Metric: "db.IO.buffers_backend.sum"},{Metric: "db.IO.buffers_backend_fsync.sum"},
          {Metric: "db.IO.buffers_clean.sum"},
          {Metric: "db.State.idle_in_transaction_aborted_count.sum"}
        ]
      });
      
      DB_Aurora_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     
  
  
  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          {Metric: "db.State.idle_in_transaction_count.sum"},{Metric: "db.Temp.temp_bytes.sum"},{Metric: "db.Temp.temp_files.sum"},
          {Metric: "db.State.idle_in_transaction_max_time.avg"},{Metric: "db.State.idle_in_transaction_max_time.max"},{Metric: "db.State.idle_in_transaction_max_time.min"},
          {Metric: "db.Transactions.active_transactions.sum"},{Metric: "db.Transactions.blocked_transactions.sum"},{Metric: "os.diskIO.auroraStorage.readLatency.min"},
          {Metric: "db.Transactions.duration_commits.avg"},{Metric: "db.Transactions.duration_commits.max"},{Metric: "db.Transactions.duration_commits.min"},
          {Metric: "db.Transactions.max_used_xact_ids.sum"},{Metric: "db.Transactions.xact_commit.sum"},{Metric: "db.Transactions.xact_rollback.sum"}
        ]
      });
      
      DB_Aurora_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     
  
  
  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          {Metric: "db.User.numbackends.avg"},{Metric: "db.User.numbackends.max"},{Metric: "db.User.numbackends.min"},
          {Metric: "db.Checkpoint.checkpoint_sync_latency.avg"},{Metric: "db.Checkpoint.checkpoint_sync_latency.max"},{Metric: "db.Checkpoint.checkpoint_sync_latency.min"},
          {Metric: "db.Checkpoint.checkpoint_write_latency.avg"},{Metric: "db.Checkpoint.checkpoint_write_latency.max"},{Metric: "db.Checkpoint.checkpoint_write_latency.min"},
          {Metric: "db.User.total_auth_attempts.sum"},{Metric: "db.WAL.archived_count.sum"},{Metric: "db.WAL.archive_failed_count.sum"},
          {Metric: "db.SQL.logical_reads.sum"}
        ]
      });
      
      DB_Aurora_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     
  

  try {
      var PI_result = await pi.getResourceMetrics({
        ServiceType: "RDS",
        Identifier: generalInformation.DbiResourceId,
        StartTime: startTime,
        EndTime: endTime,
        PeriodInSeconds: pseconds,
        MetricQueries: [
          {Metric: "db.IO.read_latency.avg"},{Metric: "db.IO.read_latency.max"},{Metric: "db.IO.read_latency.min"},
          {Metric: "db.Transactions.commit_latency.avg"},{Metric: "db.Transactions.commit_latency.max"},{Metric: "db.Transactions.commit_latency.min"}
        ]
      });
      
      DB_Aurora_MetricList.push(...PI_result.MetricList)
      
    } catch (error) {
        reject(error)
    }     
    
    

  var DB_Aurora_Metrics = {
    SQL: {name: "SQL", metrics: []},
    Cache: {name: "Cache", metrics: []},
    Checkpoint: {name: "Checkpoint", metrics: []},
    Concurrency: {name: "Concurrency", metrics: []},
    IO: {name: "I/O", metrics: []},
    State: {name: "State", metrics: []},
    Temp: {name: "Temp", metrics: []},
    Transactions: {name: "Transactions", metrics: []},
    User: {name: "User", metrics: []},
    WAL: {name: "WAL", metrics: []}
  }
  
  
  var DB_MetricsMetdata = PIMetricsMetadata.Metrics.filter(meta => meta.Metric.startsWith('db.'))
  
  var DB_MetricsExcludeList = []
  
  for (let i = 0; i < DB_MetricsMetdata.length; i++) {
    
    var cm = DB_MetricsMetdata[i]
    switch (true) {
      case cm.Metric.startsWith("db.SQL") && !DB_MetricsExcludeList.includes(cm.Metric):
        DB_Aurora_Metrics.SQL.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(DB_Aurora_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("db.Cache") && !DB_MetricsExcludeList.includes(cm.Metric):
        DB_Aurora_Metrics.Cache.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(DB_Aurora_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("db.Checkpoint") && !DB_MetricsExcludeList.includes(cm.Metric):
        DB_Aurora_Metrics.Checkpoint.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(DB_Aurora_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("db.Concurrency") && !DB_MetricsExcludeList.includes(cm.Metric):
        DB_Aurora_Metrics.Concurrency.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(DB_Aurora_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("db.IO") && !DB_MetricsExcludeList.includes(cm.Metric):
        DB_Aurora_Metrics.IO.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(DB_Aurora_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("db.State") && !DB_MetricsExcludeList.includes(cm.Metric):
        DB_Aurora_Metrics.State.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(DB_Aurora_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("db.Temp") && !DB_MetricsExcludeList.includes(cm.Metric):
        DB_Aurora_Metrics.Temp.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(DB_Aurora_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("db.Transactions") && !DB_MetricsExcludeList.includes(cm.Metric):
        DB_Aurora_Metrics.Transactions.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(DB_Aurora_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("db.User") && !DB_MetricsExcludeList.includes(cm.Metric):
        DB_Aurora_Metrics.User.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(DB_Aurora_MetricList, cm.Metric)})
        break;
      case cm.Metric.startsWith("db.WAL") && !DB_MetricsExcludeList.includes(cm.Metric):
        DB_Aurora_Metrics.WAL.metrics.push({metric: cm.Metric, desc: cm.Description, unit: cm.Unit, ...getMetricData(DB_Aurora_MetricList, cm.Metric)})
        break;
      default:
        break;
    }
    
  }
  
  
  var MetricListsAll = [...OS_MetricList, ...DB_Aurora_MetricList]
  var MetricLists = MetricListsAll.reduce((res, val, index) => {
     if (val.Key.Metric.endsWith('.avg') || val.Key.Metric.endsWith('.sum')) {
       res.push(val)
     }
     return res
  }, [])
  
  
  // Find correlated metrics and save into correlations Object
  var correlations = {0: []}
  var correlationGroup = 0
  const inCGroup = function (Metric) {
    var ret
    for (const key in correlations) {
      if (correlations[key].includes(Metric)) { 
        return key 
        } else { ret = 'n' }
    }
    return ret
  }
  for (let i = 0; i < MetricLists.length; i++) {
    for (let y = 0; y < MetricLists.length; y++) {
      if (MetricLists[i].Key.Metric === MetricLists[y].Key.Metric) continue
      var cIdx = correlationIndex(MetricLists[i].DataPoints, MetricLists[y].DataPoints)
      var cGroup1 = inCGroup(MetricLists[i].Key.Metric)
      var cGroup2 = inCGroup(MetricLists[y].Key.Metric)
      if (cIdx >= metricsCorrelationThreshold) {
        if (cGroup1 === 'n' && cGroup2 === 'n') {
          correlations[Math.max(...Object.keys(correlations))+1] = [MetricLists[i].Key.Metric, MetricLists[y].Key.Metric]
        } else if ((cGroup1 !== 'n' && cGroup2 === 'n') || (cGroup1 === 'n' && cGroup2 !== 'n')) {
            var existingCGroup = (cGroup1 !== 'n') ? cGroup1 : cGroup2
            correlations[existingCGroup].push(MetricLists[i].Key.Metric, MetricLists[y].Key.Metric)
        }
      }
    }
  }
  
  // Remove duplicates
  for (const key in correlations) {
    correlations[key] = [...new Set(correlations[key])]
  }
  
  delete correlations['0']
  correlations['Threshold'] = metricsCorrelationThreshold
  
  
  var cwData = await getCWMetrics(generalInformation)
  
  var networkThroughputBytes = parseInt(cwData.MetricDataResults.find(v => v.Id === 'networkThroughput').Label.replace(/,/g, ''))
  var storageNetworkThroughputBytes = parseInt(cwData.MetricDataResults.find(v => v.Id === 'storageNetworkThroughput').Label.replace(/,/g, ''))
  var networkLimits = calcNetworkPerformanceLimits(generalInformation, networkThroughputBytes + storageNetworkThroughputBytes)
  var transactionLogsDiskUsage = parseFloat(cwData.MetricDataResults.find(v => v.Id === 'transactionLogsDiskUsage').Label.replace(/,/g, ''))
  var snapshotStorageUsed = cwData.MetricDataResults.find(v => v.Id === 'snapshotStorageUsed').Values.length === 0 ? 0 : parseFloat(cwData.MetricDataResults.find(v => v.Id === 'snapshotStorageUsed').Label.replace(/,/g, ''))
  
  // Calculated Metrics
  var p = await getAllDBParameters(generalInformation)
  var max_connections = evaluateParameter(generalInformation.EC2Details.MemorySizeInMiB, p.find(par => par.ParameterName === 'max_connections').ParameterValue)
  
  var AdditionalMetrics = {
    bufferCacheHitRatio: {value: parseFloat(cwData.MetricDataResults.find(v => v.Id === 'bufferCacheHitRatio').Label.replace(/,/g, '')),
                           unit: 'Percent',
                           label: 'Buffer cache hit ratio', 
                           desc: `Buffer cache hit ratio`},
    BlocksReadToLogicalReads: {value: (DB_Aurora_Metrics.IO.metrics.find(m => m.metric === 'db.IO.blks_read').sum / DB_Aurora_Metrics.SQL.metrics.find(m => m.metric === 'db.SQL.logical_reads').sum * 100).toFixed(2),
                               unit: 'Percent',
                               label: 'Pct disk reads', 
                               desc: 'The percentage of disk reads that come from logical reads (all reads).'},
    TupReturnedToFetched: {value: (DB_Aurora_Metrics.SQL.metrics.find(m => m.metric === 'db.SQL.tup_returned').sum / DB_Aurora_Metrics.SQL.metrics.find(m => m.metric === 'db.SQL.tup_fetched').sum).toFixed(0),
                           unit: 'Ratio',
                           label: 'Tuples returned to fetched', 
                           desc: 'The number of tuples returned divided by the number of tuples fetched. High values can indicate intensive full and range scans or a high count of dead tuples'},
    realTrafficPercentage: {value: networkLimits.trafficToMaxPct.toFixed(5),
                            unit: 'Percent',
                           label: 'Pct network traffic to max limit', 
                           desc: `The percentage of actual network traffic compared to the maximum possible network throughput. Actual netwrok traffic for the snapshot period was ${((networkThroughputBytes + storageNetworkThroughputBytes) / 1024 / 1024).toFixed(2)} MB/s and the maximum network throughput for this instance class is ${networkLimits.networkMaxMBps} MB/s. ${networkLimits.burstable ? 'Consider that this instace class has a burstable network throughput.' : ''}`},
    realTrafficToBaselinePct: networkLimits.burstable && networkLimits.trafficToBaselinePct ? {
                                    value: networkLimits.trafficToBaselinePct.toFixed(5),
                            unit: 'Percent',
                           label: 'Pct network traffic to estimated baseline', 
                           desc: `The percentage of actual network traffic compared to the baseline network throughput. The estimated baseline network throughput for this instance class is ${networkLimits.baselineMBps} MB/s. Consider that this baseline is only estimation and can differ from actual values.}`
                           } : undefined,
    AAStoBackends: {value: (parseFloat(cwData.MetricDataResults.find(v => v.Id === 'dbLoad').Label.replace(/,/g, '')) / DB_Aurora_Metrics.User.metrics.find(m => m.metric === 'db.User.numbackends').avg * 100).toFixed(2),
                           unit: 'Percent',
                           label: 'Pct active sessions to connections', 
                           desc: `Percent of average active sessions to average backends (connections). Average number of backends for the snapshot period was ${DB_Aurora_Metrics.User.metrics.find(m => m.metric === 'db.User.numbackends').avg}`},
    numBackendsToMax: {value: (DB_Aurora_Metrics.User.metrics.find(m => m.metric === 'db.User.numbackends').max / max_connections * 100).toFixed(2),
                           unit: 'Percent',
                           label: 'Pct max backends to max_connections', 
                           desc: `Percent of maximum backends (connections) in snapshot period to max_connections. Estimated max_connections for this instance is ${max_connections}`},
    numFetchedToDML: {value: (DB_Aurora_Metrics.SQL.metrics.find(m => m.metric === 'db.SQL.tup_fetched').sum / (DB_Aurora_Metrics.SQL.metrics.find(m => m.metric === 'db.SQL.tup_inserted').sum +
                                                                                                                DB_Aurora_Metrics.SQL.metrics.find(m => m.metric === 'db.SQL.tup_deleted').sum +
                                                                                                                DB_Aurora_Metrics.SQL.metrics.find(m => m.metric === 'db.SQL.tup_updated').sum)).toFixed(0),
                           unit: 'Ratio',
                           label: 'Tuples fetched to DMLs', 
                           desc: `Fetched tuples / DMLs (inserted + updated + deleted)`},
    engineUpTime: {value: formatSeconds(parseInt(cwData.MetricDataResults.find(v => v.Id === 'engineUptime').Label.replace(/,/g, ''))),
                           unit: 'Time',
                           label: 'Instance uptime', 
                           desc: `Instance up time`},
    volumeBytesUsedGB: {value: parseFloat(cwData.MetricDataResults.find(v => v.Id === 'volumeBytesUsed').Label.replace(/,/g, '') / 1024 / 1024 / 1024).toFixed(0),
                           unit: 'GB',
                           label: 'Amount of used storage volume', 
                           desc: `Amount of storage volume used by the cluster ${generalInformation.DBClusterIdentifier}`},
    transactionLogsDiskUsageKB: {value: transactionLogsDiskUsage < 0 ? -1 : (transactionLogsDiskUsage / 1024).toFixed(0),
                           unit: 'KB',
                           label: 'Storage used by WALs', 
                           desc: `This metric is generated only when Aurora PostgreSQL is using logical replication or AWS Database Migration Service. By default, Aurora PostgreSQL uses log records, not transaction logs. When transaction logs aren't in use, the value for this metric is -1`},
    replicationSlotDiskUsageKB: {value: parseFloat(cwData.MetricDataResults.find(v => v.Id === 'replicationSlotDiskUsage').Label.replace(/,/g, '') / 1024).toFixed(2),
                           unit: 'KB',
                           label: 'Storage used by replication slots', 
                           desc: `The amount of disk space consumed by replication slot files.`},
    SnapshotStorageUsedKB: {value: parseFloat(snapshotStorageUsed / 1024),
                           unit: 'KB',
                           label: 'Storage used by manual snapshots', 
                           desc: `The amount of disk space consumed by replication slot files.`}
  }
    
  
  
  // Suggest instance
  const getSuggestInstance = async function (GeneralInformation, db_metrics, os_metrics, additional_metrics, static_metrics) {
    return new Promise (async (resolve, reject) => {
   //#AG
   
      var res = {}
   
      try {
        const command = new DescribeOrderableDBInstanceOptionsCommand({Engine: GeneralInformation.Engine, EngineVersion: GeneralInformation.EngineVersion});
        var response = await rds.send(command);
      } catch (err) {
        reject(err)
      }
      
      var availableInstanceClasses = response.OrderableDBInstanceOptions.map(i => i.DBInstanceClass)
      
      // Remove from the array availableInstanceClasses value "db.serverless"
      availableInstanceClasses = availableInstanceClasses.filter(i => i !== 'db.serverless')
      
      try {  
        var ec2Instances = await ec2.describeInstanceTypes({InstanceTypes: availableInstanceClasses.map(i => i.substr(3))});
      } catch (err) { reject(err) }
    
      //          0                 1               2        3            4                  5                    6                     7                 8
      //  [Instance class, Current generation?, Memory GB, vCPUs, netowrk max MB/ps, burstable netowrk?, baseline network MB/ps, local storage GB, max_connections]
      var availableInstanceDetails = ec2Instances.InstanceTypes.map(i => {
        var network = calcNetworkPerformanceLimits({DBInstanceClass: 'db.'+i.InstanceType, EC2Details: {NetworkPerformance: i.NetworkInfo.NetworkPerformance}})
        var max_connections = Math.round(evaluateParameter(i.MemoryInfo.SizeInMiB, 'LEAST({DBInstanceClassMemory/9531392},5000)'))
        return [i.InstanceType, i.CurrentGeneration, i.MemoryInfo.SizeInMiB/1024, i.VCpuInfo.DefaultVCpus, network.networkMaxMBps, network.burstable, network.baselineMBps || 0, i.MemoryInfo.SizeInMiB/1024 * 2, max_connections]
      } );
      
      // sort the values inside availableInstanceDetails array by the first column
      availableInstanceDetails.sort(function(a, b) {
        return a[0].localeCompare(b[0]);
      });
      
        
      // CPU, Network, local storage, memory
      const snapshot_vcpus_used =  GeneralInformation.EC2Details.DefaultVCpus * os_metrics.cpuUtilization.metrics.find(m => m.metric === 'os.cpuUtilization.total').max / 100
      const snapshot_nt_used = (networkThroughputBytes + storageNetworkThroughputBytes) / 1024 / 1024
      const snapshot_fsys_used = os_metrics.fileSys.metrics.find(m => m.metric === 'os.fileSys.used').max / 1024 / 1024
      const snapshot_max_backends = db_metrics.User.metrics.find(m => m.metric === 'db.User.numbackends').max
      const snapshot_bc_hr = additional_metrics.bufferCacheHitRatio.value
      const snapshot_mem_swap_value = os_metrics.memory.metrics.find(m => m.metric === 'os.memory.db.swap').max
      const snapshot_mem_swap = snapshot_mem_swap_value === 5e-324 ? 0 : snapshot_mem_swap_value
      const snapshot_memory_total = Math.round(static_metrics.memory[static_metrics.memory.length - 1].Value / 1024 / 1024)
      
      const snapshot_vcpus_used_plus_reserve = snapshot_vcpus_used * (1 + resourceReservePct/100)
      const snapshot_nt_used_plus_reserve = snapshot_nt_used * (1 + resourceReservePct/100)
      const snapshot_fsys_used_plus_reserve = snapshot_fsys_used * (1 + resourceReservePct/100)
      const snapshot_max_backends_plus_reserve = snapshot_max_backends * (1 + resourceReservePct/100)
    
      res['added_resource_reserve_pct'] = resourceReservePct
      res['snapshot_period_stats'] = {
        snapshot_vcpus_used_plus_reserve,
        snapshot_nt_used_plus_reserve,
        snapshot_fsys_used_plus_reserve,
        snapshot_max_backends_plus_reserve,
        snapshot_bc_hr,
        snapshot_mem_swap,
        snapshot_memory_total
      }
      
      const currPrice = await getPrices(GeneralInformation)
      
      var availableInstanceScores = availableInstanceDetails.map(i => {
        if (snapshot_bc_hr < 95 || snapshot_mem_swap > 0) {
          if (snapshot_memory_total > i[2]) return
        }
        if (i[1] === false) return
        if (snapshot_vcpus_used_plus_reserve > i[3]) return
        if (snapshot_fsys_used_plus_reserve > i[7]) return
        if (snapshot_max_backends_plus_reserve > i[8]) return
        if ((snapshot_nt_used_plus_reserve > i[6] && i[5] === true) || (snapshot_nt_used_plus_reserve > i[4] && i[5] !== true)) return
        var x1 = i[3] - snapshot_vcpus_used_plus_reserve
        var x2 = (i[5] === false) ? i[4] - snapshot_nt_used_plus_reserve : i[6] - snapshot_nt_used_plus_reserve
        var x3 = i[7] - snapshot_fsys_used_plus_reserve
        var x4 = i[8] - snapshot_max_backends_plus_reserve
        var score = 1 / (x1 + x2 + x3 + x4)
        i.push(score)
        return i
      })
      
      
      // Remove all undefined values from availableInstanceScores array
      availableInstanceScores = availableInstanceScores.filter(i => i !== undefined)
      
      
      // No large enough instance was found
      if (availableInstanceScores.length === 0) {
         res['recommended_instances_found'] = true
         res['recommended_instances'] = []
         res['note'] = 'No large enough recommended instances found. Consider reducing the workload or splitting it into more clusters.'
         resolve(res)
         return
      }
      
      
      // Sort the values inside availableInstanceScores array by the last number column
      availableInstanceScores.sort(function(a, b) {
        return b[9]- a[9];
      })
      
      
      for (var i = 0; i < availableInstanceScores.length; i++) {
        availableInstanceScores[i][0] = 'db.' + availableInstanceScores[i][0]
        var price = await getPrices({Engine: GeneralInformation.Engine, DBInstanceClass: availableInstanceScores[i][0]})
        var pricePct = (price.onDemandPricePerHour / currPrice.onDemandPricePerHour - 1) * 100
        availableInstanceScores[i].push(parseFloat(pricePct.toFixed(2)))
      }
      
      // Get top 3 candidates
      availableInstanceScores = availableInstanceScores.slice(0, 3)
      
      
      // Check if one of the elements of availableInstanceScores includes current instance class GeneralInformation.DBInstanceClass
      var currentInstanceClass = availableInstanceScores.find(i => i[0] === GeneralInformation.DBInstanceClass)
      if (currentInstanceClass) {
        res['recommended_instances_found'] = false
        res['note'] = 'The current instance class is appropriate for the current workload requirements.'
      } else {
        res['recommended_instances_found'] = true
        res['recommended_instances_desc'] = ['Instance class', 'Current generation', 'Memory GB', 'vCPUs', 'Network Mbps', 'Burstable network', 'Baseline netowrk Mbps', 'Local storage GB', 'Max recommended connections', 'Score', 'Cost diff Pct']
        res['recommended_instances'] = availableInstanceScores
        res['note'] = 'You can consider one of the listed instance types to better suit current workload.'
      }
      
      resolve(res)
    
    })
  }
  
  
  
  // Works only if snapshot period is greater or equal to 24 hours
  if (periodInSeconds >= 300) {
    try {
      var suggestInstance = await getSuggestInstance(generalInformation, DB_Aurora_Metrics, OS_Metrics, AdditionalMetrics, staticMetrics);
    } catch (err) { reject(err) }
  }
  
  
  
  
  //console.log('metric list', correlations)
  //console.log('Output', 'PI_result', OS_MetricList);
  //console.log('Output', 'PI_result length', DB_Aurora_MetricList.length);
  //console.log('Output', 'PI_result', JSON.stringify(DB_Aurora_Metrics, null, 2))
  //console.log('Output', 'PI_result', getMetricData(OS_MetricList, 'os.cpuUtilization.total'));
  //console.log('Output', 'PI_result', getMetricData(OS_MetricList, 'os.diskIO.rdstemp.readKb'));
  
  var returnObject = {}
  
  returnObject['InstanceRocemmendations'] = suggestInstance || undefined
  returnObject['StaticMetrics'] = staticMetrics
  returnObject['AdditionalMetrics'] = AdditionalMetrics
  returnObject['Correlations'] = correlations
  returnObject['OSMetrics'] = OS_Metrics
  returnObject['DBAuroraMetrics'] = DB_Aurora_Metrics
  
  resolve(returnObject);
    
  }); // Promise
}




const getGeneralInformation = async function (params) {
  return new Promise(async (resolve, reject) => {

rds.describeDBInstances(params, async function(err, data) {
  if (err) { // an error occurred
    
    console.log(`Cannot find the instance ${params.DBInstanceIdentifier}`); 
    console.log(err, err.stack);
    reject(err)
  
  } else {
  
    var DBInstanceDetails = data.DBInstances[0];
    //console.log(JSON.stringify(DBInstanceDetails, null, 2))
    var { DBInstanceIdentifier,
          DBInstanceArn,
          DBInstanceClass,
          Engine,
          DbiResourceId,
          DBInstanceArn,
          DBInstanceStatus,
          Endpoint,
          InstanceCreateTime,
          BackupRetentionPeriod,
          DBParameterGroups,
          AvailabilityZone,
          MultiAZ,
          EngineVersion,
          AutoMinorVersionUpgrade,
          StorageType,
          DBClusterIdentifier,
          PerformanceInsightsEnabled,
          PerformanceInsightsRetentionPeriod,
          EnabledCloudwatchLogsExports,
          DeletionProtection
    } = DBInstanceDetails;
    
    
          
    //console.log('Output', JSON.stringify(data.DBInstances, null, 2));
    if (DBInstanceClass === 'db.serverless') {
       try {
         var {minACUs, maxACUs}  = await getServerlessMaxACU(DbiResourceId)
       } catch (err) { reject(err) }
    } else {
        try {
          var EC2Instance = await getEC2Details(DBInstanceClass);
        } catch (err) { reject(err) }
        var EC2InstanceDetails = EC2Instance.InstanceTypes[0];
        //console.log('Output', 'EC2 details', JSON.stringify(EC2Instance, null, 2));
    
        var { CurrentGeneration,
              ProcessorInfo,
              VCpuInfo,
              MemoryInfo,
              NetworkInfo
        } = EC2InstanceDetails;
    }

    
    var GeneralInformation = {
          DBInstanceIdentifier,
          DBInstanceArn,
          DBInstanceClass,
          minACUs,
          maxACUs,
          Engine,
          DbiResourceId,
          DBInstanceArn,
          DBInstanceStatus,
          Endpoint,
          InstanceCreateTime,
          BackupRetentionPeriod,
          DBParameterGroups,
          AvailabilityZone,
          MultiAZ,
          EngineVersion,
          AutoMinorVersionUpgrade,
          StorageType,
          DBClusterIdentifier,
          PerformanceInsightsEnabled,
          PerformanceInsightsRetentionPeriod,
          EnabledCloudwatchLogsExports,
          DeletionProtection,
          EC2Details: DBInstanceClass === 'db.serverless' ? 'Serverless' : {
              CurrentGeneration,
              CPUClockSpeedInGhz: ProcessorInfo.SustainedClockSpeedInGhz,
              DefaultVCpus: VCpuInfo.DefaultVCpus,
              DefaultCores: VCpuInfo.DefaultCores,
              MemorySizeInMiB: MemoryInfo.SizeInMiB,
              NetworkPerformance: NetworkInfo.NetworkPerformance
            }
          };
      
      
      resolve(GeneralInformation);
      
     }
 
    })
  
  }) // Promise
}




const getWaitEvents = async function (GeneralInformation) {
  return new Promise(async (resolve, reject) => {

    try {
    var PIdescribeDimensionKeys = await pi.describeDimensionKeys({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      Metric: "db.load.avg",
      PeriodInSeconds: 60,
      GroupBy: {
        Group: "db.wait_event"
      }
    });
    } catch (error) {
         console.log(error);
         reject(error)
    }
    
    var PIgetResourceMetadata = await pi.getResourceMetadata({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId
    });
    
    var PITOPWaitEventsRaw = await pi.getResourceMetrics({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: 60,
      MetricQueries: [
        {
          Metric: "db.load.avg",
          GroupBy: { "Group": "db.wait_event" }
        }
      ]
    });
    

    var PITOPdbload = await pi.getResourceMetrics({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: 60,
      MetricQueries: [
        {
          Metric: "db.load.avg"
        }
      ]
    });
    
    
    
    //console.log('Output', 'PITOPdbload', JSON.stringify(PITOPdbload, null, 2));
    //console.log('Output', 'PIosCPU', JSON.stringify(PIosCPU, null, 2));
    //console.log('Output', 'realisticACUs', JSON.stringify(realisticACUs, null, 2));
    //console.log('Output', 'PIdescribeDimensionKeys', JSON.stringify(PIdescribeDimensionKeys, null, 2));
    //console.log('Output', 'PIgetResourceMetadata', JSON.stringify(PIgetResourceMetadata, null, 2));
    //console.log('Output', 'PIlistAvailableResourceMetrics', JSON.stringify(PIlistAvailableResourceMetrics, null, 2));
    //console.log('Output', 'Top waits raw', JSON.stringify(PITOPWaitEventsRaw, null, 2));
    
    var returnObject = {}
    
    returnObject['AlignedStartTime'] = PITOPWaitEventsRaw.AlignedStartTime;
    returnObject['AlignedEndTime'] = PITOPWaitEventsRaw.AlignedEndTime;
    var WallClockTimeSec = (PITOPWaitEventsRaw.AlignedEndTime-PITOPWaitEventsRaw.AlignedStartTime) / 1000;
    returnObject['WallClockTimeSec'] = WallClockTimeSec;
    
    var AAS, AASSum, DBTimeSec, TopEvents = [];
    
    PITOPWaitEventsRaw.MetricList.forEach((Metric, i) => {
      if (Metric.Key.Metric === "db.load.avg" && Metric.Key.Dimensions === undefined) {
          AASSum = Metric.DataPoints.reduce((a, b) => a + b.Value, 0);
          AAS = AASSum / Metric.DataPoints.length;
          DBTimeSec = AASSum * 60;
      }
    });

    AAS = AAS.toFixed(2);
    DBTimeSec = Math.round(DBTimeSec);
    
    PITOPWaitEventsRaw.MetricList.forEach((Metric, i) => {
      if (Metric.Key.Dimensions) {
          var SUMDataPoints = Metric.DataPoints.reduce((a, b) => a + b.Value, 0);
          var MetricTimeSec = SUMDataPoints * 60;
          MetricTimeSec = Math.round(MetricTimeSec);
          var PctDBTime = MetricTimeSec * 100 / DBTimeSec;
          TopEvents.push({
                          event_name: Metric.Key.Dimensions["db.wait_event.name"],
                          event_type: Metric.Key.Dimensions["db.wait_event.type"],
                          metric_time_sec: MetricTimeSec,
                          pct_db_time: PctDBTime.toFixed(2)
                        });
      }
    });
    
    returnObject['AverageActiveSessions'] = parseFloat(AAS)
    returnObject['DBTimeSeconds'] = DBTimeSec
    returnObject['TopEvents'] = TopEvents

    resolve(returnObject)

  })
}




const getSQLs = async function (GeneralInformation) {
  return new Promise(async (resolve, reject) => {


var dbLoadAvgRaw = await pi.getResourceMetrics({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: 60,
      MetricQueries: [
        {
          Metric: "db.load.avg"
        }
      ]
    });


var AAS, AASSum;

dbLoadAvgRaw.MetricList.forEach((Metric, i) => {
      if (Metric.Key.Metric === "db.load.avg" && Metric.Key.Dimensions === undefined) {
          AASSum = Metric.DataPoints.reduce((a, b) => a + b.Value, 0);
          AAS = AASSum / Metric.DataPoints.length;
      }
    });


try {
    var PIDescDimKeysRaw = await pi.describeDimensionKeys({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: 60,
      Metric: 'db.load.avg',
      GroupBy: { Group: 'db.sql_tokenized', Limit: 25 },
      AdditionalMetrics: ['db.sql_tokenized.stats.calls_per_sec.avg',
                          'db.sql_tokenized.stats.rows_per_sec.avg',
                          'db.sql_tokenized.stats.total_time_per_sec.avg',
                          'db.sql_tokenized.stats.shared_blks_hit_per_sec.avg',
                          'db.sql_tokenized.stats.shared_blks_read_per_sec.avg',
                          'db.sql_tokenized.stats.shared_blks_dirtied_per_sec.avg',
                          'db.sql_tokenized.stats.shared_blks_written_per_sec.avg',
                          'db.sql_tokenized.stats.local_blks_hit_per_sec.avg',
                          'db.sql_tokenized.stats.local_blks_read_per_sec.avg',
                          'db.sql_tokenized.stats.local_blks_dirtied_per_sec.avg',
                          'db.sql_tokenized.stats.local_blks_written_per_sec.avg',
                          'db.sql_tokenized.stats.temp_blks_written_per_sec.avg',
                          'db.sql_tokenized.stats.temp_blks_read_per_sec.avg',
                          'db.sql_tokenized.stats.blk_read_time_per_sec.avg',
                          'db.sql_tokenized.stats.blk_write_time_per_sec.avg',
                          'db.sql_tokenized.stats.rows_per_call.avg',
                          'db.sql_tokenized.stats.avg_latency_per_call.avg',
                          'db.sql_tokenized.stats.shared_blks_hit_per_call.avg',
                          'db.sql_tokenized.stats.shared_blks_read_per_call.avg',
                          'db.sql_tokenized.stats.shared_blks_written_per_call.avg',
                          'db.sql_tokenized.stats.shared_blks_dirtied_per_call.avg',
                          'db.sql_tokenized.stats.local_blks_hit_per_call.avg',
                          'db.sql_tokenized.stats.local_blks_read_per_call.avg',
                          'db.sql_tokenized.stats.local_blks_dirtied_per_call.avg',
                          'db.sql_tokenized.stats.local_blks_written_per_call.avg',
                          'db.sql_tokenized.stats.temp_blks_written_per_call.avg',
                          'db.sql_tokenized.stats.temp_blks_read_per_call.avg',
                          'db.sql_tokenized.stats.blk_read_time_per_call.avg',
                          'db.sql_tokenized.stats.blk_write_time_per_call.avg']
    });
  
    
    } catch (error) {
         console.log(error);
         reject(error);
    }
    //console.log('Output', 'PIDescDimKeysRaw', JSON.stringify(PIDescDimKeysRaw_byDB, null, 2));
  
  var SQLs = PIDescDimKeysRaw.Keys.map(Key => {
    return { 
             sql_db_id: Key.Dimensions["db.sql_tokenized.db_id"],
             sql_id: Key.Dimensions["db.sql_tokenized.id"],
             sql_statement: Key.Dimensions["db.sql_tokenized.statement"],
             dbload: Key.Total.toFixed(2),
             pct_aas: (Key.Total * 100 / AAS).toFixed(2),
             AdditionalMetrics: Key.AdditionalMetrics,
           } 
  });





try {
    var sqlids = await pi.describeDimensionKeys({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: 60,
      Metric: 'db.load.avg',
      GroupBy: { Group: 'db.sql', Limit: 25 }
    });
  
    
    } catch (error) {
         console.log(error);
         reject(error);
    }
    //console.log('Output', 'sqlids', JSON.stringify(sqlids, null, 2));

  var sqlTextFullPromises = sqlids.Keys.map(async Key => {
    var SQLTextsFullRaw = await pi.getDimensionKeyDetails({
       Group: 'db.sql',
       GroupIdentifier: Key.Dimensions["db.sql.id"],
       Identifier: GeneralInformation.DbiResourceId,
       ServiceType: 'RDS',
       RequestedDimensions: [
          'statement',
       ]
    });
  
    var dimension = SQLTextsFullRaw.Dimensions[0]
    
    if (dimension.hasOwnProperty('Dimension')) {
       delete dimension['Dimension'];
    }
  
    return { 
             sql_id: Key.Dimensions["db.sql.tokenized_id"],
             sql_text_full: dimension
           } 
    
  });

  
  var sqlTextFull = []
  
  for await (const val of sqlTextFullPromises){
    sqlTextFull.push(val)
  }

  


try {
    var PIDescDimKeysRaw_byDB = await pi.describeDimensionKeys({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: 60,
      Metric: 'db.load.avg',
      GroupBy: { Group: 'db.sql_tokenized', Limit: 25 },
      PartitionBy: { 
        Dimensions: [ "db.name" ],
        Group: "db",
        Limit: 25
      }
    });
  
    
    } catch (error) {
         console.log(error);
         reject(error);
    }
    //console.log('Output', 'PIDescDimKeysRaw', JSON.stringify(PIDescDimKeysRaw_byDB, null, 2));
  
  
  var Databases = PIDescDimKeysRaw_byDB.PartitionKeys.map(Key => Key.Dimensions["db.name"])
  var LoadByDB = PIDescDimKeysRaw_byDB.Keys.map(Key => {
    var dbloadDatabase = Databases.reduce((Result, Database, Index) => {
      if (Key.Partitions[Index] > 0 ) {
        Result.push({db: Database, pct: Key.Partitions[Index] * 100 / Key.Total})
      }
      return Result
    },[])
    return { 
             sql_id: Key.Dimensions["db.sql_tokenized.id"],
             dbload: dbloadDatabase
           } 
  });
  
  
  
  
  try {
    var PIDescDimKeysRaw_byUser = await pi.describeDimensionKeys({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: 60,
      Metric: 'db.load.avg',
      GroupBy: { Group: 'db.sql_tokenized', Limit: 25 },
      PartitionBy: { 
        Dimensions: [ "db.user.name" ],
        Group: "db.user",
        Limit: 25
      }
    });
  
    
    } catch (error) {
         console.log(error);
         reject(error);
    }
    //console.log('Output', 'PIDescDimKeysRaw', JSON.stringify(PIDescDimKeysRaw_byUser, null, 2));

  var Users = PIDescDimKeysRaw_byUser.PartitionKeys.map(Key => Key.Dimensions["db.user.name"])
  var LoadByUser = PIDescDimKeysRaw_byUser.Keys.map(Key => {
    var dbloadUser = Users.reduce((Result, User, Index) => {
      if (Key.Partitions[Index] > 0 ) {
        Result.push({user: User, pct: Key.Partitions[Index] * 100 / Key.Total})
      }
      return Result
    },[])
    return { 
             sql_id: Key.Dimensions["db.sql_tokenized.id"],
             dbload: dbloadUser
           } 
  });
  
  
  try {
    var PIDescDimKeysRaw_byWaits = await pi.describeDimensionKeys({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: 60,
      Metric: 'db.load.avg',
      GroupBy: { Group: 'db.sql_tokenized', Limit: 25 },
      PartitionBy: { 
        Dimensions: [ "db.wait_event.name"],
        Group: "db.wait_event",
        Limit: 25
      }
    });
  
    
    } catch (error) {
         console.log(error);
         reject(error);
    }
    //console.log('Output', 'PIDescDimKeysRaw', JSON.stringify(PIDescDimKeysRaw_byWaits, null, 2));

  var WaitEvents = PIDescDimKeysRaw_byWaits.PartitionKeys.map(Key => Key.Dimensions["db.wait_event.name"])
  var SQLWaitEvents = PIDescDimKeysRaw_byWaits.Keys.map(Key => {
    var waits = WaitEvents.reduce((Result, Event, Index) => {
      if (Key.Partitions[Index] > 0 ) {
        Result.push({event: Event, pct: Key.Partitions[Index] * 100 / Key.Total})
      }
      return Result
    },[])
    return { 
             sql_id: Key.Dimensions["db.sql_tokenized.id"],
             waits
           } 
  });
  
  
  
    /*var sum = SQLs.reduce((r, v) => {
      r = r + v.dbload
      return r
    },0)
    
    console.log('SUM', sum)*/
    
    var returnObject = {}

    returnObject['SQLs'] = SQLs
    returnObject['LoadByDatabase'] = LoadByDB
    returnObject['LoadByUser'] = LoadByUser
    returnObject['Waits'] = SQLWaitEvents
    returnObject['SQLTextFull'] = sqlTextFull

    resolve(returnObject);

  })
}




const getDBLogFiles = async function (GeneralInformation) {
  return new Promise(async (resolve, reject) => {

    try {
      
     var rdsCommand = new DescribeDBLogFilesCommand({DBInstanceIdentifier: GeneralInformation.DBInstanceIdentifier})
     var data = await rds.send(rdsCommand)
      
    } catch (error) {
         console.log(error);
         reject(error)
    }

    var logFilesInRange = data.DescribeDBLogFiles
    logFilesInRange.sort((x, y) => x.LastWritten - y.LastWritten)
    
    logFilesInRange = logFilesInRange.filter(file => file.LastWritten >= startTime.getTime())
    logFilesInRange.splice(logFilesInRange.findIndex(file => file.LastWritten >= endTime.getTime()) + 1)
    
    const processLogFile = async function (instance, logfilename) {
       return new Promise(async (resolve, reject) => {
         
          try {
             var rdsCommand = new DownloadDBLogFilePortionCommand({DBInstanceIdentifier: instance, LogFileName: logfilename})
             var logfile = await rds.send(rdsCommand)
            } catch (error) {
                 console.log(error);
                 reject(error)
            }
        
            var startTimeStr = startTime.toISOString().replace('T', ' ').slice(0, -5)
            var endTimeStr = endTime.toISOString().replace('T', ' ').slice(0, -5)
            //console.log(startTimeStr)
            //console.log(endTimeStr)
        
            const lines = logfile.LogFileData.split("\n");
        
            const filteredLines = lines.filter((line) => {
              const timestamp = line.split("UTC::")[0].trim();
              const lineTimestamp = new Date(timestamp).getTime();
              const containsKWords = /CRITICAL|ERROR/i.test(line);
              return lineTimestamp >= startTime && lineTimestamp <= endTime && containsKWords;
            });
        
            var counts = {};
        
            filteredLines.forEach((line) => {
            const trimmedLine = line.trim(); // Remove leading and trailing whitespaces
            const match = trimmedLine.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC)::@:\[\d+\]:(.+)/); // Extract date and message
            if (match) {
               const date = match[1];
               const message = match[2].trim();
               if (!counts[message]) {
                 counts[message] = { logfile: logfilename, firstOccurrenceDate: date, count: 0, message };
               }
               counts[message].count++;
            }
            });
        
            var outputArray = []
            outputArray.push(...Object.values(counts));
            
            resolve(outputArray)
         
       })
    }
    
    var outputArray = []
    var logFilesInRangeFiles = logFilesInRange.map(file => file.LogFileName)
    for (let i = 0; i < logFilesInRangeFiles.length; i += logFilesParallelDegree) {
       const group = logFilesInRangeFiles.slice(i, i + logFilesParallelDegree);
       const promises = group.map(file => processLogFile.bind(null,GeneralInformation.DBInstanceIdentifier, file))
       try {
         var results = await Promise.all(promises.map(func => func()))
       } 
       catch (error) {
         console.log(error)
         reject(error)
       }
       for (let j = 0; j < results.length; j++) {
         if (results[j].length > 0) outputArray.push(...results[j])
       }
    }
    
    
    resolve(outputArray)

  })
}








////// MAIN ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


if (options["create-report"]) {
  
  if (! options.snapshot) {
    console.error('Provide the name of the JSON snapshot file using --snapshot argument.')
    process.exit(1)
  }
  
  fs.readFile(options.snapshot, 'utf8', async (err, data) => {
  if (err) {
    console.error('Error reading snapshot file:', err);
    process.exit(1)
  }
  
  const snapshotObject = JSON.parse(data);
  
  var htmlReportFileName = options.snapshot.replace(/\.json$/, ".html").replace(/^snapshot_/, "report_");
  
  var htmlReport = await generateHTMLReport(snapshotObject)
  
  try {
       await fs.promises.writeFile(htmlReportFileName, htmlReport);
       console.log(`PI report created and saved into ${htmlReportFileName}`);
      } catch (err) {
       console.error(`Error writing file ${htmlReportFileName}:`, err);
  }
  
  process.exit()  
    
  });
  
  
}



if (options["create-compare-report"]) {
  
  if (! options.snapshot) {
    console.error('Provide the name of the JSON snapshot file using --snapshot argument.')
    process.exit(1)
  }
  
  if (! options.snapshot2) {
    console.error('Provide the name of the second JSON snapshot file to compare using --snapshot2 argument.')
    process.exit(1)
  }


  fs.readFile(options.snapshot, 'utf8', async (err, data) => {
  if (err) {
    console.error('Error reading snapshot file:', err);
    process.exit(1)
  }
  
     fs.readFile(options.snapshot2, 'utf8', async (err2, data2) => {
     if (err2) {
       console.error('Error reading snapshot file:', err2);
       process.exit(1)
     }
  
     const snapshotObject = JSON.parse(data);
     const snapshotObject2 = JSON.parse(data2);
     
     var htmlReportFileName = options.snapshot.replace(/\.json$/, ".html").replace(/^snapshot_/, "compare_report_");
     
     var htmlReport = await generateCompareHTMLReport(snapshotObject, snapshotObject2)
     
     try {
          await fs.promises.writeFile(htmlReportFileName, htmlReport);
          console.log(`PI report created and saved into ${htmlReportFileName}`);
         } catch (err) {
          console.error(`Error writing file ${htmlReportFileName}:`, err);
     }
  
     process.exit()
  
     })
    
  });
  
  
}





// Gather general information
getGeneralInformation({DBInstanceIdentifier: InstanceName})
.then(async GeneralInformation => {
      //console.log('Output', 'GeneralInformation 1', JSON.stringify(GeneralInformation, null, 2));

    if (GeneralInformation.PerformanceInsightsEnabled !== true) {
      console.error(`Performance Insights is not enabled for the provided instance ${InstanceName}!`);
      process.exit(1);
    }



    if (options["do-estimation"]) {    
       // Estimate serverless price
       try {
         var result = await estimateServerless(GeneralInformation)
       } 
       catch (error) {
         console.log(error)
         process.exit(1)
       }
       
       console.log(result)
       process.exit()
    }


    
    /*console.log(`Note: Performance Insights can only collect statistics for queries in pg_stat_activity that aren't truncated. 
                 By default, PostgreSQL databases truncate queries longer than 1,024 bytes. To increase the query size, change 
                 the track_activity_query_size parameter in the DB parameter group associated with your DB instance. When you 
                 change this parameter, a DB instance reboot is required.
                 Also blk_read_time and blk_write_time are collected only when additional track_io_timing setting is enabled.`);*/
    

    var promises = [getSQLs.bind(null, GeneralInformation), 
                    getWaitEvents.bind(null, GeneralInformation), 
                    counterMetrics.bind(null, GeneralInformation), 
                    getDBParameters.bind(null, GeneralInformation)]
    
    if (options["include-logfiles"]) promises.push(getDBLogFiles.bind(null, GeneralInformation))
    
    if (options["create-snapshot"]) {
       try {
         var results = await Promise.all(promises.map(func => func()))
       } 
       catch (error) {
         console.log(error)   
       }
       
       
       var pi_snapshot = {
           $META$: {
              startTime: results[1].AlignedStartTime,
              endTime: results[1].AlignedEndTime,
              instanceName: InstanceName,
              commandLineOptions: options
           },
           GeneralInformation: GeneralInformation,
           NonDefParameters: results[3],
           WaitEvents: results[1],
           Metrics: results[2],
           SQLs: results[0]
       }
       
       if (options["include-logfiles"]) pi_snapshot['LogFileAnalysis'] = results[4]
       
       //console.log('Output', 'Metrics', JSON.stringify(pi_snapshot, null, 2));
       
       const snapshotFileName = `snapshot_${InstanceName}_${convertDate(pi_snapshot.$META$.startTime)}_${convertDate(pi_snapshot.$META$.endTime)}.json`
       
       try {
          await fs.promises.writeFile(snapshotFileName, JSON.stringify(pi_snapshot, null, 2));
          console.log(`PI snapshot created and saved into ${snapshotFileName}`);
       } catch (err) {
          console.error(`Error writing file ${snapshotFileName}:`, err);
       }
    
    }
    

})
.catch(error => {
  console.log(error)
})


