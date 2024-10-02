const fs = require('fs');

const { RDS, 
        DescribeOrderableDBInstanceOptionsCommand, 
        DescribeGlobalClustersCommand,
        DescribeDBLogFilesCommand,
        DownloadDBLogFilePortionCommand
     } = require("@aws-sdk/client-rds");
const { PI } = require("@aws-sdk/client-pi");
const { EC2 } = require("@aws-sdk/client-ec2");
const { CloudWatchClient, GetMetricDataCommand } = require("@aws-sdk/client-cloudwatch");

const { getDBParameters,
        getCurrentRegion,
        getPIperiodSeconds,
        calculateAverage,
        calculateMax,
        calculateMin,
        calculateSum,
        correlationIndex,
        calculateArrayMultiply,
        calculateSumArrays,
        calcNetworkPerformanceLimits,
        getAllDBParameters,
        evaluateParameter,
        formatSeconds,
        dbInstanceToEC2,
        ec2InstanceToDB,
        getPrices,
        getWriteThroughput
      } = require('./helpers');


var rds
var pi
var cw
var ec2
var startTime
var endTime
var periodInSeconds
var resourceReservePct
var cwMetrics = []


if (fs.existsSync('./conf.json')) {
    var conf = JSON.parse(fs.readFileSync('./conf.json', 'utf8'))
} else {
    console.error('Cant load ./conf.json. Chec kif file exists in the current directory.')
    process.exit(1)
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
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: generalInformation.DBInstanceIdentifier}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "auroraEstimatedSharedMemoryBytes",  Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "AuroraEstimatedSharedMemoryBytes",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: generalInformation.DBInstanceIdentifier}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "storageNetworkThroughput", Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "StorageNetworkThroughput",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: generalInformation.DBInstanceIdentifier}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "writeThroughput", Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "WriteThroughput",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: generalInformation.DBInstanceIdentifier}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "engineUptime", Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "EngineUptime",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: generalInformation.DBInstanceIdentifier}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "replicationSlotDiskUsage", Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "ReplicationSlotDiskUsage",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: generalInformation.DBInstanceIdentifier}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "snapshotStorageUsed", Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "SnapshotStorageUsed",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: generalInformation.DBInstanceIdentifier}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "transactionLogsDiskUsage", Label: "${MAX}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "TransactionLogsDiskUsage",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: generalInformation.DBInstanceIdentifier}]},
                                                    Period: pseconds,
                                                    Stat: "Maximum"}},
        {Id: "dbLoad", Label: "${AVG}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "DBLoad",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: generalInformation.DBInstanceIdentifier}]},
                                                    Period: pseconds,
                                                    Stat: "Average"}},
        {Id: "bufferCacheHitRatio", Label: "${AVG}",  MetricStat: { Metric: { Namespace: "AWS/RDS", MetricName: "BufferCacheHitRatio",
                                                    Dimensions: [{Name: "DBInstanceIdentifier", Value: generalInformation.DBInstanceIdentifier}]},
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
  
   
   //console.log('CW data', pseconds, cwMetrics.MetricDataResults.find(v => v.Id === 'auroraEstimatedSharedMemoryBytes').Values)
   
   resolve(cwMetrics)  

  })
}










const counterMetrics = async function (generalInformation, options) {
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
  
  
  
  
  
  const calc2SDValue = function (numbers) {
    // calculate mean
    const n = numbers.length;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += numbers[i]; 
    }
    const mean = sum / n;

    // calculate standard deviation
    let stddevSum = 0;
    for (let i = 0; i < n ; i++){
     stddevSum += Math.pow(numbers[i] - mean, 2);
    }
    
    const stddev = Math.sqrt(stddevSum/n);
    return mean + (stddev * 2)

  }
  
  
  const get2SDValue = function (dataSet, metric) {
    var dataPointsArr = dataSet.filter(object => object.Key.Metric.startsWith(metric+'.'))

    const getValues = function (arr) {
      return arr.map(dataPoint => dataPoint.Value)
    }
    if (dataPointsArr.length === 3) {
        return calc2SDValue(getValues(dataPointsArr.find(object => object.Key.Metric === `${metric}.max`).DataPoints))
        
    } else {
        return -1
    }
    
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
      
      //console.log('OS Metrics', PI_result)
      
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
      if (cIdx >= conf.metricsCorrelationThreshold) {
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
  correlations['Threshold'] = conf.metricsCorrelationThreshold
  
  
  var cwData = await getCWMetrics(generalInformation)
  // Check if cloudWatch returns data
  if (cwData.MetricDataResults.find(v => v.Id === 'dbLoad').Values.length === 0) {
    console.log('No performance data available from CloudWatch for the selected timeframe. Please choose a timeframe with application load or user activity.')
    process.exit(1)
  }
  
  var auroraEstimatedSharedMemoryBytesMax = calculateMax(cwData.MetricDataResults.find(v => v.Id === 'auroraEstimatedSharedMemoryBytes').Values)
  var auroraEstimatedSharedMemoryBytesAvg = calculateAverage(cwData.MetricDataResults.find(v => v.Id === 'auroraEstimatedSharedMemoryBytes').Values)
  var auroraEstimatedSharedMemoryBytes2sd = calc2SDValue(cwData.MetricDataResults.find(v => v.Id === 'auroraEstimatedSharedMemoryBytes').Values)
  
  // Calculating actual network traffic which consists from the following components:
  //   1. CW.StorageNetworkThroughput // The write traffic going to the Aurora Storage, because of 6 copies of each block, this is 6x bigger than CW.WriteThroughput
  //   If instance is writer then 2a, if reader then 2b
  //   2a. CW.WriteThroughput * <number of read replicas and global clusters> // CW.WriteThroughput is the amount of data actually written to Aurora storage. 
                                                                             // For Aurora it is estimated size of WAL stream instance generates. Because the WAL stream also
                                                                             // sent to all read replicas and to each remote master in a global cluster we do this calculation.
  //   2b. CW.WriteThroughput          // CW.WriteThroughput of the writer instance
  //   3. CW.NetworkThroughput        // The amount of network throughput both received from and transmitted to clients
  

  var numberRemoteClusters = 0
  try {
      let command = new DescribeGlobalClustersCommand({});
      let response = await rds.send(command);
      if (response.GlobalClusters.length > 0) {
        let globalCluster = response.GlobalClusters.find((i) => i.GlobalClusterMembers.find((j) => j.DBClusterArn === generalInformation.DBClusterArn))
        numberRemoteClusters = globalCluster.GlobalClusterMembers.length - 1
      }
      //console.log(response)
  } catch (err) {
      console.error(err)
  }
  
  
  if (generalInformation.IsWriter) {
    var writeThroughput = cwData.MetricDataResults.find(v => v.Id === 'writeThroughput').Values
    var writeThroughputAvg = calculateAverage(writeThroughput)
    var walThread = calculateArrayMultiply(writeThroughput, generalInformation.NumberOfOtherInstances + numberRemoteClusters)
    var walThreadAvg = writeThroughputAvg * (generalInformation.NumberOfOtherInstances + numberRemoteClusters)
  } else {
    var writeThroughput = await getWriteThroughput(generalInformation.WriterInstanceIdentifier, cw, {startTime, endTime, periodInSeconds})  
    var walThread = writeThroughput
    var walThreadAvg = calculateAverage(writeThroughput)
  }
  
  
  // Adding each member of walThread, networkThroughput and storageNetworkThroughput togather to one array to calculate max throughput
  var estimatedNetworkThroughput = calculateSumArrays(walThread, cwData.MetricDataResults.find(v => v.Id === 'networkThroughput').Values)
  estimatedNetworkThroughput = calculateSumArrays(estimatedNetworkThroughput, cwData.MetricDataResults.find(v => v.Id === 'storageNetworkThroughput').Values)
  
  var networkThroughputAvg = calculateAverage(cwData.MetricDataResults.find(v => v.Id === 'networkThroughput').Values)
  var storageNetworkThroughputAvg = calculateAverage(cwData.MetricDataResults.find(v => v.Id === 'storageNetworkThroughput').Values)
  
  var estimatedNetworkThroughput2sd = calc2SDValue(estimatedNetworkThroughput)
  var estimatedNetworkThroughputMax = calculateMax(estimatedNetworkThroughput)
  var estimatedNetworkThroughputAvg = storageNetworkThroughputAvg + walThreadAvg + networkThroughputAvg
  
  var networkLimits = calcNetworkPerformanceLimits(generalInformation, estimatedNetworkThroughputMax)
  
  var transactionLogsDiskUsage = parseFloat(cwData.MetricDataResults.find(v => v.Id === 'transactionLogsDiskUsage').Label.replace(/,/g, ''))
  var snapshotStorageUsed = cwData.MetricDataResults.find(v => v.Id === 'snapshotStorageUsed').Values.length === 0 ? 0 : parseFloat(cwData.MetricDataResults.find(v => v.Id === 'snapshotStorageUsed').Label.replace(/,/g, ''))
  
  // Calculated Metrics
  var p = await getAllDBParameters(generalInformation, rds)
  var max_connections = evaluateParameter(generalInformation.EC2Details.MemorySizeInMiB, p.find(par => par.ParameterName === 'max_connections').ParameterValue)
  
  var localStorageThroughput2sdMB = (get2SDValue(OS_MetricList, 'os.diskIO.rdstemp.writeKbPS') + get2SDValue(OS_MetricList, 'os.diskIO.rdstemp.readKbPS')) / 1024
  var localStorageThroughputMaxMB = (OS_Metrics.diskIO.metrics.find(m => m.metric === 'os.diskIO.rdstemp.writeKbPS').max + OS_Metrics.diskIO.metrics.find(m => m.metric === 'os.diskIO.rdstemp.readKbPS').max) / 1024
  var localStorageThroughputAvgMB = (OS_Metrics.diskIO.metrics.find(m => m.metric === 'os.diskIO.rdstemp.writeKbPS').avg + OS_Metrics.diskIO.metrics.find(m => m.metric === 'os.diskIO.rdstemp.readKbPS').avg) / 1024
  
  var AdditionalMetrics = {
    bufferCacheHitRatio: {value: parseFloat(cwData.MetricDataResults.find(v => v.Id === 'bufferCacheHitRatio').Label.replace(/,/g, '')),
                           unit: 'Percent',
                           label: 'Buffer cache hit ratio', 
                           desc: `Buffer cache hit ratio`},
    AuroraEstimatedSharedMemoryUsedAvgMB: {value: (auroraEstimatedSharedMemoryBytesAvg / 1024 / 1024).toFixed(2),
                           unit: 'MB',
                           label: 'Average estimated buffer pool memory used', 
                           desc: `The average value of estimated amount of shared buffer or buffer pool memory which was actively used during the reporting period.`},
    AuroraEstimatedSharedMemoryUsedMaxMB: {value: (auroraEstimatedSharedMemoryBytesMax / 1024 / 1024).toFixed(2),
                           unit: 'MB',
                           label: 'Max estimated buffer pool memory used', 
                           desc: `The maximum value of estimated amount of shared buffer or buffer pool memory which was actively used during the reporting period.`},
    BlocksReadToLogicalReads: {value: (DB_Aurora_Metrics.IO.metrics.find(m => m.metric === 'db.IO.blks_read').sum / DB_Aurora_Metrics.SQL.metrics.find(m => m.metric === 'db.SQL.logical_reads').sum * 100).toFixed(2),
                               unit: 'Percent',
                               label: 'Pct disk reads', 
                               desc: 'The percentage of disk reads that come from logical reads (all reads).'},
    TupReturnedToFetched: {value: (DB_Aurora_Metrics.SQL.metrics.find(m => m.metric === 'db.SQL.tup_returned').sum / DB_Aurora_Metrics.SQL.metrics.find(m => m.metric === 'db.SQL.tup_fetched').sum).toFixed(0),
                           unit: 'Ratio',
                           label: 'Tuples returned to fetched', 
                           desc: 'The number of tuples returned divided by the number of tuples fetched. High values can indicate intensive full and range scans or a high count of dead tuples'},
    estimatedNetworkTrafficMax: {value: (estimatedNetworkThroughputMax/1024/1024).toFixed(2),
                            unit: 'MB/s',
                           label: 'Estimated network throughput max', 
                           desc: `The estimated maximum network throughput of the instance for the snapshot period. It includes user traffic, WAL stream to other instances or from master instance and Aurora storage throughput.`},
    estimatedNetworkTrafficAvg: {value: (estimatedNetworkThroughputAvg/1024/1024).toFixed(2),
                            unit: 'MB/s',
                           label: 'Estimated network throughput average', 
                           desc: `The estimated average network throughput of the instance for the snapshot period. It includes user traffic, WAL stream to other instances or from master instance and Aurora storage throughput.`},                           
    actualTrafficPercentage: {value: networkLimits.trafficToMaxPct.toFixed(2),
                            unit: 'Percent',
                           label: 'Pct network traffic to max limit', 
                           desc: `The percentage of actual estimated max network traffic compared to the maximum available network throughput of the instance. Estimated netwrok traffic for the snapshot period was ${(estimatedNetworkThroughputMax / 1024 / 1024).toFixed(2)} MB/s and the maximum network throughput for this instance class is ${networkLimits.networkMaxMBps} MB/s. ${networkLimits.burstable ? 'Consider that this instace class has a burstable network throughput.' : ''}`},
    actualTrafficToBaselinePct: networkLimits.burstable && networkLimits.trafficToBaselinePct ? {
                                    value: networkLimits.trafficToBaselinePct.toFixed(2),
                                    unit: 'Percent',
                                    label: 'Pct network traffic to estimated baseline', 
                                    desc: `The percentage of actual estimated max network traffic compared to the baseline network throughput. The estimated baseline network throughput for this instance class is ${networkLimits.baselineMBps} MB/s. Consider that this baseline is only estimation and can differ from actual values.}`
                              } : undefined,
    LocalStorageThroughputMax: {value: localStorageThroughputMaxMB.toFixed(2),
                            unit: 'MB/s',
                           label: 'Max local storage throughput', 
                           desc: `The maximum local storage throughput observed during snapshot period. For instances without optimized reads, it is EBS storage.`},
    LocalStorageThroughputAvg: {value: localStorageThroughputAvgMB.toFixed(2),
                            unit: 'MB/s',
                           label: 'Avg local storage throughput', 
                           desc: `The average local storage throughput observed during snapshot period. For instances without optimized reads, it is EBS storage.`},
    throughputToLocalStorageMaxToMaxEBSThroughput: {value: (localStorageThroughputMaxMB * 100 / (generalInformation.EC2Details.EBSMaximumBandwidthInMbps/8)).toFixed(2),
                            unit: 'Percent',
                           label: 'Pct max local storage througput to max EBS throughput', 
                           desc: `The percent of maximum available EBS throughput, which is ${(generalInformation.EC2Details.EBSMaximumBandwidthInMbps/8).toFixed(2)} MBps, utilized by actual maximum throughput during snapshot period.`},
    throughputToLocalStorageMaxToBaselineEBSThroughput: generalInformation.EC2Details.EBSBurstable === "yes" ? {value: (localStorageThroughputMaxMB * 100 / (generalInformation.EC2Details.EBSBaselineBandwidthInMbps/8)).toFixed(2),
                            unit: 'Percent',
                           label: 'Pct max local storage througput to baseline EBS throughput', 
                           desc: `The percent of baseline EBS throughput, which is ${(generalInformation.EC2Details.EBSBaselineBandwidthInMbps/8).toFixed(2)} MBps, utilized by actual maximum throughput during snapshot period.`
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
        var ec2Instances = await ec2.describeInstanceTypes({InstanceTypes: availableInstanceClasses.map(i => dbInstanceToEC2(i.substr(3)))});
      } catch (err) { reject(err) }
      
    
      //          0                 1               2        3            4                  5                    6                     7                 8                9
      //  [Instance class, Current generation?, Memory GB, vCPUs, netowrk max MB/s, burstable netowrk?, baseline network MB/s, local storage GB, max_connections, EBS throughput MB/s]
      var availableInstanceDetails = ec2Instances.InstanceTypes.map(i => {
        let NetworkMaxBandwidthMbps = i.NetworkInfo.NetworkCards.reduce((a, v) => {return a + v.PeakBandwidthInGbps}, 0) * 1000;
        let NetworkBaselineBandwidthMbps = i.NetworkInfo.NetworkCards.reduce((a, v) => {return a + v.BaselineBandwidthInGbps}, 0) * 1000;
        var network = calcNetworkPerformanceLimits({DBInstanceClass: 'db.'+ec2InstanceToDB(i.InstanceType), EC2Details: { NetworkPerformanceMbps: NetworkMaxBandwidthMbps,
                                                                                                         NetworkBaselineMbps: NetworkBaselineBandwidthMbps,
                                                                                                         BurstableNetworkPerformance: (NetworkMaxBandwidthMbps > NetworkBaselineBandwidthMbps) ? "yes" : "no" } 
              })
        let max_connections = Math.round(evaluateParameter(i.MemoryInfo.SizeInMiB, 'LEAST({DBInstanceClassMemory/9531392},5000)'))
        let EBSMaximumBandwidthInMbps = i.EbsInfo.EbsOptimizedInfo.MaximumBandwidthInMbps
        let EBSBaselineBandwidthInMbps = i.EbsInfo.EbsOptimizedInfo.BaselineBandwidthInMbps
        let EBSThroughputMB = EBSMaximumBandwidthInMbps / 8
        if (i.EbsInfo.EbsOptimizedInfo.MaximumBandwidthInMbps > i.EbsInfo.EbsOptimizedInfo.BaselineBandwidthInMbps) {
           EBSThroughputMB = EBSBaselineBandwidthInMbps / 8
        }
        return [i.InstanceType, i.CurrentGeneration, i.MemoryInfo.SizeInMiB/1024, i.VCpuInfo.DefaultVCpus, network.networkMaxMBps, network.burstable, network.baselineMBps || 0, i.MemoryInfo.SizeInMiB/1024 * 2, max_connections, EBSThroughputMB]
      } );
      
      
      // sort the values inside availableInstanceDetails array by the first column
      availableInstanceDetails.sort(function(a, b) {
        return a[0].localeCompare(b[0]);
      });
      
        
      // CPU, Network, local storage, memory
      if (options['use-2sd-values']) {
        var snapshot_nt_used = estimatedNetworkThroughput2sd / 1024 / 1024
        var snapshot_aurora_max_bc_mb = auroraEstimatedSharedMemoryBytes2sd / 1024 / 1024
        var snapshot_local_storage_max_throughput = localStorageThroughput2sdMB
        var snapshot_memory_estimated_gb = ((50003 + (auroraEstimatedSharedMemoryBytes2sd / 1024 / 8)) * 12038) / 1024 / 1024 / 1024
        var snapshot_vcpus_used =  parseFloat(( GeneralInformation.EC2Details.DefaultVCpus * get2SDValue(OS_MetricList, 'os.cpuUtilization.total') / 100 ).toFixed(1))
      } else {
        var snapshot_nt_used = estimatedNetworkThroughputMax / 1024 / 1024
        var snapshot_aurora_max_bc_mb = additional_metrics.AuroraEstimatedSharedMemoryUsedMaxMB.value
        var snapshot_local_storage_max_throughput = localStorageThroughputMaxMB
        // Using this formula to calculate DBInstanceClassMemory based on this formula shared_buffers = {DBInstanceClassMemory/12038} - 50003
        // As shared_buffers will use auroraEstimatedSharedMemoryBytesMax
        var snapshot_memory_estimated_gb = ((50003 + (auroraEstimatedSharedMemoryBytesMax / 1024 / 8)) * 12038) / 1024 / 1024 / 1024
        var snapshot_vcpus_used =  parseFloat(( GeneralInformation.EC2Details.DefaultVCpus * os_metrics.cpuUtilization.metrics.find(m => m.metric === 'os.cpuUtilization.total').max / 100 ).toFixed(1))
      }
      
  
      var snapshot_fsys_used = (os_metrics.fileSys.metrics.find(m => m.metric === 'os.fileSys.used').max || os_metrics.fileSys.metrics.find(m => m.metric === 'os.fileSys.used').avg) / 1024 / 1024
      var snapshot_max_backends = db_metrics.User.metrics.find(m => m.metric === 'db.User.numbackends').max || db_metrics.User.metrics.find(m => m.metric === 'db.User.numbackends').avg
      var snapshot_bc_hr = additional_metrics.bufferCacheHitRatio.value
      var snapshot_mem_swap_value = os_metrics.memory.metrics.find(m => m.metric === 'os.memory.db.swap').max || os_metrics.memory.metrics.find(m => m.metric === 'os.memory.db.swap').avg
      var snapshot_mem_swap = snapshot_mem_swap_value === 5e-324 ? 0 : snapshot_mem_swap_value
      var snapshot_memory_total = Math.round(static_metrics.memory[static_metrics.memory.length - 1].Value / 1024 / 1024)
      
      
      const snapshot_vcpus_used_plus_reserve = snapshot_vcpus_used * (1 + resourceReservePct/100)
      const snapshot_nt_used_plus_reserve = snapshot_nt_used * (1 + resourceReservePct/100)
      const snapshot_fsys_used_plus_reserve = snapshot_fsys_used * (1 + resourceReservePct/100)
      const snapshot_max_backends_plus_reserve = snapshot_max_backends * (1 + resourceReservePct/100)
      const snapshot_local_storage_max_throughput_plus_reserve = snapshot_local_storage_max_throughput * (1 + resourceReservePct/100)
      const snapshot_memory_estimated_gb_plus_reserve = snapshot_memory_estimated_gb * (1 + resourceReservePct/100)
    
      res['resource_reserve_pct'] = resourceReservePct
      res['usage_stats_based_on'] = options['use-2sd-values'] ? 'avg+2sd' : 'max'
      res['snapshot_period_stats'] = {
        snapshot_vcpus_used,
        snapshot_nt_used,
        snapshot_fsys_used,
        snapshot_max_backends,
        snapshot_memory_estimated_gb,
        snapshot_local_storage_max_throughput
      }
      res['instance_capacity'] = {
        vcpus: GeneralInformation.EC2Details.DefaultVCpus,
        network_limit_MBps: GeneralInformation.EC2Details.BurstableNetworkPerformance === "yes" ? GeneralInformation.EC2Details.NetworkBaselineMbps / 8 : GeneralInformation.EC2Details.NetworkPerformanceMbps / 8, 
        local_storage_GB: (staticMetrics.memory.at(-1).Value / 1024 / 1024) * 2,
        max_connections,
        memory_GB: staticMetrics.memory.at(-1).Value / 1024 / 1024,
        local_storage_throughput_limit_MBps: GeneralInformation.EC2Details.EBSBurstable === "yes" ? GeneralInformation.EC2Details.EBSBaselineBandwidthInMbps / 8 : GeneralInformation.EC2Details.EBSMaximumBandwidthInMbps / 8,
      }
      //console.log('snapshot_vcpus_used_plus_reserve', snapshot_vcpus_used_plus_reserve)
      //console.log('snapshot_nt_used_plus_reserve', snapshot_nt_used_plus_reserve)
      //console.log('snapshot_fsys_used_plus_reserve', snapshot_fsys_used_plus_reserve)
      //console.log('snapshot_max_backends_plus_reserve', snapshot_max_backends_plus_reserve)
      //console.log('snapshot_local_storage_max_throughput_plus_reserve', snapshot_local_storage_max_throughput_plus_reserve)
      //console.log('snapshot_memory_estimated_gb_plus_reserve', snapshot_memory_estimated_gb_plus_reserve)
      
      const currPrice = await getPrices(GeneralInformation)
      
      var availableInstanceScores = availableInstanceDetails.map(i => {
        //console.log('i', i, snapshot_memory_total, snapshot_bc_hr, snapshot_mem_swap)
        if (snapshot_bc_hr < 95 || snapshot_mem_swap > (snapshot_memory_total * 1024 * 1024 * 1024) * 0.05) {
          if (snapshot_memory_total > i[2]) return
        }
        if (snapshot_memory_estimated_gb_plus_reserve > i[2]) return
        if (i[1] === false) return
        if (snapshot_local_storage_max_throughput_plus_reserve > i[9]) return
        if (snapshot_vcpus_used_plus_reserve > i[3]) return
        if (snapshot_fsys_used_plus_reserve > i[7]) return
        if (snapshot_max_backends_plus_reserve > i[8]) return
        if ((snapshot_nt_used_plus_reserve > i[6] && i[5] === true) || (snapshot_nt_used_plus_reserve > i[4] && i[5] !== true)) return
        let x1 = i[3] - snapshot_vcpus_used_plus_reserve
        let x2 = (i[5] === false) ? i[4] - snapshot_nt_used_plus_reserve : i[6] - snapshot_nt_used_plus_reserve
        let x3 = i[7] - snapshot_fsys_used_plus_reserve
        let x4 = i[8] - snapshot_max_backends_plus_reserve
        let x5 = i[9] - snapshot_local_storage_max_throughput_plus_reserve
        let score = 1 / (x1 + x2 + x3 + x4 + x5)
        i.push(parseFloat((score * 1000).toFixed(5)))
        //console.log('Eligible')
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
      
      
      // Sort the values inside availableInstanceScores array by the score desc and price diff asc
      availableInstanceScores.sort(function(a, b) {
          if(b[10] === a[10]) {
              return a[11] - b[11]; 
          } else {
              return b[10] - a[10];
          }
      })
      
      
      for (var i = 0; i < availableInstanceScores.length; i++) {
        availableInstanceScores[i][0] = 'db.' + availableInstanceScores[i][0]
        var price = await getPrices({Engine: GeneralInformation.Engine, DBInstanceClass: availableInstanceScores[i][0]})
        var pricePct = (price.onDemandPricePerHour / currPrice.onDemandPricePerHour - 1) * 100
        availableInstanceScores[i].push(parseFloat(pricePct.toFixed(2)))
      }
      
      // Get top 3 candidates
      availableInstanceScores = availableInstanceScores.slice(0, 3)
      
      //console.log('availableInstanceScores', availableInstanceScores)
      
      // Check if the first entry of the availableInstanceScores is current instance class GeneralInformation.DBInstanceClass
      if (GeneralInformation.DBInstanceClass === availableInstanceScores[0][0]) {
        res['recommended_instances_found'] = false
        res['note'] = 'The current instance class is appropriate for the current workload requirements.'
      } else {
        res['recommended_instances_found'] = true
        res['recommended_instances_desc'] = ['Instance class', 
                                             'Current generation', 
                                             'Memory GB', 
                                             'vCPUs', 
                                             'Network MBps', 
                                             'Burstable network', 
                                             'Baseline netowrk MBps', 
                                             'Local storage GB', 
                                             'Max recommended connections',
                                             'EBS throughput MBps',
                                             'Score', 
                                             'Cost diff Pct']
        res['recommended_instances'] = availableInstanceScores
        res['note'] = 'Instance types to suit current workload.'
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
  
  returnObject['WorkloadAnalyses'] = suggestInstance || undefined
  returnObject['StaticMetrics'] = staticMetrics
  returnObject['AdditionalMetrics'] = AdditionalMetrics
  returnObject['Correlations'] = correlations
  returnObject['OSMetrics'] = OS_Metrics
  returnObject['DBAuroraMetrics'] = DB_Aurora_Metrics
  
  resolve(returnObject);
    
  }); // Promise
}












const getWaitsAndSQLs = async function (GeneralInformation) {
  return new Promise(async (resolve, reject) => {

  const pseconds = getPIperiodSeconds(periodInSeconds)


    var returnWaitsObject = {}
    
    var PITOPWaitEventsRaw = await pi.getResourceMetrics({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: pseconds,
      MetricQueries: [
        {
          Metric: "db.load.avg",
          GroupBy: { "Group": "db.wait_event" }
        }
      ]
    });
    
    
    //console.log('DEBUG', 'PI Wait events', JSON.stringify(PITOPWaitEventsRaw, null, 2))
    //console.log('DEBUG', 'Sum of data point values', PITOPWaitEventsRaw.MetricList[0].DataPoints.reduce((sum, obj) => {return sum + obj.Value;}, 0))
    
    if (PITOPWaitEventsRaw.MetricList[0].DataPoints.length === 0 || ! PITOPWaitEventsRaw.MetricList[0].DataPoints.reduce((sum, obj) => {return sum + obj.Value;}, 0) > 0) {
       console.log('No performance data available from Performance Insights for the selected timeframe. Please choose a timeframe with application load or user activity.')
       process.exit(1)
    }
    
    returnWaitsObject['AlignedStartTime'] = PITOPWaitEventsRaw.AlignedStartTime;
    returnWaitsObject['AlignedEndTime'] = PITOPWaitEventsRaw.AlignedEndTime;
    var WallClockTimeSec = (PITOPWaitEventsRaw.AlignedEndTime-PITOPWaitEventsRaw.AlignedStartTime) / 1000;
    returnWaitsObject['WallClockTimeSec'] = WallClockTimeSec;
    
    var AAS, AASSum, DBTimeSec, TopEvents = [];
    
    // Calculate AAS and DBTime including idle Timout events
    /*PITOPWaitEventsRaw.MetricList.forEach((Metric, i) => {
      if (Metric.Key.Metric === "db.load.avg" && Metric.Key.Dimensions === undefined) {
          AASSum = Metric.DataPoints.reduce((a, b) => a + b.Value, 0);
          AAS = AASSum / Metric.DataPoints.length;
          DBTimeSec = AASSum * pseconds;
      }
    });*/

    // Calculate AAS and DBTime excluding idle Timout events
    AASSum = 0
    PITOPWaitEventsRaw.MetricList.forEach((Metric, i) => {
      if (Metric.Key.Dimensions && Metric.Key.Dimensions["db.wait_event.type"] !== 'Timeout') {
          AASSum = AASSum + Metric.DataPoints.reduce((a, b) => a + b.Value, 0);
      }
    });
    AAS = AASSum / PITOPWaitEventsRaw.MetricList[0].DataPoints.length;
    DBTimeSec = AASSum * pseconds;
    
    AAS = AAS.toFixed(2);
    DBTimeSec = Math.round(DBTimeSec);
    
    PITOPWaitEventsRaw.MetricList.forEach((Metric, i) => {
      if (Metric.Key.Dimensions && Metric.Key.Dimensions["db.wait_event.type"] !== 'Timeout') {
          var SUMDataPoints = Metric.DataPoints.reduce((a, b) => a + b.Value, 0);
          var MetricTimeSec = SUMDataPoints * pseconds;
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
    
    returnWaitsObject['AverageActiveSessions'] = parseFloat(AAS)
    returnWaitsObject['DBTimeSeconds'] = DBTimeSec
    returnWaitsObject['TopEvents'] = TopEvents
    

  try {
    var PIDescDimKeysRaw = await pi.describeDimensionKeys({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: pseconds,
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
  
   /*
   var sqlids = await pi.describeDimensionKeys({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: pseconds,
      Metric: 'db.load.avg',
      GroupBy: { Group: 'db.sql', Limit: 25 }
    });
   */
   
    var sqlidsTokenized = await pi.describeDimensionKeys({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: pseconds,
      Metric: 'db.load.avg',
      GroupBy: { 
       Dimensions: [ "db.sql_tokenized.id", "db.sql_tokenized.statement", "db.sql_tokenized.db_id"],
       Group: "db.sql_tokenized",
       Limit: 25
      },
    });
  
  //#ag
  
    //console.log('DEBUG', JSON.stringify(sqlidsTokenized, null, 2))
    
    
    } catch (error) {
         console.log(error);
         reject(error);
    }
  
  
  
  var sqlidsPromises = sqlidsTokenized.Keys.map(async Key => {
  
   let sqlidsRaw = await pi.describeDimensionKeys({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: pseconds,
      Metric: 'db.load.avg',
      GroupBy: { Group: 'db.sql', Limit: 25 },
      Filter: { 
        "db.sql.tokenized_id" : Key.Dimensions["db.sql_tokenized.id"]
      }
      
    });

   //console.log('DEBUG', JSON.stringify(sqlidsRaw, null, 2))
  
    let Res = sqlidsRaw.Keys.map(({ Dimensions, Total }) => ({
          "db.sql.db_id": Dimensions["db.sql.db_id"],
          "db.sql.id": Dimensions["db.sql.id"],
          "db.sql.statement": Dimensions["db.sql.statement"],
          "db.load.avg": Number(Total.toFixed(3))
        }));
  
    return { 
             sql_id_tokinized: Key.Dimensions["db.sql_tokenized.id"],
             sql_text_tokinized: Key.Dimensions["db.sql_tokenized.statement"],
             sql_ids: Res
           } 
    
  });

  
  var sqlTextFull = []
  
  for await (const val of sqlidsPromises){
    sqlTextFull.push(val)
  }

  
  //console.log('Output', 'sqlids', sqlids);

  
  var sqlTexts = []
  for (let i = 0; i < sqlTextFull.length; i++) {
    let sql = sqlTextFull[i].sql_ids
    
    let sqlTextFullPromises = sql.map(async Key => {
      let SQLTextsFullRaw = await pi.getDimensionKeyDetails({
       Group: 'db.sql',
       GroupIdentifier: Key["db.sql.id"],
       Identifier: GeneralInformation.DbiResourceId,
       ServiceType: 'RDS',
       RequestedDimensions: [
          'statement',
       ]
    });
    
    //console.log('DEBUG', JSON.stringify(SQLTextsFullRaw, null, 2))
  
    var dimension = SQLTextsFullRaw.Dimensions[0]
    
    if (dimension.hasOwnProperty('Dimension')) {
       delete dimension['Dimension'];
    }
    
    return { 
             sql_id: Key["db.sql.id"],
             sql_db_id: Key["db.sql.db_id"],
             sql_text_full: dimension.Value
           } 
    
    });
    
    for await (const val of sqlTextFullPromises){
       sqlTexts.push(val)
    }  
  }
  


  sqlTextFull.forEach(mainObj => {
    mainObj.sql_ids.forEach(sqlIdObj => {
      const matchingSubObj = sqlTexts.find(subObj =>
        subObj.sql_db_id === sqlIdObj["db.sql.db_id"] &&
        subObj.sql_id === sqlIdObj["db.sql.id"]
      );
      if (matchingSubObj) {
        delete sqlIdObj['db.sql.statement'];
        sqlIdObj["sql_full_text"] = matchingSubObj.sql_text_full;
      }
    });
  });
  
  
  
try {
    var PIDescDimKeysRaw_byDB = await pi.describeDimensionKeys({
      ServiceType: "RDS",
      Identifier: GeneralInformation.DbiResourceId,
      StartTime: startTime,
      EndTime: endTime,
      PeriodInSeconds: pseconds,
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
  
  // console.log('DEBUG', 'PI Desc Dimension Keys by DB', JSON.stringify(PIDescDimKeysRaw_byDB, null, 2));
  
  
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
      PeriodInSeconds: pseconds,
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
      PeriodInSeconds: pseconds,
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
    
    var returnSQLStatsObject = {}

    returnSQLStatsObject['SQLs'] = SQLs
    returnSQLStatsObject['LoadByDatabase'] = LoadByDB
    returnSQLStatsObject['LoadByUser'] = LoadByUser
    returnSQLStatsObject['Waits'] = SQLWaitEvents
    returnSQLStatsObject['SQLTextFull'] = sqlTextFull

    resolve({waits: returnWaitsObject, sqls: returnSQLStatsObject});

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
              //console.log('logfile line', line)
              const timestamp = line.split("UTC::")[0].trim();
              const lineTimestamp = new Date(timestamp).getTime();
              const keywords = conf.logFilesCheckRegExp.value;
              const pattern = new RegExp(keywords, "i");
              const containsKWords = pattern.test(line);
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
    for (let i = 0; i < logFilesInRangeFiles.length; i += conf.logFilesParallelDegree) {
       const group = logFilesInRangeFiles.slice(i, i + conf.logFilesParallelDegree);
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





const generateSnapshot = async function (generalInformation, options, snapshotRange) {
    var currentRegion = await getCurrentRegion();
    
    resourceReservePct = options['res-reserve-pct'] || 15
    
    rds = new RDS({apiVersion: '2014-10-31', region: currentRegion });
    pi = new  PI({apiVersion: '2018-02-27', region: currentRegion });
    cw = new CloudWatchClient({apiVersion: '2010-08-01', region: currentRegion });
    ec2 = new EC2({apiVersion: '2016-11-15', region: currentRegion });
    
    startTime = snapshotRange.startTime
    endTime = snapshotRange.endTime
    periodInSeconds = snapshotRange.periodInSeconds
    
    var promises = [getWaitsAndSQLs.bind(null, generalInformation),
                    counterMetrics.bind(null, generalInformation, options), 
                    getDBParameters.bind(null, generalInformation, rds)]
    
    if (options["include-logfiles"]) promises.push(getDBLogFiles.bind(null, generalInformation))

    try {
      var results = await Promise.all(promises.map(func => func()))
    } 
    catch (error) {
      console.log(error)   
    }
       
    var end_snapshot = {
           NonDefParameters: results[2],
           WaitEvents: results[0].waits,
           Metrics: results[1],
           SQLs: results[0].sqls
    }
       
    if (options["include-logfiles"]) end_snapshot['LogFileAnalysis'] = results[4]

    return end_snapshot    
    
}




module.exports = { generateSnapshot }