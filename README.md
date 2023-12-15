# PI Reporter
## The Performance Insights Reporter tool captures snapshots of PI data and generates reports for single snapshots or compared across time periods.

The PI Reporter is a tool designed to significantly streamline the process of performance troubleshooting, right-sizing, and cost optimization exercises. It captures snapshots of performance insights (PI) data and generates reports for specific time frame and compare periods report for easy comparison between two time periods. The tool's functionalities include:

* **Snapshot creation**: Capturing a snapshot of a specified time range, with the data stored in a JSON file.
* **HTML reports**: Generating HTML reports for individual snapshots and for comparison of two snapshots.

##### Some of the main benefits of the PI reporter are:

* In a few minutes get a report with all instance related information on one page. No need to go to different places and gather the data manually.
* Generate the compare period reports which are the most efficient and fast way to detect any changes in performance, workload, stats or configuration.
* Understand if the instance can handle the workload and if a right-sizing exercise is required for the instance.
* To provide instance, workload, and performance statistics to third parties like external support engineers or companies without giving them direct access to the system. This increases security while supplying the engineers with adequate information to make timely decisions.

##### Functional capabilities:

The following data will be gathered into the snapshot files and represented in the reports::
* Snapshot metadata
* General details about the Aurora/RDS instance, such as instance name, DB instance class, parameter group, backup retention, cluster identifier, multi-AZ configuration, number of vCPUs, network performance, and more.
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
./pireporter-linux --help
```

> Note: For security reasons you can also clone the repository and install `pkg` on a staging machine and build a packaged version yourself and then use it in your environment.

##### Security considerations

All the permissions required to run pireporter are read-only and include only the mandatory ones.  

The IAM policy pireporterPolicy.json is attached to this repository.

The database log files will be downloaded and scanned for error messages if the `--include-logfiles` option is used.

According to the policy, only instances and clusters with the Tag pireporter:allow (Key: pireporter Value: allow) can be accessed. That is why, use tagging to control which database instances can be accessed by the tool.


##### General considerations

###### PostgreSQL

For RDS PostgreSQL and Amazon Aurora with PostgreSQL compatibility, consider the following:

* Enable the `pg_stat_statements` extension to collect per-query statistics. This extension is enabled by default in Amazon Aurora with PostgreSQL compatibility.
* By default, PostgreSQL databases truncate queries longer than 1,024 bytes. To increase the logged query size, change the `track_activity_query_size` parameter in the DB parameter group associated with your database instance. When you change this parameter, an instance reboot is required. 
* By default, the `pg_stat_statements.track` parameter is set to the value `TOP`, which means only top-level queries will be captured. To capture all queries like ones running from inside stored functions and procedures, set this parameter to the value `ALL`.
* Important performance consideration! The `pg_stat_statements` extension uses a hash table in memory to store the query statistics. If there are more unique queries than available memory, then a locking mechanism will kick in which can lead to contention and performance problems. The `pg_stat_statements.max` parameter controls the maximum number of unique statements that can be stored in memory. The default value is 5000. If you have more unique queries, set this accordingly. For example, if you estimate ~6000 unique queries, set it to 10000 to be safe.
* Also, `blk_read_time` and `blk_write_time` are collected only when the additional `track_io_timing` parameter is enabled.


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
                                 Default is 30.                                 
  -m, --comment string           Provide a comment to associate with the        
                                 snapshot.                                      
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

##### Examples

1. Create a snapshot inlclude logfile analysis                                                                                                                      
    `$ pireporter --create-snapshot --start-time 2023-08-02T16:50 --end-time 2023-08-02T17:50 -i apginst1 --include-logfiles -m "High load period"`
2. Create a report from snapshot                                                                                                                                    
    `$ pireporter --create-report --snapshot snapshot_apg-bm_20230802145000_20230802155000.json`
3. Create a compare periods report                                                                                                                                  
    `$ pireporter --create-compare-report --snapshot snapshot_apg-bm_20230704150700_20230704194900.json --snapshot2 snapshot_apg-bm_20230619100000_20230619113000.json`


[pkg]: <https://github.com/vercel/pkg>
