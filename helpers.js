const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { RDS } = require("@aws-sdk/client-rds");
const { PI } = require("@aws-sdk/client-pi");
const { EC2 } = require("@aws-sdk/client-ec2");

const { DescribeDBParametersCommand, DescribeDBClustersCommand } = require("@aws-sdk/client-rds");
const { PricingClient, GetPriceListFileUrlCommand, DescribeServicesCommand, ListPriceListsCommand } = require("@aws-sdk/client-pricing");
const { CloudWatchClient, GetMetricDataCommand } = require("@aws-sdk/client-cloudwatch");

var pricing = new PricingClient({apiVersion: '2017-10-15', region: 'us-east-1'});
var priceListGlobal


const getToken = function () {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '169.254.169.254',
      port: 80,
      path: '/latest/api/token',
      method: 'PUT',
      headers: {
        'X-aws-ec2-metadata-token-ttl-seconds': '21600'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve(data);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
};

// Function to get the region
const getCurrentRegion = async function () {
  return new Promise(async (resolve, reject) => {
   
  // Setting region to the AWS_REGION environment variable. In the function getGeneralInformation we will check for its value, if its empty, then we will get 
  // the region from the instance medatada using IMDSv2
  if (process.env.AWS_REGION) {
       resolve(process.env.AWS_REGION)
       return
  }
 
  try {
    const token = await getToken();
    const options = {
      hostname: '169.254.169.254',
      port: 80,
      path: '/latest/meta-data/placement/region',
      method: 'GET',
      headers: {
        'X-aws-ec2-metadata-token': token
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve(data)
      });
    });

    req.on('error', (error) => {
      reject(error)
    });

    req.end();
  } catch (error) {
    console.error('Error:', error);
  }
 });
};


const getEC2Details = function (a, ec2) {
  var EC2Class = dbInstanceToEC2(a.substr(3));
  var request = ec2.describeInstanceTypes({InstanceTypes: [EC2Class]});
  return request;
};

// Some db instance names to not have equivalent EC2 instance. The instance db.x2g.* do not have x2g.* instances, only x2gd.* instances.
// To workaround this function must convert the names
function dbInstanceToEC2(instance_name) {
  if (instance_name.startsWith("x2g.") || instance_name.includes(".x2g.")) {
     return instance_name.replace("x2g", "x2gd");
  } else {
     return instance_name
  }
}

function ec2InstanceToDB(instance_name) {
  if (instance_name.startsWith("x2gd.") || instance_name.includes(".x2gd.")) {
     return instance_name.replace("x2gd", "x2g");
  } else {
     return instance_name
  }
}




// Generate 5 hour (by default) date ranges
const generateDateRanges = function (startTime, endTime, interval = 18000) {
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


// Get the PI range in seconds based on report range
const getPIperiodSeconds = function (range) {
  if ((range / 1) <= 350) {
    return 1
  } else if ((range / 60) <= 350) {
    return 60
  } else if ((range / 300) <= 350) {
    return 300
  } else if ((range / 3600) <= 350) {
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




const mergeArraysByMax = function (arr1, arr2, arr3) {
  
  var maxArr = [];
  for (let i = 0; i < arr1.length; i++) {
    const maxVal = Math.max(arr1[i], arr2[i], arr3[i]);
    maxArr.push(maxVal);
  }

  return maxArr
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


const calculateSumArrays = function (numbers1, numbers2) {
  if (!Array.isArray(numbers1) || numbers1.length === 0) {
    return undefined;
  }
  const result = [];
  for (let i=0; i<numbers1.length; i++) {
    result.push(numbers1[i] + numbers2[i]);
  }
  return result;
}


const calculateArrayMultiply = function (numbers, v) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return undefined;
  }
  const result = [];
  for (let i=0; i<numbers.length; i++) {
    result.push(numbers[i] * v);
  }
  return result;
}


function calculateStandardDeviation(numbers, mean) {
  const differences = numbers.map(number => number - mean);
  const squaredDifferences = differences.map(difference => difference ** 2);
  const averageSquaredDifference = squaredDifferences.reduce((sum, difference) => sum + difference, 0) / numbers.length;
  const standardDeviation = Math.sqrt(averageSquaredDifference);
  return standardDeviation;
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



const calcNetworkPerformanceLimits = function (generalInformation, maxKnownNetworkTrafficBytes) {
  var res = {}
  var burstable = generalInformation.EC2Details.BurstableNetworkPerformance === 'yes' ? true : false
  var MaxNetworkPerformanceMbps = generalInformation.EC2Details.NetworkPerformanceMbps
  
  var trafficToMaxPct = (maxKnownNetworkTrafficBytes / 1024 / 1024)  /  (MaxNetworkPerformanceMbps / 8) * 100;
  res["networkMaxMBps"] = MaxNetworkPerformanceMbps / 8
  if (burstable) { 
     res["baselineMBps"] = generalInformation.EC2Details.NetworkBaselineMbps / 8
  }

  if (maxKnownNetworkTrafficBytes) {
    res["trafficToMaxPct"] = trafficToMaxPct
    res["diffFromMaxMBps"] = (MaxNetworkPerformanceMbps / 8) - (maxKnownNetworkTrafficBytes / 1024 / 1024)
    
    if (burstable) { 
      var trafficToBaselinePct = (maxKnownNetworkTrafficBytes / 1024 / 1024)  /  (generalInformation.EC2Details.NetworkBaselineMbps / 8) * 100;
      res["trafficToBaselinePct"] = trafficToBaselinePct
      res["diffFromBaselineMBps"] = (generalInformation.EC2Details.NetworkBaselineMbps / 8) - (maxKnownNetworkTrafficBytes / 1024 / 1024)
    }
  }
  
  res["burstable"] = burstable
  return res
  
}


const getWriteThroughput = async function (Identifier, cw, snapshotRange) {
  return new Promise (async (resolve, reject) => {

    const pseconds = getPIperiodSeconds(snapshotRange.periodInSeconds)
    
    const cwCommand = new GetMetricDataCommand({
     StartTime: snapshotRange.startTime,
     EndTime: snapshotRange.endTime,
     MetricDataQueries: [
        {Id: "writeThroughput", Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "WriteThroughput",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: Identifier}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}}
     ]
  });
  
  
  try {
    var MetricValues = await cw.send(cwCommand);
  } catch(err) { 
    reject(err)
  }
  
   
   //console.log('CW data', pseconds, cwMetrics.MetricDataResults.find(v => v.Id === 'auroraEstimatedSharedMemoryBytes').Values)
   
   resolve(MetricValues.MetricDataResults[0].Values)  

  })
}






const getPrices = async function (GeneralInformation) {
   return new Promise (async (resolve, reject) => {
    
    var currentRegion = await getCurrentRegion()
    
    if (fs.existsSync('./conf.json')) {
      var conf = JSON.parse(fs.readFileSync('./conf.json', 'utf8'))
    } else {
      console.error('Cant load ./conf.json. Chec kif file exists in the current directory.')
      process.exit(1)
    }

    
    let pricingDBEngine
    if (GeneralInformation.Engine === 'aurora-postgresql') {
      pricingDBEngine = 'Aurora PostgreSQL'
    } else {
      pricingDBEngine = 'Aurora MySQL'
    }
    
    var PriceList
    var tmpDir = os.tmpdir();
    var tempFilePath = path.join(tmpDir, 'aws-pricelist.json');

    async function fetchPricelist() {
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
               item => item.CurrencyCode === "USD" && item.RegionCode === currentRegion
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
           fs.writeFileSync(tempFilePath, JSON.stringify(priceListGlobal), {flag: 'w'});
           return priceListGlobal
    }

    if (priceListGlobal) {
      
      PriceList = priceListGlobal
      
    } else {
      
      if (fs.existsSync(tempFilePath)) {
        
        var fstats = fs.statSync(tempFilePath);
        var fmodified = new Date(fstats.mtimeMs);
        // Calculate age of file in days 
        var now = new Date();
        var fageInDays = Math.round((now - fmodified) / (1000 * 60 * 60 * 24));
    
        if(fageInDays <= conf.tempPriceFileRetentionDays) {
          // Reading price list from temp
          priceListGlobal = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
          PriceList = priceListGlobal
        } else {
           // File too old, fetch fresh data
           PriceList = await fetchPricelist()
        }
        
      } else {
           // No temp file, fetch fresh
           PriceList = await fetchPricelist()
       }
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
          p.productFamily === "Database Instance" && p.attributes.databaseEngine === pricingDBEngine && p.attributes.instanceType === ec2InstanceToDB(GeneralInformation.DBInstanceClass) && !p.attributes.storage.includes("IO Optimization")
        );
        const provigioned_IOO_SKU = Object.values(PriceList.products).find(p =>
          p.productFamily === "Database Instance" && p.attributes.databaseEngine === pricingDBEngine && p.attributes.instanceType === ec2InstanceToDB(GeneralInformation.DBInstanceClass) && p.attributes.storage.includes("IO Optimization")
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






const getAllDBParameters = async function (GeneralInformation, rds) {
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




const getDBParameters = async function (GeneralInformation, rds) {
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






const getServerlessMaxACU = async function (pi, DbiResourceId, endTime) {
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




const getGeneralInformation = async function (params, options, snapshotRange) {
  return new Promise(async (resolve, reject) => {

  // Getting the current region from instance metadata and setting APIs for the services using this region
  const myRegion = await getCurrentRegion()
  // console.log('AWS Region', myRegion)
  const rds = new RDS({apiVersion: '2014-10-31', region: myRegion});
  const ec2 = new EC2({apiVersion: '2016-11-15', region: myRegion});
  const pi  = new  PI({apiVersion: '2018-02-27', region: myRegion});


rds.describeDBInstances(params, async function(err, data) {
  if (err) { // an error occurred
    
    console.log(`Cannot find the instance ${params.DBInstanceIdentifier}`); 
    console.log(err, err.stack);
    reject(err)
  
  } else {
  
    var DBInstanceDetails = data.DBInstances[0];
    // console.log(JSON.stringify(DBInstanceDetails, null, 2))
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
         var {minACUs, maxACUs}  = await getServerlessMaxACU(pi, DbiResourceId, snapshotRange.endTime)
       } catch (err) { reject(err) }
    } else {
        try {
          var EC2Instance = await getEC2Details(DBInstanceClass, ec2);
        } catch (err) { reject(err) }
        var EC2InstanceDetails = EC2Instance.InstanceTypes[0];
        //console.log('Output', 'EC2 details', JSON.stringify(EC2Instance, null, 2));
    
        var { CurrentGeneration,
              ProcessorInfo,
              VCpuInfo,
              MemoryInfo,
              EbsInfo,
              NetworkInfo
        } = EC2InstanceDetails;
    }

    try {
      let command = new DescribeDBClustersCommand({DBClusterIdentifier: DBClusterIdentifier});
      let response = await rds.send(command);
      let myInstance = response.DBClusters[0].DBClusterMembers.find(i => i.DBInstanceIdentifier === DBInstanceIdentifier)
      var StorageEncrypted = response.DBClusters[0].StorageEncrypted
      var MultiAZ = response.DBClusters[0].MultiAZ
      var IsWriter = myInstance.IsClusterWriter
      if (IsWriter === true) {
         var WriterInstanceIdentifier = DBInstanceIdentifier
      } else {
         var WriterInstanceIdentifier = response.DBClusters[0].DBClusterMembers.find(i => i.IsClusterWriter === true).DBInstanceIdentifier
      }

      var NumberOfOtherInstances = response.DBClusters[0].DBClusterMembers.length - 1
      var DBClusterArn = response.DBClusters[0].DBClusterArn
      //console.log(response.DBClusters[0])
    } catch (err) {
      console.error(err)
    }

    let NetworkMaxBandwidthMbps = NetworkInfo.NetworkCards.reduce((a, v) => {return a + v.PeakBandwidthInGbps}, 0) * 1000;
    let NetworkBaselineBandwidthMbps = NetworkInfo.NetworkCards.reduce((a, v) => {return a + v.BaselineBandwidthInGbps}, 0) * 1000;
    
    var GeneralInformation = {
          DBInstanceIdentifier,
          IsWriter,
          WriterInstanceIdentifier,
          NumberOfOtherInstances,
          StorageEncrypted,
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
          DBClusterArn,
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
              NetworkPerformance: NetworkInfo.NetworkPerformance,
              NetworkPerformanceMbps: NetworkMaxBandwidthMbps,
              NetworkBaselineMbps: NetworkBaselineBandwidthMbps,
              BurstableNetworkPerformance: (NetworkMaxBandwidthMbps > NetworkBaselineBandwidthMbps) ? "yes" : "no",
              EBSOptimized: EbsInfo.EbsOptimizedSupport === "default" ? "yes" : "no",
              EBSMaximumBandwidthInMbps: EbsInfo.EbsOptimizedInfo.MaximumBandwidthInMbps,
              EBSBaselineBandwidthInMbps: EbsInfo.EbsOptimizedInfo.BaselineBandwidthInMbps,
              EBSBurstable: (EbsInfo.EbsOptimizedInfo.MaximumBandwidthInMbps > EbsInfo.EbsOptimizedInfo.BaselineBandwidthInMbps) ? "yes" : "no",
              EBSMaximumIops: EbsInfo.EbsOptimizedInfo.MaximumIops,
              EBSBaselineIops: EbsInfo.EbsOptimizedInfo.BaselineIops
            }
          };
    
      resolve(GeneralInformation);
      
     }
 
    })
  
  }) // Promise
}




// Export all the functions in this file to be used in other modules
module.exports = {
  getGeneralInformation,
  getPrices,
  getDBParameters,
  generateDateRanges,
  getCurrentRegion,
  getPIperiodSeconds,
  convertDate,
  mergeArraysByMax,
  correlationIndex,
  fetchJSON,
  evaluateParameter,
  calculateAverage,
  calculateMax,
  calculateMin,
  calculateSum,
  calculateSumArrays,
  calculateArrayMultiply,
  calculateStandardDeviation,
  getEC2Details,
  dbInstanceToEC2,
  ec2InstanceToDB,
  formatSeconds,
  calcNetworkPerformanceLimits,
  getWriteThroughput,
  getAllDBParameters
}