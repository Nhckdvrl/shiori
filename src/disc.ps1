param([ValidateSet('ensure','inspect','release')][string]$Mode='ensure',[string]$IsoPath,[string]$GamePath,[int]$IgnorePid=0,[switch]$PreferOwn)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
try {
  $drives=@([System.IO.DriveInfo]::GetDrives() | Where-Object DriveType -eq 'CDRom')
  if ($Mode -eq 'inspect') {
    $attached=$false
    if($IsoPath -and (Test-Path -LiteralPath $IsoPath)){$image=Get-DiskImage -ImagePath $IsoPath -ErrorAction SilentlyContinue;if($image){$attached=[bool]$image.Attached}}
    @{drives=@($drives | ForEach-Object Name);attached=$attached} | ConvertTo-Json -Compress; exit 0
  }
  if (!$IsoPath -or [IO.Path]::GetExtension($IsoPath) -ne '.iso') { throw 'Invalid compatibility image path' }
  $ownImage=Get-DiskImage -ImagePath $IsoPath -ErrorAction SilentlyContinue
  if($Mode -eq 'release'){
    if(!$ownImage -or !$ownImage.Attached){@{ok=$true;unmounted=$false}|ConvertTo-Json -Compress;exit 0}
    # Only our image is eligible. Keep it while a game/compatibility launcher
    # still uses it, including when the main launcher has already exited.
    $users=@(Get-CimInstance Win32_Process | Where-Object {
      $_.ProcessId -ne $IgnorePid -and (
        ($GamePath -and $_.ExecutablePath -eq $GamePath) -or
        ($_.Name -like 'ShioriLegacy-*.exe' -and $_.CommandLine -and $_.CommandLine.Contains($IsoPath))
      )
    })
    if($users.Count){@{ok=$true;unmounted=$false;inUse=$true}|ConvertTo-Json -Compress;exit 0}
    if($ownImage -and $ownImage.Attached){Dismount-DiskImage -ImagePath $IsoPath | Out-Null}
    @{ok=$true;unmounted=$true}|ConvertTo-Json -Compress;exit 0
  }
  if($ownImage -and $ownImage.Attached){
    $volume=$ownImage | Get-Volume -ErrorAction SilentlyContinue | Select-Object -First 1
    $drive=if($volume.DriveLetter){$volume.DriveLetter+':\'}elseif($drives.Count){$drives[0].Name}else{''}
    @{ok=$true;mounted=$false;managed=$true;drive=$drive;isoPath=$IsoPath}|ConvertTo-Json -Compress;exit 0
  }
  # This engine only needs an enumerated optical drive, not a particular game disc.
  if ($drives.Count -gt 0 -and !$PreferOwn) { @{ok=$true; mounted=$false; managed=$false; drive=$drives[0].Name} | ConvertTo-Json -Compress; exit 0 }
  if (!(Test-Path -LiteralPath $IsoPath)) {
    $parent=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($IsoPath))
    [IO.Directory]::CreateDirectory($parent) | Out-Null
    $content=Join-Path $parent 'disc-content'
    [IO.Directory]::CreateDirectory($content) | Out-Null
    [IO.File]::WriteAllText((Join-Path $content 'README.TXT'),'Shiori compatibility data disc. This contains no game data. It supplies an optical drive for legacy software.',[Text.Encoding]::ASCII)
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class ShioriIsoWriter {
 public static void Save(object image, string file) {
  IStream stream=(IStream)image;
  IntPtr read=Marshal.AllocHGlobal(4);
  try { using(FileStream output=new FileStream(file,FileMode.Create,FileAccess.Write)) {
   byte[] buffer=new byte[65536];
   while(true) { stream.Read(buffer,buffer.Length,read); int count=Marshal.ReadInt32(read); if(count<=0)break; output.Write(buffer,0,count); }
  }} finally { Marshal.FreeHGlobal(read); }
 }
}
'@
    $image=New-Object -ComObject IMAPI2FS.MsftFileSystemImage
    $image.FileSystemsToCreate=1
    $image.VolumeName='SHIORI_COMPAT'
    $image.Root.AddTree($content,$false)
    $result=$image.CreateResultImage()
    [ShioriIsoWriter]::Save($result.ImageStream,$IsoPath)
  }
  Mount-DiskImage -ImagePath $IsoPath -Access ReadOnly -PassThru | Out-Null
  $drives=@([System.IO.DriveInfo]::GetDrives() | Where-Object DriveType -eq 'CDRom')
  if(!$drives.Count){throw 'The compatibility image was mounted but no optical drive appeared'}
  @{ok=$true; mounted=$true; managed=$true; drive=$drives[0].Name;isoPath=$IsoPath} | ConvertTo-Json -Compress
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
