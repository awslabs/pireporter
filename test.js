const { EC2Client, DescribeInstanceTypesCommand } = require("@aws-sdk/client-ec2"); // CommonJS import
const client = new EC2Client({apiVersion: '2016-11-15', region: "eu-central-1"});
const input = { // DescribeInstanceTypesRequest
  InstanceTypes: [ // RequestInstanceTypeList
    "r6g.xlarge"
  ]
};
const command = new DescribeInstanceTypesCommand(input);

async function main() {
   const response = await client.send(command);
   console.log('Res', JSON.stringify(response.InstanceTypes[0].NetworkInfo, null, 2));
   var a = response.InstanceTypes[0].NetworkInfo.NetworkCards.reduce((acc, val) => {return acc + val.PeakBandwidthInGbps}, 0);
   console.log(a);
}

main()