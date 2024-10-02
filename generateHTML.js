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

const fs = require('fs');
const path = require('path');
const { LLMGenerator } = require('./genai.js')

// Get cusrrent date in de-DE format
const getCurrDate = function() {
  const date = new Date();

  const options = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };

  return date.toLocaleString('de-DE', options);
}


const info_svg = function(color) {
  return `<svg width="12" height="12" viewBox="0 0 800 800" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.0" viewBox="0 0 468 468"">
    <g transform="matrix(1.74664,0,0,1.74642,-252.1,-60.7251)">
        <g id="Ebene1"><g><g transform="matrix(3.48575,0,0,3.48575,-650.368,-420.328)"><circle cx="293.685" cy="196.267" r="65.165" style="fill:${color};"/>
                </g><g transform="matrix(3.08698,0,0,3.08698,-779.162,-550.57)"><path d="M383.686,244.808L383.686,311.2L393.411,311.2L393.411,318.84L354.496,318.84L354.496,311.2L363.406,311.2L363.406,255.222L354.496,251.655L354.496,244.808L383.686,244.808Z" style="fill:white;"/>
                </g><g transform="matrix(3.22886,0,0,3.22886,-797.323,-547.116)"><circle cx="362.95" cy="211.755" r="11.84" style="fill:white;"/></g></g></g>
    </g>
</svg>`
}

const ne_svg = function() {
  return `<svg width="12" height="12" viewBox="0 0 468 468" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:1.41421;">
    <g transform="translate(0 468) scale(0.0936 -0.0936)" fill="#000000">
    <path d="m3520 4433c-19-21-75-87-124-148-50-60-95-114-102-120-6-5-57-66-114-135s-106-127-110-130c-3-3-39-45-79-94s-93-113-119-142l-47-54h-1362-1363v-375-375l1047-2 1047-3-58-70c-33-38-64-74-70-80-7-5-54-62-106-125s-99-119-105-125c-7-5-57-64-113-131l-100-121-243-6c-133-4-480-7-771-7h-528v-380-380h446 445l-48-61c-26-34-61-76-77-93s-67-78-114-136-93-112-102-122c-26-25-90-104-90-111s59-37 73-37c5 0 23-6 40-14 18-8 64-26 102-41 39-14 84-32 100-39 17-8 62-26 100-40 39-15 86-34 105-43 19-8 51-21 70-28 37-14 109-42 190-75 102-41 155-60 166-60 6 0 40 37 77 83 36 45 79 97 96 115 16 17 69 80 117 140 48 59 95 114 104 122 10 8 50 56 90 105 40 50 89 108 109 130s66 76 103 121l67 81 119 7c153 8 1177 8 1925 0l587-7v386 387l-990 2-989 3 64 84c36 46 71 89 79 95 7 6 47 54 88 106 99 124 169 211 243 298l60 72h723 722v375 375h-395c-217 0-395 2-395 5 0 6 216 265 234 280 6 6 46 53 90 105l78 94-38 17c-22 9-61 26-89 37-102 40-151 60-200 80-27 12-88 35-135 53s-89 36-95 41c-5 4-15 8-23 8-7 0-32 8-55 18-23 11-69 29-102 41-33 13-85 33-115 46-95 41-101 41-140-2z"
    />
  </g>
</svg>`
}

const cD = {
  pctAAS: "Percent of Averge Active Sessions",
  pctCPU: "Percent waits time of the SQL spent on CPU",
  pctIO: "Percent waits time of the SQL spent on IO",
  callsPS: "Average calls per sec",
  latPC: "Average latency per call in ms",
  rowsPC: "Average number of rows retrieved or affected per call",
  rowsPS: "Average number of rows retrieved or affected per second",
  blksHitPS: "Average number of blocks hit in memory per second",
  blksReadPS: "Average number of blocks read from the storage per second",
  blksWritePS: "Average number of blocks affected by write operations per second",
  loadByDB: "Load distribution by the databases for the affected statement",
  loadByUser: "Load distribution by the users executing the affected statement"
}

const columnDescriptionsSQLs = function () {
  var rows = ''
  for (let key in cD) {
    let value = cD[key]
    rows = rows + `\n` + tr(td(`<b>${key}</b>`)+td(value))
  }
  return `
    <table style="width:initial" class="container-table" class="no-border">
    ${tr(`<td colspan="2"><b>Column descriptions for the SQLs tables:</b></td>`)}
    ${rows}
  </table>
  `
}

const infoMessage = function(msg, width = 'initial', valign = 'middle') {
  return `<div style="width:${width}" class="info-msg"><table style="width:initial" class="container-table" class="no-border">
  <tr><td valign="${valign}"><i>${info_svg('#086bc7')}</i></td><td>${msg}</td></tr>
  </table></div>`
}


const div = function(body, cssClass) {
  if (cssClass) {
    return '<div class="' + cssClass + '">' + body + '</div>';
  }
  else {
    return '<div>' + body + '</div>';
  }
}


const td = function(body, cssClass) {
  if (cssClass) {
    return '<td class="' + cssClass + '">' + body + '</td>';
  }
  else {
    return '<td>' + body + '</td>';
  }
}


const td3 = function(body, cssClass) {
  if (cssClass) {
    return '<td rowspan=3 class="' + cssClass + '">' + body + '</td>';
  }
  else {
    return '<td rowspan=3>' + body + '</td>';
  }
}


const tr = function(body, cssClass) {
  if (cssClass) {
    return '<tr class="' + cssClass + '">' + body + '</tr>';
  }
  else {
    return '<tr>' + body + '</tr>';
  }
}


const abbr = function(val, title) {
  if (title === 'Bytes') {
    return `<abbr title="${(val/1024).toFixed(2)} KB or ${(val/1024/1024).toFixed(2)} MB">${val}</abbr>`
  }
  if (title === 'KB') {
    return `<abbr title="${(val/1024).toFixed(2)} MB or ${(val/1024/1024).toFixed(2)} GB">${val}</abbr>`
  }
  if (title === 'MB') {
    return `<abbr title="${(val/1024).toFixed(2)} GB">${val}</abbr>`
  }
  else {
    return `<abbr title="${title}">${val}</abbr>`
  }
}


const tableFromObject = function(obj) {
  var body = ''
  for (const Key in obj) {
    if (obj.hasOwnProperty(Key)) {
      const Value = obj[Key];
      body = `${body}\n${tr(td(Key)+td(Value))}`
    }
  }
  return `<table class="no-shadow">${body}</table>`
}


const tableFromArray = function(arr) {
  var body = ''
  for (const i in arr) {
    body = `${body}${td(arr[i])}`
  }
  return `<table class="no-shadow">${body}</table>`
}

const tableFromArrayOfObjects = function(arr, table = true, header = false) {
  var body = '',
    rows = ''
  var columns = [],
    cols = ''
  var rowarr = [],
    row = '',
    rows = ''
  for (const i in arr) {
    const obj = arr[i]
    for (const Key in obj) {
      if (obj.hasOwnProperty(Key)) {
        if (!columns.includes(Key)) columns.push(Key)
        const Value = obj[Key];
        rowarr[columns.indexOf(Key)] = Value
        //body = `${body}${td(Value)}`
      }
    }

    for (let i = 0; i < rowarr.length; i++) {
      row = `${row}${td((typeof rowarr[i] === 'undefined') ? '-' : rowarr[i])}`
    }
    rows = `${rows}\n${tr(row)}`
    row = ''
    rowarr = []
  }
  for (const i in columns) {
    cols = `${cols}${td(columns[i])}`
  }
  if (table === true) {
    return `<table class="table-border">${tr(cols)}\n${rows}</table>`
  }
  else {
    if (header === true) {
      return `${tr(cols, 'table-header')}\n${rows}`
    }
    else {
      return `${tr(cols)}\n${rows}`
    }
  }
}


const replaceSQLIDWithLink = function (text) {
  const regex = /SQLID:([A-Z0-9]+)/g;
  return text.replace(regex, (match, sqlid) => {
     return `<a href="#S${sqlid}" class="sql-link">${sqlid}</a>`;
  });
}




const htmlScript = `
  document.addEventListener('DOMContentLoaded', function() {
  var links = document.querySelectorAll('.sql-link');
  var tables = document.querySelectorAll('.toggle-table');
  
  tables.forEach(function(table) {
    table.addEventListener('click', function(e) {
      var clickedRow = e.target.closest('tr');
      if (clickedRow && clickedRow.hasAttribute('rid')) {
        var rid = clickedRow.getAttribute('rid');
        var hiddenRow = this.querySelector('tr[srid="' + rid + '"]');
        
        if (hiddenRow) {
          if (hiddenRow.style.display === "none" || hiddenRow.style.display === "") {
            hiddenRow.style.display = "table-row";
          } else {
            hiddenRow.style.display = "none";
          }
        }
      }
    });
  });


  links.forEach(function(link) {
    link.addEventListener('click', function(event) {
      var targetId = this.getAttribute('href');
      var targetElement = document.querySelector(targetId);
      let tds = targetElement.querySelectorAll('td'); // select all td elements that are children of the tr element
      tds.forEach(td => {
        td.classList.add('highlight');
      });
      //targetElement.classList.add('highlight');
      setTimeout(function() {
        tds.forEach(td => {
          td.classList.remove('highlight');
        });
        //targetElement.classList.remove('highlight');
      }, 5000);
    });
  });
});
`



const generateHTMLReport = async function(snapshotObject, genai) {
  return new Promise(async (resolve, reject) => {

    if (genai) {
       var genAI = new LLMGenerator('single_snapshot', {region: snapshotObject.$META$.region, 
                                                          startTime: snapshotObject.$META$.startTime, 
                                                          endTime: snapshotObject.$META$.endTime, 
                                                          engine: snapshotObject.GeneralInformation.Engine, 
                                                          comment: snapshotObject.$META$.commandLineOptions.comment || undefined})
    }

    const snapshotDurationMin = Math.floor((new Date(snapshotObject.$META$.endTime).getTime() - new Date(snapshotObject.$META$.startTime).getTime()) / 1000) / 60

    try {
      var htmlStyle = await fs.promises.readFile(path.join(process.cwd(), 'report.css'), 'utf8')
    }
    catch (err) {
      console.error('Error reading file report.style:', err)
      process.exit(1)
    }

    if (! snapshotObject.$META$.version) {
      snapshotObject.$META$.version = "2.0.3"
    }

    //console.log('Parsed JSON object:', snapshotObject);

    var generalInformationHTML = `
  <table style="width:initial">
   	   <caption>General information</caption>
   	   <tr class="table-header">${td('Name')}${td('Value')}</tr>
  {{body}}
  </table>
  `
    var giBody = ''
    for (const giKey in snapshotObject.GeneralInformation) {
      if (snapshotObject.GeneralInformation.hasOwnProperty(giKey)) {
        const giValue = snapshotObject.GeneralInformation[giKey];
        if (Object.prototype.toString.call(giValue) === '[object Object]') {
          giBody = `${giBody}\n${tr(td(giKey)+td(tableFromObject(giValue)))}`
        }
        else if (Array.isArray(giValue) && Object.prototype.toString.call(giValue[0]) === '[object Object]') {
          giBody = `${giBody}\n${tr(td(giKey)+td(tableFromArrayOfObjects(giValue)))}`
        }
        else if (Array.isArray(giValue)) {
          giBody = `${giBody}\n${tr(td(giKey)+td(tableFromArray(giValue)))}`
        }
        else {
          giBody = `${giBody}\n${tr(td(giKey)+td(giValue))}`
        }
      }
    }

    generalInformationHTML = generalInformationHTML.replace("{{body}}", giBody);


    const printParams = function(params) {
      var rows = '',
        rowdata = ''
      for (let i = 0; i < params.length; i++) {
        rowdata = td(params[i].ParameterName) + td(params[i].ParameterValue) + td(params[i].Description) + td((params[i].ApplyType === 'static') ? 'Reboot' : 'Dynamic')
        rows = `${rows}\n${tr(rowdata)}`
      }
      return rows
    }
    var nonDefParametersHTML = ''
    if (snapshotObject.NonDefParameters.length > 0) {

      nonDefParametersHTML = `<table style="width:initial">
     <caption>Non-default parameters from parameter group: ${snapshotObject.GeneralInformation.DBParameterGroups[0].DBParameterGroupName} [${snapshotObject.GeneralInformation.DBParameterGroups[0].ParameterApplyStatus}]</caption>
     ${tr(td('Parameter')+td('Value')+td('Description')+td('Apply type'), 'table-header')}
     ${printParams(snapshotObject.NonDefParameters)}
     </table>`

    }



    var instanceActivityHTML = `
  <table style="width:initial">
   	   <caption>Instance activity stats</caption>
   	   ${tr(td('Stat')+td('Value'), 'table-header')}
       ${tr(td('Wallclock time (min)')+td(snapshotObject.WaitEvents.WallClockTimeSec/60))}
       ${tr(td('Average Active Sessions')+td(snapshotObject.WaitEvents.AverageActiveSessions))}
       ${tr(td('DBTime (min)')+td((snapshotObject.WaitEvents.DBTimeSeconds/60).toFixed(2)))}
  </table>
  `

    var WaitEvents = [...new Set([...snapshotObject.WaitEvents.TopEvents.map(obj => obj.event_name)])];

    var waitEventsHTML = `
  <table style="width:initial">
   	   <caption>Top wait events</caption>
       ${tableFromArrayOfObjects(snapshotObject.WaitEvents.TopEvents, false, true)}
  </table>
  `

    var staticMetricsHTML = `
  <table style="width:initial" class="no-shadow">
   	   <caption>EC2 stats</caption>
   	   ${tr(td('Stat')+td('Value'), 'table-header')}
       ${tr(td('vCPUs')+td(tableFromArrayOfObjects(snapshotObject.Metrics.StaticMetrics.vCPUs)))}
       ${tr(td('Memory (Kb)')+td(tableFromArrayOfObjects(snapshotObject.Metrics.StaticMetrics.memory)))}
       ${tr(td('Swap (Kb)')+td(tableFromArrayOfObjects(snapshotObject.Metrics.StaticMetrics.swap)))}
  </table>
  `

    const generateAdditionalMetricsHTML = function (snap) {
      var rows = '',  rowdata = ''
      for (const Key in snap) {
         const Metric = snap[Key]
         rowdata = td(abbr(Metric.label, Metric.desc)) +
                   td(Metric.unit) +
                   td(abbr(Metric.value, Metric.unit))
         rows = `${rows}\n<tr>${rowdata}</tr>`
      }
      
      return `
       <table style="width:initial" class="no-shadow">
        	   <caption>Additional metrics</caption>
        	   ${tr(td('Name')+td('Unit')+td('Value'), 'table-header')}
        	   ${rows}
       </table>
       `
    }
    
    
    const generateInstanceRecommendationsHTML = function (snap) {
      var rows = '',  rowdata = ''
      for (const Key in snap) {
         const Metric = snap[Key]
         rowdata = td(abbr(Metric.label, Metric.desc)) +
                   td(Metric.unit) +
                   td(abbr(Metric.value, Metric.unit))
         rows = `${rows}\n<tr>${rowdata}</tr>`
      }
      
      
      var body = ""
      var message = ""
      if (snap.recommended_instances_found) {
        
        var recommendedInstancesHTML = ''
        var snapshotPeriodStatsHTML = `<table style="width:initial" class="no-shadow">
          <tr><th>Stat</th><th>Usage</th><th>Capacity</th><th>Pct used</th></tr>
          ${tr(td('Number vCPUs')+td(snap.snapshot_period_stats.snapshot_vcpus_used)+td(snap.instance_capacity.vcpus)+td((snap.snapshot_period_stats.snapshot_vcpus_used*100/snap.instance_capacity.vcpus).toFixed(2)+'%'))}
          ${tr(td('Network throughput (MBps)')+td(snap.snapshot_period_stats.snapshot_nt_used.toFixed(2))+td(snap.instance_capacity.network_limit_MBps)+td((snap.snapshot_period_stats.snapshot_nt_used*100/snap.instance_capacity.network_limit_MBps).toFixed(2)+'%'))}
          ${tr(td('Host instance memory (GB)')+td(snap.snapshot_period_stats.snapshot_memory_estimated_gb.toFixed(2))+td(snap.instance_capacity.memory_GB.toFixed(2))+td((snap.snapshot_period_stats.snapshot_memory_estimated_gb*100/snap.instance_capacity.memory_GB).toFixed(2)+'%'))}
          ${tr(td('Local storage throughput (MBps)')+td(snap.snapshot_period_stats.snapshot_local_storage_max_throughput.toFixed(2))+td(snap.instance_capacity.local_storage_throughput_limit_MBps.toFixed(2))+td((snap.snapshot_period_stats.snapshot_local_storage_max_throughput*100/snap.instance_capacity.local_storage_throughput_limit_MBps).toFixed(2)+'%'))}
          ${tr(td('Local storage (GB)')+td(snap.snapshot_period_stats.snapshot_fsys_used.toFixed(2))+td(snap.instance_capacity.local_storage_GB.toFixed(2))+td((snap.snapshot_period_stats.snapshot_fsys_used*100/snap.instance_capacity.local_storage_GB).toFixed(2)+'%'))}
          ${tr(td('Number backends')+td(snap.snapshot_period_stats.snapshot_max_backends.toFixed(1))+td(snap.instance_capacity.max_connections.toFixed(1))+td((snap.snapshot_period_stats.snapshot_max_backends*100/snap.instance_capacity.max_connections).toFixed(2)+'%'))}
        </table>`
        
        if (snap.recommended_instances.length === 0) {
          message = `Based on the ${snap.usage_stats_based_on === 'max' ? 'maximum' : 'average + 2 standard deviations'} usage metrics during this snapshot and an additional ${snap.resource_reserve_pct}% reserve above them: ${snap.note}`
        } else {
          message = `Based on the ${snap.usage_stats_based_on === 'max' ? 'maximum' : 'average + 2 standard deviations'} usage metrics during this snapshot and an additional ${snap.resource_reserve_pct}% reserve above them, there are possible instance classes that may be better suited for the workload.`
          
          // 'https://us-east-1.console.aws.amazon.com/compute-optimizer/home?region=eu-central-1#/resources-lists/rds'
          
          
          var rowHTML = ''
          for (var i = 0; i < snap.recommended_instances_desc.length; i++) {
            rowHTML = rowHTML + td(snap.recommended_instances_desc[i])
          }
          var headerHTML = tr(rowHTML, 'table-header')
          rowsHTML = ''
          for (var i = 0; i < snap.recommended_instances.length; i++) {
            var row = snap.recommended_instances[i]
            var rowHTML = ''
            for (var j = 0; j < row.length; j++) {
              rowHTML = rowHTML + td(row[j])
            }
            rowsHTML = rowsHTML + tr(rowHTML)
          }
        
          recommendedInstancesHTML = `
          <div style="padding: 10px"><span>${snap.note}</span></div>
          <table style="width:initial">
             ${headerHTML}
             ${rowsHTML}
          </table>
          <div style="padding: 10px"><span>The Cost Diff Pct shows the cost difference compared to the current instance type. If the number is positive, the cost should be higher; if negative, it should be cheaper.</span></div>
          `
        
        }
        
        body = `
          <div style="padding: 10px"><span>${snap.usage_stats_based_on === 'max' ? 'Maximum' : 'Average + 2 standard deviations'} resources used in snapshot period:</span></div>
          ${snapshotPeriodStatsHTML}
          ${recommendedInstancesHTML}
        `
        
      } else {
        message = `Based on the maximum usage metrics and an additional ${snap.resource_reserve_pct}% reserve above them, the current instance class is appropriate for the current workload requirements.`
      }
      
      return `
       <table style="width:initial" class="container-table">
        	   <caption>Workload analyses
        	   ${infoMessage(`CAUTION: The information in this section is based solely on the data available in this report and only for this snapshot period. The information was created on a best effort basis and requires additional manual confirmation. It is included to make you aware that the resource could be a potential bottleneck for the workload. To get more reliable recommendations, use <a href="https://us-east-1.console.aws.amazon.com/compute-optimizer/home?region=${snapshotObject.$META$.region}#/resources-lists/rds">AWS Compute Optimizer</a>`)}
        	   </caption>
        	   <td>
        	      <div style="padding: 10px"><span>${message}</span></div>
        	      ${body}
        	   </td>
       </table>
       `
    }


    const generateMetricsHTML = function(snap, type) {
      var mainHTML = ''

      for (let Key in snap) {
        var metrics = snap[Key].metrics
        var metricsHTML = ''
        var rows = '',  rowdata = ''
        for (let i = 0; i < metrics.length; i++) {
          rowdata = td(abbr(metrics[i].metric, metrics[i].desc)) +
            td(metrics[i].unit) +
            td(metrics[i].sum ? abbr(metrics[i].sum, metrics[i].unit) : '-') +
            td(metrics[i].avg ? abbr(metrics[i].avg, metrics[i].unit) : '-') +
            td(metrics[i].max ? abbr(metrics[i].max, metrics[i].unit) : '-') +
            td(metrics[i].min ? abbr(metrics[i].min, metrics[i].unit) : '-')

          rows = `${rows}\n<tr>${rowdata}</tr>`

        }
        metricsHTML = `
        <table class="no-shadow">
           <caption>${snap[Key].name}</caption>
      	   ${tr(td('Metric')+td('Unit')+td('Sum')+td('Avg')+td('Max')+td('Min'), 'table-header')}
      	   ${rows}
        </table>
      `

        mainHTML = `${mainHTML}\n${metricsHTML}`
      }

      return `
  <table style="width:initial" class="no-shadow no-border">
   	   <caption>${type === 'DB' ? 'Database' : 'OS'} Metrics</caption>
   	   ${tr(td(mainHTML))}
  </table>
  `
    }


    var correlationsHTML = ''

    var correlationGroupsHTML = ''
    var correlationRowHTML = ''
    var i = 0
    var numberOfGroups = Object.keys(snapshotObject.Metrics.Correlations).length - 1
    if (snapshotObject.Metrics.Correlations) {
      for (let Key in snapshotObject.Metrics.Correlations) {
        if (Key === 'Threshold') continue
        var correllationGroup = snapshotObject.Metrics.Correlations[Key]
        var correllationGroupHTML = ''
        for (let i = 0; i < correllationGroup.length; i++) {
          correllationGroupHTML = `${correllationGroupHTML}\n${tr(td(correllationGroup[i]))}`
        }
        correllationGroupHTML = `<table class="no-shadow">${correllationGroupHTML}</table>`
        correlationRowHTML = `${correlationRowHTML}${correllationGroupHTML}`
        i++
        if (i === Math.floor(numberOfGroups / 2)) {
          correlationGroupsHTML = `${correlationGroupsHTML}<td style="vertical-align: top;">${correlationRowHTML}</td>`
          correlationRowHTML = ''
          i = 0
        }
      }

      correlationGroupsHTML = `${correlationGroupsHTML}<td style="vertical-align: top;">${correlationRowHTML}</td>`

      var correlationsHTML = `
     <table style="width:initial" class="no-shadow no-border">
      	   <caption>Correlated groups of metrics (Correlation over ${snapshotObject.Metrics.Correlations.Threshold * 100} percent)</caption>
      	   ${tr(correlationGroupsHTML)}
     </table>
  `
    }


   var additionalMetricsHTML = generateAdditionalMetricsHTML(snapshotObject.Metrics.AdditionalMetrics)
   var instanceRecommendationsHTML = generateInstanceRecommendationsHTML(snapshotObject.Metrics.WorkloadAnalyses)
   var OSMetricsHTML = generateMetricsHTML(snapshotObject.Metrics.OSMetrics, 'OS')
   var DBMetricsHTML = generateMetricsHTML(snapshotObject.Metrics.DBAuroraMetrics, 'DB')

    var metricsHTML = `
  <table style="width:initial" class="no-border">
   	   <caption>Metrics</caption>
   	   ${tr(td(staticMetricsHTML))}
   	   ${tr(td(additionalMetricsHTML))}
   	   ${tr(td(instanceRecommendationsHTML))}
   	   ${tr(td(OSMetricsHTML))}
   	   ${tr(td(DBMetricsHTML))}
   	   ${tr(td(correlationsHTML))}
  </table>
  `


    // SQLs section begin
    const generateSQLsHTML = function(snap, sortby) {
      var mainHTML = ''

      const getCPUpct = function(sqlid) {
        var sql_waits = snap.Waits.find(sql => sql.sql_id === sqlid);
        var cpu_wait = sql_waits.waits.find(wait => wait.event === 'CPU');
        if (cpu_wait) {
          return cpu_wait.pct.toFixed(2) + '%'
        }
        else {
          return '-'
        }
      }

      const getIOpct = function(sqlid) {
        var sql_waits = snap.Waits.find(sql => sql.sql_id === sqlid);
        var io_wait = sql_waits.waits.filter(wait => wait.event.startsWith("IO:"));
        if (io_wait.length > 0) {
          var sumIO = io_wait.reduce((acc, val) => acc + val.pct, 0)
          return sumIO.toFixed(2) + '%'
        }
        else {
          return '-'
        }
      }

      const loadByDB = function(sqlid) {
        var sqls = snap.LoadByDatabase.find(sql => sql.sql_id === sqlid);
        var rows = '',
          rowdata = ''
        for (let i = 0; i < sqls.dbload.length; i++) {
          rowdata = td(sqls.dbload[i].db + ':') + td(sqls.dbload[i].pct.toFixed(0) + '%')
          rows = `${rows}\n${tr(rowdata)}`
        }
        return `<table class='inline-table'>\n${rows}\n</table>`
      }

      const loadByUser = function(sqlid) {
        var sqls = snap.LoadByUser.find(sql => sql.sql_id === sqlid);
        var rows = '',
          rowdata = ''
        for (let i = 0; i < sqls.dbload.length; i++) {
          rowdata = td(sqls.dbload[i].user + ':') + td(sqls.dbload[i].pct.toFixed(0) + '%')
          rows = `${rows}\n${tr(rowdata)}`
        }
        return `<table class='inline-table'>\n${rows}\n</table>`
      }


      const printMetrics = function(metrics) {
        var rows = '',
          rowdata = ''
        for (let key in metrics) {
          if (metrics.hasOwnProperty(key)) {
            const value = metrics[key]
            rowdata = td(key.substring(23)) + td(value.toFixed(2))
            rows = `${rows}\n${tr(rowdata)}`
          }
        }
        if (rows.length > 0) {
          return `<table class='inline-table'><caption>Additional metrics</caption>\n${rows}\n</table>`
        }
        else {
          return ''
        }
      }

      const printWaits = function(sqlid = 'LOAD') {
        var rows = '',
          rowdata = ''
        var sql_waits = snap.Waits.find(sql => sql.sql_id === sqlid);
        for (let i = 0; i < sql_waits.waits.length; i++) {
          rowdata = td(sql_waits.waits[i].event) + td(sql_waits.waits[i].pct.toFixed(2) + '%')
          rows = `${rows}\n${tr(rowdata)}`
        }
        if (rows.length > 0) {
          return `<table class='inline-table'><caption>Waits</caption>\n${rows}\n</table>`
        }
        else {
          return ''
        }
      }

      var caption = 'load'

      if (sortby === 'LOAD') {
        var sortedSQLs = snap.SQLs.slice().sort((a, b) => parseFloat(b.dbload) - parseFloat(a.dbload))
      }
      else if (sortby === 'IOREAD') {
        caption = 'read IO'
        var sortedSQLs = snap.SQLs.slice().sort((a, b) => {
          var val1 = 0,
            val2 = 0
          if (b.AdditionalMetrics) val1 = parseFloat(b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_read_per_sec.avg"])
          if (a.AdditionalMetrics) val2 = parseFloat(a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_read_per_sec.avg"])
          return val1 - val2
        })
      }
      else if (sortby === 'IOWRITE') {
        caption = 'write IO'
        var sortedSQLs = snap.SQLs.slice().sort((a, b) => {
          var val1 = 0,
            val2 = 0
          if (b.AdditionalMetrics) val1 = parseFloat(b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"])
          if (a.AdditionalMetrics) val2 = parseFloat(a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"])
          return val1 - val2
        })
      }
      else if (sortby === 'IO') {
        caption = '(read + write) IO'
        var sortedSQLs = snap.SQLs.slice().sort((a, b) => {
          var val1 = 0,
            val2 = 0
          if (b.AdditionalMetrics) val1 = parseFloat(b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"]) + parseFloat(b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"])
          if (a.AdditionalMetrics) val2 = parseFloat(a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"]) + parseFloat(a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"])
          return val1 - val2
        })
      }


      var rows = '',
        rowdata = ''
      for (let i = 0; i < sortedSQLs.length; i++) {
        var sqlidHTML = `<a href="#S${sortedSQLs[i].sql_id}" class="sql-link">${sortedSQLs[i].sql_id}</a>`
        rowdata = td(info_svg('grey') + `<div class="popup-window"><table class='inline-table no-border'><tr><td style="vertical-align: top;">${printMetrics(sortedSQLs[i].AdditionalMetrics)}</td><td style="vertical-align: top;">${printWaits(sortedSQLs[i].sql_id)}</td></tr></table></div>`, 'popup-container') +
          td(abbr(sortedSQLs[i].dbload, 'load')) +
          td(abbr(sortedSQLs[i].pct_aas + '%', cD['pctAAS'])) +
          td(abbr(getCPUpct(sortedSQLs[i].sql_id), cD['pctCPU'])) + // pct CPU
          td(abbr(getIOpct(sortedSQLs[i].sql_id), cD['pctIO'])) + // pct IO waits
          td(abbr((sortedSQLs[i].hasOwnProperty('AdditionalMetrics') && sortedSQLs[i].AdditionalMetrics.hasOwnProperty('db.sql_tokenized.stats.calls_per_sec.avg')) ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.calls_per_sec.avg'].toFixed(2) : '-', cD['callsPS'])) +
          td(abbr((sortedSQLs[i].hasOwnProperty('AdditionalMetrics') && sortedSQLs[i].AdditionalMetrics.hasOwnProperty('db.sql_tokenized.stats.avg_latency_per_call.avg')) ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.avg_latency_per_call.avg'].toFixed(2) : '-', cD['latPC'])) +
          td(abbr((sortedSQLs[i].hasOwnProperty('AdditionalMetrics') && sortedSQLs[i].AdditionalMetrics.hasOwnProperty('db.sql_tokenized.stats.rows_per_call.avg')) ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.rows_per_call.avg'].toFixed(2) : '-', cD['rowsPC'])) +
          td(abbr((sortedSQLs[i].hasOwnProperty('AdditionalMetrics') && sortedSQLs[i].AdditionalMetrics.hasOwnProperty('db.sql_tokenized.stats.rows_per_sec.avg')) ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.rows_per_sec.avg'].toFixed(2) : '-', cD['rowsPS'])) +
          td(abbr((sortedSQLs[i].hasOwnProperty('AdditionalMetrics') && sortedSQLs[i].AdditionalMetrics.hasOwnProperty('db.sql_tokenized.stats.shared_blks_hit_per_sec.avg')) ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_hit_per_sec.avg'].toFixed(2) : '-', cD['blksHitPS'])) + 
          td(abbr((sortedSQLs[i].hasOwnProperty('AdditionalMetrics') && sortedSQLs[i].AdditionalMetrics.hasOwnProperty('db.sql_tokenized.stats.shared_blks_read_per_sec.avg')) ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_read_per_sec.avg'].toFixed(2) : '-', cD['blksReadPS'])) +
          td(abbr((sortedSQLs[i].hasOwnProperty('AdditionalMetrics') && sortedSQLs[i].AdditionalMetrics.hasOwnProperty('db.sql_tokenized.stats.shared_blks_written_per_sec.avg')) ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_written_per_sec.avg'].toFixed(2) : '-', cD['blksWritePS'])) +
          td(abbr(loadByDB(sortedSQLs[i].sql_id), cD['loadByDB'])) + // load by DB
          td(abbr(loadByUser(sortedSQLs[i].sql_id), cD['loadByUser'])) + // load by user
          td(sqlidHTML) +
          td(sortedSQLs[i].sql_statement.substring(0, 60))

        rows = `${rows}\n${tr(rowdata)}`

      }
      mainHTML = `
     <table style="width:initial">
      	   <caption>SQLs ordered by ${caption}</caption>
      	   ${tr(td('i')+td('load')+td('pctAAS')+td('pctCPU')+td('pctIO')+td('callsPS')+td('latPC')+td('rowsPC')+td('rowsPS')+td('blksHitPS')+td('blksReadPS')+td('blksWritePS')+td('loadByDB')+td('loadByUser')+td('sqlid')+td('text'), 'table-header')}
      	   ${rows}
     </table>
  `

      return mainHTML
    }


    const generateSQLTextsHTML = function(snap) {
      var mainHTML = ''

      var sqlTexts = snap.SQLTextFull

      const getSQLDBid = function(sqlid) {
        var sql = snap.SQLs.find(sql => sql.sql_id === sqlid)
        if (sql) {
          return sql.sql_db_id
        }
        else {
          return '-'
        }
      }

      var rows = '', rowdata = ''
      
      
    
    if (parseInt(snapshotObject.$META$.version.split(".").join("")) < 204 ) {
      for (let i = 0; i < sqlTexts.length; i++) {
        rowdata = td(sqlTexts[i].sql_id) +
          td(getSQLDBid(sqlTexts[i].sql_id)) +
          td(sqlTexts[i].sql_text_full.Value)

        rows = `${rows}\n<tr id="S${sqlTexts[i].sql_id}">${rowdata}</tr>`
       }
        
      } else {
      
      
      for (let i = 0; i < sqlTexts.length; i++) {
        var subrows = ''
        for (let j = 0; j < sqlTexts[i].sql_ids.length; j++) {
           subrows = `${subrows}
             <tr>${td(sqlTexts[i].sql_ids[j]["db.sql.id"]) + td(sqlTexts[i].sql_ids[j]["db.sql.db_id"]) + td(sqlTexts[i].sql_ids[j].sql_full_text) + td(sqlTexts[i].sql_ids[j]["db.load.avg"])}</tr>
           `
        }
        
        rowdata = `<tr rid="row${i}" id="S${sqlTexts[i].sql_id_tokinized}" class="${subrows.length > 5 ? "clickable" : ""}">${td("<b>"+sqlTexts[i].sql_id_tokinized+"</b>") + td("<b>"+getSQLDBid(sqlTexts[i].sql_id_tokinized)+"</b>") + td("<b>"+sqlTexts[i].sql_text_tokinized+"</b>")}</tr>`

        if (subrows.length > 5) {
          rowdata = rowdata + `
          <tr srid="row${i}" class="hideable"><td colspan="3">
           <table style="margin-left:15px" class="no-shadow">
           <tr><td>sqlid</td><td>db sqlid</td><td>full text</td><td>db load</td></tr>
           ${subrows}</table>
          </td></tr>
          `
        }
          
        rows = `${rows}\n${rowdata}`
      }
 

      }
      mainHTML = `
     <table style="width:initial" class="toggle-table">
      	   <caption>SQLs full text ${infoMessage(`By default, PostgreSQL databases truncate queries longer than 1,024 bytes. To increase the query size, change 
                 the track_activity_query_size parameter in the DB parameter group associated with your DB instance. When you 
                 change this parameter, a DB instance reboot is required.`)}</caption>
      	   ${tr(td('sqlid')+td('DB sqlid')+td('Text'), 'table-header')}
      	   ${rows}
     </table>
  `

      return mainHTML

    }

    
    var SQLsSortedByLoadHTML = generateSQLsHTML(snapshotObject.SQLs, 'LOAD')
    var SQLTextsHTML = generateSQLTextsHTML(snapshotObject.SQLs)

    var SQLsHTML = `<div>
    ${SQLsSortedByLoadHTML}
    ${generateSQLsHTML(snapshotObject.SQLs, 'IOREAD')}
    ${generateSQLsHTML(snapshotObject.SQLs, 'IOWRITE')}
    ${generateSQLsHTML(snapshotObject.SQLs, 'IO')}
    ${generateSQLTextsHTML(snapshotObject.SQLs)}
    </div>
    `

    // SQLs section end


    var nonDefParameters = nonDefParametersHTML.length === 0 ? 'There is no non-default parameters. Skip this section of the report.' : nonDefParametersHTML
    
    if (genai) {
       var resp = await genAI.generateParallel([{section: 'single_general_info', data: generalInformationHTML},
                                                {section: 'single_nondef_params', data: nonDefParameters},
                                                {section: 'single_wait_events', data: instanceActivityHTML + "\n" + waitEventsHTML, events: WaitEvents},
                                                {section: 'single_static_metrics', data: staticMetricsHTML},
                                                {section: 'single_additional_metrics', data: additionalMetricsHTML},
                                                {section: 'single_instance_recommendations', data: instanceRecommendationsHTML},
                                                {section: 'single_os_metrics', data: OSMetricsHTML},
                                                {section: 'single_db_metrics', data: DBMetricsHTML}
                                       ]);

       var resp = await genAI.generate({section: 'single_summary', sqls: SQLsSortedByLoadHTML, sqltext: SQLTextsHTML})
       //console.log(replaceSQLIDWithLink(genAI.getSection('single_summary')))
       console.log('LLM tokens used:', genAI.getUsage())
    }

    if (genai) {
      var genAIanalyzesHTML = `
       <table style="background-color: aliceblue;" class="genai-table container-table">
        	   <caption style="background-color: aliceblue;"><span style="color: blue;">GenAI analyzes of the report</span>
        	   ${infoMessage(`CAUTION: LLM can make mistakes. Verify this analyzes.`)}
        	   </caption>
        	   <td>
        	      <div style="padding: 10px"><pre style="white-space: break-spaces;word-wrap: break-word;color: blue;font-weight: bold;">${replaceSQLIDWithLink(genAI.getSection('single_summary'))}</pre></div>
        	   </td>
       </table>
       `
    } else {
      var genAIanalyzesHTML = ""
    }





    // Log files section
    const generateLogFilesHTML = function(snap) {
      var mainHTML = ''



      var rows = '',
        rowdata = ''
      for (let i = 0; i < snap.length; i++) {
        rowdata = td(snap[i].logfile) +
          td(snap[i].firstOccurrenceDate) +
          td(snap[i].count) +
          td(snap[i].message)

        rows = `${rows}\n<tr>${rowdata}</tr>`

      }
      mainHTML = `
     <table style="width:initial">
      	   <caption>Instance log files analysis</caption>
      	   ${tr(td('Logfile')+td('First occurrence')+td('Count')+td('Message'), 'table-header')}
      	   ${rows}
     </table>
  `

      return mainHTML

    }



    var logFilesHTML = ''
    if (snapshotObject.LogFileAnalysis) {
      if (snapshotObject.LogFileAnalysis.length === 0) {
        logFilesHTML = `
     <table style="width:initial">
      	   <caption>Instance log files analysis</caption>
      	   ${tr(td(infoMessage('No rows matching the filters were found.')))}
     </table>
  `
      }
      else {
        logFilesHTML = generateLogFilesHTML(snapshotObject.LogFileAnalysis)
      }
    }
    // Log files section end



    var snapshotOptionsHTML = `
  <table style="width:initial">
   	   <caption>Snapshot command line options</caption>
   	   <tr class="table-header">${td('Name')}${td('Value')}</tr>
  {{body}}
  </table>
  `
    var soBody = ''
    for (const soKey in snapshotObject.$META$.commandLineOptions) {
      if (snapshotObject.$META$.commandLineOptions.hasOwnProperty(soKey)) {
        const soValue = snapshotObject.$META$.commandLineOptions[soKey];
        soBody = `${soBody}\n${tr(td(soKey)+td(soValue))}`
      }
    }

    snapshotOptionsHTML = snapshotOptionsHTML.replace("{{body}}", soBody);




    const htmlReport = `
<!DOCTYPE html>
<html>
<body>
<style>${htmlStyle}</style>
<script>${htmlScript}</script>

<div class="info-box" style="float:right">
  <b>Report creation time: </b>${getCurrDate()}<br>
  <b>Region: </b>${snapshotObject.$META$.region}
</div>

<table style="width:initial">
   	   <caption>Snapshot</caption>
   	   <tr class="table-header">${td('Begin')}${td('End')}${td('Duration (min)')}</tr>
       ${tr(td(snapshotObject.$META$.startTime)+td(snapshotObject.$META$.endTime)+td(snapshotDurationMin))}
  </table>

${genAIanalyzesHTML}

${snapshotOptionsHTML}
${generalInformationHTML}
${nonDefParametersHTML}
${instanceActivityHTML}
${waitEventsHTML}
${metricsHTML}
${infoMessage(columnDescriptionsSQLs(), 'fit-content', 'top')}
${SQLsHTML}
${logFilesHTML}

<p>Performance Insights Reporter v${global.version}.</p>

</body>
</html>
`

    resolve(htmlReport)

  })

}
















// Compare periods report

const generateCompareHTMLReport = async function(snapshotObject1, snapshotObject2, genai) {
  return new Promise(async (resolve, reject) => {
    
    if (genai) {
       var genAI = new LLMGenerator('compare_snapshots', {region: snapshotObject1.$META$.region, 
                                                          startTime: snapshotObject1.$META$.startTime, 
                                                          endTime: snapshotObject1.$META$.endTime, 
                                                          engine: snapshotObject1.GeneralInformation.Engine, 
                                                          comment: snapshotObject1.$META$.commandLineOptions.comment || undefined}, 
                                                         {region: snapshotObject2.$META$.region, 
                                                          startTime: snapshotObject2.$META$.startTime, 
                                                          endTime: snapshotObject2.$META$.endTime, 
                                                          engine: snapshotObject2.GeneralInformation.Engine, 
                                                          comment: snapshotObject2.$META$.commandLineOptions.comment || undefined})
    }
    
    const snapshotDurationMin1 = Math.floor((new Date(snapshotObject1.$META$.endTime).getTime() - new Date(snapshotObject1.$META$.startTime).getTime()) / 1000) / 60
    const snapshotDurationMin2 = Math.floor((new Date(snapshotObject2.$META$.endTime).getTime() - new Date(snapshotObject2.$META$.startTime).getTime()) / 1000) / 60

    try {
      var htmlStyle = await fs.promises.readFile(path.join(process.cwd(), 'report.css'), 'utf8')
    }
    catch (err) {
      console.error('Error reading file report.style:', err)
      process.exit(1)
    }

    if (! snapshotObject1.$META$.version) {
      snapshotObject1.$META$.version = "2.0.3"
    }
    
    if (! snapshotObject2.$META$.version) {
      snapshotObject2.$META$.version = "2.0.3"
    }


    var generalInformationHTML = `
    <table style="width:initial">
     	   <caption>General information</caption>
     	   <tr class="table-header">${td('Name')}${td('Value')}${td('Value','s2-h-bg')}${td('Diff','c-h-bg')}</tr>
    {{body}}
    </table>
    `

    const compare = function(v1, v2, format = 'html') {
      if (!isNaN(Number(v1))) v1 = Number(v1)
      if (!isNaN(Number(v2))) v2 = Number(v2)
      const minus = '<span style="color: red"><b>-</b></span>'
      const plus = '<span style="color: green"><b>+</b></span>'
      
      if (v1 === '-' || v2 === '-') {
        return '-'
      } else if (typeof v1 === 'string') {
        if (v1 === '-' || v2 === '-') return '-'
        return (v1 === v2) ? '=' : '&#8800;'
      }
      else if (typeof v1 === 'number' || typeof v2 === 'number') {
        if (v1 === undefined || v2 === undefined || isNaN(v1) || isNaN(v2)) return '-'
        let s = ''
        let pct = 0
        let x = 0
        let diff = 0
        if (v1 !== 0 && v2 === 0) {
          s = '-'
          x = v1
          pct = 100
          diff = -1 * v1
        }
        else if (v1 === 0 && v2 !== 0) {
          s = '+'
          x = v2
          pct = 100
          diff = v2
        }
         else {
            diff = v2 - v1
            if (diff > 0) {
              s = '+'
              pct = Math.abs(diff / v1) * 100
              x = v2 / v1
            }
            else if (diff < 0) {
              pct = Math.abs(diff / v2) * 100
              x = v1 / v2
            }
        }
        if (format === 'html') {
           s = (diff < 0) ? minus : (diff > 0) ? plus : ''
           return `${s}${Math.abs(parseFloat(diff.toFixed(2)))} [${parseFloat(x.toFixed(1))}x|${pct.toFixed(0)}%]`
        } else {
           return {diff: parseFloat(diff.toFixed(2)), x: parseFloat(x.toFixed(1)), pct: pct.toFixed(0)}
        }
      }
      else if (typeof v1 === 'object') {
        return (JSON.stringify(v1) === JSON.stringify(v2)) ? '=' : '&#8800;'
      } else if (v1 === undefined || v2 === undefined) {
        return '-'
      }
      else {
        return (v1 === v2) ? '=' : '&#8800;'
      }
    }


    var giBody = ''
    for (const giKey in snapshotObject1.GeneralInformation) {
      if (snapshotObject1.GeneralInformation.hasOwnProperty(giKey)) {
        const giValue = snapshotObject1.GeneralInformation[giKey];
        const giValue2 = snapshotObject2.GeneralInformation[giKey];
        if (Object.prototype.toString.call(giValue) === '[object Object]') {
          giBody = `${giBody}\n${tr(td(giKey)+td(tableFromObject(giValue))+td(tableFromObject(giValue2), 's2-r-bg')+td(compare(giValue,giValue2), 'c-r-bg'))}`
        }
        else if (Array.isArray(giValue) && Object.prototype.toString.call(giValue[0]) === '[object Object]') {
          giBody = `${giBody}\n${tr(td(giKey)+td(tableFromArrayOfObjects(giValue))+td(tableFromArrayOfObjects(giValue2), 's2-r-bg')+td(compare(giValue,giValue2), 'c-r-bg'))}`
        }
        else if (Array.isArray(giValue)) {
          giBody = `${giBody}\n${tr(td(giKey)+td(tableFromArray(giValue))+td(tableFromArray(giValue2), 's2-r-bg')+td(compare(giValue,giValue2), 'c-r-bg'))}`
        }
        else {
          giBody = `${giBody}\n${tr(td(giKey)+td(giValue)+td(giValue2, 's2-r-bg')+td(compare(giValue,giValue2), 'c-r-bg'))}`
        }
      }
    }

    generalInformationHTML = generalInformationHTML.replace("{{body}}", giBody);


    const printParams = function(params) {
      var rows = '',
        rowdata = ''
      for (let i = 0; i < params.length; i++) {
        rowdata = td(abbr(params[i].ParameterName, params[i].Description)) + td(params[i].ParameterValue) + td((params[i].ApplyType === 'static') ? 'Reboot' : 'Dynamic')
        rows = `${rows}\n${tr(rowdata)}`
      }
      return rows
    }
    var nonDefParametersHTML1 = ''
    if (snapshotObject1.NonDefParameters.length > 0) {
      nonDefParametersHTML1 = `<table style="width:initial">
       <caption>Snapshot 1 non-default parameters from parameter group: ${snapshotObject1.GeneralInformation.DBParameterGroups[0].DBParameterGroupName} [${snapshotObject1.GeneralInformation.DBParameterGroups[0].ParameterApplyStatus}]</caption>
       ${tr(td('Parameter')+td('Value')+td('Apply type'), 'table-header')}
       ${printParams(snapshotObject1.NonDefParameters)}
       </table>`
    }
    var nonDefParametersHTML2 = ''
    if (snapshotObject2.NonDefParameters.length > 0) {
      nonDefParametersHTML2 = `<table style="width:initial" class="s2-r-bg">
       <caption class="s2-c-color">Snapshot 2 non-default parameters from parameter group: ${snapshotObject2.GeneralInformation.DBParameterGroups[0].DBParameterGroupName} [${snapshotObject2.GeneralInformation.DBParameterGroups[0].ParameterApplyStatus}]</caption>
       ${tr(td('Parameter')+td('Value')+td('Apply type'), 'table-header s2-h-color')}
       ${printParams(snapshotObject2.NonDefParameters)}
       </table>`
    }


    var nonDefParameters1 = nonDefParametersHTML1.length === 0 ? 'There is no non-default parameters for this snapshot.' : nonDefParametersHTML1
    var nonDefParameters2 = nonDefParametersHTML2.length === 0 ? 'There is no non-default parameters for this snapshot.' : nonDefParametersHTML2
    var nonDefParameters = `<table class="container-table"><tr>
  <td style="vertical-align: top">${nonDefParameters1}</td><td style="vertical-align: top">${nonDefParameters2}</td>
  </tr>
  </table>
    `

    var nonDefParametersHTML = `<table class="container-table"><tr>
  <td style="vertical-align: top">${nonDefParametersHTML1}</td><td style="vertical-align: top">${nonDefParametersHTML2}</td>
  </tr>
  </table>
    `


    var instanceActivityHTML = `
  <table style="width:initial">
   	   <caption>Instance activity stats</caption>
   	   ${tr(td('Stat')+td('Value')+td('Value', 's2-h-bg')+td('Diff','c-h-bg'), 'table-header')}
       ${tr(td('Wallclock time (min)')+td(snapshotObject1.WaitEvents.WallClockTimeSec/60)+td(snapshotObject2.WaitEvents.WallClockTimeSec / 60, 's2-r-bg')+td(compare(snapshotObject1.WaitEvents.WallClockTimeSec / 60, snapshotObject2.WaitEvents.WallClockTimeSec / 60),'c-r-bg'))}
       ${tr(td('Average Active Sessions')+td(snapshotObject1.WaitEvents.AverageActiveSessions)+td(snapshotObject2.WaitEvents.AverageActiveSessions, 's2-r-bg') + td(compare(snapshotObject1.WaitEvents.AverageActiveSessions, snapshotObject2.WaitEvents.AverageActiveSessions), 'c-r-bg'))}
       ${tr(td('DBTime (min)')+td((snapshotObject1.WaitEvents.DBTimeSeconds/60).toFixed(2))+td((snapshotObject2.WaitEvents.DBTimeSeconds / 60).toFixed(2), 's2-r-bg') + td(compare(snapshotObject1.WaitEvents.DBTimeSeconds / 60, snapshotObject2.WaitEvents.DBTimeSeconds / 60), 'c-r-bg'))}
  </table>
  `


    const printWaitEventsHTML = function(snap1, snap2) {
      var mainHTML = '';

      const snap = [];

      for (const event1 of snap1) {
        const event2 = snap2.find((e) => e.event_name === event1.event_name);

        if (event2) {
          const joinedEvent = {
            "event_name": event1.event_name,
            "event_type": event1.event_type,
            "metric_time_sec1": event1.metric_time_sec,
            "metric_time_sec2": event2.metric_time_sec,
            "pct_db_time1": event1.pct_db_time,
            "pct_db_time2": event2.pct_db_time
          };

          snap.push(joinedEvent);
        }
        else {
          const joinedEvent = {
            "event_name": event1.event_name,
            "event_type": event1.event_type,
            "metric_time_sec1": event1.metric_time_sec,
            "metric_time_sec2": undefined,
            "pct_db_time1": event1.pct_db_time,
            "pct_db_time2": undefined
          };

          snap.push(joinedEvent);
        }
      }


      for (const event2 of snap2) {
        const event1 = snap1.find((e) => e.event_name === event2.event_name);

        if (!event1) {
          const joinedEvent = {
            "event_name": event2.event_name,
            "event_type": event2.event_type,
            "metric_time_sec1": undefined,
            "metric_time_sec2": event2.metric_time_sec,
            "pct_db_time1": undefined,
            "pct_db_time2": event2.pct_db_time
          };

          snap.push(joinedEvent);
        }
      }

      var rows = '',
        rowdata = ''
      for (let i = 0; i < snap.length; i++) {
        rowdata = td(snap[i].event_name) +
          td(snap[i].event_type) +
          td(snap[i].metric_time_sec1 === undefined ? '-' : snap[i].metric_time_sec1) +
          td(snap[i].metric_time_sec2 === undefined ? '-' : snap[i].metric_time_sec2, 's2-r-bg') +
          td(compare(snap[i].metric_time_sec1, snap[i].metric_time_sec2), 'c-r-bg') +
          td(snap[i].pct_db_time1 === undefined ? '-' : snap[i].pct_db_time1) +
          td(snap[i].pct_db_time2 === undefined ? '-' : snap[i].pct_db_time2, 's2-r-bg') +
          td(compare(parseFloat(snap[i].pct_db_time1), parseFloat(snap[i].pct_db_time2)), 'c-r-bg')


        rows = `${rows}\n<tr>${rowdata}</tr>`

      }
      mainHTML = `
        <table style="width:initial">
           <caption>Top wait events</caption>
      	   ${tr(td('Event')+td('Type')+td('Metric time (sec)')+td('Metric time (sec)','s2-h-bg') + td('Diff', 'c-h-bg') + td('Pct DB time') + td('Pct DB time', 's2-h-bg') + td('Diff', 'c-h-bg'), 'table-header')}
      	   ${rows}
        </table>
      `

      return mainHTML

    }

    var WaitEvents = [...new Set([...snapshotObject1.WaitEvents.TopEvents.map(obj => obj.event_name), ...snapshotObject2.WaitEvents.TopEvents.map(obj => obj.event_name)])];
    var waitEventsHTML = printWaitEventsHTML(snapshotObject1.WaitEvents.TopEvents, snapshotObject2.WaitEvents.TopEvents);

    

    /// Metrics B /////


    var staticMetricsHTML1 = `
  <table style="width:initial" class="no-shadow">
   	   <caption>Snapshot 1 EC2 stats</caption>
   	   ${tr(td('Stat')+td('Value'), 'table-header')}
       ${tr(td('vCPUs')+td(tableFromArrayOfObjects(snapshotObject1.Metrics.StaticMetrics.vCPUs)))}
       ${tr(td('Memory (Kb)')+td(tableFromArrayOfObjects(snapshotObject1.Metrics.StaticMetrics.memory)))}
       ${tr(td('Swap (Kb)')+td(tableFromArrayOfObjects(snapshotObject1.Metrics.StaticMetrics.swap)))}
  </table>
  `

    var staticMetricsHTML2 = `
  <table style="width:initial" class="no-shadow s2-r-bg">
        <caption class="s2-c-color">Snapshot 2 EC2 stats</caption>
        ${tr(td('Stat') + td('Value'), 'table-header s2-h-color')}
        ${tr(td('vCPUs') + td(tableFromArrayOfObjects(snapshotObject2.Metrics.StaticMetrics.vCPUs)))}
        ${tr(td('Memory (Kb)') + td(tableFromArrayOfObjects(snapshotObject2.Metrics.StaticMetrics.memory)))}
        ${tr(td('Swap (Kb)') + td(tableFromArrayOfObjects(snapshotObject2.Metrics.StaticMetrics.swap)))}
  </table>
        `


    var staticMetricsHTML = `<table class="container-table"><tr>
  <td style="vertical-align: top">${staticMetricsHTML1}</td><td style="vertical-align: top">${staticMetricsHTML2}</td>
  </tr>
  </table>
    `


    const generateMetricsHTML = function(snap1, snap2, type) {
      var mainHTML = ''
      
      const joinMetrics = function (metrics1, metrics2) {
        
        const metrics = [];

      for (const metric1 of metrics1) {
        const metric2 = metrics2.find((e) => e.metric === metric1.metric);

        if (metric2) {
          const joinedMetric = {
            "metric": metric1.metric,
            "desc": metric1.desc,
            "unit": metric1.unit,
            "sum1": metric1.sum,
            "sum2": metric2.sum,
            "avg1": metric1.avg,
            "avg2": metric2.avg,
            "max1": metric1.max,
            "max2": metric2.max,
            "min1": metric1.min,
            "min2": metric2.min
          };

          metrics.push(joinedMetric);
        }
        else {
          const joinedMetric = {
            "metric": metric1.metric,
            "desc": metric1.desc,
            "unit": metric1.unit,
            "sum1": metric1.sum,
            "sum2": undefined,
            "avg1": metric1.avg,
            "avg2": undefined,
            "max1": metric1.max,
            "max2": undefined,
            "min1": metric1.min,
            "min2": undefined
          };

          metrics.push(joinedMetric);
        }
      }


      for (const metric2 of metrics2) {
        const metric1 = metrics1.find((e) => e.metric === metric2.metric);

        if (!metric1) {
          const joinedMetric = {
            "metric": metric2.metric,
            "desc": metric2.desc,
            "unit": metric2.unit,
            "sum1": undefined,
            "sum2": metric2.sum,
            "avg1": undefined,
            "avg2": metric2.avg,
            "max1": undefined,
            "max2": metric2.max,
            "min1": undefined,
            "min2": metric2.min
          };

          metrics.push(joinedMetric);
        }
      }

      return metrics
        
      } // joinMetrics
  

      for (let Key in snap1) {
        const metrics = joinMetrics(snap1[Key].metrics, snap2[Key].metrics)
        metrics.sort((a, b) => {
           let aSumDiff = compare((a.sum1 || 0), (a.sum2 || 0), 'json');
           let bSumDiff = compare((b.sum1 || 0), (b.sum2 || 0), 'json');
           let aAvgDiff = compare((a.avg1 || 0), (a.avg2 || 0), 'json');
           let bAvgDiff = compare((b.avg1 || 0), (b.avg2 || 0), 'json');
           return bSumDiff.pct - aSumDiff.pct || bAvgDiff.pct - aAvgDiff.pct || bSumDiff.diff - aSumDiff.diff || bAvgDiff.diff - aAvgDiff.diff;
        });
        
        var metricsHTML = ''
        var rows = '',
          rowdata = ''
        for (let i = 0; i < metrics.length; i++) {
          rowdata = td(abbr(metrics[i].metric, metrics[i].desc)) +
            td(metrics[i].unit) +
            td(metrics[i].sum1 !== undefined ? abbr(metrics[i].sum1, metrics[i].unit) : '-') +
            td(metrics[i].sum2 !== undefined ? abbr(metrics[i].sum2, metrics[i].unit) : '-', 's2-r-bg') +
            td(compare(metrics[i].sum1, metrics[i].sum2), 'c-r-bg') +
            td(metrics[i].avg1 !== undefined ? abbr(metrics[i].avg1, metrics[i].unit) : '-') +
            td(metrics[i].avg2 !== undefined ? abbr(metrics[i].avg2, metrics[i].unit) : '-', 's2-r-bg') +
            td(compare(metrics[i].avg1, metrics[i].avg2), 'c-r-bg') +
            td(metrics[i].max1 !== undefined ? abbr(metrics[i].max1, metrics[i].unit) : '-') +
            td(metrics[i].max2 !== undefined ? abbr(metrics[i].max2, metrics[i].unit) : '-', 's2-r-bg') +
            td(compare(metrics[i].max1, metrics[i].max2), 'c-r-bg') +
            td(metrics[i].min1 !== undefined ? abbr(metrics[i].min1, metrics[i].unit) : '-') +
            td(metrics[i].min2 !== undefined ? abbr(metrics[i].min2, metrics[i].unit) : '-', 's2-r-bg') +
            td(compare(metrics[i].min1, metrics[i].min2), 'c-r-bg')
          
          rows = `${rows}\n<tr>${rowdata}</tr>`

        }
        metricsHTML = `
        <table class="no-shadow">
           <caption>${snap1[Key].name}</caption>
           ${tr(td('Metric') + td('Unit') + td('Sum') + td('Sum', 's2-h-bg') + td('Diff', 'c-h-bg') + td('Avg') + td('Avg', 's2-h-bg') + td('Diff', 'c-h-bg') + td('Max') + td('Max', 's2-h-bg') + td('Diff', 'c-h-bg') + td('Min') + td('Min', 's2-h-bg') + td('Diff', 'c-h-bg'), 'table-header ')}
      	   ${rows}
        </table>
      `

        mainHTML = `${mainHTML}\n${metricsHTML}`
      }

      return `
  <table style="width:initial" class="no-shadow no-border">
   	   <caption>${type === 'DB' ? 'Database' : 'OS'} Metrics</caption>
   	   ${tr(td(mainHTML))}
  </table>
  `
    }


    
    const printCorrelationGroupsHTML = function (correlations) {
    var correlationGroupsHTML = ''
    var correlationRowHTML = ''
    var i = 0
    var numberOfGroups = Object.keys(correlations).length - 1
    for (let Key in correlations) {
        if (Key === 'Threshold') continue
        var correllationGroup = correlations[Key]
        var correllationGroupHTML = ''
        for (let i = 0; i < correllationGroup.length; i++) {
          correllationGroupHTML = `${correllationGroupHTML}\n${tr(td(correllationGroup[i]))}`
        }
        correllationGroupHTML = `<table class="no-shadow">${correllationGroupHTML}</table>`
        correlationRowHTML = `${correlationRowHTML}${correllationGroupHTML}`
        i++
        if (i === Math.floor(numberOfGroups / 2)) {
          correlationGroupsHTML = `${correlationGroupsHTML}<td style="vertical-align: top;">${correlationRowHTML}</td>`
          correlationRowHTML = ''
          i = 0
        }
      }

      correlationGroupsHTML = `${correlationGroupsHTML}<td style="vertical-align: top;">${correlationRowHTML}</td>`

      return tr(correlationGroupsHTML)
     
    }
    
    const correlationsHTML = `<table class="container-table"><tr>
  <td style="vertical-align: top">
  <table style="width:initial" class="no-shadow no-border">
      	   <caption>Correlated groups of metrics (Correlation over ${snapshotObject1.Metrics.Correlations.Threshold * 100} percent)</caption>
      	   ${(snapshotObject1.Metrics.Correlations) ? printCorrelationGroupsHTML(snapshotObject1.Metrics.Correlations) : ''}
     </table>
  </td><td style="vertical-align: top">
  <table style="width:initial" class="no-shadow no-border s2-r-bg">
      	   <caption class="s2-c-color">Correlated groups of metrics (Correlation over ${snapshotObject2.Metrics.Correlations.Threshold * 100} percent)</caption>
      	   ${(snapshotObject2.Metrics.Correlations) ? printCorrelationGroupsHTML(snapshotObject2.Metrics.Correlations) : ''}
     </table>
  </td>
  </tr>
  </table>
    `



   const generateAdditionalMetricsHTML = function (snap1, snap2) {
      var rows = '',  rowdata = ''
      
      const allKeys = new Set([...Object.keys(snap1), ...Object.keys(snap2)]);
      
      for (const Key of allKeys) {
         
         const Metric1 = snap1[Key] || {...snap2[Key] , value: '-' }
         const Metric2 = snap2[Key] || {value: '-'}
         
         rowdata = td(abbr(Metric1.label, Metric1.desc)) +
                   td(Metric1.unit) +
                   td(abbr(Metric1.value, Metric1.unit)) +
                   td(abbr(Metric2.value, Metric1.unit), 's2-r-bg') +
                   td(compare(Metric1.value, Metric2.value), 'c-r-bg')
                   
         rows = `${rows}\n<tr>${rowdata}</tr>`
      }
      
      return `
       <table style="width:initial" class="no-shadow">
        	   <caption>Additional metrics</caption>
        	   ${tr(td('Name')+td('Unit')+td('Value')+td('Value', 's2-r-bg') + td('Diff', 'c-r-bg'), 'table-header')}
        	   ${rows}
       </table>
       `
    }



    const generateInstanceRecommendationsHTML = function (snap, snapid = 1) {
  
      var body = ""
      var message = ""
      if (snap.recommended_instances_found) {
        
        var recommendedInstancesHTML = ''
        var snapshotPeriodStatsHTML = `<table style="width:initial" class="no-shadow">
          <tr><th>Stat</th><th>Usage</th><th>Capacity</th><th>Pct used</th></tr>
          ${tr(td('Number vCPUs')+td(snap.snapshot_period_stats.snapshot_vcpus_used)+td(snap.instance_capacity.vcpus)+td((snap.snapshot_period_stats.snapshot_vcpus_used*100/snap.instance_capacity.vcpus).toFixed(2)+'%'))}
          ${tr(td('Network throughput (MBps)')+td(snap.snapshot_period_stats.snapshot_nt_used.toFixed(2))+td(snap.instance_capacity.network_limit_MBps)+td((snap.snapshot_period_stats.snapshot_nt_used*100/snap.instance_capacity.network_limit_MBps).toFixed(2)+'%'))}
          ${tr(td('Host instance memory (GB)')+td(snap.snapshot_period_stats.snapshot_memory_estimated_gb.toFixed(2))+td(snap.instance_capacity.memory_GB.toFixed(2))+td((snap.snapshot_period_stats.snapshot_memory_estimated_gb*100/snap.instance_capacity.memory_GB).toFixed(2)+'%'))}
          ${tr(td('Local storage throughput (MBps)')+td(snap.snapshot_period_stats.snapshot_local_storage_max_throughput.toFixed(2))+td(snap.instance_capacity.local_storage_throughput_limit_MBps.toFixed(2))+td((snap.snapshot_period_stats.snapshot_local_storage_max_throughput*100/snap.instance_capacity.local_storage_throughput_limit_MBps).toFixed(2)+'%'))}
          ${tr(td('Local storage (GB)')+td(snap.snapshot_period_stats.snapshot_fsys_used.toFixed(2))+td(snap.instance_capacity.local_storage_GB.toFixed(2))+td((snap.snapshot_period_stats.snapshot_fsys_used*100/snap.instance_capacity.local_storage_GB).toFixed(2)+'%'))}
          ${tr(td('Number backends')+td(snap.snapshot_period_stats.snapshot_max_backends.toFixed(1))+td(snap.instance_capacity.max_connections.toFixed(1))+td((snap.snapshot_period_stats.snapshot_max_backends*100/snap.instance_capacity.max_connections).toFixed(2)+'%'))}
        </table>`
        
        if (snap.recommended_instances.length === 0) {
          message = `Based on the ${snap.usage_stats_based_on === 'max' ? 'maximum' : 'average + 2 standard deviations'} usage metrics during this snapshot and an additional ${snap.resource_reserve_pct}% reserve above them: ${snap.note}`
        } else {
          message = `Based on the ${snap.usage_stats_based_on === 'max' ? 'maximum' : 'average + 2 standard deviations'} usage metrics during this snapshot and an additional ${snap.resource_reserve_pct}% reserve above them, there are possible instance classes that may be better suited for the workload.`
        
          var rowHTML = ''
          for (var i = 0; i < snap.recommended_instances_desc.length; i++) {
            rowHTML = rowHTML + td(snap.recommended_instances_desc[i])
          }
          var headerHTML = tr(rowHTML, 'table-header' + (snapid === 1 ? '' : ' s2-h-color'))
          rowsHTML = ''
          for (var i = 0; i < snap.recommended_instances.length; i++) {
            var row = snap.recommended_instances[i]
            var rowHTML = ''
            for (var j = 0; j < row.length; j++) {
              rowHTML = rowHTML + td(row[j])
            }
            rowsHTML = rowsHTML + tr(rowHTML)
          }
        
          recommendedInstancesHTML = `
          <div style="padding: 10px"><span>${snap.note}</span></div>
          <table style="width:initial">
             ${headerHTML}
             ${rowsHTML}
          </table>
          <div style="padding: 10px"><span>The Cost Diff Pct shows the cost difference compared to the current instance type. If the number is positive, the cost should be higher; if negative, it should be cheaper.</span></div>
          `
        
        }
       
        body = `
          <div style="padding: 10px"><span>${snap.usage_stats_based_on === 'max' ? 'Maximum' : 'Average + 2 standard deviations'} resources used in snapshot period:</span></div>
          ${snapshotPeriodStatsHTML}
          ${recommendedInstancesHTML}
        `
        
      } else {
        message = `Based on the maximum usage metrics and an additional ${snap.resource_reserve_pct}% reserve above them, the current instance class is appropriate for the current workload requirements.`
      }
      
      if (snapid === 2) {
        return `
       <table style="width:initial" class="container-table s2-r-bg">
        	   <caption class="s2-c-color">Workload analyses for snapshot period 2
        	   ${infoMessage(`CAUTION: The information in this section is based solely on the data available in this report and only for this snapshot period. The information was created on a best effort basis and requires additional manual confirmation. It is included to make you aware that the resource could be a potential bottleneck for the workload. To get more reliable recommendations, use <a href="https://us-east-1.console.aws.amazon.com/compute-optimizer/home?region=${snapshotObject1.$META$.region}#/resources-lists/rds">AWS Compute Optimizer</a>`)}
        	   
        	   </caption>
        	   <td>
        	      <div style="padding: 10px"><span>${message}</span></div>
        	      ${body}
        	   </td>
       </table>
       `
      } else {
        return `
       <table style="width:initial" class="container-table">
        	   <caption>Workload analyses for snapshot period 1
        	   ${infoMessage(`CAUTION: The information in this section is based solely on the data available in this report and only for this snapshot period. The information was created on a best effort basis and requires additional manual confirmation. It is included to make you aware that the resource could be a potential bottleneck for the workload. To get more reliable recommendations, use <a href="https://us-east-1.console.aws.amazon.com/compute-optimizer/home?region=${snapshotObject2.$META$.region}#/resources-lists/rds">AWS Compute Optimizer</a>`)}
        	   </caption>
        	   <td>
        	      <div style="padding: 10px"><span>${message}</span></div>
        	      ${body}
        	   </td>
       </table>
       `
      }
    }


   var instanceRecommendationsHTML = `<table class="container-table">
   <tr>
  <td>${generateInstanceRecommendationsHTML(snapshotObject1.Metrics.WorkloadAnalyses, 1)}</td></tr>
  <tr><td>${generateInstanceRecommendationsHTML(snapshotObject2.Metrics.WorkloadAnalyses, 2)}</td></tr>
  </table>`


  var additionalMetricsHTML = generateAdditionalMetricsHTML(snapshotObject1.Metrics.AdditionalMetrics, snapshotObject2.Metrics.AdditionalMetrics)
  var OSMetricsHTML = generateMetricsHTML(snapshotObject1.Metrics.OSMetrics, snapshotObject2.Metrics.OSMetrics, 'OS')
  var DBMetricsHTML = generateMetricsHTML(snapshotObject1.Metrics.DBAuroraMetrics, snapshotObject2.Metrics.DBAuroraMetrics, 'DB')

    var metricsHTML = `
  <table style="width:initial" class="no-border">
   	   <caption>Metrics</caption>
   	   ${tr(td(staticMetricsHTML))}
   	   ${tr(td(additionalMetricsHTML))}
   	   ${tr(td(instanceRecommendationsHTML))}
   	   ${tr(td(OSMetricsHTML))}
   	   ${tr(td(DBMetricsHTML))}
   	   ${tr(td(correlationsHTML))}
  </table>
  `
  
    
    /// Metrics E /////




    // SQLs section begin
    
    const joinSQLs = function (sqls1, sqls2) {
      
      const joinAdditionalMetrics = function(metrics1, metrics2) {
        if (metrics1 === undefined && metrics2 === undefined) return undefined
        let Joined = {};
        if (metrics1 !== undefined) {
        for (let key in metrics1) {
          Joined[key] = [metrics1[key], metrics2[key] || null];
        }}
        if (metrics2 !== undefined) {
        for (let key in metrics2) {
          if (!Joined.hasOwnProperty(key)) {
            Joined[key] = [null, metrics2[key]];
          }
        }}
        return Joined
      }
        
      const sqls = [];

      for (const sql1 of sqls1) {
        const sql2 = sqls2.find((e) => e.sql_id === sql1.sql_id);

        if (sql2) {
          const joinedSQL = {
            "snap": 1,
            "sql_db_id": sql1.sql_db_id,
            "sql_id": sql1.sql_id,
            "sql_statement": sql1.sql_statement,
            "dbload1": sql1.dbload,
            "dbload2": sql2.dbload,
            "pct_aas1": sql1.pct_aas,
            "pct_aas2": sql2.pct_aas,
            "AdditionalMetrics": joinAdditionalMetrics(sql1.AdditionalMetrics,sql2.AdditionalMetrics)
          };

          sqls.push(joinedSQL);
        }
        else {
          const joinedSQL = {
            "snap": 1,
            "sql_db_id": sql1.sql_db_id,
            "sql_id": sql1.sql_id,
            "sql_statement": sql1.sql_statement,
            "dbload1": sql1.dbload,
            "dbload2": undefined,
            "pct_aas1": sql1.pct_aas,
            "pct_aas2": undefined,
            "AdditionalMetrics": sql1.AdditionalMetrics
          };

          sqls.push(joinedSQL);
        }
      }


      for (const sql2 of sqls2) {
        const sql1 = sqls1.find((e) => e.sql_id === sql2.sql_id);

        if (!sql1) {
          const joinedSQL = {
            "snap": 2,
            "sql_db_id": sql2.sql_db_id,
            "sql_id": sql2.sql_id,
            "sql_statement": sql2.sql_statement,
            "dbload1": undefined,
            "dbload2": sql2.dbload,
            "pct_aas1": undefined,
            "pct_aas2": sql2.pct_aas,
            "AdditionalMetrics": sql2.AdditionalMetrics
          };

          sqls.push(joinedSQL);
        }
      }

      return sqls
        
      } // joinSQLs

    
    const sqls = joinSQLs(snapshotObject1.SQLs.SQLs, snapshotObject2.SQLs.SQLs)
    
    
    const generateSQLsHTML = function(snap1, snap2, sqls, sortby) {
      var mainHTML = ''

      const getCPUpct = function(snap, sqlid) {
        var sql_waits = snap.Waits.find(sql => sql.sql_id === sqlid);
        var cpu_wait = sql_waits.waits.find(wait => wait.event === 'CPU');
        if (cpu_wait) {
          return cpu_wait.pct.toFixed(2)
        }
        else {
          return '-'
        }
      }

      const getIOpct = function(snap, sqlid) {
        var sql_waits = snap.Waits.find(sql => sql.sql_id === sqlid);
        var io_wait = sql_waits.waits.filter(wait => wait.event.startsWith("IO:"));
        if (io_wait.length > 0) {
          var sumIO = io_wait.reduce((acc, val) => acc + val.pct, 0)
          return sumIO.toFixed(2)
        }
        else {
          return '-'
        }
      }

      const loadByDB = function(snap, sqlid) {
        var sqls = snap.LoadByDatabase.find(sql => sql.sql_id === sqlid);
        var rows = '',
          rowdata = ''
        for (let i = 0; i < sqls.dbload.length; i++) {
          rowdata = td(sqls.dbload[i].db + ':') + td(sqls.dbload[i].pct.toFixed(0) + '%')
          rows = `${rows}\n${tr(rowdata)}`
        }
        return `<table class='inline-table'>\n${rows}\n</table>`
      }

      const loadByUser = function(snap, sqlid) {
        var sqls = snap.LoadByUser.find(sql => sql.sql_id === sqlid);
        var rows = '',
          rowdata = ''
        for (let i = 0; i < sqls.dbload.length; i++) {
          rowdata = td(sqls.dbload[i].user + ':') + td(sqls.dbload[i].pct.toFixed(0) + '%')
          rows = `${rows}\n${tr(rowdata)}`
        }
        return `<table class='inline-table'>\n${rows}\n</table>`
      }


      const printMetrics = function(metrics) {
        var rows = '',
          rowdata = ''
        for (let key in metrics) {
          if (metrics.hasOwnProperty(key)) {
            const value = metrics[key]
            if (typeof value === 'object') {
              rowdata = td(key.substring(23)) + 
                        td(value[0] === null ? '-' : value[0].toFixed(2)) + 
                        td(value[1] === null ? '-' : value[1].toFixed(2), 's2-r-bg') +
                        td(compare(value[0] === null ? undefined : value[0].toFixed(2), value[1] === null ? undefined : value[1].toFixed(2)), 'c-r-bg')
            } else {
              rowdata = td(key.substring(23)) + td(value.toFixed(2) || value[0].toFixed(2))
            }
            rows = `${rows}\n${tr(rowdata)}`
          }
        }
        
        if (rows.length > 0) {
          return `<table class='inline-table'><caption>Additional metrics</caption>\n${rows}\n</table>`
        }
        else {
          return ''
        }
      }

      const printWaits = function(snap, sqlid) {
        
        var rows = ''
        
        const rowsForSnap = function (s, cssClass = '') {
          var rows = '', rowdata = ''
            var sql_waits = s.Waits.find(sql => sql.sql_id === sqlid);
            for (let i = 0; i < sql_waits.waits.length; i++) {
              rowdata = td(sql_waits.waits[i].event, cssClass) + td(sql_waits.waits[i].pct.toFixed(2) + '%', cssClass)
              rows = `${rows}\n${tr(rowdata)}`
            }
          return rows
        }
        
        if (Array.isArray(snap)) {
          
          if (typeof snap[0] === 'object' && typeof snap[1] === 'object') {
          
            var sql_waits1 = snap[0].Waits.find(sql => sql.sql_id === sqlid);
            var sql_waits2 = snap[1].Waits.find(sql => sql.sql_id === sqlid);
            
            const joinedWaits = [];

            for (const event1 of sql_waits1.waits) {
              const event2 = sql_waits2.waits.find((e) => e.event === event1.event);
      
              if (event2) {
                const joinedEvent = {
                  "event": event1.event,
                  "pct1": event1.pct,
                  "pct2": event2.pct
                };
      
                joinedWaits.push(joinedEvent);
              }
              else {
                const joinedEvent = {
                  "event": event1.event,
                  "pct1": event1.pct,
                  "pct2": undefined
                };
      
                joinedWaits.push(joinedEvent);
              }
            }
      
      
            for (const event2 of sql_waits2.waits) {
              const event1 = sql_waits1.waits.find((e) => e.event === event2.event);
      
              if (!event1) {
                const joinedEvent = {
                  "event": event2.event,
                  "pct1": undefined,
                  "pct2": event2.pct
                };
      
                joinedWaits.push(joinedEvent);
              }
            }

            var rows = '', rowdata = ''
            for (let i = 0; i < joinedWaits.length; i++) {
              rowdata = td(joinedWaits[i].event) +
                td((joinedWaits[i].pct1 === undefined ? '-' : joinedWaits[i].pct1.toFixed(2)) + '%') +
                td((joinedWaits[i].pct2 === undefined ? '-' : joinedWaits[i].pct2.toFixed(2)) + '%', 's2-r-bg') +
                td(compare(parseFloat(joinedWaits[i].pct1), parseFloat(joinedWaits[i].pct2)), 'c-r-bg')
    
              rows = `${rows}\n<tr>${rowdata}</tr>`
              }
          
          } else if (typeof snap[0] === 'object' && typeof snap[1] !== 'object') {
              rows = rowsForSnap(snap[0])
            
          } else if (typeof snap[0] !== 'object' && typeof snap[1] === 'object') {
              rows = rowsForSnap(snap[1], 's2-r-bg')
          }
          
        } else {
        
            var rows = rowsForSnap(snap)
        
        }
        
        if (rows.length > 0) {
          return `<table class='inline-table'><caption>Waits</caption>\n${rows}\n</table>`
        }
        else {
          return ''
        }
      }

      var caption = 'load'

      if (sortby === 'LOAD') {
        var sortedSQLs = sqls.slice().sort((a, b) => parseFloat(b.dbload1) - parseFloat(a.dbload1))
      }
      else if (sortby === 'IOREAD') {
        caption = 'read IO'
        var sortedSQLs = sqls.slice().sort((a, b) => {
          var val1 = 0,
            val2 = 0
          if (b.AdditionalMetrics) val1 = parseFloat(b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_read_per_sec.avg"] || b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_read_per_sec.avg"][0])
          if (a.AdditionalMetrics) val2 = parseFloat(a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_read_per_sec.avg"] || a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_read_per_sec.avg"][0])
          return val1 - val2
        })
      }
      else if (sortby === 'IOWRITE') {
        caption = 'write IO'
        var sortedSQLs = sqls.slice().sort((a, b) => {
          var val1 = 0,
            val2 = 0
          if (b.AdditionalMetrics) val1 = parseFloat(b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"] || b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"][0])
          if (a.AdditionalMetrics) val2 = parseFloat(a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"] || a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"][0])
          return val1 - val2
        })
      }
      else if (sortby === 'IO') {
        caption = '(read + write) IO'
        var sortedSQLs = sqls.slice().sort((a, b) => {
          var val1 = 0,
            val2 = 0
          if (b.AdditionalMetrics) val1 = parseFloat(b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"] || b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"][0]) + parseFloat(b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"] || b.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"][0])
          if (a.AdditionalMetrics) val2 = parseFloat(a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"] || a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"][0]) + parseFloat(a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"] || a.AdditionalMetrics["db.sql_tokenized.stats.shared_blks_written_per_sec.avg"][0])
          return val1 - val2
        })
      }

      const checkAdditionalMetrics = function (sqlObj, stat) {
        if ('AdditionalMetrics' in sqlObj && sqlObj.AdditionalMetrics !== undefined && sqlObj.AdditionalMetrics && stat in sqlObj.AdditionalMetrics) {
            return true
        } else {
            return false
        }
      }
      
      const toFixed = function (num) {
        return (typeof num === 'number') ? num.toFixed(2) : '-'
      }

      var rows = '', rowdata = '', rowdata1 = '', rowdata2 = '', rowdata3 = ''
      for (let i = 0; i < sortedSQLs.length; i++) {
        var sqlidHTML = `<a href="#S${sortedSQLs[i].sql_id}" class="sql-link">${sortedSQLs[i].sql_id}</a>`
        
        // Check if the sql is combined from two snapshots. If yes then group rows
        if (sortedSQLs[i].snap === 1 && sortedSQLs[i].dbload1 !== undefined && sortedSQLs[i].dbload2 !== undefined) {
          
          rowdata1 = td3(info_svg('grey') + `<div class="popup-window"><table class='inline-table no-border'><tr><td style="vertical-align: top;">${printMetrics(sortedSQLs[i].AdditionalMetrics)}</td><td style="vertical-align: top;">${printWaits([snap1, snap2], sortedSQLs[i].sql_id)}</td></tr></table></div>`, 'popup-container') +
            td(abbr(sortedSQLs[i].dbload1, 'load')) +
            td(abbr(sortedSQLs[i].pct_aas1 + '%', cD['pctAAS'])) +
            td(abbr(getCPUpct(snap1, sortedSQLs[i].sql_id) + '%', cD['pctCPU'])) + // pct CPU
            td(abbr(getIOpct(snap1, sortedSQLs[i].sql_id) + '%', cD['pctIO'])) + // pct IO waits
            td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.calls_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.calls_per_sec.avg'][0]) : '-', cD['callsPS'])) +
            td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.avg_latency_per_call.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.avg_latency_per_call.avg'][0]) : '-', cD['latPC'])) +
            td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.rows_per_call.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.rows_per_call.avg'][0]) : '-', cD['rowsPC'])) +
            td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.rows_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.rows_per_sec.avg'][0]) : '-', cD['rowsPS'])) +
            td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_hit_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_hit_per_sec.avg'][0]) : '-', cD['blksHitPS'])) +
            td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_read_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_read_per_sec.avg'][0]) : '-', cD['blksReadPS'])) +
            td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_written_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_written_per_sec.avg'][0]) : '-', cD['blksWritePS'])) +
            td(abbr(loadByDB(snap1, sortedSQLs[i].sql_id), cD['loadByDB'])) + // load by DB
            td(abbr(loadByUser(snap1, sortedSQLs[i].sql_id), cD['loadByUser'])) + // load by user
            td3(sqlidHTML) +
            td3(sortedSQLs[i].sql_statement.substring(0, 60))
            
          rowdata2 = 
            td(sortedSQLs[i].dbload2, 's2-r-bg') +
            td(sortedSQLs[i].pct_aas2 + '%', 's2-r-bg') +
            td(getCPUpct(snap2, sortedSQLs[i].sql_id) + '%', 's2-r-bg') + // pct CPU
            td(getIOpct(snap2, sortedSQLs[i].sql_id) + '%', 's2-r-bg') + // pct IO waits
            td(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.calls_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.calls_per_sec.avg'][1]) : '-', 's2-r-bg') +
            td(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.avg_latency_per_call.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.avg_latency_per_call.avg'][1]) : '-', 's2-r-bg') +
            td(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.rows_per_call.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.rows_per_call.avg'][1]) : '-', 's2-r-bg') +
            td(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.rows_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.rows_per_sec.avg'][1]) : '-', 's2-r-bg') +
            td(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_hit_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_hit_per_sec.avg'][1]) : '-', 's2-r-bg') +
            td(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_read_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_read_per_sec.avg'][1]) : '-', 's2-r-bg') +
            td(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_written_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_written_per_sec.avg'][1]) : '-', 's2-r-bg') +
            td(loadByDB(snap2, sortedSQLs[i].sql_id), 's2-r-bg') + // load by DB
            td(loadByUser(snap2, sortedSQLs[i].sql_id), 's2-r-bg') // load by user
        
          rowdata3 = 
            td(compare(sortedSQLs[i].dbload1, sortedSQLs[i].dbload2), 'c-r-bg') +
            td(compare(sortedSQLs[i].pct_aas1, sortedSQLs[i].pct_aas2), 'c-r-bg') +
            td(compare(getCPUpct(snap1, sortedSQLs[i].sql_id), getCPUpct(snap2, sortedSQLs[i].sql_id)), 'c-r-bg') + // pct CPU
            td(compare(getIOpct(snap1, sortedSQLs[i].sql_id), getIOpct(snap2, sortedSQLs[i].sql_id)), 'c-r-bg') + // pct IO waits
            td(compare(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.calls_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.calls_per_sec.avg'][0]) : undefined, checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.calls_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.calls_per_sec.avg'][1]) : undefined), 'c-r-bg') +
            td(compare(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.avg_latency_per_call.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.avg_latency_per_call.avg'][0]) : undefined, checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.avg_latency_per_call.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.avg_latency_per_call.avg'][1]) : undefined), 'c-r-bg') +
            td(compare(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.rows_per_call.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.rows_per_call.avg'][0]) : undefined, checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.rows_per_call.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.rows_per_call.avg'][1]) : undefined), 'c-r-bg') +
            td(compare(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.rows_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.rows_per_sec.avg'][0]) : undefined, checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.rows_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.rows_per_sec.avg'][1]) : undefined), 'c-r-bg') +
            td(compare(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_hit_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_hit_per_sec.avg'][0]) : undefined, checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_hit_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_hit_per_sec.avg'][1]) : undefined), 'c-r-bg') +
            td(compare(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_read_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_read_per_sec.avg'][0]) : undefined, checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_read_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_read_per_sec.avg'][1]) : undefined), 'c-r-bg') +
            td(compare(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_written_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_written_per_sec.avg'][0]) : undefined, checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_written_per_sec.avg') ? toFixed(sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_written_per_sec.avg'][1]) : undefined), 'c-r-bg') +
            td(compare(loadByDB(snap1, sortedSQLs[i].sql_id), loadByDB(snap2, sortedSQLs[i].sql_id)), 'c-r-bg') + // load by DB
            td(compare(loadByUser(snap1, sortedSQLs[i].sql_id), loadByUser(snap2, sortedSQLs[i].sql_id)), 'c-r-bg') // load by user
        
            rows = `${rows}\n<tr snapshot="1" sqlid="${sortedSQLs[i].sql_id}" >${rowdata1}</tr>\n<tr snapshot="2" sqlid="${sortedSQLs[i].sql_id}" >${rowdata2}</tr>\n<tr snapshot="diff" sqlid="${sortedSQLs[i].sql_id}" >${rowdata3}</tr>`
          
        } else {
        
        const bg = sortedSQLs[i].snap === 1 ? '' : 's2-r-bg'
        rowdata = td(info_svg('grey') + `<div class="popup-window"><table class='inline-table no-border'><tr><td style="vertical-align: top;">${printMetrics(sortedSQLs[i].AdditionalMetrics)}</td><td style="vertical-align: top;">${printWaits(sortedSQLs[i].snap === 1 ? snap1 : snap2, sortedSQLs[i].sql_id)}</td></tr></table></div>`, 'popup-container', bg) +
          td(abbr(sortedSQLs[i].snap === 1 ? sortedSQLs[i].dbload1 : sortedSQLs[i].dbload2, 'load'), bg) +
          td(abbr(sortedSQLs[i].snap === 1 ? sortedSQLs[i].pct_aas1 + '%' : sortedSQLs[i].pct_aas2 + '%', cD['pctAAS']), bg) +
          td(abbr(getCPUpct(sortedSQLs[i].snap === 1 ? snap1 : snap2, sortedSQLs[i].sql_id) + '%', cD['pctCPU']), bg) + // pct CPU
          td(abbr(getIOpct(sortedSQLs[i].snap === 1 ? snap1 : snap2, sortedSQLs[i].sql_id) + '%', cD['pctIO']), bg) + // pct IO waits
          td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.calls_per_sec.avg') ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.calls_per_sec.avg'].toFixed(2) : '-', cD['callsPS']), bg) +
          td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.avg_latency_per_call.avg') ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.avg_latency_per_call.avg'].toFixed(2) : '-', cD['latPC']), bg) +
          td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.rows_per_call.avg') ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.rows_per_call.avg'].toFixed(2) : '-', cD['rowsPC']), bg) +
          td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.rows_per_sec.avg') ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.rows_per_sec.avg'].toFixed(2) : '-', cD['rowsPS']), bg) +
          td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_hit_per_sec.avg') ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_hit_per_sec.avg'].toFixed(2) : '-', cD['blksHitPS']), bg) +
          td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_read_per_sec.avg') ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_read_per_sec.avg'].toFixed(2) : '-', cD['blksReadPS']), bg) +
          td(abbr(checkAdditionalMetrics(sortedSQLs[i], 'db.sql_tokenized.stats.shared_blks_written_per_sec.avg') ? sortedSQLs[i].AdditionalMetrics['db.sql_tokenized.stats.shared_blks_written_per_sec.avg'].toFixed(2) : '-', cD['blksWritePS']), bg) +
          td(abbr(loadByDB(sortedSQLs[i].snap === 1 ? snap1 : snap2, sortedSQLs[i].sql_id), cD['loadByDB']), bg) + // load by DB
          td(abbr(loadByUser(sortedSQLs[i].snap === 1 ? snap1 : snap2, sortedSQLs[i].sql_id), cD['loadByUser']), bg) + // load by user
          td(sqlidHTML, bg) +
          td(sortedSQLs[i].sql_statement.substring(0, 60), bg)
          
          rows = `${rows}\n<tr snapshot="${sortedSQLs[i].snap}" sqlid="${sortedSQLs[i].sql_id}" >${rowdata}</tr>`
        }
        

      }
      mainHTML = `
     <table style="width:initial">
      	   <caption>SQLs ordered by ${caption}</caption>
      	   ${tr(td('i')+td('load')+td('pctAAS')+td('pctCPU')+td('pctIO')+td('callsPS')+td('latPC')+td('rowsPC')+td('rowsPS')+td('blksHitPS')+td('blksReadPS')+td('blksWritePS')+td('loadByDB')+td('loadByUser')+td('sqlid')+td('text'), 'table-header')}
      	   ${rows}
     </table>
  `

      return mainHTML
    }


    const generateSQLTextsHTML = function(snap1, snap2, sqls) {
      var mainHTML = ''
      
      const sqlFullTexts1 = snap1.SQLTextFull
      const sqlFullTexts2 = snap2.SQLTextFull
      
      var rows = '', rowdata = '', bg = ''
      
    var snap1Version = parseInt(snapshotObject1.$META$.version.split(".").join(""))
    var snap2Version = parseInt(snapshotObject2.$META$.version.split(".").join(""))

     
     const getSQLText = function(sqlid, snapID) {
        var sqlTexts = snapID === 1 ? sqlFullTexts1 : sqlFullTexts2
        var sqlText = sqlTexts.find(sql => sql.sql_id === sqlid)
        if (sqlText) {
          return sqlText.sql_text_full.Value
        }
        else {
          return '-'
        }
      }
    
     const getSQLTextNew = function(sqlid, snapID) {
        var sqlTexts = snapID === 1 ? sqlFullTexts1 : sqlFullTexts2
        var sqlText = sqlTexts.find(sql => sql.sql_id_tokinized === sqlid)
        return sqlText
      }
    
            // #ag
            
    if (snap1Version < 204 && snap2Version < 204) {
      
      for (let i = 0; i < sqls.length; i++) {
        bg = sqls[i].snap === 2 ? 's2-r-bg' : ''
        rowdata = td(sqls[i].sql_id, bg) +
          td(sqls[i].sql_db_id, bg) +
          td(getSQLText(sqls[i].sql_id, sqls[i].snap), bg)

        rows = `${rows}\n<tr id="S${sqls[i].sql_id}">${rowdata}</tr>`

      }
        
      } else if (snap1Version >= 204 && snap2Version >= 204) {
    
            
         for (let i = 0; i < sqls.length; i++) {

           var sqlTexts1 = getSQLTextNew(sqls[i].sql_id, 1)
           var subrows1 = ''
           if (sqlTexts1) {
             for (let j = 0; j < sqlTexts1.sql_ids.length; j++) {
               subrows1 = `${subrows1}
                <tr>${td(sqlTexts1.sql_ids[j]["db.sql.id"]) + td(sqlTexts1.sql_ids[j]["db.sql.db_id"]) + td(sqlTexts1.sql_ids[j].sql_full_text) + td(sqlTexts1.sql_ids[j]["db.load.avg"])}</tr>
              `
             }
             subrows1 = "<table style=\"margin-left:15px\" class=\"no-shadow\"><tr><td>Snapshot 1: sqlid</td><td>db sqlid</td><td>full text</td><td>db load</td></tr>\n" + subrows1 + "</table>"
           }
           
           var sqlTexts2 = getSQLTextNew(sqls[i].sql_id, 2)
           var subrows2 = ''
           if (sqlTexts2) {
             for (let j = 0; j < sqlTexts2.sql_ids.length; j++) {
               subrows2 = `${subrows2}
                <tr>${td(sqlTexts2.sql_ids[j]["db.sql.id"]) + td(sqlTexts2.sql_ids[j]["db.sql.db_id"]) + td(sqlTexts2.sql_ids[j].sql_full_text) + td(sqlTexts2.sql_ids[j]["db.load.avg"])}</tr>
              `
             }
             subrows2 = "<table style=\"margin-left:15px\" class=\"s2-r-bg no-shadow\"><tr><td>Snapshot 2: sqlid</td><td>db sqlid</td><td>full text</td><td>db load</td></tr>\n" + subrows2 + "</table>"
           }

           bg = sqls[i].snap === 2 ? 's2-r-bg' : ''
           rowdata = `<tr rid="row${i}" id="S${sqls[i].sql_id}" class="${((sqlTexts1 && sqlTexts1.sql_ids.length > 0) || (sqlTexts2 && sqlTexts2.sql_ids.length > 0)) ? "clickable" : ""}">${td("<b>"+sqls[i].sql_id+"</b>", bg) + td("<b>"+sqls[i].sql_db_id+"</b>", bg) + td("<b>"+sqls[i].sql_statement+"</b>", bg)}</tr>`
           
           
           if ((sqlTexts1 && sqlTexts1.sql_ids.length > 0) || (sqlTexts2 && sqlTexts2.sql_ids.length > 0)) {
               rowdata = rowdata + `
               <tr srid="row${i}" class="hideable"><td colspan="3">
                 ${(sqlTexts1 && sqlTexts1.sql_ids.length > 0) ? subrows1 : ""}
                 ${(sqlTexts2 && sqlTexts2.sql_ids.length > 0) ? subrows2 : ""}
               </td></tr>
               `
             }
               
          rows = `${rows}\n${rowdata}`

         }
    
          
      } else {
          rows = `<tr><td colspan="3">Warning: No SQL full texts can be generated because of missmathing snapshot versions. Snapshot 1 version is ${snap1Version}, snapshot 2 version is ${snap2Version}.</td></tr>`
      }

      
      
      mainHTML = `
     <table style="width:initial" class="toggle-table">
      	   <caption>SQLs full text ${infoMessage(`By default, PostgreSQL databases truncate queries longer than 1,024 bytes. To increase the query size, change 
                 the track_activity_query_size parameter in the DB parameter group associated with your DB instance. When you 
                 change this parameter, a DB instance reboot is required.`)}</caption>
      	   ${tr(td('sqlid')+td('DB sqlid')+td('Text'), 'table-header')}
      	   ${rows}
     </table>
  `

      return mainHTML

    }

    
    var SQLsSortedByLoadHTML = generateSQLsHTML(snapshotObject1.SQLs, snapshotObject2.SQLs, sqls, 'LOAD')
    var SQLTextsHTML = generateSQLTextsHTML(snapshotObject1.SQLs, snapshotObject2.SQLs, sqls)

    var SQLsHTML = `<div>
    ${SQLsSortedByLoadHTML}
    ${generateSQLsHTML(snapshotObject1.SQLs, snapshotObject2.SQLs, sqls, 'IOREAD')}
    ${generateSQLsHTML(snapshotObject1.SQLs, snapshotObject2.SQLs, sqls, 'IOWRITE')}
    ${generateSQLsHTML(snapshotObject1.SQLs, snapshotObject2.SQLs, sqls, 'IO')}
    ${SQLTextsHTML}
    </div>
    `
    
/// SQL END

    if (genai) {
       var resp = await genAI.generateParallel([{section: 'compare_general_info', data: generalInformationHTML},
                                                {section: 'compare_nondef_params', data: nonDefParameters},
                                                {section: 'compare_wait_events', data: instanceActivityHTML + "\n" + waitEventsHTML, events: WaitEvents},
                                                {section: 'compare_static_metrics', data: staticMetricsHTML},
                                                {section: 'compare_additional_metrics', data: additionalMetricsHTML},
                                                {section: 'compare_instance_recommendations', data: instanceRecommendationsHTML},
                                                {section: 'compare_os_metrics', data: OSMetricsHTML},
                                                {section: 'compare_db_metrics', data: DBMetricsHTML}
                                       ]);

       var resp = await genAI.generate({section: 'compare_summary', sqls: SQLsSortedByLoadHTML, sqltext: SQLTextsHTML})
       //console.log(replaceSQLIDWithLink(genAI.getSection('compare_summary')))
       console.log('LLM tokens used:', genAI.getUsage())
    }

    if (genai) {
      var genAIanalyzesHTML = `
       <table style="background-color: aliceblue;" class="genai-table container-table">
        	   <caption style="background-color: aliceblue;"><span style="color: blue;">GenAI analyzes of the report</span>
        	   ${infoMessage(`CAUTION: LLM can make mistakes. Verify this analyzes.`)}
        	   </caption>
        	   <td>
        	      <div style="padding: 10px"><pre style="white-space: break-spaces;word-wrap: break-word;color: blue;font-weight: bold;">${replaceSQLIDWithLink(genAI.getSection('compare_summary'))}</pre></div>
        	   </td>
       </table>
       `
    } else {
      var genAIanalyzesHTML = ""
    }



// Log files section
    const generateLogFilesHTML = function(snap, snapID) {
      var mainHTML = ''
      const s2_r_bg = snapID === 1 ? '' : "s2-r-bg"
      const s2_c_color= snapID === 1 ? '' : "s2-c-color"
      const s2_h_color = snapID === 1 ? '' : "s2-h-color"

      var rows = '',  rowdata = ''
      for (let i = 0; i < snap.length; i++) {
        rowdata = td(snap[i].logfile) +
          td(snap[i].firstOccurrenceDate) +
          td(snap[i].count) +
          td(snap[i].message)

        rows = `${rows}\n<tr>${rowdata}</tr>`

      }
      mainHTML = `
     <table style="width:initial" class="${s2_r_bg}">
      	   <caption class="${s2_c_color}">Instance log files analysis</caption>
      	   ${tr(td('Logfile')+td('First occurrence')+td('Count')+td('Message'), 'table-header ' + s2_h_color)}
      	   ${rows}
     </table>
  `

      return mainHTML

    }



    var logFilesHTML1 = ''
    if (snapshotObject1.LogFileAnalysis) {
      if (snapshotObject1.LogFileAnalysis.length === 0) {
        logFilesHTML1 = `
     <table style="width:initial">
      	   <caption>Instance log files analysis</caption>
      	   ${tr(td(infoMessage('No rows matching the filters were found.')))}
     </table>
  `
      }
      else {
        logFilesHTML1 = generateLogFilesHTML(snapshotObject1.LogFileAnalysis, 1)
      }
    }
    
    var logFilesHTML2 = ''
    if (snapshotObject2.LogFileAnalysis) {
      if (snapshotObject2.LogFileAnalysis.length === 0) {
        logFilesHTML2 = `
     <table style="width:initial" class="s2-r-bg">
      	   <caption class="s2-c-color">Instance log files analysis</caption>
      	   ${tr(td(infoMessage('No rows matching the filters were found.')), 's2-h-color')}
     </table>
  `
      }
      else {
        logFilesHTML2 = generateLogFilesHTML(snapshotObject2.LogFileAnalysis, 2)
      }
    }
    
    var logFilesHTML = ''
    if (logFilesHTML1.length > 0 || logFilesHTML1.length > 0) {
      logFilesHTML = `<table class="container-table">
      <tr><td style="vertical-align: top">${logFilesHTML1}</td></tr>
      <tr><td style="vertical-align: top">${logFilesHTML2}</td></tr>
  </table>
    `
    }
    
    // Log files section end


   var snapshot1OptionsHTML = `
  <table style="width:initial">
   	   <caption>Snapshot 1 command line options</caption>
   	   <tr class="table-header">${td('Name')}${td('Value')}</tr>
  {{body}}
  </table>
  `
    var so1Body = ''
    for (const soKey in snapshotObject1.$META$.commandLineOptions) {
      if (snapshotObject1.$META$.commandLineOptions.hasOwnProperty(soKey)) {
        const soValue = snapshotObject1.$META$.commandLineOptions[soKey];
        so1Body = `${so1Body}\n${tr(td(soKey)+td(soValue))}`
      }
    }

    snapshot1OptionsHTML = snapshot1OptionsHTML.replace("{{body}}", so1Body);
    
  var snapshot2OptionsHTML = `
  <table style="width:initial" class="s2-r-bg">
   	   <caption class="s2-c-color">Snapshot 2 command line options</caption>
   	   <tr class="table-header s2-h-color">${td('Name')}${td('Value')}</tr>
  {{body}}
  </table>
  `
    var so2Body = ''
    for (const soKey in snapshotObject2.$META$.commandLineOptions) {
      if (snapshotObject2.$META$.commandLineOptions.hasOwnProperty(soKey)) {
        const soValue = snapshotObject2.$META$.commandLineOptions[soKey];
        so2Body = `${so2Body}\n${tr(td(soKey)+td(soValue))}`
      }
    }

    snapshot2OptionsHTML = snapshot2OptionsHTML.replace("{{body}}", so2Body);
    



    const htmlReport = `
  <!DOCTYPE html>
  <html>
  <body>
  <style>${htmlStyle}</style>
  <script>${htmlScript}</script>
  
  <div class="info-box" style="float:right"><b>Report creation time: </b>${getCurrDate()}</div>
  
  <table class="container-table"><tr>
  <td><table style="width:initial">
     	   <caption>Snapshot 1 [S1]</caption>
     	   <tr class="table-header">${td('Begin')}${td('End')}${td('Duration (min)')}</tr>
         ${tr(td(snapshotObject1.$META$.startTime)+td(snapshotObject1.$META$.endTime)+td(snapshotDurationMin1))}
    </table></td>
  <td><table style="width:initial" class="s2-r-bg">
     	   <caption class="s2-c-color">Snapshot 2 [S2]</caption>
     	   <tr class="table-header s2-h-color">${td('Begin')}${td('End')}${td('Duration (min)')}</tr>
         ${tr(td(snapshotObject2.$META$.startTime)+td(snapshotObject2.$META$.endTime)+td(snapshotDurationMin2))}
    </table></td>
  </tr>
  </table>
  
  <table class="container-table"><tr>
  <td style="vertical-align: top">${snapshot1OptionsHTML}</td>
  <td style="vertical-align: top">${snapshot2OptionsHTML}</td>
  </tr>
  </table>
  
  ${genAIanalyzesHTML}
  
  ${generalInformationHTML}
  ${nonDefParametersHTML}
  ${instanceActivityHTML}
  ${waitEventsHTML}
  ${metricsHTML}
  ${infoMessage(columnDescriptionsSQLs(), 'fit-content', 'top')}
  ${SQLsHTML}
  ${logFilesHTML}
  
  <p>Performance Insights Reporter v${global.version}.</p>
  
  </body>
  </html>
  `

    resolve(htmlReport)



  })
}





module.exports = {
  generateHTMLReport,
  generateCompareHTMLReport
};
