[CmdletBinding(SupportsShouldProcess = $false)]
param(
    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [System.String] $Path = "logs/$(Get-Date -Format yyyy-MM-dd)/"
)

# Configure the environment
$ErrorActionPreference = [System.Management.Automation.ActionPreference]::Stop
$InformationPreference = [System.Management.Automation.ActionPreference]::Continue
$ProgressPreference = [System.Management.Automation.ActionPreference]::SilentlyContinue
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072

Write-Information -MessageData "$($PSStyle.Foreground.Cyan)Read auth file: auth.json"
$Auth = Get-Content -Raw -Path "./auth.json" | ConvertFrom-Json

Write-Information -MessageData "$($PSStyle.Foreground.Cyan)Import AWSPowerShell.NetCore module"
Import-Module -Name "AWSPowerShell.NetCore"

Write-Information -MessageData "$($PSStyle.Foreground.Cyan)Authenticate to Cloudflare R2 bucket"
$Credentials = New-Object -TypeName "Amazon.Runtime.BasicAWSCredentials"($Auth.AccessKey, $Auth.SecretKey)
$Config = New-Object -TypeName "Amazon.S3.AmazonS3Config"
$Config.ServiceURL = $Auth.Endpoint
$Config.ForcePathStyle = $true
$S3Client = New-Object -TypeName "Amazon.S3.AmazonS3Client"($Credentials, $Config)

Write-Information -MessageData "$($PSStyle.Foreground.Cyan)Configure request"
$ListRequest = New-Object -TypeName "Amazon.S3.Model.ListObjectsV2Request"
$ListRequest.BucketName = $Auth.Bucket

Write-Information -MessageData "$($PSStyle.Foreground.Cyan)Using prefix: $Path"
$ListRequest.Prefix = $Path

Write-Information -MessageData "$($PSStyle.Foreground.Cyan)Retrieve log files from: $($Auth.Bucket)/$Path"
$ListResponse = $S3Client.ListObjectsV2Async($ListRequest).Result

Write-Information -MessageData "$($PSStyle.Foreground.Cyan)Found $($ListResponse.S3Objects.Count) log files"
Write-Information -MessageData "$($PSStyle.Foreground.Cyan)Reading log files$($PSStyle.Reset)"
$Logs = $ListResponse.S3Objects | ForEach-Object {
    $GetRequest = New-Object -TypeName "Amazon.S3.Model.GetObjectRequest"
    $GetRequest.BucketName = $Auth.Bucket
    $GetRequest.Key = $_.Key
    $GetResponse = $S3Client.GetObjectAsync($GetRequest).Result

    # Read the object’s content as text
    $Reader = New-Object -TypeName "System.IO.StreamReader"($GetResponse.ResponseStream)
    $Content = $Reader.ReadToEnd()
    $Reader.Close()
    if ($Content -notmatch "EvergreenAPI_Tests|Rate-Limit-Test|GitHub-Actions-Performance-Test|Security-Test") { $Content | ConvertFrom-Json }
}
$Logs | Sort-Object -Property timestamp -Descending | `
Select-Object -Property path, connectingIp, country, region, asOrganisation, userAgent | Format-Table -AutoSize
