using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

// A real Win32 GUI fixture that obeys STARTUPINFO, like legacy WinMain games.
// Its window is off-screen so automated checks do not interrupt the desktop.
class VisibleGame {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct WNDCLASS { public uint style;public IntPtr proc;public int clsExtra,wndExtra;public IntPtr instance,icon,cursor,brush;public string menu,className; }
 [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd;public uint message;public UIntPtr wParam;public IntPtr lParam;public uint time;public int x,y;public uint extra; }
 [StructLayout(LayoutKind.Sequential)] struct STARTUPINFO { public int cb;public IntPtr reserved,desktop,title;public uint x,y,width,height,xChars,yChars,fill,flags;public ushort show,reservedCount;public IntPtr reserved2,input,output,error; }
 [UnmanagedFunctionPointer(CallingConvention.Winapi)] delegate IntPtr WindowProc(IntPtr hwnd,uint message,UIntPtr wp,IntPtr lp);
 static WindowProc callback=Proc;
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern void GetStartupInfo(ref STARTUPINFO info);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern ushort RegisterClass(ref WNDCLASS cls);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateWindowEx(uint ex,string cls,string title,uint style,int x,int y,int w,int h,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr param);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd,int command);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool UpdateWindow(IntPtr hwnd);
 [DllImport("user32.dll")] static extern UIntPtr SetTimer(IntPtr hwnd,UIntPtr id,uint ms,IntPtr proc);
 [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr hwnd);
 [DllImport("user32.dll")] static extern void PostQuitMessage(int code);
 [DllImport("user32.dll")] static extern int GetMessage(out MSG msg,IntPtr hwnd,uint min,uint max);
 [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG msg);
 [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG msg);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr DefWindowProc(IntPtr hwnd,uint message,UIntPtr wp,IntPtr lp);
 static IntPtr Proc(IntPtr hwnd,uint message,UIntPtr wp,IntPtr lp) {
  if(message==0x0010||message==0x0113){DestroyWindow(hwnd);return IntPtr.Zero;}
  if(message==0x0002){PostQuitMessage(0);return IntPtr.Zero;}
  return DefWindowProc(hwnd,message,wp,lp);
 }
 [STAThread] static void Main(string[] args) {
  int seconds=3;if(args.Length>0)int.TryParse(args[0],out seconds);if(seconds<1)seconds=3;
  var instance=GetModuleHandle(null);var cls=new WNDCLASS { proc=Marshal.GetFunctionPointerForDelegate(callback),instance=instance,className="ShioriVisibilityFixture" };
  if(RegisterClass(ref cls)==0)throw new Exception("RegisterClass failed: "+Marshal.GetLastWin32Error());
  var hwnd=CreateWindowEx(0,cls.className,"Shiori WinMain regression test",0x00CF0000,-20000,-20000,300,180,IntPtr.Zero,IntPtr.Zero,instance,IntPtr.Zero);
  if(hwnd==IntPtr.Zero)throw new Exception("CreateWindow failed: "+Marshal.GetLastWin32Error());
  var startup=new STARTUPINFO();startup.cb=Marshal.SizeOf(startup);GetStartupInfo(ref startup);
  int show=(startup.flags&1)!=0?startup.show:1;ShowWindow(hwnd,show);UpdateWindow(hwnd);
  var report=Environment.GetEnvironmentVariable("SHIORI_FIXTURE_REPORT");
  if(!String.IsNullOrEmpty(report)){
   var lines=new System.Collections.Generic.List<string>();lines.Add("visible="+IsWindowVisible(hwnd));lines.Add("show="+show);
   foreach(var arg in args)lines.Add("arg="+Convert.ToBase64String(Encoding.UTF8.GetBytes(arg)));
   File.WriteAllLines(report,lines.ToArray(),Encoding.UTF8);
  }
  SetTimer(hwnd,(UIntPtr)1,(uint)(seconds*1000),IntPtr.Zero);
  MSG message;while(GetMessage(out message,IntPtr.Zero,0,0)>0){TranslateMessage(ref message);DispatchMessage(ref message);}
 }
}
