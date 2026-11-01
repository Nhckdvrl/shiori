using System;
using System.Diagnostics;
using System.Threading;
class TestGame {
  static void Main(string[] args) {
    if (args.Length>0 && args[0]=="handoff") {
      Process.Start(new ProcessStartInfo { FileName=Process.GetCurrentProcess().MainModule.FileName, Arguments="25", UseShellExecute=false, CreateNoWindow=true });
      return;
    }
    int seconds=25;
    if(args.Length>0)int.TryParse(args[0],out seconds);
    Thread.Sleep(Math.Max(1,seconds)*1000);
  }
}
