const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('shiori',{
  getLibrary:()=>ipcRenderer.invoke('library:get'),scan:()=>ipcRenderer.invoke('library:scan'),
  launch:id=>ipcRenderer.invoke('game:launch',id),updateGame:(id,patch)=>ipcRenderer.invoke('game:update',id,patch),bulkStatus:(ids,status)=>ipcRenderer.invoke('game:bulk-status',ids,status),
  chooseExe:(id,emulator)=>ipcRenderer.invoke('game:choose-exe',id,emulator),setCandidate:(id,file)=>ipcRenderer.invoke('game:set-candidate',id,file),
  chooseCover:id=>ipcRenderer.invoke('game:choose-cover',id),openFolder:id=>ipcRenderer.invoke('game:folder',id),
  pause:id=>ipcRenderer.invoke('game:pause',id),finish:id=>ipcRenderer.invoke('game:finish',id),
  searchMetadata:(id,q,provider)=>ipcRenderer.invoke('metadata:search',id,q,provider),applyMetadata:(id,subject)=>ipcRenderer.invoke('metadata:apply',id,subject),
  retryMetadata:()=>ipcRenderer.invoke('metadata:retry'),auditMetadata:()=>ipcRenderer.invoke('metadata:audit'),updateSettings:p=>ipcRenderer.invoke('settings:update',p),setWriterPreferences:p=>ipcRenderer.invoke('settings:writers',p),
  addRoot:()=>ipcRenderer.invoke('settings:add-root'),removeRoot:root=>ipcRenderer.invoke('settings:remove-root',root),importExecutable:()=>ipcRenderer.invoke('game:import-executable'),chooseLocaleEmulator:()=>ipcRenderer.invoke('settings:choose-locale'),setBangumiToken:token=>ipcRenderer.invoke('settings:bangumi-token',token),openData:()=>ipcRenderer.invoke('data:folder'),exportData:()=>ipcRenderer.invoke('data:export'),
  openExternal:url=>ipcRenderer.invoke('external:open',url),windowAction:action=>ipcRenderer.invoke('window:action',action),
  onChange:callback=>{ipcRenderer.on('library:changed',()=>callback());},onWarning:callback=>{ipcRenderer.on('app:warning',(_,text)=>callback(text));}
  ,setSidebarTags:p=>ipcRenderer.invoke('settings:sidebar-tags',p),refreshCompanies:()=>ipcRenderer.invoke('metadata:companies')
});
