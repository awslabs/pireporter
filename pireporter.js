/* 
 Copyright 2010-2013 Amazon.com, Inc. or its affiliates. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License").
 You may not use this file except in compliance with the License.
 A copy of the License is located at

 http://aws.amazon.com/apache2.0

 or in the "license" file accompanying this file. This file is distributed
 on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 express or implied. See the License for the specific language governing
 permissions and limitations under the License.
*/

global.version = "2.2.1"


const fs = require('fs');
const path = require('path');
const os = require('os');
const commandLineArgs =  require('command-line-args');
const commandLineUsage =  require('command-line-usage');

const { RDS } = require("@aws-sdk/client-rds");
const { EC2 } = require("@aws-sdk/client-ec2");
const { PI } = require("@aws-sdk/client-pi");
const { generateHTMLReport, generateCompareHTMLReport } = require('./generateHTML');

const { generateDateRanges,
        getGeneralInformation,
        convertDate,
        getCurrentRegion
      } = require('./helpers');


const { estimateServerless } = require('./estimators');


// Defining global variables. The APIs will be set in getGeneralInformation function.
var rds
var ec2
var pi
var cw
var myRegion


const optionDefinitions = [
  { name: 'help', description: 'Display this usage guide.', alias: 'h', type: Boolean},
  { name: 'version', description: 'Display version number.', alias: 'v', type: Boolean},
  { name: 'rds-instance', alias: 'i', type: String, description: 'The RDS instance name to create snapshot.' },
  { name: 'create-snapshot', alias: 's', type: Boolean, description: 'Create snapshot.'},
  { name: 'start-time', type: String, description: 'Snapshot start time. Allowed format is ISO 8601 "YYYY-MM-DDTHH:MM". Seconds will be ignored if provided.'},
  { name: 'end-time', type: String, description: 'Snapshot end time. Same format as for start time.'},
  { name: 'res-reserve-pct', type: Number, description: 'Specify the percentage of additional resources to reserve above the maximum metrics when generating instance type recommendations. Default is 15.'},
  { name: 'use-2sd-values', type: Boolean, description: 'To calculate the required resource for the workload, consider the average value plus 2 standard deviations (SDs). By default the maximum usage is used.'},
  { name: 'comment', alias: 'm', type: String, description: 'Provide a comment to associate with the snapshot. When --ai-analyzes used to generate report, this comment will be provided to LLM as a hint.'},
  { name: 'ai-analyzes', alias: 'a', type: Boolean, description: 'When generating reports, include the analysis from the language model (Amazon Bedrock: Claude by Anthropic), which provides its findings, analysis, and recommendations. This option works with create report and create compare periods report.'},
  { name: 'create-report', alias: 'r', type: Boolean, description: 'Create HTML report for snapshot.'},
  { name: 'create-compare-report', alias: 'c', type: Boolean, description: 'Create compare snapshots HTML report for two snapshots.'},
  { name: 'snapshot', type: String, description: 'Snapshot JSON file name.'},
  { name: 'snapshot2', type: String, description: 'Second snapshot JSON file name to compare.'},
  { name: 'include-logfiles', type: Boolean, description: 'Instance log files will be scanned for errors or critical messages within the provided time range. This operation can be time-consuming and resource-intensive.', defaultOption: false},
  { name: 'do-estimation', type: Boolean, description: 'Estimates the percent of cost difference between a serverless versus a provisioned offerings and IO optimized versus standard storage. WARNING: Please note that the numbers presented in this estimation are indicative and can deviate from real numbers significantly.'},
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
    // optionList: optionDefinitions.filter(o => o.name !== 'do-estimation')
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
    content: 'Project home: {underline https://github.com/awslabs/pireporter}'
  }
]


const options = commandLineArgs(optionDefinitions)

if (options.help) {
   console.log(commandLineUsage(sections))
   process.exit()
}

if (options.version) {
   console.log(global.version)
   process.exit()
}


if (fs.existsSync('./conf.json')) {
    var conf = JSON.parse(fs.readFileSync('./conf.json', 'utf8'))
} else {
    console.error('Cant load ./conf.json. Chec kif file exists in the current directory.')
    process.exit(1)
}


// console.log(options);

var startTime
var endTime

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
    var dateRanges = generateDateRanges(startTime, endTime)
    
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


const snapshotRange = {startTime, endTime, periodInSeconds}


/*const startTime = new Date(2023, 3, 17, 11, 0, 0)
const endTime = new Date(2023, 3, 24, 13, 30, 0)
*/
//const startTime = new Date(2023, 6, 2, 10, 10, 0)
//const endTime = new Date(2023, 6, 3, 20, 49, 0)




const getSnapshotsDirectory = function (snapshotsDirectory) {
  if(!snapshotsDirectory || snapshotsDirectory.trim() === '') {
    snapshotsDirectory = path.join(process.cwd(), 'snapshots'); 
  }

  if (!fs.existsSync(snapshotsDirectory)) {
    fs.mkdirSync(snapshotsDirectory);
  }

  return snapshotsDirectory
}


const getReportsDirectory = function (reportsDirectory) {
  if(!reportsDirectory || reportsDirectory.trim() === '') {
    reportsDirectory = path.join(process.cwd(), 'reports'); 
  }

  if (!fs.existsSync(reportsDirectory)) {
    fs.mkdirSync(reportsDirectory);
  }

  return reportsDirectory
}












/*
const getResourceMetricsPerMinute = async function (DbiResourceId, iMetricQueries) {
    // PI can return maximum 350 data points.
    var PIMetricsIntervalSecs = 60
    var dateIntervals = generateDateRanges(60 * 350)
    
    var ResponseAccumulator = undefined
    for (let i = 0; i < dateIntervals.length; i++) {
    
      try {
        var ResponseLoop = await pi.getResourceMetrics({
              ServiceType: "RDS",
              Identifier: DbiResourceId,
              StartTime: dateIntervals[i].start,
              EndTime: dateIntervals[i].end,
              PeriodInSeconds: PIMetricsIntervalSecs,
              MetricQueries: iMetricQueries
        });
        
      } catch (error) {
          console.log(`Error: ${error}`)
      }   
      
      if (i === 0) { 
        ResponseAccumulator = ResponseLoop
      } else {
        ResponseAccumulator.MetricList.forEach((metric1) => {
           const matchingMetric2 = ResponseLoop.MetricList.find(metric2 => JSON.stringify(metric2.Key) === JSON.stringify(metric1.Key));
           // If found, concatenate the DataPoints arrays
           if (matchingMetric2) {
              metric1.DataPoints = metric1.DataPoints.concat(matchingMetric2.DataPoints);
           }
        });
        
      }
      
      if (i === dateIntervals.length - 1) ResponseAccumulator.AlignedEndTime = ResponseLoop.AlignedEndTime

    }
    
  return ResponseAccumulator
}
*/  

/*
const getWaitEvents = async function (GeneralInformation) {
  return new Promise(async (resolve, reject) => {

    //var PIgetResourceMetadata = await pi.getResourceMetadata({
    //  ServiceType: "RDS",
    //  Identifier: GeneralInformation.DbiResourceId
    //});
    
    var PITOPWaitEventsRaw = await getResourceMetricsPerMinute(GeneralInformation.DbiResourceId, [
        {
          Metric: "db.load.avg",
          GroupBy: { "Group": "db.wait_event" }
        }
      ])
      
   //var PITOPWaitEventsRaw = await pi.getResourceMetrics({
  //    ServiceType: "RDS",
    //  Identifier: GeneralInformation.DbiResourceId,
    //  StartTime: startTime,
    //  EndTime: endTime,
    //  PeriodInSeconds: 300,
    //  MetricQueries: [
    //    {
    //      Metric: "db.load.avg",
    //      GroupBy: { "Group": "db.wait_event" }
    //    }
    //  ]
    //});
    
    
    console.log('StartTime', startTime)
    console.log('EndTime', endTime)
    console.log('Res', PITOPWaitEventsRaw)
    console.log('Res', PITOPWaitEventsRaw.MetricList[0].DataPoints.length)

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
*/









////// MAIN ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


if (options["create-report"]) {
  
  if (! options.snapshot) {
    console.error('Provide the name of the JSON snapshot file using --snapshot argument.')
    process.exit(1)
  }
  
  var snapshotLocation = path.isAbsolute(options.snapshot) ? options.snapshot : path.join(getSnapshotsDirectory(), options.snapshot)
  
  fs.readFile(snapshotLocation, 'utf8', async (err, data) => {
  if (err) {
    console.error('Error reading snapshot file:', err);
    process.exit(1)
  }
  
  const snapshotObject = JSON.parse(data);
  
  var htmlReportFileName = path.basename(snapshotLocation).replace(/\.json$/, ".html").replace(/^snapshot_/, "report_");
  
  var htmlReport = await generateHTMLReport(snapshotObject, options["ai-analyzes"])
  
  try {
       await fs.promises.writeFile(path.join(getReportsDirectory(), htmlReportFileName), htmlReport);
       console.log(`PI report created and saved into ${path.join(getReportsDirectory(), htmlReportFileName)}`);
      } catch (err) {
       console.error(`Error writing file ${path.join(getReportsDirectory(), htmlReportFileName)}:`, err);
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

  var snapshot1Location = path.isAbsolute(options.snapshot) ? options.snapshot : path.join(getSnapshotsDirectory(), options.snapshot)
  var snapshot2Location = path.isAbsolute(options.snapshot2) ? options.snapshot2 : path.join(getSnapshotsDirectory(), options.snapshot2)

  fs.readFile(snapshot1Location, 'utf8', async (err, data) => {
  if (err) {
    console.error('Error reading snapshot file:', err);
    process.exit(1)
  }
  
     fs.readFile(snapshot2Location, 'utf8', async (err2, data2) => {
     if (err2) {
       console.error('Error reading snapshot file:', err2);
       process.exit(1)
     }
  
     const snapshotObject = JSON.parse(data);
     const snapshotObject2 = JSON.parse(data2);
     
     var snapshot1FileName = path.basename(options.snapshot)
     var snapshot2FileName = path.basename(options.snapshot2)
  
     var regex = /snapshot_(.*)_(\d{14}_\d{14})\.json/;
     // extract matching groups
     var match1 = snapshot1FileName.match(regex);
     var instanceName1 = match1[1];
     var dateRange1 = match1[2];
     var match2 = snapshot2FileName.match(regex);
     var instanceName2 = match2[1];
     var dateRange2 = match2[2];

     var instanceNameString = (instanceName1 === instanceName2) ? instanceName1 : `${instanceName1}_${instanceName2}`
     var htmlReportFileName = `compare_report_${instanceNameString}_${dateRange1}-${dateRange2}.html`;
     
     var htmlReport = await generateCompareHTMLReport(snapshotObject, snapshotObject2, options["ai-analyzes"])
     
     try {
          await fs.promises.writeFile(path.join(getReportsDirectory(), htmlReportFileName), htmlReport);
          console.log(`PI report created and saved into ${path.join(getReportsDirectory(), htmlReportFileName)}`);
         } catch (err) {
          console.error(`Error writing file ${path.join(getReportsDirectory(), htmlReportFileName)}:`, err);
     }
  
     process.exit()
  
     })
    
  });
  
  
}





// Gather general information
getGeneralInformation({DBInstanceIdentifier: InstanceName}, options, snapshotRange)
.then(async GeneralInformation => {
      //console.log('Output', 'GeneralInformation 1', JSON.stringify(GeneralInformation, null, 2));

    if (GeneralInformation.PerformanceInsightsEnabled !== true) {
      console.error(`Performance Insights is not enabled for the provided instance ${InstanceName}!`);
      process.exit(1);
    }



    if (options["do-estimation"]) {    
       // Estimate serverless price
       try {
         var result = await estimateServerless(GeneralInformation, options, snapshotRange)
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
  
    
    if (options["create-snapshot"]) {

       if (GeneralInformation.Engine === 'aurora-postgresql') {
         
           var { generateSnapshot } = require('./aurorapg.js') 
         
       } else {
           console.log('Not supported engine')
           process.exit()
       }
   
  
       var snapshotData = await generateSnapshot(GeneralInformation, options, snapshotRange);
   
       var pi_snapshot = {
           $META$: {
              version: global.version,
              region: await getCurrentRegion(),
              startTime: snapshotData.WaitEvents.AlignedStartTime,
              endTime: snapshotData.WaitEvents.AlignedEndTime,
              instanceName: InstanceName,
              commandLineOptions: options
           },
           GeneralInformation: GeneralInformation,
           ...snapshotData
       }
       
       
       //console.log('Output', 'Metrics', JSON.stringify(pi_snapshot, null, 2));
       
       const snapshotFileName = `snapshot_${InstanceName}_${convertDate(pi_snapshot.$META$.startTime)}_${convertDate(pi_snapshot.$META$.endTime)}.json`
       
       try {
          await fs.promises.writeFile(path.join(getSnapshotsDirectory(), snapshotFileName), JSON.stringify(pi_snapshot, null, 2));
          console.log(`PI snapshot created and saved into ${path.join(getSnapshotsDirectory(), snapshotFileName)}`);
       } catch (err) {
          console.error(`Error writing file ${path.join(getSnapshotsDirectory(), snapshotFileName)}:`, err);
       }
    
    }
    

})
.catch(error => {
  console.log(error)
})


