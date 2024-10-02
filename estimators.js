
const { RDS, 
        DescribeOrderableDBInstanceOptionsCommand,
        DescribeDBClustersCommand } = require("@aws-sdk/client-rds");
const { PI } = require("@aws-sdk/client-pi");
const { CloudWatchClient, GetMetricDataCommand } = require("@aws-sdk/client-cloudwatch");

const { getGeneralInformation,
        getCurrentRegion, 
        generateDateRanges,
        calculateAverage,
        calculateStandardDeviation,
        getPrices,
        mergeArraysByMax,
        getPIperiodSeconds
    } = require('./helpers');


// Max ACUs is 128 which 256 GB host with 32 vCPUs, it makes 4 ACUs per vCPU. It will be used for rough estimations.
const ACUmultiplier = 4
const maxACULimit = 128
const ACUcalcIOmetricEffectivePeriod = 7
const otherMemoryAllocationsPCT = 35

var rds
var cw
var pi
var dateRanges
var startTime
var endTime
var periodInSeconds


const roundToNext1000 = function (num) {
  
  if (num < 1000) return 1000
  
  var next1000 = Math.ceil(num / 1000) * 1000;
  
  return next1000;
}


// Rounds the number to next 0.5 if less than 0.5 or to next 1 if number is between 0.5 and 1
const roundACUs = function (num) {
   return Math.ceil(num * 2) / 2;
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


const calculateServerlessCost = function (ACUs, pricePerACUHour) {
      let cost = 0
      for (let i = 0; i < ACUs.length; i++) {
          cost = cost + (parseFloat(pricePerACUHour/60) * ACUs[i])
      }
      
      return cost
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






const estimateServerless = async function (GeneralInformation, options, snapshotRange) {
    
    var currentRegion = await getCurrentRegion();

    cw = new CloudWatchClient({apiVersion: '2010-08-01', region: currentRegion });
    rds = new RDS({apiVersion: '2014-10-31', region: currentRegion });
    pi = new  PI({apiVersion: '2018-02-27', region: currentRegion });
    
    dateRanges = generateDateRanges(snapshotRange.startTime, snapshotRange.endTime)
    startTime = snapshotRange.startTime
    endTime = snapshotRange.endTime
    periodInSeconds = snapshotRange.periodInSeconds
    
    
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
         
      serverlessEstimation['EstimatedPercentRelativeToCostOnDemand'] =  -1 * parseFloat(((instanceCosts.CostOnDemand - serverlessCost) /  instanceCosts.CostOnDemand * 100).toFixed(2))
      serverlessEstimation['EstimatedPercentRelativeToCost1YrAllUpfront'] = -1 * parseFloat(((instanceCosts.Cost1YrAllUpfront - serverlessCost) /  instanceCosts.Cost1YrAllUpfront * 100).toFixed(2))
      serverlessEstimation['EstimatedPercentRelativeToCost1YrPartialUpfront'] = -1 * parseFloat(((instanceCosts.Cost1YrPartialUpfront - serverlessCost) /  instanceCosts.Cost1YrPartialUpfront * 100).toFixed(2))
      serverlessEstimation['EstimatedPercentRelativeToCost1YrNoUpfront'] = -1 * parseFloat(((instanceCosts.Cost1YrNoUpfront - serverlessCost) /  instanceCosts.Cost1YrNoUpfront * 100).toFixed(2))
      serverlessEstimation['EstimatedPercentRelativeToCost3YrPartialUpfront'] = -1 * parseFloat(((instanceCosts.Cost3YrPartialUpfront - serverlessCost) /  instanceCosts.Cost3YrPartialUpfront * 100).toFixed(2))
      serverlessEstimation['EstimatedPercentRelativeToCost3YrAllUpfront'] = -1 * parseFloat(((instanceCosts.Cost3YrAllUpfront - serverlessCost) /  instanceCosts.Cost3YrAllUpfront * 100).toFixed(2))
      serverlessEstimation['desc'] = 'A positive percentage indicates that the serverless price is estimated to be more expensive, while a negative percentage indicates that it is cheaper.',
      serverlessEstimation['SuggestedMinACUs'] = Math.abs(parseFloat(minACUs))
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
        var instanceGeneralInformation = await getGeneralInformation({ DBInstanceIdentifier: availableInstances[i] }, options, snapshotRange)
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
      optimizedIOEstimation = {estimatedPercentIOOptimizedCost: Math.abs(parseFloat(((overallCost - overallCostIOO) / overallCost * 100).toFixed(2))), desc: (overallCost > overallCostIOO) ? 'cheaper' : 'more expensive' }
    
    } else {
    // Storage type is IO optimized, estimate standard
      optimizedIOEstimation = {estimatedPercentStandardCost: Math.abs(parseFloat(((overallCostIOO - overallCost) / overallCostIOO * 100).toFixed(2))), desc: (overallCost > overallCostIOO) ? 'more expensive' : 'cheaper' }
    }
  
    return {serverlessEstimation, optimizedIOEstimation, warning: 'Please note that the numbers presented in this estimation are indicative and may not represent precise or exact figures. They are based on a probable assessment and intended to provide general recommendations. Actual values may vary depending on various factors.'}
    
}




module.exports = { estimateServerless }