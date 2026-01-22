# PI Reporter
## The Performance Insights Reporter tool captures snapshots of PI data and generates reports for single snapshots or comparisons across time periods. It uses an agentic approach to analyze reports using LLMs and identify problems and provide recommendations.

The PI Reporter is a tool designed to significantly streamline the process of performance troubleshooting, right-sizing, and cost optimization exercises. It captures snapshots of performance insights (PI) data and generates reports for specific time frame and compare periods report for easy comparison between two time periods. The tool's functionalities include:

* **Snapshot creation**: Capturing a snapshot of a specified time range, with the data stored in a JSON file.
* **HTML reports**: Generating HTML reports for individual snapshots and for comparison of two snapshots.


### New major version 3.0 released

New major version adds interactive chat capability to the AI analyzes mode. Now you can chat with your reports. The LLM model with strong reasoning capability Claude Opus 4.5 is used as the main model. The model selection is configurable in the `conf.json` configuration file. Chat mode also supports MCP integrations (disabled by default); AWS documentation MCP server is pre-configured, and a postgres MCP server template is included in `mcp.json`. Check the interactive chat section for more details.


### Version 2.0

The main feature of this version is integration with Amazon Bedrock to leverage the power of the LLMs like Claude or Amazon Nova models for analyzing single snapshot and comparing snapshot reports, generating detailed report with summary (including root cause analysis) and recommendations for all sections of the report. This will significantly help and save time during troubleshooting and report reading.

GenAI analyses can be optionally enabled during the report generation phase. The new attribute `--ai-analyzes` has been introduced for this purpose.

Claude 3.5 Sonnet v2 model over cross-region inference is used by default. Other models like Claude 3 Opus or Amazon Nova can be used.

The `pireporterPolicy.json` file now includes a section that allows the `InvokeModel` action on the Claude 3.5 Sonnet v2 and other big models. You can change the model in the `conf.js` configuration file, you can use also inference profile ID of the cross-region inference. Make sure that the model you are trying to use is part of policy.

Be aware that using `--ai-analyzes` will incur additional charges. The tool will always print out the number of input and output tokens used to accomplish the analyses. It will help you estimate the cost.

Example:
```sh
$ ./pireporter --create-report --snapshot snapshot_apg-bm_20240424070000_20240424080000.json --ai-analyzes
LLM tokens used: { input_tokens: 35422, output_tokens: 6101 }
```

In the new `conf.json` file, some parameters related to GenAI, such as the AWS region and model ID, can be configured.

A new section named "GenAI Analyses of the Report" will appear at the top of the report. Check the screenshot below for an example.

Additionally, the comments associated with snapshots using the `-m` command-line argument will be considered by the LLM during analyzes. This provides a way to give the LLM a hint about a particular period or to include your observations, such as "Applications were hanging, and no DML transactions could be completed." You can always update the snapshot JSON file to change or add comments.


##### Some of the main benefits of the PI reporter are:

* In a few minutes get a report with all instance related information on one page. No need to go to different places and gather the data manually.
* Generate the compare period reports which are the most efficient and fast way to detect any changes in performance, workload, stats or configuration.
* Understand if the instance can handle the workload and if a right-sizing exercise is required for the instance.
* To provide instance, workload, and performance statistics to third parties like external support engineers or companies without giving them direct access to the system. This increases security while supplying the engineers with adequate information to make timely decisions.
* LLM analysis of the report, including root cause identification and recommendations.
* Interactive chat mode to ask questions about your reports and explore performance data conversationally.

##### Functional capabilities:

The following data will be gathered into the snapshot files and represented in the reports:
* Snapshot metadata
* General details about the Amazon Aurora instance, such as instance name, DB instance class, parameter group, backup retention, cluster identifier, multi-AZ configuration, number of vCPUs, network performance, and more.
* Non-default parameters
* Instance activity statistics: Average Active Sessions, DBTime, wall clock time
* Top wait events during the snapshot period, indicating time spent and percentage of DBTime
* Operating system metrics, presented as either sum of values, average, minimum, or maximum values
* Database metrics, presented as sum, average, minimum, or maximum values
* Additional metrics derived from other statistics, such as tuples returned to tuples fetched ratio, actual network traffic as a percentage of instance limits, and comparisons to instance baseline network usage
* Instance recommendations: Based on workload analysis, the tool assesses the suitability of the current instance size and suggests up to three alternative instances that may better handle the workload. It presents the instance characteristics and percentage price difference compared to the current instance type for the recommendations. These recommendations serve as a starting point for further analysis, but do not constitute a final instance sizing decision.
* Metric correlations: Identifies metrics that exhibit similar highs and lows over time.
* SQL Insights: Presents top SQL queries ranked by load, read I/O, write I/O, and combined read-write I/O. Each SQL entry includes various statistics, additional information from pg_stat_statements, and wait events. It also displays the distribution of SQL load across different databases and users.
* Log File Analysis: The tool downloads and analyzes log files from the snapshot period, grouping and displaying error or fatal messages in the report if any are found.
* Compare Period Report: Enables comparison between two snapshots to quickly identify differences in metrics and SQL performance.
* GenAI analysis of the report with summary of the possible root cause and recommendations.
* Interactive chat mode: Ask follow-up questions about your reports, explore correlations, and get deeper insights through natural language conversation with the LLM.

##### Screenshots

General information section:

![Screen 1](screenshots/screen1.png)

Metrics calculated from other metrics and workload analysis section:

![Screen 2](screenshots/screen2.png)

Next are parts of the compare periods report, where yellow represents snapshot 1 data, teal blue snapshot 2 data and green the difference.

Difference between two metrics represtend in three forms, for example `+7.81 [1.1x|13%]` provides three values:

* 7.81 represents the absolute difference or increase in the numerical value of the metric being compared.

* 1.1x represents the factor by which the metric has increased. So 1.1x means the new value is 1.1 times higher the previous value.

* 13% is the percentage increase in the metric's value.

So in this case, the metric increased by an absolute value of 7.81 units, which is a 1.1x or 13% increase over the previous value. The 7.81, 1.1x, and 13% all represent the same increase, just expressed in different ways (absolute, factor, and percentage respectively).

![Screen 3](screenshots/screen3.png)

![Screen 4](screenshots/screen4.png)


GenAI analyzes of the report:

![Screen 5](screenshots/screen5.png)

##### How to use

PI Reporter was tested on Linux x86. To run the tool, you can start an EC2 instance with any x86 Linux OS. 

Create an IAM Policy called pireporterPolicy.json which is part of this repository. You can modify the policy to add additional conditions if needed. Then, tag the database instance you plan to use with a tag that has the key `pireporter` and value `allow`.  

Attach the pireporterPolicy to the instance role of the EC2 instance where you plan to run the tool.

There are two options to run pireporter:

1. Clone this repo to local host and use node.js to execute the pireporter.js script. It requires connection to npm repositories and installation of packages and node.js itself.

```sh
cd pireporter
npm install
node pireporter.js --help
```

2. Use the portable packaged version which do not require any installations. The packaged version was created using [pkg] which is open-source tool published under MIT License.

```sh
cd portable
./pireporter --help
```

> Note: For security reasons you can also clone the repository and install `pkg` on a staging machine and build a packaged version yourself and then use it in your environment.

Consider that you can execute PIreporter from any Linux host located outside of AWS. For example, the access key and secret key can be stored in the shared credentials file `~/.aws/credentials`. The AWS SDK used in PIreporter will automatically read it on load. For sure, the PIreporter policy must be attached to the IAM entity to which the access key applies.


##### AWS Region

The AWS Region will be automatically set to the region of the hosting EC2 instance, based on instance metadata retrieved through IMDSv2. You can overwrite this by setting the AWS_REGION environment variable to the desired value.

##### Security considerations

All the permissions required to run pireporter are read-only and include only the mandatory ones.  

The IAM policy pireporterPolicy.json is attached to this repository.

The database log files will be downloaded and scanned for error messages if the `--include-logfiles` option is used.

According to the policy, only instances and clusters with the Tag pireporter:allow (Key: pireporter Value: allow) can be accessed. That is why, use tagging to control which database instances can be accessed by the tool.

Consider that the provided policy file can be modified by you. If you do not want to have a condition that checks for Tags, you can remove it before creating the policy or at any time afterward.



##### General considerations

###### PostgreSQL

For RDS PostgreSQL and Amazon Aurora with PostgreSQL compatibility, consider the following:

* Enable the `pg_stat_statements` extension to collect per-query statistics. This extension is enabled by default in Amazon Aurora with PostgreSQL compatibility.
* By default, PostgreSQL databases truncate queries longer than 1,024 bytes. To increase the logged query size, change the `track_activity_query_size` parameter in the DB parameter group associated with your database instance. When you change this parameter, an instance reboot is required. 
* By default, the `pg_stat_statements.track` parameter is set to the value `TOP`, which means only top-level queries will be captured. To capture all queries like ones running from inside stored functions and procedures, set this parameter to the value `ALL`.
* Important performance consideration! The `pg_stat_statements` extension uses a hash table in memory to store the query statistics. If there are more unique queries than available memory, then a locking mechanism will kick in which can lead to contention and performance problems. The `pg_stat_statements.max` parameter controls the maximum number of unique statements that can be stored in memory. The default value is 5000. If you have more unique queries, set this accordingly. For example, if you estimate ~6000 unique queries, set it to 10000 to be safe.
* Also, `blk_read_time` and `blk_write_time` are collected only when the additional `track_io_timing` parameter is enabled.

If the snapshot start time and end time differs from the time you provided on command line, then make sure that the timezon of the host and the Amazon Aurora instance are same.

Check timezone on the host where you execute `pireporter`:
```
$ timedatectl | grep "Time zone"
       Time zone: Europe/Berlin (CET, +0100)
```
Then connect to the Amazon Aurora instance and check timezone related parameter, in case of PostgreSQL it will be `timezone`:
```
postgres=> show timezone;
   TimeZone
---------------
 Europe/Berlin
(1 row)
```
In both cases we have `Europe/Berlin` timezone. If you have differnt values, then you need to adjust the timezone of the host.


##### Synopsis
```sh
  $ pireporter --create-snapshot --rds-instance name --start-time YYYY-MM-DDTHH:MM --end-time YYYY-MM-DDTHH:MM [--comment text] [--include-logfiles] 
  $ pireporter --create-report --snapshot snapshot_file                                                                                              
  $ pireporter --create-compare-report --snapshot snapshot_file --snapshot2 snapshot_file                                                            
  $ pireporter --do-estimation --rds-instance name --start-time YYYY-MM-DDTHH:MM --end-time YYYY-MM-DDTHH:MM                                         
  $ pireporter --help                                                                                                                                
```

##### Command line options
```sh
  -h, --help                     Display this usage guide.                      
  -i, --rds-instance string      The RDS instance name to create snapshot.      
  -s, --create-snapshot          Create snapshot.                               
  --start-time string            Snapshot start time. Allowed format is ISO     
                                 8601 "YYYY-MM-DDTHH:MM". Seconds will be       
                                 ignored if provided.                           
  --end-time string              Snapshot end time. Same format as for start    
                                 time.                                          
  --res-reserve-pct number       Specify the percentage of additional resources 
                                 to reserve above the maximum metrics when      
                                 generating instance type recommendations.      
                                 Default is 15.
  --use-2sd-values               To calculate the required resource for the     
                                 workload, consider the average value plus 2    
                                 standard deviations (SDs). By default the      
                                 maximum usage is used.
  -m, --comment string           Provide a comment to associate with the        
                                 snapshot.
  -a, --ai-analyzes              When generating reports, include the analysis  
                                 from the large language model (Amazon Bedrock), 
                                 which provides its findings, analysis, and 
                                 recommendations. This option works with create 
                                 report and create compare periods report.
  --chat                         Enter interactive chat mode after generating   
                                 the report. Requires --ai-analyzes. Allows     
                                 asking follow-up questions about the report.                             
  -r, --create-report            Create HTML report for snapshot.               
  -c, --create-compare-report    Create compare snapshots HTML report for two   
                                 snapshots.                                     
  --snapshot string              Snapshot JSON file name.                       
  --snapshot2 string             Second snapshot JSON file name to compare.     
  --include-logfiles             Instance log files will be scanned for errors  
                                 or critical messages within the provided time  
                                 range. This operation can be time-consuming    
                                 and resource-intensive.                        
```

### Interactive Chat Mode

The `--chat` option enables an interactive conversation mode where you can ask follow-up questions about your performance report. This feature requires the `--ai-analyzes` flag.

```sh
$ pireporter --create-report --snapshot snapshot_file.json --ai-analyzes --chat
```

In chat mode, you can:
- Ask questions about wait events, SQL performance, metrics, and configuration
- Request deeper analysis of specific issues identified in the report
- Get recommendations for optimization
- Include file contents in your questions using the `@filename` decorator
- Save the conversation as a markdown report for documentation or sharing

Type `exit` or `quit` to end the chat session.

The LLM is provided with local tools responsible for different parts of the snapshot (or snapshots in case of compare period analysis). This enables the LLM to request different metrics, configuration information, and SQLs. The compressed engine-related knowledge and initial deep analysis summary are injected into the LLM's system prompt.

In chat mode, a summary of the initial deep analysis and recommendations is displayed, and then the chat prompt appears.

First read the summary and then ask your clarifying questions.

The tool implements continuous message compression without losing meaning, which allows for a much larger context and longer discussions before emergency summarization kicks in.

### MCP (Model Context Protocol) Support

PIreporter supports MCP tools for extended functionality in chat mode. MCP allows the LLM to access external tools like AWS documentation search or direct database queries.

To enable MCP:

1. Set `mcpEnabled` to `true` in `conf.json`:
```json
{
    "mcpEnabled": { "value": true, "description": "Enable MCP tools for chat mode" }
}
```

2. Configure MCP servers in `mcp.json`:
```json
{
  "mcpServers": {
    "aws-documentation": {
      "command": "uvx",
      "args": ["awslabs.aws-documentation-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "enabled": true,
      "description": "AWS Documentation search for accurate AWS recommendations"
    },
    "postgres": {
      "command": "uvx",
      "args": ["mcp-server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:password@localhost:5432/dbname"
      },
      "enabled": false,
      "description": "PostgreSQL database query tool"
    }
  }
}
```

MCP servers require `uvx` (from the `uv` Python package manager). Install it with:
```sh
pip install uv
```

When MCP is enabled, the chat welcome message will show the number of external tools available. The LLM can then use these tools to search AWS documentation, query databases directly, or access other external resources.

Note: MCP requires internet access for some tools. Set `mcpEnabled` to `false` in environments without internet connectivity.

### Chat Mode Examples

Chat welcome screen showing example questions and usage instructions:

![Chat welcome screen](screenshots/screen8.png)

Asking for SQL correlation analysis - the LLM generates visualizations showing resource attribution by SQL and provides actionable recommendations:

![SQL impact visualization and recommendations](screenshots/screen6.png)

Key insights with workload impact flow diagram, healthy correlations observed, and recommendations:

![Key insights and correlations](screenshots/screen7.png)

Using the `@filename` decorator to load a file containing SQL and execution plan for analysis:

![File decorator for SQL analysis](screenshots/screen9.png)

Saving the conversation as a markdown report for documentation or sharing, just ask Assistant to save it:

![Save conversation report](screenshots/screen10.png)


##### Examples

1. Create a snapshot inlclude logfile analysis                                                                                                                      
    `$ pireporter --create-snapshot --start-time 2023-08-02T16:50 --end-time 2023-08-02T17:50 -i apginst1 --include-logfiles -m "High load period"`
2. Create a report from snapshot                                                                                                                                    
    `$ pireporter --create-report --snapshot snapshot_apg-bm_20230802145000_20230802155000.json`
3. Create a report with AI analysis                                                                                                                                 
    `$ pireporter --create-report --snapshot snapshot_apg-bm_20230802145000_20230802155000.json --ai-analyzes`
4. Create a report with AI analysis and enter interactive chat mode                                                                                                 
    `$ pireporter --create-report --snapshot snapshot_apg-bm_20230802145000_20230802155000.json --ai-analyzes --chat`
5. Create a compare periods report                                                                                                                                  
    `$ pireporter --create-compare-report --snapshot snapshot_apg-bm_20230704150700_20230704194900.json --snapshot2 snapshot_apg-bm_20230619100000_20230619113000.json`
6. Create a compare periods report with AI analysis and chat mode                                                                                                   
    `$ pireporter --create-compare-report --snapshot snapshot1.json --snapshot2 snapshot2.json --ai-analyzes --chat`



[pkg]: <https://github.com/vercel/pkg>
