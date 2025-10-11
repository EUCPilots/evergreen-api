$Auth = Get-Content -Raw -Path "./auth.json" | ConvertFrom-Json

Import-Module AWSPowerShell.NetCore
$Credentials = New-Object -TypeName "Amazon.Runtime.BasicAWSCredentials"($Auth.AccessKey, $Auth.SecretKey)

$Config = New-Object -TypeName "Amazon.S3.AmazonS3Config"
$Config.ServiceURL = $Auth.Endpoint
$Config.ForcePathStyle = $true
$S3Client = New-Object -TypeName "Amazon.S3.AmazonS3Client"($Credentials, $Config)

$ListRequest = New-Object -TypeName "Amazon.S3.Model.ListObjectsV2Request"
$ListRequest.BucketName = $Auth.Bucket
$ListRequest.Prefix = "logs/$(Get-Date -Format yyyy-MM-dd)/"

$ListResponse = $S3Client.ListObjectsV2Async($ListRequest).Result
# $ListResponse.S3Objects | ForEach-Object { $_.Key }
$Logs = foreach ($Object in $ListResponse.S3Objects) {
    $GetRequest = New-Object Amazon.S3.Model.GetObjectRequest
    $GetRequest.BucketName = $Auth.Bucket
    $GetRequest.Key = $Object.Key

    $GetResponse = $S3Client.GetObjectAsync($GetRequest).Result

    # Read the object’s content as text
    $Reader = New-Object -TypeName "System.IO.StreamReader"($GetResponse.ResponseStream)
    $Content = $Reader.ReadToEnd()
    $Reader.Close()
    $Content | ConvertFrom-Json
}
$Logs | Select-Object -Property path, connectingIp, country, region, asOrganisation, userAgent | Format-Table -AutoSize
