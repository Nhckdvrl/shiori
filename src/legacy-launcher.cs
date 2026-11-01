using System;
using System.IO;
using System.Text;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
internal static class ShioriLegacyLauncher {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct StartupInfo {
  public int size;public string reserved,desktop,title;public int x,y,width,height,xChars,yChars,fill,flags;public short show,reservedSize;public IntPtr reservedData,input,output,error;
 }
 [StructLayout(LayoutKind.Sequential)]struct ProcessInfo {public IntPtr process,thread;public uint pid,tid;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcess(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr environment,string cwd,ref StartupInfo startup,out ProcessInfo process);
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr VirtualAllocEx(IntPtr process,IntPtr address,UIntPtr size,uint type,uint protection);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool WriteProcessMemory(IntPtr process,IntPtr address,byte[] data,UIntPtr size,out UIntPtr written);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi)]static extern IntPtr GetModuleHandle(string name);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi,ExactSpelling=true)]static extern IntPtr GetProcAddress(IntPtr module,string name);
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr CreateRemoteThread(IntPtr process,IntPtr attributes,UIntPtr stack,IntPtr start,IntPtr parameter,uint flags,IntPtr tid);
 [DllImport("kernel32.dll")]static extern uint WaitForSingleObject(IntPtr handle,uint time);
 [DllImport("kernel32.dll")]static extern bool GetExitCodeThread(IntPtr thread,out uint code);
 [DllImport("kernel32.dll")]static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll")]static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll")]static extern bool VirtualFreeEx(IntPtr process,IntPtr memory,UIntPtr size,uint type);
 static int Main(string[] args){
  string log=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"legacy-launch.log");
  ProcessInfo child=new ProcessInfo();IntPtr injectedThread=IntPtr.Zero,memory=IntPtr.Zero;bool running=false;
  try{
   if(args.Length!=2&&args.Length!=4)throw new ArgumentException("Expected AI5WIN.exe and the compatibility DLL");
   string exe=Path.GetFullPath(args[0]),dll=Path.GetFullPath(args[1]);
   if(!File.Exists(exe)||!File.Exists(dll)||!String.Equals(Path.GetFileName(exe),"AI5WIN.exe",StringComparison.OrdinalIgnoreCase))throw new ArgumentException("Unsupported installed legacy game");
   StartupInfo startup=new StartupInfo();startup.size=Marshal.SizeOf(typeof(StartupInfo));startup.flags=1;startup.show=1;
   if(!CreateProcess(exe,new StringBuilder("\""+exe+"\""),IntPtr.Zero,IntPtr.Zero,false,4,IntPtr.Zero,Path.GetDirectoryName(exe),ref startup,out child))throw new Win32Exception();
   byte[] data=Encoding.Unicode.GetBytes(dll+"\0");
   memory=VirtualAllocEx(child.process,IntPtr.Zero,(UIntPtr)data.Length,0x3000,4);
   UIntPtr written;if(memory==IntPtr.Zero||!WriteProcessMemory(child.process,memory,data,(UIntPtr)data.Length,out written))throw new Win32Exception();
   injectedThread=CreateRemoteThread(child.process,IntPtr.Zero,UIntPtr.Zero,GetProcAddress(GetModuleHandle("kernel32.dll"),"LoadLibraryW"),memory,0,IntPtr.Zero);
   if(injectedThread==IntPtr.Zero)throw new Win32Exception();
   if(WaitForSingleObject(injectedThread,15000)!=0)throw new InvalidOperationException("Compatibility initialization timed out");
   uint loaded;if(!GetExitCodeThread(injectedThread,out loaded)||loaded==0)throw new InvalidOperationException("Game import compatibility was not initialized");
   File.WriteAllText(log,"Per-user install registry compatibility initialized.\r\n");
   if(ResumeThread(child.thread)==UInt32.MaxValue)throw new Win32Exception();running=true;
   WaitForSingleObject(child.process,UInt32.MaxValue);return 0;
  }catch(Exception error){File.WriteAllText(log,error.ToString()+"\r\n");return 10;}
  finally{
   if(!running&&child.process!=IntPtr.Zero)TerminateProcess(child.process,10);
   if(injectedThread!=IntPtr.Zero)CloseHandle(injectedThread);
   if(memory!=IntPtr.Zero&&child.process!=IntPtr.Zero)VirtualFreeEx(child.process,memory,UIntPtr.Zero,0x8000);
   if(child.thread!=IntPtr.Zero)CloseHandle(child.thread);if(child.process!=IntPtr.Zero)CloseHandle(child.process);
   // This independent cleanup survives closing/restarting the main launcher.
   if(args.Length==4)try{
    string script=Path.GetFullPath(args[2]),image=Path.GetFullPath(args[3]);
    if(String.Equals(Path.GetFileName(script),"disc.ps1",StringComparison.OrdinalIgnoreCase)&&String.Equals(Path.GetFileName(image),"legacy-optical.iso",StringComparison.OrdinalIgnoreCase)){
     string powershell=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),Environment.Is64BitOperatingSystem?"Sysnative":"System32","WindowsPowerShell","v1.0","powershell.exe");
     Process.Start(new ProcessStartInfo(powershell,"-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+script+"\" -Mode release -IsoPath \""+image+"\" -GamePath \""+Path.GetFullPath(args[0])+"\" -IgnorePid "+Process.GetCurrentProcess().Id){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden});
    }
   }catch{}
  }
 }
}
