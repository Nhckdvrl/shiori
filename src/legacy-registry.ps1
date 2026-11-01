param([Parameter(Mandatory=$true)][string]$GameFolder,[Parameter(Mandatory=$true)][string]$DataFolder,[Parameter(Mandatory=$true)][string]$Drive)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$folder=(Resolve-Path -LiteralPath $GameFolder).Path
if(!(Test-Path -LiteralPath (Join-Path $folder 'AI5WIN.exe'))){throw 'Expected installed AI5WIN game'}
$backupFolder=Join-Path $DataFolder 'compatibility'
[System.IO.Directory]::CreateDirectory($backupFolder) | Out-Null
$backupFile=Join-Path $backupFolder 'kakyu2-registry-before.json'
$keyPath='Software\elf\KAKYU2'
if(!(Test-Path -LiteralPath $backupFile)){
 $existing=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($keyPath);$values=@{}
 if($existing){foreach($name in $existing.GetValueNames()){$values[$name]=@{value=$existing.GetValue($name);kind=$existing.GetValueKind($name).ToString()}};$existing.Dispose()}
 [System.IO.File]::WriteAllText($backupFile,(@{path=$keyPath;values=$values;existed=($null-ne$existing)}|ConvertTo-Json -Depth 6),[System.Text.UTF8Encoding]::new($false))
}
$entry=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($keyPath)
try{
 $entry.SetValue('InstPath',($folder.TrimEnd('\')+'\'),[Microsoft.Win32.RegistryValueKind]::String)
 $entry.SetValue('InstExec',(Join-Path $folder 'AI5WIN.EXE'),[Microsoft.Win32.RegistryValueKind]::String)
 $entry.SetValue('Drive',$Drive.TrimEnd('\'),[Microsoft.Win32.RegistryValueKind]::String)
 $entry.SetValue('Version',10000,[Microsoft.Win32.RegistryValueKind]::DWord)
 $entry.SetValue('InstComponent',1,[Microsoft.Win32.RegistryValueKind]::DWord)
 $entry.SetValue('InstallMedia',1,[Microsoft.Win32.RegistryValueKind]::DWord)
}finally{$entry.Dispose()}
[Console]::WriteLine('{"scope":"current-user","machineKeyChanged":false}')
