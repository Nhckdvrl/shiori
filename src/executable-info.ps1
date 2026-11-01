$ErrorActionPreference='SilentlyContinue'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$paths=ConvertFrom-Json ([Console]::In.ReadToEnd())
$rows=@(foreach($file in $paths){try{$v=[Diagnostics.FileVersionInfo]::GetVersionInfo($file);@{path=$file;productName=$v.ProductName;description=$v.FileDescription;company=$v.CompanyName;version=$v.ProductVersion}}catch{}})
ConvertTo-Json -InputObject $rows -Compress -Depth 3
