#include <windows.h>
#include <string.h>

// Only this game's obsolete machine-wide settings key is redirected. The
// process receives its existing user permissions; no machine ACL is changed.
typedef LONG (WINAPI *OpenA)(HKEY,LPCSTR,DWORD,REGSAM,PHKEY);
typedef LONG (WINAPI *OpenW)(HKEY,LPCWSTR,DWORD,REGSAM,PHKEY);
static OpenA originalA;
static OpenW originalW;
static LONG WINAPI userOpenA(HKEY root,LPCSTR key,DWORD options,REGSAM access,PHKEY output){
 if(root==HKEY_LOCAL_MACHINE && key && (_stricmp(key,"Software\\elf\\KAKYU2")==0||_stricmp(key,"Software\\WOW6432Node\\elf\\KAKYU2")==0)){
  root=HKEY_CURRENT_USER;key="Software\\elf\\KAKYU2";
 }
 return originalA(root,key,options,access,output);
}
static LONG WINAPI userOpenW(HKEY root,LPCWSTR key,DWORD options,REGSAM access,PHKEY output){
 if(root==HKEY_LOCAL_MACHINE && key && (_wcsicmp(key,L"Software\\elf\\KAKYU2")==0||_wcsicmp(key,L"Software\\WOW6432Node\\elf\\KAKYU2")==0)){
  root=HKEY_CURRENT_USER;key=L"Software\\elf\\KAKYU2";
 }
 return originalW(root,key,options,access,output);
}
static int replaceImports(HMODULE module){
 BYTE* base=(BYTE*)module;
 IMAGE_DOS_HEADER* dos=(IMAGE_DOS_HEADER*)base;
 IMAGE_NT_HEADERS* nt;
 IMAGE_IMPORT_DESCRIPTOR* descriptor;
 int patched=0;
 if(dos->e_magic!=IMAGE_DOS_SIGNATURE)return 0;
 nt=(IMAGE_NT_HEADERS*)(base+dos->e_lfanew);
 if(nt->Signature!=IMAGE_NT_SIGNATURE||!nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT].VirtualAddress)return 0;
 descriptor=(IMAGE_IMPORT_DESCRIPTOR*)(base+nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT].VirtualAddress);
 for(;descriptor->Name;descriptor++){
  IMAGE_THUNK_DATA* function=(IMAGE_THUNK_DATA*)(base+descriptor->FirstThunk);
  for(;function->u1.Function;function++){
   ULONG_PTR replacement=0;
   if(function->u1.Function==(ULONG_PTR)originalA)replacement=(ULONG_PTR)userOpenA;
   if(function->u1.Function==(ULONG_PTR)originalW)replacement=(ULONG_PTR)userOpenW;
   if(replacement){DWORD protection;
    if(VirtualProtect(&function->u1.Function,sizeof(ULONG_PTR),PAGE_READWRITE,&protection)){
     InterlockedExchange((LONG*)&function->u1.Function,(LONG)replacement);
     VirtualProtect(&function->u1.Function,sizeof(ULONG_PTR),protection,&protection);patched++;
    }
   }
  }
 }
 return patched;
}
BOOL WINAPI DllMain(HINSTANCE instance,DWORD reason,LPVOID reserved){
 if(reason==DLL_PROCESS_ATTACH){
  HMODULE registry=GetModuleHandleA("advapi32.dll");
  if(!registry)return FALSE;
  originalA=(OpenA)GetProcAddress(registry,"RegOpenKeyExA");originalW=(OpenW)GetProcAddress(registry,"RegOpenKeyExW");
  if(!originalA||!originalW||!replaceImports(GetModuleHandleA(NULL)))return FALSE;
  DisableThreadLibraryCalls(instance);
 }
 return TRUE;
}
